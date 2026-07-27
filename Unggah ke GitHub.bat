@echo off
REM Mengunggah seluruh isi folder ini ke repositori GitHub PresensiKI.
REM Klik ganda berkas ini setiap kali ada perubahan yang ingin diterbitkan.
title Unggah PresensiKu ke GitHub
cd /d "%~dp0"

echo.
echo   Mengunggah PresensiKu ke GitHub...
echo.
echo   Kalau muncul jendela login, pilih "Sign in with your browser"
echo   lalu klik Authorize. Ini hanya diminta sekali.
echo.

git add -A
git commit -m "Perbarui tampilan PresensiKu" 2>nul
git push -u origin main

echo.
if errorlevel 1 (
  echo   GAGAL. Salin pesan di atas dan tunjukkan ke Claude.
) else (
  echo   BERHASIL. Situs akan diperbarui dalam 1-2 menit di:
  echo   https://noijafeliks02-droid.github.io/PresensiKI/
)
echo.
pause
