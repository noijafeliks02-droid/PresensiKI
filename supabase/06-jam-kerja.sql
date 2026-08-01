-- ============================================================
-- Kompas — Tolak presensi di luar jam kerja
-- ------------------------------------------------------------
-- Jalankan SETELAH 05-lanjutan.sql.
-- Tempel seluruhnya ke SQL Editor → Run. Tidak ada yang disunting.
--
-- Aman terhadap data yang sudah ada: tidak ada baris yang diubah maupun
-- dihapus. Presensi pukul 00.12 yang sudah terlanjur tercatat tetap ada
-- — aturan baru berlaku untuk presensi berikutnya, bukan surut ke
-- belakang. Menghapus catatan lama berarti menghilangkan jejak, dan
-- itu justru yang tidak boleh dilakukan sistem presensi.
--
-- ------------------------------------------------------------
-- MASALAHNYA
--
-- Aturan status hanya punya batas ATAS: lewat 08.00 berarti terlambat.
-- Tidak ada batas bawah. Akibatnya absen pukul 00.12 tercatat "Tepat
-- waktu", karena 00.12 memang lebih awal dari 08.00.
--
-- Celah yang sama ada di sisi sebaliknya: absen pukul 22.00 tercatat
-- "Terlambat", padahal itu bukan datang terlambat.
-- ============================================================


-- ============================================================
-- 1. BATAS JAM PRESENSI
-- ------------------------------------------------------------
-- Bisa disetel. Bawaannya 05.00–20.00: cukup lebar untuk menampung
-- tugas lapangan yang berangkat subuh atau lembur sampai malam, cukup
-- sempit untuk menutup jam-jam yang tidak masuk akal.
--
-- Batas bawah berlaku untuk presensi MASUK saja. Presensi pulang tidak
-- dibatasi jam — orang yang lembur sampai lewat tengah malam tetap
-- harus bisa mencatat kepulangannya, dan menolaknya justru membuat
-- catatan hari itu menggantung tanpa jam pulang.
-- ============================================================

alter table public.pengaturan
  add column if not exists jam_paling_awal time not null default '05:00',
  add column if not exists jam_paling_akhir time not null default '20:00';

comment on column public.pengaturan.jam_paling_awal is
  'Presensi MASUK sebelum jam ini ditolak server.';
comment on column public.pengaturan.jam_paling_akhir is
  'Presensi MASUK sesudah jam ini ditolak server. Presensi pulang tidak dibatasi.';


-- ============================================================
-- 2. PENOLAKAN DI SISI SERVER
-- ------------------------------------------------------------
-- Aplikasi juga mencegahnya lebih dulu supaya pegawai tidak menempuh
-- seluruh verifikasi wajah lalu ditolak di ujung. Tetapi pencegahan di
-- aplikasi hanyalah kenyamanan: yang menentukan adalah pemeriksaan di
-- sini, karena aplikasi berjalan di perangkat orang yang diawasi dan
-- jam di perangkat itu bisa disetel semaunya.
-- ============================================================

create or replace function public.stempel_presensi()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  batas  time;
  awal   time;
  akhir  time;
  klat   double precision;
  klng   double precision;
  jam    time;
begin
  select batas_terlambat, jam_paling_awal, jam_paling_akhir, kantor_lat, kantor_lng
    into batas, awal, akhir, klat, klng
    from public.pengaturan where id = 1;

  /* ---- Jam ditetapkan server ---- */
  if tg_op = 'INSERT' then
    new.tanggal := public.hari_ini();
    if new.jam_masuk  is not null then new.jam_masuk  := now(); end if;
    if new.jam_keluar is not null then new.jam_keluar := now(); end if;
  elsif old.jam_keluar is null and new.jam_keluar is not null then
    new.jam_keluar := now();
  end if;

  /* ---- Presensi masuk: ditolak di luar jam kerja ---- */
  if new.jam_masuk is not null
     and (tg_op = 'INSERT' or old.jam_masuk is null) then
    jam := (new.jam_masuk at time zone 'Asia/Jayapura')::time;

    if jam < awal or jam > akhir then
      raise exception
        'Presensi masuk hanya dapat dilakukan antara % dan % WIT. Saat ini pukul %.',
        to_char(awal, 'HH24:MI'), to_char(akhir, 'HH24:MI'), to_char(jam, 'HH24:MI');
    end if;

    new.status := case when jam <= batas then 'Tepat waktu' else 'Terlambat' end;
  end if;

  /* ---- Jarak dihitung server ---- */
  if new.lat_masuk is not null and new.lng_masuk is not null then
    new.jarak_masuk := round(public.jarak_meter(new.lat_masuk, new.lng_masuk, klat, klng));
  else
    new.jarak_masuk := null;
  end if;

  if new.lat_keluar is not null and new.lng_keluar is not null then
    new.jarak_keluar := round(public.jarak_meter(new.lat_keluar, new.lng_keluar, klat, klng));
  else
    new.jarak_keluar := null;
  end if;

  return new;
end
$$;


-- ============================================================
-- PEMERIKSAAN
-- Termasuk enam jam contoh, dihitung memakai batas yang benar-benar
-- tersimpan di tabel pengaturan.
-- ============================================================

with p as (select jam_paling_awal awal, jam_paling_akhir akhir,
                  batas_terlambat batas
             from public.pengaturan where id = 1),
uji(label, jam) as (
  values ('00.12 tengah malam', time '00:12'),
         ('04.59 sebelum batas', time '04:59'),
         ('05.30 subuh',        time '05:30'),
         ('07.41 pagi',         time '07:41'),
         ('08.20 terlambat',    time '08:20'),
         ('22.00 malam',        time '22:00')
)
select 'Kolom batas jam' as pemeriksaan,
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'pengaturan'
                     and column_name in ('jam_paling_awal', 'jam_paling_akhir')) = 2
            then 'OK' else 'GAGAL' end as hasil
union all
select 'Pemicu menolak di luar jam',
       case when (select prosrc from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                   where n.nspname = 'public' and pr.proname = 'stempel_presensi')
                 like '%hanya dapat dilakukan antara%'
            then 'OK' else 'GAGAL - pemicu belum diperbarui' end
union all
select 'Batas berlaku',
       'OK - ' || (select to_char(awal, 'HH24:MI') || ' sampai ' || to_char(akhir, 'HH24:MI') from p)
union all
select 'Jam ' || uji.label,
       'OK - ' || case
         when uji.jam < p.awal or uji.jam > p.akhir then 'DITOLAK'
         when uji.jam <= p.batas then 'diterima, Tepat waktu'
         else 'diterima, Terlambat'
       end
from uji, p
order by 1;
