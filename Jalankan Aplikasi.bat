@echo off
REM Menjalankan PresensiKu di http://localhost:8080 lalu membuka browser.
REM Tutup jendela ini (atau tekan Ctrl+C) untuk menghentikan server.
title PresensiKu - Server Lokal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0jalankan-server.ps1"
pause
