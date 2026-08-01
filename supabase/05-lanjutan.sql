-- ============================================================
-- Kompas — Perbaikan lanjutan
-- ------------------------------------------------------------
-- Jalankan SETELAH 01-skema.sql.
-- Tempel seluruhnya ke Supabase → SQL Editor → Run.
-- TIDAK ADA yang perlu disunting.
--
-- Aman dijalankan berulang, dan aman terhadap data yang sudah ada:
-- tidak ada tabel yang dibuat ulang, tidak ada baris yang dihapus.
--
-- Tiga hal yang diperbaiki:
--
--   1. Jarak ke kantor dihitung SERVER, bukan dikirim peramban.
--   2. Pengajuan izin bisa membawa lampiran surat dokter.
--   3. Penyimpanan menerima PDF, bukan hanya gambar.
-- ============================================================


-- ============================================================
-- 1. JARAK DIHITUNG SERVER
-- ------------------------------------------------------------
-- Sebelumnya peramban yang menghitung jaraknya lalu mengirim angka
-- jadi. Artinya siapa pun yang paham alat pengembang bisa mengirim
-- "jarak 12 meter" dari mana saja, tanpa perlu memalsukan GPS sama
-- sekali — cukup mengubah satu angka sebelum dikirim.
--
-- Sekarang server menghitungnya sendiri dari koordinat yang dikirim
-- terhadap titik kantor di tabel pengaturan. Apa pun angka jarak yang
-- dikirim peramban akan ditimpa.
--
-- Ini TIDAK membuat GPS palsu jadi mustahil — aplikasi pemalsu lokasi
-- masih bisa mengarang koordinat. Yang hilang adalah cara termudahnya.
-- ============================================================

create or replace function public.jarak_meter(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision)
returns double precision
language sql immutable
as $$
  -- Haversine, jari-jari bumi 6.371.000 m. Sama dengan rumus yang
  -- dipakai aplikasi, supaya angkanya tidak berselisih.
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

create or replace function public.stempel_presensi()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  batas time;
  klat  double precision;
  klng  double precision;
begin
  select batas_terlambat, kantor_lat, kantor_lng
    into batas, klat, klng
    from public.pengaturan where id = 1;

  /* ---- Jam ditetapkan server ---- */
  if tg_op = 'INSERT' then
    new.tanggal := public.hari_ini();
    if new.jam_masuk  is not null then new.jam_masuk  := now(); end if;
    if new.jam_keluar is not null then new.jam_keluar := now(); end if;
  elsif old.jam_keluar is null and new.jam_keluar is not null then
    new.jam_keluar := now();
  end if;

  /* ---- Status dihitung server ---- */
  if new.jam_masuk is not null then
    new.status := case
      when (new.jam_masuk at time zone 'Asia/Jayapura')::time <= batas
        then 'Tepat waktu'
      else 'Terlambat'
    end;
  end if;

  /* ---- Jarak dihitung server ----
     Koordinat kosong berarti presensi dilakukan tanpa lokasi (mode demo
     atau GPS ditolak). Jaraknya dibiarkan kosong, BUKAN diisi nol —
     nol berarti "tepat di titik kantor", dan itu klaim yang tidak
     pernah dibuat siapa pun. */
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
-- 2. LAMPIRAN PENGAJUAN
-- ------------------------------------------------------------
-- Layar pengajuan izin sudah punya tombol unggah berkas sejak awal,
-- lengkap dengan batas 5 MB. Tetapi yang tersimpan hanya NAMA
-- berkasnya — isinya tidak pernah terkirim ke mana pun.
--
-- Akibatnya pegawai melampirkan surat dokter, melihat namanya muncul di
-- layar, menekan kirim, dan atasan tidak menerima apa-apa. Tidak ada
-- tanda bahwa ada yang salah.
--
-- Kolom ini menyimpan JALUR berkas di Storage, bukan berkasnya.
-- ============================================================

alter table public.pengajuan
  add column if not exists lampiran text;

comment on column public.pengajuan.lampiran is
  'Jalur berkas di bucket bukti, mis. <id-pegawai>/lampiran-<cap-waktu>.pdf';


-- ============================================================
-- 3. PENYIMPANAN MENERIMA PDF
-- ------------------------------------------------------------
-- Bucket bukti semula hanya menerima JPEG dan WebP karena isinya foto
-- selfie. Surat dokter paling sering berupa PDF atau hasil pindaian PNG.
--
-- Batas ukuran dinaikkan ke 5 MB, mengikuti batas yang sudah tertulis
-- di layar pengajuan. Foto selfie sendiri hanya ±40 KB.
-- ============================================================

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/webp', 'image/png', 'application/pdf'],
       file_size_limit = 5242880
 where id = 'bukti';

-- Pegawai boleh MENGGANTI lampirannya selama pengajuannya belum
-- diputus — beda dengan foto presensi, yang sekali tulis. Surat dokter
-- bisa saja salah unggah atau perlu diperbarui, dan itu bukan bukti
-- kehadiran yang perlu dikunci.
drop policy if exists "bukti ganti lampiran" on storage.objects;
create policy "bukti ganti lampiran" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'bukti'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name like '%/lampiran-%'
  )
  with check (
    bucket_id = 'bukti'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name like '%/lampiran-%'
  );


-- ============================================================
-- PEMERIKSAAN
-- Setiap baris harus dimulai dengan "OK".
-- ============================================================

select 'Fungsi jarak_meter' as pemeriksaan,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'jarak_meter')
            then 'OK' else 'GAGAL - fungsi tidak terbentuk' end as hasil
union all
select 'Perhitungan jarak benar',
       -- Dua titik berjarak ±111,2 km (selisih 1 derajat lintang).
       case when abs(public.jarak_meter(0, 0, 1, 0) - 111195) < 500
            then 'OK - ' || round(public.jarak_meter(0, 0, 1, 0)) || ' m untuk 1 derajat lintang'
            else 'GAGAL - hasilnya ' || round(public.jarak_meter(0, 0, 1, 0)) end
union all
select 'Pemicu presensi memakai jarak server',
       case when (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'stempel_presensi') like '%jarak_meter%'
            then 'OK' else 'GAGAL - pemicu belum diperbarui' end
union all
select 'Kolom lampiran',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'pengajuan'
                            and column_name = 'lampiran')
            then 'OK' else 'GAGAL - kolom tidak terbentuk' end
union all
select 'Bucket menerima PDF',
       case when (select 'application/pdf' = any(allowed_mime_types)
                    from storage.buckets where id = 'bukti')
            then 'OK' else 'GAGAL - PDF masih ditolak' end
union all
select 'Bucket tetap privat',
       case when (select not public from storage.buckets where id = 'bukti')
            then 'OK' else 'GAGAL - bucket PUBLIK' end
order by 1;
