-- ============================================================
-- Kompas — Skema basis data (Supabase / PostgreSQL)
-- Balai Wilayah Sungai Maluku
-- ------------------------------------------------------------
-- Tempel SELURUH berkas ini ke Supabase → SQL Editor → Run.
-- Aman dijalankan pada proyek yang masih kosong.
--
-- Tiga hal yang dikerjakan skema ini, dan tidak bisa dikerjakan
-- oleh prototipe localStorage:
--
--   1. Jam presensi ditetapkan SERVER, bukan HP pegawai. Mengubah
--      jam di HP tidak lagi mengubah jam absen.
--   2. Status "Tepat waktu / Terlambat" dihitung server dari jam
--      server. Pegawai tidak bisa mengaku tepat waktu.
--   3. Bukti yang sudah tercatat tidak dapat ditimpa oleh siapa pun
--      kecuali admin — jam, foto, maupun rekaman verifikasi wajah.
--
-- Zona waktu dipatok Asia/Jayapura (WIT, UTC+9) sesuai Maluku,
-- supaya batas hari dan batas terlambat tidak ikut zona HP.
-- ============================================================

-- Zona waktu default untuk seluruh perhitungan tanggal di bawah.
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

-- ---------- Pegawai ----------
-- Barisnya ditautkan satu-satu ke akun di auth.users. Menghapus akun
-- ikut menghapus profilnya; menonaktifkan pegawai cukup lewat `aktif`
-- supaya riwayat presensinya tidak hilang.
create table if not exists public.pegawai (
  id           uuid primary key references auth.users(id) on delete cascade,
  nip          text not null unique,
  nama         text not null,
  jabatan      text,
  unit_id      uuid references public.unit_kerja(id) on delete set null,
  peran        text not null default 'pegawai' check (peran in ('pegawai', 'admin')),
  aktif        boolean not null default true,
  cuti_kuota   int  not null default 12 check (cuti_kuota >= 0),
  dibuat       timestamptz not null default now()
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
-- Satu baris per pegawai per hari. Kolom *_masuk diisi saat check-in,
-- kolom *_keluar saat absen pulang. `verifikasi_*` menyimpan rekaman
-- dua langkah gerak wajah — inilah yang dibuka admin saat memeriksa
-- keaslian bukti.
create table if not exists public.presensi (
  id          uuid primary key default gen_random_uuid(),
  pegawai_id  uuid not null references public.pegawai(id) on delete cascade,
  tanggal     date not null default public.hari_ini(),
  status      text not null default 'Belum absen'
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
-- `security definer` di sini WAJIB. Tanpa itu, kebijakan RLS pada
-- tabel pegawai akan membaca tabel pegawai lagi lewat fungsi ini dan
-- Postgres menolaknya sebagai rekursi tak berujung.
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
-- 3. PENJAGA INTEGRITAS BUKTI
-- ============================================================

-- Jam dan status ditetapkan server. Apa pun yang dikirim peramban
-- untuk kedua kolom itu diabaikan.
create or replace function public.stempel_presensi()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare batas time;
begin
  select batas_terlambat into batas from public.pengaturan where id = 1;

  if tg_op = 'INSERT' then
    new.tanggal := public.hari_ini();
    if new.jam_masuk is not null then new.jam_masuk := now(); end if;
    if new.jam_keluar is not null then new.jam_keluar := now(); end if;
  else
    -- Absen pulang: jam diambil dari server saat kolomnya baru terisi.
    if old.jam_keluar is null and new.jam_keluar is not null then
      new.jam_keluar := now();
    end if;
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

  if old.jam_masuk is not null and new.jam_masuk is distinct from old.jam_masuk then
    raise exception 'Jam masuk sudah tercatat dan tidak dapat diubah.';
  end if;
  if old.foto_masuk is not null and new.foto_masuk is distinct from old.foto_masuk then
    raise exception 'Foto masuk sudah tercatat dan tidak dapat diubah.';
  end if;
  if old.jam_keluar is not null and new.jam_keluar is distinct from old.jam_keluar then
    raise exception 'Jam pulang sudah tercatat dan tidak dapat diubah.';
  end if;
  if old.foto_keluar is not null and new.foto_keluar is distinct from old.foto_keluar then
    raise exception 'Foto pulang sudah tercatat dan tidak dapat diubah.';
  end if;

  return new;
end
$$;

-- Urutan pemicu mengikuti urutan abjad: stempel_ dulu, lalu jaga_.
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
-- 4. ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Kunci utama keamanan aplikasi ini. Halaman Kompas adalah berkas
-- statis di GitHub Pages, jadi anon key-nya PASTI terlihat siapa pun
-- yang membuka kode sumber halaman. Yang menahan mereka bukan
-- kerahasiaan kunci itu, melainkan kebijakan di bawah ini: kunci anon
-- tanpa login tidak bisa membaca satu baris pun.
--
-- Karena itu RLS TIDAK BOLEH dimatikan pada tabel mana pun, walau
-- sebentar, walau untuk mempermudah pengujian.
-- ============================================================

alter table public.unit_kerja enable row level security;
alter table public.pegawai    enable row level security;
alter table public.pengaturan enable row level security;
alter table public.presensi   enable row level security;
alter table public.pengajuan  enable row level security;

-- ---------- Unit kerja ----------
drop policy if exists "unit baca" on public.unit_kerja;
create policy "unit baca" on public.unit_kerja
  for select to authenticated using (public.saya_aktif());

drop policy if exists "unit kelola" on public.unit_kerja;
create policy "unit kelola" on public.unit_kerja
  for all to authenticated using (public.saya_admin()) with check (public.saya_admin());

-- ---------- Pegawai ----------
-- Pegawai hanya melihat dirinya sendiri; hanya admin melihat roster.
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

-- Absen hanya untuk diri sendiri, hanya untuk hari ini.
drop policy if exists "presensi absen" on public.presensi;
create policy "presensi absen" on public.presensi
  for insert to authenticated
  with check (pegawai_id = auth.uid() and public.saya_aktif());

drop policy if exists "presensi pulang" on public.presensi;
create policy "presensi pulang" on public.presensi
  for update to authenticated
  using ((pegawai_id = auth.uid() and tanggal = public.hari_ini()) or public.saya_admin())
  with check ((pegawai_id = auth.uid() and tanggal = public.hari_ini()) or public.saya_admin());

-- Menghapus bukti hanya hak admin. Tanpa kebijakan delete untuk
-- pegawai, tidak ada cara menghapus absen terlambat lalu absen ulang.
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

-- Hanya admin yang memutuskan. Pegawai tidak bisa menyetujui cutinya
-- sendiri, dan tidak bisa mengubah pengajuan yang sudah diputus.
drop policy if exists "pengajuan putuskan" on public.pengajuan;
create policy "pengajuan putuskan" on public.pengajuan
  for update to authenticated
  using (public.saya_admin()) with check (public.saya_admin());

drop policy if exists "pengajuan tarik" on public.pengajuan;
create policy "pengajuan tarik" on public.pengajuan
  for delete to authenticated
  using ((pegawai_id = auth.uid() and status = 'Menunggu') or public.saya_admin());


-- ============================================================
-- 5. PENYIMPANAN FOTO (Storage)
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

-- Mengunggah hanya ke folder milik sendiri.
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

-- Sengaja TIDAK ada kebijakan update/delete untuk pegawai: foto bukti
-- tidak dapat ditimpa maupun dihapus setelah terunggah.
drop policy if exists "bukti kelola admin" on storage.objects;
create policy "bukti kelola admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bukti' and public.saya_admin());


-- ============================================================
-- 6. ISI AWAL
-- ============================================================

insert into public.pengaturan (id, kantor_nama, kantor_alamat, kantor_lat, kantor_lng, radius)
values (1,
        'Kantor Balai Wilayah Sungai Maluku',
        'Jl. Wolter Monginsidi, Passo, Kota Ambon, Maluku',
        -3.65440, 128.24170, 100)
on conflict (id) do nothing;

-- Unit kerja diisi dengan bidang-bidang yang lazim di sebuah Balai
-- Wilayah Sungai, bukan direktorat jenderal kementerian.
insert into public.unit_kerja (nama) values
  ('Bidang Perencanaan Umum dan Program'),
  ('Bidang Pelaksanaan Jaringan Sumber Air'),
  ('Bidang Pelaksanaan Jaringan Pemanfaatan Air'),
  ('Bidang Operasi dan Pemeliharaan'),
  ('Bagian Tata Usaha'),
  ('Unit Hidrologi dan Kualitas Air'),
  ('Satuan Kerja Non Vertikal Tertentu')
on conflict (nama) do nothing;


-- ============================================================
-- SELESAI
-- Periksa hasilnya: Table Editor harus menampilkan 5 tabel, dan
-- setiap tabel bertanda "RLS enabled".
-- ============================================================
