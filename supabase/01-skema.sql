-- ============================================================
-- Kompas — Skema basis data (Supabase / PostgreSQL)
-- Balai Wilayah Sungai Maluku
-- ------------------------------------------------------------
-- CARA PAKAI
--   1. Ganti alamat email di bagian 7 dengan email Anda sendiri.
--   2. Tempel SELURUH berkas ini ke Supabase → SQL Editor → Run.
--   3. Periksa Table Editor: 6 tabel, semuanya bertanda "RLS enabled".
--
-- Aman dijalankan berulang pada proyek yang sama.
--
-- ------------------------------------------------------------
-- MASUK MEMAKAI EMAIL, NIK SEBAGAI IDENTITAS PEGAWAI
--
-- Email adalah kredensial: yang diurus Supabase Auth, dan yang membuat
-- tombol "Lupa kata sandi?" berfungsi tanpa kode tambahan.
--
-- NIK (16 digit, dari KTP) adalah identitas pegawai: unik, dipakai di
-- rekap kehadiran dan laporan. Dipakai menggantikan NIP karena tidak
-- semua pegawai berstatus ASN — tenaga kontrak tidak punya NIP,
-- sedangkan NIK dimiliki semua orang.
--
-- NIK adalah data pribadi yang dilindungi UU 27/2022, dan bocornya
-- berakibat lebih jauh daripada NIP: NIK dipakai untuk perbankan,
-- kartu SIM, dan layanan publik. Karena itu tabel yang memuatnya hanya
-- terbaca admin, dan tidak pernah dikirim ke aplikasi pegawai.
--
-- Kunci sebenarnya adalah id internal (uuid), bukan email maupun NIK.
-- Jadi pegawai yang berganti email tidak kehilangan riwayat presensinya.
--
-- ------------------------------------------------------------
-- TIGA HAL YANG TIDAK MUNGKIN DI PROTOTIPE localStorage
--
--   1. Jam presensi ditetapkan SERVER. Mengubah jam di HP tidak lagi
--      mengubah jam absen.
--   2. Status "Tepat waktu / Terlambat" dihitung server dari jam server.
--      Pegawai tidak bisa mengaku tepat waktu.
--   3. Bukti yang sudah tercatat tidak dapat ditimpa siapa pun kecuali
--      admin — jam, foto, maupun rekaman verifikasi wajah.
--
-- Zona waktu dipatok Asia/Jayapura (WIT, UTC+9) sesuai Maluku, supaya
-- batas hari dan batas terlambat tidak ikut zona waktu HP.
-- ============================================================

create or replace function public.hari_ini()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Jayapura')::date
$$;


-- ============================================================
-- 1. TABEL
-- ============================================================

-- ---------- Unit kerja ----------
create table if not exists public.unit_kerja (
  id     uuid primary key default gen_random_uuid(),
  nama   text not null unique,
  aktif  boolean not null default true,
  dibuat timestamptz not null default now()
);

-- ---------- Daftar pegawai yang boleh mendaftar ----------
-- Halaman Kompas terbuka di internet. Tanpa daftar ini, siapa pun yang
-- menemukan alamatnya bisa membuat akun dan masuk ke sistem presensi.
--
-- Jadi alurnya: admin memasukkan email + NIK + nama pegawai di sini
-- lebih dulu. Pegawai lalu mendaftar sendiri dengan email itu dan
-- membuat sandinya sendiri. Email yang tidak ada di sini ditolak.
--
-- Hasilnya: Anda tidak pernah memegang sandi siapa pun.
create table if not exists public.pegawai_terdaftar (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique check (position('@' in email) > 1),
  -- NIK selalu tepat 16 digit. Panjang dipatok, bukan diberi rentang:
  -- NIK 15 atau 17 digit pasti salah ketik, dan lebih baik ditolak saat
  -- didaftarkan daripada baru ketahuan saat menyusun laporan.
  nik          text not null unique check (nik ~ '^[0-9]{16}$'),
  nama         text not null,
  jabatan      text,
  unit_id      uuid references public.unit_kerja(id) on delete set null,
  peran        text not null default 'pegawai' check (peran in ('pegawai', 'admin')),
  cuti_kuota   int  not null default 12 check (cuti_kuota >= 0),
  sudah_daftar boolean not null default false,
  dibuat       timestamptz not null default now()
);

-- ---------- Pegawai ----------
-- Barisnya dibuat OTOMATIS oleh pemicu di bagian 3 saat pegawai
-- mendaftar; tidak diisi tangan. Menonaktifkan pegawai cukup lewat
-- `aktif` supaya riwayat presensinya tidak hilang.
create table if not exists public.pegawai (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  nik        text not null unique check (nik ~ '^[0-9]{16}$'),
  nama       text not null,
  jabatan    text,
  unit_id    uuid references public.unit_kerja(id) on delete set null,
  peran      text not null default 'pegawai' check (peran in ('pegawai', 'admin')),
  aktif      boolean not null default true,
  cuti_kuota int  not null default 12 check (cuti_kuota >= 0),
  dibuat     timestamptz not null default now()
);

-- ---------- Pengaturan ----------
-- Satu baris saja (id dipatok 1). Titik kantor dan jam kerja hidup di
-- server, jadi tidak perlu lagi disetel ulang di tiap perangkat.
create table if not exists public.pengaturan (
  id              int primary key default 1 check (id = 1),
  kantor_nama     text not null,
  kantor_alamat   text,
  kantor_lat      double precision not null check (kantor_lat between -90 and 90),
  kantor_lng      double precision not null check (kantor_lng between -180 and 180),
  radius          int  not null default 100 check (radius between 20 and 2000),
  jam_masuk       time not null default '07:30',
  batas_terlambat time not null default '08:00',
  jam_pulang      time not null default '16:00',
  akurasi_maks    int  not null default 100 check (akurasi_maks between 10 and 500),
  diubah          timestamptz not null default now()
);

-- ---------- Presensi ----------
-- Satu baris per pegawai per hari. `verifikasi_*` menyimpan rekaman dua
-- langkah gerak wajah — inilah yang dibuka admin saat memeriksa keaslian
-- bukti.
create table if not exists public.presensi (
  id         uuid primary key default gen_random_uuid(),
  pegawai_id uuid not null references public.pegawai(id) on delete cascade,
  tanggal    date not null default public.hari_ini(),
  status     text not null default 'Belum absen'
             check (status in ('Tepat waktu', 'Terlambat', 'Izin', 'Belum absen')),

  jam_masuk        timestamptz,
  foto_masuk       text,              -- jalur berkas di Storage, bukan base64
  verifikasi_masuk jsonb,
  lat_masuk        double precision,
  lng_masuk        double precision,
  akurasi_masuk    int,
  jarak_masuk      int,

  jam_keluar        timestamptz,
  foto_keluar       text,
  verifikasi_keluar jsonb,
  lat_keluar        double precision,
  lng_keluar        double precision,
  akurasi_keluar    int,
  jarak_keluar      int,

  dibuat timestamptz not null default now(),

  unique (pegawai_id, tanggal)
);

create index if not exists presensi_tanggal_idx on public.presensi (tanggal desc);
create index if not exists presensi_pegawai_idx on public.presensi (pegawai_id, tanggal desc);

-- ---------- Pengajuan izin & cuti ----------
create table if not exists public.pengajuan (
  id            uuid primary key default gen_random_uuid(),
  pegawai_id    uuid not null references public.pegawai(id) on delete cascade,
  jenis         text not null check (jenis in ('Cuti Tahunan', 'Izin', 'Sakit')),
  mulai         date not null,
  selesai       date not null,
  hari          int  not null check (hari > 0),
  alasan        text not null check (length(alasan) between 3 and 500),
  status        text not null default 'Menunggu'
                check (status in ('Menunggu', 'Disetujui', 'Ditolak')),
  catatan_admin text,
  diputus_oleh  uuid references public.pegawai(id) on delete set null,
  diputus_pada  timestamptz,
  dibuat        timestamptz not null default now(),

  check (selesai >= mulai)
);

create index if not exists pengajuan_status_idx  on public.pengajuan (status);
create index if not exists pengajuan_pegawai_idx on public.pengajuan (pegawai_id, mulai desc);


-- ============================================================
-- 2. FUNGSI PEMBANTU
-- ------------------------------------------------------------
-- `security definer` di sini WAJIB. Tanpa itu, kebijakan RLS pada tabel
-- pegawai akan membaca tabel pegawai lagi lewat fungsi ini, dan Postgres
-- menolaknya sebagai rekursi tak berujung.
-- ============================================================

create or replace function public.saya_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select peran = 'admin' and aktif from public.pegawai where id = auth.uid()),
    false)
$$;

create or replace function public.saya_aktif()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select aktif from public.pegawai where id = auth.uid()), false)
$$;


-- ============================================================
-- 3. PENDAFTARAN PEGAWAI
-- ------------------------------------------------------------
-- Berjalan otomatis saat pegawai menekan "Daftar" di Kompas. Emailnya
-- dicari di pegawai_terdaftar; kalau tidak ada, pendaftarannya gagal dan
-- aplikasi menampilkan pesan agar menghubungi admin.
--
-- NIK, nama, jabatan, dan unit diambil dari daftar yang Anda isi — bukan
-- dari apa yang diketik pegawai. Jadi pegawai tidak bisa mengarang NIK
-- atau memilih sendiri jabatannya.
-- ============================================================

create or replace function public.daftarkan_pegawai()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare d public.pegawai_terdaftar;
begin
  select * into d from public.pegawai_terdaftar
   where lower(email) = lower(new.email);

  if d.id is null then
    raise exception 'Email % belum didaftarkan oleh admin.', new.email;
  end if;
  if d.sudah_daftar then
    raise exception 'Email % sudah pernah dipakai mendaftar.', new.email;
  end if;

  insert into public.pegawai (id, email, nik, nama, jabatan, unit_id, peran, cuti_kuota)
  values (new.id, lower(new.email), d.nik, d.nama, d.jabatan, d.unit_id, d.peran, d.cuti_kuota);

  update public.pegawai_terdaftar set sudah_daftar = true where id = d.id;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.daftarkan_pegawai();

-- Pegawai yang mengganti emailnya sendiri tetap terhubung ke barisnya.
-- Riwayat presensinya tidak terpengaruh karena kuncinya id, bukan email.
create or replace function public.samakan_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.pegawai set email = lower(new.email) where id = new.id;
  end if;
  return new;
end
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.samakan_email();


-- ============================================================
-- 4. PENJAGA INTEGRITAS BUKTI
-- ============================================================

-- Jam dan status ditetapkan server. Apa pun yang dikirim peramban untuk
-- kedua kolom itu diabaikan.
create or replace function public.stempel_presensi()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare batas time;
begin
  select batas_terlambat into batas from public.pengaturan where id = 1;

  if tg_op = 'INSERT' then
    new.tanggal := public.hari_ini();
    if new.jam_masuk  is not null then new.jam_masuk  := now(); end if;
    if new.jam_keluar is not null then new.jam_keluar := now(); end if;
  elsif old.jam_keluar is null and new.jam_keluar is not null then
    new.jam_keluar := now();          -- absen pulang: jam diambil dari server
  end if;

  if new.jam_masuk is not null then
    new.status := case
      when (new.jam_masuk at time zone 'Asia/Jayapura')::time <= batas
        then 'Tepat waktu'
      else 'Terlambat'
    end;
  end if;

  return new;
end
$$;

-- Bukti yang sudah tercatat bersifat sekali tulis. Admin dikecualikan
-- supaya koreksi resmi tetap mungkin dilakukan.
create or replace function public.jaga_presensi()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.saya_admin() then return new; end if;

  if new.pegawai_id is distinct from old.pegawai_id
     or new.tanggal is distinct from old.tanggal then
    raise exception 'Pemilik dan tanggal presensi tidak dapat dipindahkan.';
  end if;

  if old.jam_masuk   is not null and new.jam_masuk   is distinct from old.jam_masuk then
    raise exception 'Jam masuk sudah tercatat dan tidak dapat diubah.';
  end if;
  if old.foto_masuk  is not null and new.foto_masuk  is distinct from old.foto_masuk then
    raise exception 'Foto masuk sudah tercatat dan tidak dapat diubah.';
  end if;
  if old.jam_keluar  is not null and new.jam_keluar  is distinct from old.jam_keluar then
    raise exception 'Jam pulang sudah tercatat dan tidak dapat diubah.';
  end if;
  if old.foto_keluar is not null and new.foto_keluar is distinct from old.foto_keluar then
    raise exception 'Foto pulang sudah tercatat dan tidak dapat diubah.';
  end if;

  return new;
end
$$;

-- Urutan pemicu mengikuti abjad: a_stempel dulu, lalu b_jaga.
drop trigger if exists a_stempel_presensi on public.presensi;
create trigger a_stempel_presensi
  before insert or update on public.presensi
  for each row execute function public.stempel_presensi();

drop trigger if exists b_jaga_presensi on public.presensi;
create trigger b_jaga_presensi
  before update on public.presensi
  for each row execute function public.jaga_presensi();

-- Keputusan pengajuan selalu tercatat siapa dan kapan.
create or replace function public.stempel_pengajuan()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status <> 'Menunggu' then
    new.diputus_oleh := auth.uid();
    new.diputus_pada := now();
  end if;
  return new;
end
$$;

drop trigger if exists stempel_pengajuan on public.pengajuan;
create trigger stempel_pengajuan
  before update on public.pengajuan
  for each row execute function public.stempel_pengajuan();


-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Kunci utama keamanan aplikasi ini. Kompas adalah berkas statis di
-- GitHub Pages, jadi anon key-nya PASTI terlihat siapa pun yang membuka
-- kode sumber halaman. Yang menahan mereka bukan kerahasiaan kunci itu,
-- melainkan kebijakan di bawah ini: kunci anon tanpa login tidak bisa
-- membaca satu baris pun.
--
-- Karena itu RLS TIDAK BOLEH dimatikan pada tabel mana pun, walau
-- sebentar, walau hanya untuk mempermudah pengujian.
-- ============================================================

alter table public.unit_kerja        enable row level security;
alter table public.pegawai_terdaftar enable row level security;
alter table public.pegawai           enable row level security;
alter table public.pengaturan        enable row level security;
alter table public.presensi          enable row level security;
alter table public.pengajuan         enable row level security;

-- ---------- Unit kerja ----------
drop policy if exists "unit baca" on public.unit_kerja;
create policy "unit baca" on public.unit_kerja
  for select to authenticated using (public.saya_aktif());

drop policy if exists "unit kelola" on public.unit_kerja;
create policy "unit kelola" on public.unit_kerja
  for all to authenticated using (public.saya_admin()) with check (public.saya_admin());

-- ---------- Daftar pegawai yang boleh mendaftar ----------
-- Admin saja. Isinya email + NIK seluruh pegawai — data pribadi yang
-- tidak boleh terbaca pegawai lain, apalagi pengunjung anonim. NIK yang
-- bocor bisa dipakai menyalahgunakan identitas orangnya, jadi tabel ini
-- yang paling ketat di seluruh skema.
-- Pemicu pendaftaran tetap bisa membacanya karena `security definer`.
drop policy if exists "terdaftar kelola" on public.pegawai_terdaftar;
create policy "terdaftar kelola" on public.pegawai_terdaftar
  for all to authenticated using (public.saya_admin()) with check (public.saya_admin());

-- ---------- Pegawai ----------
drop policy if exists "pegawai baca diri" on public.pegawai;
create policy "pegawai baca diri" on public.pegawai
  for select to authenticated using (id = auth.uid() or public.saya_admin());

drop policy if exists "pegawai kelola" on public.pegawai;
create policy "pegawai kelola" on public.pegawai
  for all to authenticated using (public.saya_admin()) with check (public.saya_admin());

-- ---------- Pengaturan ----------
drop policy if exists "pengaturan baca" on public.pengaturan;
create policy "pengaturan baca" on public.pengaturan
  for select to authenticated using (public.saya_aktif());

drop policy if exists "pengaturan ubah" on public.pengaturan;
create policy "pengaturan ubah" on public.pengaturan
  for update to authenticated using (public.saya_admin()) with check (public.saya_admin());

-- ---------- Presensi ----------
drop policy if exists "presensi baca" on public.presensi;
create policy "presensi baca" on public.presensi
  for select to authenticated
  using (pegawai_id = auth.uid() or public.saya_admin());

drop policy if exists "presensi absen" on public.presensi;
create policy "presensi absen" on public.presensi
  for insert to authenticated
  with check (pegawai_id = auth.uid() and public.saya_aktif());

drop policy if exists "presensi pulang" on public.presensi;
create policy "presensi pulang" on public.presensi
  for update to authenticated
  using ((pegawai_id = auth.uid() and tanggal = public.hari_ini()) or public.saya_admin())
  with check ((pegawai_id = auth.uid() and tanggal = public.hari_ini()) or public.saya_admin());

-- Tanpa kebijakan delete untuk pegawai, tidak ada cara menghapus absen
-- terlambat lalu absen ulang.
drop policy if exists "presensi hapus" on public.presensi;
create policy "presensi hapus" on public.presensi
  for delete to authenticated using (public.saya_admin());

-- ---------- Pengajuan ----------
drop policy if exists "pengajuan baca" on public.pengajuan;
create policy "pengajuan baca" on public.pengajuan
  for select to authenticated
  using (pegawai_id = auth.uid() or public.saya_admin());

drop policy if exists "pengajuan ajukan" on public.pengajuan;
create policy "pengajuan ajukan" on public.pengajuan
  for insert to authenticated
  with check (pegawai_id = auth.uid() and public.saya_aktif() and status = 'Menunggu');

-- Pegawai tidak bisa menyetujui cutinya sendiri.
drop policy if exists "pengajuan putuskan" on public.pengajuan;
create policy "pengajuan putuskan" on public.pengajuan
  for update to authenticated
  using (public.saya_admin()) with check (public.saya_admin());

drop policy if exists "pengajuan tarik" on public.pengajuan;
create policy "pengajuan tarik" on public.pengajuan
  for delete to authenticated
  using ((pegawai_id = auth.uid() and status = 'Menunggu') or public.saya_admin());


-- ============================================================
-- 6. PENYIMPANAN FOTO (Storage)
-- ------------------------------------------------------------
-- Bucket privat. Foto tidak pernah punya alamat publik; panel admin
-- membukanya lewat URL bertanda tangan yang kedaluwarsa sendiri.
-- Pola nama berkas: <id-pegawai>/<tanggal>-masuk.jpg
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bukti', 'bukti', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/webp'];

drop policy if exists "bukti unggah" on storage.objects;
create policy "bukti unggah" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bukti'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.saya_aktif()
  );

drop policy if exists "bukti baca" on storage.objects;
create policy "bukti baca" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bukti'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.saya_admin())
  );

-- Sengaja TIDAK ada kebijakan update untuk pegawai: foto bukti tidak
-- dapat ditimpa setelah terunggah.
drop policy if exists "bukti hapus admin" on storage.objects;
create policy "bukti hapus admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bukti' and public.saya_admin());


-- ============================================================
-- 7. ISI AWAL
-- ============================================================

-- ---------- Titik kantor ----------
-- Koordinat di bawah masih titik lama dan HARUS Anda ganti — lewat
-- Panel Admin → Lokasi Kantor setelah masuk, atau langsung di sini.
insert into public.pengaturan (id, kantor_nama, kantor_alamat, kantor_lat, kantor_lng, radius)
values (1,
        'Kantor Balai Wilayah Sungai Maluku',
        'Ganti alamat ini',
        -6.23553, 106.79752, 100)
on conflict (id) do nothing;

-- ---------- Unit kerja ----------
insert into public.unit_kerja (nama) values
  ('PPK PSDA')
on conflict (nama) do nothing;

-- ============================================================
-- ADMIN PERTAMA — WAJIB DIGANTI
-- ------------------------------------------------------------
-- Ada masalah ayam-dan-telur: hanya admin yang boleh mengisi daftar
-- pegawai, tapi belum ada admin sama sekali. Baris di bawah memutus itu.
-- SQL Editor berjalan sebagai postgres sehingga tidak terhalang RLS.
--
-- GANTI ketiga nilai ini dengan milik Anda. Sesudah dijalankan, buka
-- Kompas → Daftar → masukkan email yang sama → buat sandi Anda sendiri.
-- Sandi itu tidak pernah lewat sini dan tidak pernah saya lihat.
-- ============================================================
insert into public.pegawai_terdaftar (email, nik, nama, jabatan, peran, unit_id)
values (
  'ganti@email.anda',                    -- <<< email Anda
  '8101010101010001',                    -- <<< NIK Anda, tepat 16 digit
  'Nama Admin',                          -- <<< nama Anda
  'Pejabat Pembuat Komitmen',
  'admin',
  (select id from public.unit_kerja where nama = 'PPK PSDA')
)
on conflict (email) do nothing;


-- ============================================================
-- SELESAI
-- Table Editor harus menampilkan 6 tabel, semuanya "RLS enabled".
-- ============================================================
