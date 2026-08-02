-- ============================================================
-- Kompas — Hapus pegawai sampai bersih
-- ------------------------------------------------------------
-- CARA PAKAI
--   Tempel SELURUH berkas ini ke Supabase → SQL Editor → Run.
--   Aman dijalankan berulang.
--
-- ------------------------------------------------------------
-- MENGAPA INI PERLU FUNGSI SENDIRI
--
-- Sampai sekarang panel admin hanya bisa MENONAKTIFKAN pegawai:
-- `aktif` disetel false, aksesnya berhenti, riwayatnya tinggal. Itu yang
-- benar untuk pegawai yang pindah atau berhenti — riwayat presensi adalah
-- dokumen kepegawaian dan tidak boleh lenyap begitu saja.
--
-- Tetapi menonaktifkan tidak menyentuh dua hal:
--
--   1. Akun di auth.users. Orangnya masih bisa memasukkan email dan
--      sandinya, dan yang muncul adalah "Akun Anda belum aktif" —
--      membingungkan bagi admin yang mengira sudah menghapusnya.
--   2. Barisnya di pegawai_terdaftar. Email dan NIK-nya tetap terpakai,
--      sehingga tidak bisa didaftarkan ulang dari nol.
--
-- Untuk salah daftar dan untuk data uji coba, yang dibutuhkan justru
-- hapus sungguhan. auth.users hanya bisa disentuh pemilik basis data,
-- bukan kunci publishable di halaman — jadi jalannya lewat fungsi
-- `security definer` yang memeriksa sendiri siapa pemanggilnya.
--
-- Menghapus baris auth.users otomatis menghapus baris pegawai, seluruh
-- presensi, dan seluruh pengajuannya lewat `on delete cascade` yang sudah
-- terpasang di 01-skema.sql. Fotonya dibuang aplikasi lebih dulu.
-- ============================================================


-- ---------- Berapa yang akan ikut hilang ----------
-- Dipanggil panel admin SEBELUM menghapus, supaya angka yang tampil di
-- layar konfirmasi angka sungguhan dari server, bukan tebakan.
create or replace function public.hitung_data_pegawai(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  d public.pegawai;
  n_presensi  int;
  n_pengajuan int;
begin
  if not public.saya_admin() then
    raise exception 'Hanya admin yang dapat membaca data ini.';
  end if;

  select * into d from public.pegawai where id = p_id;
  if d.id is null then
    raise exception 'Pegawai tidak ditemukan.';
  end if;

  select count(*) into n_presensi  from public.presensi  where pegawai_id = p_id;
  select count(*) into n_pengajuan from public.pengajuan where pegawai_id = p_id;

  return jsonb_build_object(
    'nama',      d.nama,
    'email',     d.email,
    'peran',     d.peran,
    'aktif',     d.aktif,
    'presensi',  n_presensi,
    'pengajuan', n_pengajuan,
    'terdaftar', exists (
      select 1 from public.pegawai_terdaftar where lower(email) = lower(d.email)
    )
  );
end
$$;


-- ---------- Hapus permanen ----------
-- p_simpan_pendaftaran = true  → baris pegawai_terdaftar DIPERTAHANKAN dan
--   penandanya dikembalikan ke "belum mendaftar". Orangnya bisa langsung
--   daftar lagi dengan email yang sama, tanpa admin mengetik ulang
--   NIK, nama, jabatan, dan unitnya.
-- p_simpan_pendaftaran = false → baris itu ikut dihapus. Email dan NIK-nya
--   benar-benar bebas, dan pendaftarannya harus diisi lagi dari nol.
create or replace function public.hapus_pegawai(
  p_id uuid,
  p_simpan_pendaftaran boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  d public.pegawai;
  n_presensi  int;
  n_pengajuan int;
  n_admin     int;
begin
  if not public.saya_admin() then
    raise exception 'Hanya admin yang dapat menghapus pegawai.';
  end if;

  -- Admin yang menghapus dirinya sendiri akan terkunci di luar seketika,
  -- dan tidak ada jalan masuk lain untuk memperbaikinya.
  if p_id = auth.uid() then
    raise exception 'Anda tidak dapat menghapus akun Anda sendiri.';
  end if;

  select * into d from public.pegawai where id = p_id;
  if d.id is null then
    raise exception 'Pegawai tidak ditemukan.';
  end if;

  -- Sistem tanpa admin aktif tidak bisa lagi menyetujui cuti, mendaftarkan
  -- pegawai, maupun mengangkat admin baru. Pintu terakhir dijaga di sini.
  if d.peran = 'admin' and d.aktif then
    select count(*) into n_admin
      from public.pegawai
     where peran = 'admin' and aktif and id <> p_id;
    if n_admin = 0 then
      raise exception 'Ini satu-satunya admin aktif. Angkat admin lain lebih dulu.';
    end if;
  end if;

  select count(*) into n_presensi  from public.presensi  where pegawai_id = p_id;
  select count(*) into n_pengajuan from public.pengajuan where pegawai_id = p_id;

  if p_simpan_pendaftaran then
    update public.pegawai_terdaftar
       set sudah_daftar = false
     where lower(email) = lower(d.email);
  else
    delete from public.pegawai_terdaftar
     where lower(email) = lower(d.email);
  end if;

  -- Satu baris ini yang menghapus semuanya: pegawai, presensi, dan
  -- pengajuan menggantung padanya lewat `on delete cascade`.
  delete from auth.users where id = p_id;

  return jsonb_build_object(
    'nama',        d.nama,
    'email',       d.email,
    'presensi',    n_presensi,
    'pengajuan',   n_pengajuan,
    'pendaftaran', case when p_simpan_pendaftaran then 'disimpan' else 'dihapus' end
  );
end
$$;


-- Kunci publishable memakai peran `anon` sebelum login. Fungsi ini tidak
-- boleh terjangkau dari sana sama sekali — pemeriksaan saya_admin() di
-- dalamnya penjaga kedua, bukan satu-satunya.
revoke all on function public.hitung_data_pegawai(uuid)      from public, anon;
revoke all on function public.hapus_pegawai(uuid, boolean)   from public, anon;
grant execute on function public.hitung_data_pegawai(uuid)    to authenticated;
grant execute on function public.hapus_pegawai(uuid, boolean) to authenticated;


-- ============================================================
-- PERIKSA
-- ------------------------------------------------------------
-- Ditulis sebagai `select`, bukan `raise notice`. Editor SQL Supabase
-- hanya menampilkan hasil select sebagai tabel; pesan notice tidak
-- pernah muncul di layar, sehingga pemeriksaan yang memakainya tampak
-- seperti tidak berjalan.
--
-- Yang benar: DUA baris, keduanya bertanda ✔.
-- ============================================================
select
  p.proname                                                  as fungsi,
  case when p.prosecdef then '✔ security definer'
       else                  '✗ BIASA — ULANGI BERKAS INI' end as mode,
  case when has_function_privilege('authenticated', p.oid, 'execute')
       then '✔ boleh dipanggil admin'
       else '✗ hak eksekusi belum diberikan' end             as hak
from pg_proc p
join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public'
  and p.proname in ('hapus_pegawai', 'hitung_data_pegawai')
order by 1;
