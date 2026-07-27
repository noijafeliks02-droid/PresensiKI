# Panduan Publikasi — Repositori Baru

Folder ini berisi PresensiKu versi tampilan **"Kop Surat"**, siap diunggah
sebagai repositori GitHub yang baru dan terpisah dari yang lama.

Hasil akhirnya berupa alamat seperti:

```
https://namaakun.github.io/presensiku-baru/
```

Karena alamatnya `https://`, GPS dan kamera berfungsi penuh — atasan Anda bisa
benar-benar mencoba check-in dari HP, bukan sekadar melihat tangkapan layar.

> **Repositori lama tidak terpengaruh.** Situs di
> `noijafeliks02-droid.github.io/Presensiku/` akan tetap menampilkan tampilan
> versi sebelumnya sampai Anda menghapusnya atau memperbaruinya sendiri.

---

## Langkah 1 — Buat repositori baru

1. Buka <https://github.com/new>
2. **Repository name**: `presensiku-baru` (atau nama lain, tanpa spasi)
3. Pilih **Public**

   GitHub Pages pada paket gratis hanya melayani repositori publik. Isi
   aplikasi ini hanya data contoh — tidak ada data pegawai sungguhan — jadi
   aman dipublikasikan. Kalau instansi mengharuskan privat, pakai Netlify atau
   Cloudflare Pages sebagai gantinya.
4. **Jangan** centang "Add a README file" — repositori harus kosong
5. Klik **Create repository**

---

## Langkah 2 — Unggah isinya

Tanpa terminal, tanpa git.

1. Di halaman repositori yang baru dibuat, klik tautan
   **uploading an existing file**.
2. Buka **File Explorer** ke folder `D:\PresensiKu`
3. Tekan `Ctrl+A` untuk memblok **seluruh isinya**, lalu **seret** ke area
   bertulisan *"Drag files here"* di browser.
4. Gulir ke bawah, klik tombol hijau **Commit changes**.

> Seret **isi** foldernya, bukan folder `PresensiKu`-nya. Kalau yang terunggah
> foldernya, alamat situsnya jadi salah.

> Dua berkas bernama `.gitignore` dan `.nojekyll` tersembunyi di Windows dan
> mungkin tidak ikut terseret. **Tidak masalah** — keduanya bukan bagian
> aplikasi dan situsnya tetap berjalan normal tanpa mereka.

---

## Langkah 3 — Aktifkan GitHub Pages

1. Di repositori, buka tab **Settings**
2. Menu kiri → **Pages**
3. **Source**: `Deploy from a branch`
4. **Branch**: pilih `main`, folder `/ (root)` → **Save**
5. Tunggu satu sampai dua menit, lalu muat ulang halaman itu — alamatnya akan
   muncul di bagian atas

---

## Mencobanya di HP

1. Buka alamat `https://…` tadi di browser HP
2. Pilih **Aplikasi pegawai** → **Masuk**
3. Saat diminta izin **lokasi** dan **kamera**, pilih **Izinkan**
4. Tambahkan ke layar utama agar terbuka layar penuh seperti aplikasi biasa:
   - **Android/Chrome**: menu ⋮ → *Tambahkan ke layar utama*
   - **iPhone/Safari**: tombol bagikan → *Add to Home Screen*

---

## Sebelum diperagakan ke atasan

**Setel titik kantor ke lokasi sebenarnya.** Bawaannya masih Jl. Pattimura
No. 20. Buka **Panel admin → Lokasi kantor**, tekan **"Pakai lokasi saya
sekarang"** saat Anda berada di kantor, atur radiusnya lewat slider, lalu
**Simpan**. Tanpa ini, check-in akan selalu ditolak.

**Kalau demo dilakukan di luar kantor**, aktifkan **Profil → Mode demo** di
aplikasi pegawai supaya pengecekan lokasi dilewati.

**Peragakan dari satu perangkat.** Prototipe ini belum punya server, jadi data
tersimpan di browser masing-masing perangkat. Absen di HP tidak akan muncul di
panel admin yang dibuka di laptop. Cara paling meyakinkan: buka **aplikasi
pegawai dan panel admin berdampingan di dua tab** pada perangkat yang sama —
keduanya saling memperbarui seketika.

Untuk menyiapkan perangkat kedua, pakai **Panel admin → Lokasi kantor →
Kirim ke perangkat lain**: salin tautannya, kirim lewat WhatsApp, buka di
perangkat tujuan.

**Panel admin belum terkunci.** Siapa pun yang memegang tautan bisa membuka
`admin.html`. Untuk prototipe berdata fiktif ini tidak masalah, tetapi jangan
memasukkan data pegawai sungguhan sebelum autentikasi dan backend dipasang.

---

## Menjalankan di komputer tanpa internet publik

Klik ganda **`Jalankan Aplikasi.bat`** di folder ini. Browser akan terbuka di
`http://localhost:8080`. Tutup jendela hitamnya untuk menghentikan server.
