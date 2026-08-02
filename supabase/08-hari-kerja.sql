-- ============================================================
-- Kompas — Hari libur akhir pekan & jam paling awal pulang
-- ------------------------------------------------------------
-- CARA PAKAI
--   Tempel SELURUH berkas ini ke Supabase → SQL Editor → Run.
--   Aman dijalankan berulang.
--
-- ------------------------------------------------------------
-- DUA ATURAN BARU
--
--   1. Sabtu dan Minggu terkunci. Presensi MASUK ditolak.
--   2. Presensi PULANG baru dibuka pukul 16.00 WIT (mengikuti
--      `jam_pulang` di pengaturan, bukan angka tersendiri).
--
-- Keduanya dipasang di pemicu, bukan di aplikasi. Tombol yang dimatikan
-- di layar hanya menghemat langkah pegawai; yang benar-benar menolak
-- adalah server, karena jam dan tanggalnya jam server.
--
-- ------------------------------------------------------------
-- YANG SENGAJA TIDAK DIKUNCI
--
-- Presensi PULANG tidak dikunci pada hari libur, dan tidak dibatasi
-- jam paling akhir.
--
-- Alasannya sama dengan yang sudah dipakai sejak 06-jam-kerja.sql:
-- sekali presensi masuk tercatat, kepulangannya HARUS bisa dicatat.
-- Menolaknya meninggalkan catatan yang menggantung tanpa jam pulang —
-- dan catatan menggantung lebih merepotkan bagian kepegawaian daripada
-- jam pulang yang lewat tengah malam.
--
-- Yang dikunci hari libur adalah MEMULAI presensi, bukan menutupnya.
--
-- ------------------------------------------------------------
-- AKIBAT YANG PERLU ANDA SADARI
--
-- Pegawai yang pulang sebelum pukul 16.00 — sakit mendadak, dinas luar,
-- keperluan keluarga — TIDAK akan punya jam pulang sama sekali. Bukan
-- "pulang cepat", melainkan kosong. Saluran resminya adalah pengajuan
-- Izin/Sakit, yang memang sudah ada di aplikasi.
--
-- Bila kantor mengadakan piket atau lembur akhir pekan (di BWS ini nyata
-- saat musim banjir), setel `libur_akhir_pekan` menjadi false lewat
-- Panel Admin → Lokasi Kantor, atau dengan satu baris:
--     update public.pengaturan set libur_akhir_pekan = false where id = 1;
-- ============================================================


-- ---------- Saklar hari libur ----------
-- Dibuat sebagai kolom, bukan ditanam mati di dalam pemicu, supaya
-- kantor tidak perlu menyentuh SQL lagi hanya untuk membuka satu hari.
alter table public.pengaturan
  add column if not exists libur_akhir_pekan boolean not null default true;


-- ---------- Pemicu presensi ----------
create or replace function public.stempel_presensi()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  p    public.pengaturan;
  jam  time;
  hari int;   -- isodow: 1 Senin … 6 Sabtu, 7 Minggu
begin
  select * into p from public.pengaturan where id = 1;

  jam  := (now() at time zone 'Asia/Jayapura')::time;
  hari := extract(isodow from (now() at time zone 'Asia/Jayapura')::date);

  if tg_op = 'INSERT' then
    new.tanggal := public.hari_ini();

    -- ---------- Presensi masuk ----------
    if new.jam_masuk is not null then
      if p.libur_akhir_pekan and hari >= 6 then
        raise exception
          'Hari % adalah hari libur kantor. Presensi tidak dibuka.',
          case hari when 6 then 'Sabtu' else 'Minggu' end;
      end if;

      if jam < p.jam_paling_awal or jam > p.jam_paling_akhir then
        raise exception
          'Presensi masuk hanya dapat dilakukan antara % dan % WIT. Saat ini pukul %.',
          to_char(p.jam_paling_awal, 'HH24:MI'),
          to_char(p.jam_paling_akhir, 'HH24:MI'),
          to_char(jam, 'HH24:MI');
      end if;

      new.jam_masuk := now();
    end if;

    -- ---------- Presensi pulang pada baris yang sama ----------
    if new.jam_keluar is not null then
      if jam < p.jam_pulang then
        raise exception
          'Presensi pulang baru dapat dilakukan mulai pukul % WIT. Saat ini pukul %.',
          to_char(p.jam_pulang, 'HH24:MI'), to_char(jam, 'HH24:MI');
      end if;
      new.jam_keluar := now();
    end if;

  -- ---------- Presensi pulang menyusul ----------
  elsif old.jam_keluar is null and new.jam_keluar is not null then
    if jam < p.jam_pulang then
      raise exception
        'Presensi pulang baru dapat dilakukan mulai pukul % WIT. Saat ini pukul %.',
        to_char(p.jam_pulang, 'HH24:MI'), to_char(jam, 'HH24:MI');
    end if;
    new.jam_keluar := now();
  end if;

  -- Status selalu dihitung server dari jam server.
  if new.jam_masuk is not null then
    new.status := case
      when (new.jam_masuk at time zone 'Asia/Jayapura')::time <= p.batas_terlambat
        then 'Tepat waktu'
      else 'Terlambat'
    end;
  end if;

  return new;
end
$$;


-- ============================================================
-- PERIKSA
-- ------------------------------------------------------------
-- Ditulis sebagai `select` — editor SQL Supabase tidak menampilkan
-- `raise notice`, sehingga pemeriksaan yang memakainya tampak seperti
-- tidak berjalan.
--
-- Yang benar: SATU baris, semuanya bertanda ✔.
-- ============================================================
select
  case when exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'pengaturan'
       and column_name = 'libur_akhir_pekan')
  then '✔ kolom libur_akhir_pekan ada' else '✗ kolom belum dibuat' end   as kolom,

  case when (select libur_akhir_pekan from public.pengaturan where id = 1)
  then '✔ Sabtu & Minggu terkunci' else '— akhir pekan sedang dibuka' end as akhir_pekan,

  '✔ pulang mulai ' || to_char(
    (select jam_pulang from public.pengaturan where id = 1), 'HH24:MI') || ' WIT' as pulang,

  case when exists (
    select 1 from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = 'stempel_presensi'
       and pg_get_functiondef(p.oid) like '%libur_akhir_pekan%')
  then '✔ pemicu sudah diperbarui' else '✗ pemicu masih yang lama' end    as pemicu;
