-- ============================================================
-- Kompas — Admin pertama
-- ------------------------------------------------------------
-- Jalankan SETELAH 01-skema.sql berhasil.
--
-- Ada masalah ayam-dan-telur: hanya admin yang boleh mengisi daftar
-- pegawai, tetapi belum ada admin sama sekali. Berkas ini memutusnya.
-- SQL Editor berjalan sebagai postgres, jadi tidak terhalang RLS.
--
-- Ini BUKAN tempat membuat kata sandi. Yang dibuat di sini hanya izin
-- bahwa email Anda boleh mendaftar. Sandinya Anda buat sendiri nanti
-- di Kompas → Daftar. Sandi itu tidak pernah melewati berkas ini.
-- ============================================================

-- ------------------------------------------------------------
-- GANTI TIGA NILAI DI BAWAH INI. Jangan hapus tanda kutipnya.
-- ------------------------------------------------------------
insert into public.pegawai_terdaftar (email, nik, nama, jabatan, peran, unit_id)
values (
  'ganti@email.anda',            -- email Anda, harus asli (dipakai masuk & setel ulang sandi)
  '1111111111111111',            -- NIK Anda, tepat 16 angka
  'Nama Lengkap Anda',           -- nama yang akan tampil di aplikasi
  'Pejabat Pembuat Komitmen',    -- jabatan; ubah bila perlu
  'admin',                       -- JANGAN diubah — ini yang menjadikan Anda admin
  (select id from public.unit_kerja where nama = 'PPK PSDA')
)
on conflict (email) do update
  set nik     = excluded.nik,
      nama    = excluded.nama,
      jabatan = excluded.jabatan,
      peran   = excluded.peran;
-- ^ Kalau salah ketik lalu dijalankan ulang, barisnya diperbarui —
--   bukan menghasilkan galat "email sudah ada".


-- ------------------------------------------------------------
-- Hasilnya akan tampil di bawah setelah Run.
-- 'sudah_daftar' masih false: itu benar, artinya email Anda sudah
-- diizinkan tetapi akunnya belum dibuat. Kolom itu berubah true
-- sendiri begitu Anda mendaftar dari Kompas.
-- ------------------------------------------------------------
select email, nik, nama, peran, sudah_daftar
  from public.pegawai_terdaftar
 order by dibuat;
