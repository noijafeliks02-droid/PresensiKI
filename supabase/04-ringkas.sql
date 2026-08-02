-- ============================================================
-- Kompas — Pemeriksaan ringkas
-- ------------------------------------------------------------
-- Isinya sama persis dengan 03-periksa.sql, tetapi hanya
-- menampilkan RINGKASAN dan baris yang GAGAL.
--
-- Kalau semuanya benar, hasilnya satu baris saja — tidak perlu
-- digulir, tidak ada yang bisa terlewat dari pandangan.
--
-- Tempel dan Run. Tidak mengubah apa pun, hanya membaca.
-- ============================================================

with tabel_wajib(nama) as (
  values ('unit_kerja'), ('pegawai_terdaftar'), ('pegawai'),
         ('pengaturan'), ('presensi'), ('pengajuan')
),
fungsi_wajib(nama) as (
  values ('saya_admin'), ('saya_aktif'), ('hari_ini'),
         ('daftarkan_pegawai'), ('stempel_presensi'), ('jaga_presensi')
),
periksa(pemeriksaan, hasil) as (

  -- 1. Tabel ada, dan RLS-nya menyala.
  select
    'Tabel ' || t.nama,
    case
      when c.relname is null    then 'GAGAL - tabel tidak terbentuk'
      when not c.relrowsecurity then 'GAGAL - RLS MATI, siapa pun bisa membaca'
      when (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = t.nama) = 0
        then 'GAGAL - RLS menyala tanpa kebijakan, semua akses tertutup'
      else 'OK - RLS aktif, ' || (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = t.nama) || ' kebijakan'
    end
  from tabel_wajib t
  left join pg_class c
    on c.relname = t.nama and c.relnamespace = 'public'::regnamespace

  union all

  -- 2. Fungsi pembantu dan pemicu.
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
    ) then 'OK'
    else 'GAGAL - pendaftaran tidak akan membuat baris pegawai' end

  union all

  -- 3. Penyimpanan foto: harus ada, dan harus PRIVAT.
  select
    'Bucket foto bukti',
    coalesce(
      (select case when public then 'GAGAL - bucket PUBLIK, foto wajah bisa dibuka siapa saja'
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
      when 1 then 'OK'
      when 0 then 'GAGAL - belum ada titik kantor'
      else 'GAGAL - lebih dari satu baris' end

  union all

  select
    'Unit kerja',
    case when (select count(*) from public.unit_kerja) >= 1
         then 'OK' else 'GAGAL - belum ada unit kerja' end

  union all

  -- 5. Admin pertama.
  select
    'Admin pertama',
    coalesce(
      (select 'OK - ' || email from public.pegawai_terdaftar
        where peran = 'admin' limit 1),
      'GAGAL - belum ada admin, jalankan 02-admin-pertama.sql')

  union all

  select
    'Email admin sudah diganti',
    case when exists (select 1 from public.pegawai_terdaftar
                       where email = 'ganti@email.anda')
         then 'GAGAL - email contoh masih terpasang'
         else 'OK' end
)

-- Ringkasan di baris pertama, lalu HANYA yang gagal di bawahnya.
select 'RINGKASAN' as pemeriksaan,
       case when (select count(*) from periksa where hasil not like 'OK%') = 0
            then 'SEMUA OK - ' || (select count(*) from periksa)
                 || ' pemeriksaan lulus, tidak ada yang gagal'
            else 'ADA ' || (select count(*) from periksa where hasil not like 'OK%')
                 || ' YANG GAGAL - lihat baris di bawah'
       end as hasil
union all
select pemeriksaan, hasil from periksa where hasil not like 'OK%';
