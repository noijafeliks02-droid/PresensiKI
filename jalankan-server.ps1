# ============================================================
#  PresensiKu — server lokal sederhana
#  GPS dan kamera hanya diizinkan browser lewat https:// atau localhost,
#  jadi aplikasi ini tidak bisa dibuka langsung lewat klik ganda file
#  (file://). Skrip ini menyajikan folder aplikasi di http://localhost:8080
#  tanpa perlu memasang Node.js, Python, atau apa pun.
#
#  Cara pakai: klik ganda "Jalankan Aplikasi.bat",
#  atau di PowerShell jalankan:  .\jalankan-server.ps1
#  Hentikan dengan menekan Ctrl+C.
# ============================================================

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8080
$prefix = "http://localhost:$port/"

$mimes = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.md'   = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "Gagal membuka port $port." -ForegroundColor Red
  Write-Host "Kemungkinan port sedang dipakai aplikasi lain."
  Write-Host "Ubah nilai `$port di baris atas berkas ini, lalu coba lagi."
  Write-Host ""
  Read-Host "Tekan Enter untuk menutup"
  exit 1
}

Write-Host ""
Write-Host "  PresensiKu siap." -ForegroundColor Green
Write-Host "  Buka di browser: $prefix" -ForegroundColor Cyan
Write-Host "  Folder          : $root"
Write-Host ""
Write-Host "  Tekan Ctrl+C untuk menghentikan server."
Write-Host ""

Start-Process $prefix

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.LocalPath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

    $file = Join-Path $root $rel
    # Jangan sajikan berkas di luar folder aplikasi.
    # Bandingkan dengan akar yang diakhiri pemisah folder, supaya folder
    # bersebelahan (mis. "...\Aplikasi Absen Lain") tidak ikut lolos.
    $penuh = [IO.Path]::GetFullPath($file)
    $akar = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
    $aman = $penuh.StartsWith($akar, [StringComparison]::OrdinalIgnoreCase)

    # Permintaan HEAD hanya minta header, tanpa isi. Menulis isi ke
    # responsnya membuat HttpListener melempar galat dan server berhenti.
    $kepalaSaja = $ctx.Request.HttpMethod -eq 'HEAD'

    # Satu permintaan bermasalah (mis. browser menutup koneksi di tengah
    # jalan) tidak boleh mematikan seluruh server.
    try {
      if ($aman -and (Test-Path -LiteralPath $penuh -PathType Leaf)) {
        $ext = [IO.Path]::GetExtension($penuh).ToLower()
        $type = $mimes[$ext]
        if (-not $type) { $type = 'application/octet-stream' }

        $bytes = [IO.File]::ReadAllBytes($penuh)
        $ctx.Response.ContentType = $type
        $ctx.Response.Headers.Add('Cache-Control', 'no-store')
        $ctx.Response.ContentLength64 = $bytes.Length
        if (-not $kepalaSaja) { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $msg = [Text.Encoding]::UTF8.GetBytes("404 - $rel tidak ditemukan")
        $ctx.Response.StatusCode = 404
        $ctx.Response.ContentType = 'text/plain; charset=utf-8'
        $ctx.Response.ContentLength64 = $msg.Length
        if (-not $kepalaSaja) { $ctx.Response.OutputStream.Write($msg, 0, $msg.Length) }
      }
      $ctx.Response.Close()
    } catch {
      try { $ctx.Response.Abort() } catch { }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
  Write-Host "Server dihentikan."
}
