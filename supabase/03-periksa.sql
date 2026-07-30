-- ============================================================
-- Kompas — Pemeriksaan hasil pemasangan
-- ------------------------------------------------------------
-- Tempel dan Run. Tidak mengubah apa pun, hanya membaca.
--
-- Setiap baris hasil harus dimulai dengan "OK". Satu saja yang
-- "GAGAL", kirimkan tangkapan layarnya kepada saya — jangan
-- dilanjutkan, karena beberapa kegagalan berarti data presensi bisa
-- dibaca orang yang tidak berhak.
-- ============================================================

with tabel_wajib(nama) as (
  values ('unit_kerja'), ('pegawai_terdaftar'), ('pegawai'),
         ('pengaturan'), ('presensi'), ('pengajuan')
),
fungsi_wajib(nama) as (
  values ('saya_admin'), ('saya_aktif'), ('hari_ini'),
         ('daftarkan_pegawai'), ('stempel_presensi'), ('jaga_presensi')
)

-- 1. Tabel ada, dan RLS-nya menyala.
select
  'Tabel ' || t.nama as pemeriksaan,
  case
    when c.relname is null    then 'GAGAL - tabel tidak terbentuk'
    when not c.relrowsecurity then 'GAGAL - RLS MATI, siapa pun bisa membaca'
    when (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = t.nama) = 0
      then 'GAGAL - RLS menyala tanpa kebijakan, semua akses tertutup'
    else 'OK - RLS aktif, ' || (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = t.nama) || ' kebijakan'
  end as hasil
from tabel_wajib t
left join pg_class c
  on c.relname = t.nama and c.relnamespace = 'public'::regnamespace

union all

-- 2. Fungsi pembantu dan pemicu terbentuk.
select
  'Fungsi ' || f.nama,
  case when exists (
    select 1 from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f.nama
  ) then 'OK' else 'GAGAL - fungsi tidak terbentuk' end
from fungsi_wajib f

union all

select
  'Pemicu pendaftaran otomatis',
  case when exists (
    select 1 from pg_trigger tg
     join pg_class c on c.oid = tg.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
      and tg.tgname = 'on_auth_user_created'
  ) then 'OK - pendaftaran akan mengisi tabel pegawai sendiri'
  else 'GAGAL - pendaftaran tidak akan membuat baris pegawai' end

union all

-- 3. Penyimpanan foto: harus ada, dan harus PRIVAT.
select
  'Bucket foto bukti',
  coalesce(
    (select case when public then 'GAGAL - bucket PUBLIK, foto bisa dibuka siapa saja'
                 else 'OK - privat' end
       from storage.buckets where id = 'bukti'),
    'GAGAL - bucket belum terbentuk')

union all

select
  'Kebijakan Storage',
  case when (select count(*) from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and policyname like 'bukti%') >= 3
       then 'OK' else 'GAGAL - kebijakan foto belum lengkap' end

union all

-- 4. Isi awal.
select
  'Baris pengaturan kantor',
  case (select count(*) from public.pengaturan)
    when 1 then 'OK - 1 baris'
    when 0 then 'GAGAL - belum ada titik kantor'
    else 'GAGAL - lebih dari satu baris' end

union all

select
  'Unit kerja',
  case when (select count(*) from public.unit_kerja) >= 1
       then 'OK - ' || (select count(*) from public.unit_kerja) || ' unit'
       else 'GAGAL - belum ada unit kerja' end

union all

-- 5. Admin pertama (hasil 02-admin-pertama.sql).
select
  'Admin pertama',
  coalesce(
    (select 'OK - ' || email || case when sudah_daftar
              then ' (akun sudah dibuat)'
              else ' (belum mendaftar, ini normal)' end
       from public.pegawai_terdaftar where peran = 'admin' limit 1),
    'BELUM - jalankan 02-admin-pertama.sql')

union all

select
  'Email admin sudah diganti',
  case when exists (select 1 from public.pegawai_terdaftar
                     where email = 'ganti@email.anda')
       then 'GAGAL - email contoh masih terpasang, ganti dengan email Anda'
       else 'OK' end

order by 1;
