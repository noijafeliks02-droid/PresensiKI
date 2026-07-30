# PresensiKu — Aplikasi Presensi Online Berbasis Lokasi

Versi tampilan **"Kop Surat"**, siap diunggah sebagai repositori baru.
Langkahnya ada di [PANDUAN-PUBLIKASI.md](PANDUAN-PUBLIKASI.md).

Prototipe sistem presensi pegawai untuk lingkungan Kementerian Pekerjaan Umum.

Tampilannya mengikuti arah visual **"Kop Surat"** dari
`design_handoff_presensiku`: tenang, resmi, rata kiri, banyak ruang kosong,
tanpa gradasi, tanpa bayangan dekoratif. Aksen tunggal berupa garis emas tipis.
Daftar dan tabel memakai garis pemisah, bukan tumpukan kartu. Tipografi
memakai **Caprasimo** untuk angka besar dan judul, **Figtree** untuk seluruh
teks lainnya. Tersedia **mode gelap** penuh di kedua aplikasi — sakelarnya ada
di Profil (pegawai) dan di bawah sidebar (admin), dan pilihannya diingat.

Terdiri dari **dua aplikasi**:

| Aplikasi | Berkas | Untuk siapa |
|---|---|---|
| Aplikasi pegawai (mobile) | `pegawai.html` | Pegawai — check-in/out, riwayat, izin & cuti |
| Panel admin (desktop) | `admin.html` | Biro SDM — rekap, persetujuan, laporan |
| Halaman pembuka | `index.html` | Pemilih antara keduanya |

> **Status: prototipe tampilan.** Belum ada server/backend. Seluruh data
> adalah data contoh yang tersimpan di browser (localStorage), sehingga
> aplikasi bisa langsung diperagakan ke pimpinan tanpa persiapan apa pun.
> Bagian "Langkah berikutnya" di bawah menjelaskan cara menjadikannya nyata.

---

## Cara menjalankan

GPS dan kamera **hanya diizinkan browser** kalau halaman dibuka lewat
`https://` atau `localhost`. Membuka berkasnya langsung dengan klik ganda
(`file://`) tetap menampilkan seluruh tampilan, tetapi lokasi dan kamera
akan mati.

### Cara termudah (Windows, tanpa memasang apa pun)

Klik ganda **`Jalankan Aplikasi.bat`**.

Browser akan terbuka otomatis di `http://localhost:8080`. Untuk menghentikan,
tutup jendela hitam yang muncul atau tekan `Ctrl+C` di dalamnya.

### Agar bisa dibuka dari HP mana saja

Terbitkan ke GitHub Pages — langkahnya lengkap di
**[PANDUAN-PUBLIKASI.md](PANDUAN-PUBLIKASI.md)**, termasuk cara menyiapkan
titik kantor dan hal-hal yang perlu diperhatikan sebelum diperagakan ke
pimpinan. Setelah terbit, aplikasi bisa **ditambahkan ke layar utama HP**
lewat manifest PWA sehingga terbuka layar penuh seperti aplikasi biasa.

---

## Memperagakan aplikasinya

1. Buka `http://localhost:8080` → pilih **Aplikasi Pegawai**.
2. Tekan **Masuk** (NIP dan kata sandi sudah terisi contoh).
3. Kalau Anda sedang tidak berada di titik kantor, tombol Check In akan
   nonaktif — itu memang perilaku yang benar. Ada dua cara mengatasinya
   saat demo:
   - **Profil → Mode demo** → aktifkan. Pengecekan radius dilewati.
   - Atau di **Panel Admin → Lokasi Kantor** tekan **"Pakai lokasi saya
     sekarang"** lalu **Simpan**, sehingga titik kantor pindah ke posisi Anda.
4. Check In → layar selfie → tekan tombol rana → layar sukses. Lalu buka
   **Panel Admin → Bukti Absen**: foto Anda barusan sudah ada di kartu paling
   atas dengan penanda hijau **ASLI**. Klik kartunya untuk melihat koordinat,
   akurasi GPS, dan jaraknya.
5. Buka **Izin & Cuti → Ajukan Pengajuan**, kirim satu pengajuan.
6. Buka **Panel Admin → Izin & Cuti** — pengajuan tadi muncul di sana dan
   bisa **Setujui/Tolak**. Angka ringkasan dan badge di sidebar ikut berubah.
7. **Panel Admin → Pegawai** → tekan ikon pensil pada baris paling atas
   (Budi Santoso), ubah jabatan atau unit kerjanya, lalu Simpan. Kembali ke
   aplikasi pegawai dan buka **Profil** — datanya sudah ikut berubah.
8. Masih di menu Pegawai, tekan **Unit Kerja** → ganti nama salah satu unit,
   atau hapus satu unit dan pindahkan pegawainya ke unit lain.
9. **Laporan** → pilih jenis laporan → **Unduh Excel** atau **Cetak / PDF**.

Untuk mengembalikan semua data contoh ke kondisi awal:
**Profil → Kembalikan data contoh ke awal**.

---

## Fitur yang sudah jalan

**Aplikasi pegawai** — Login · Beranda dengan jam langsung dan status lokasi ·
Verifikasi lokasi · Verifikasi wajah · Layar berhasil · Riwayat presensi per
bulan · Izin & Cuti · Form pengajuan · Profil.

Alur presensinya: **Beranda → Verifikasi lokasi → Selfie → Berhasil**. Bottom
navigation berisi Beranda · Riwayat · Izin · Profil; layar verifikasi lokasi
adalah bagian dari alur check-in, bukan tab tersendiri.

- **Geofencing sungguhan.** Jarak dihitung dengan rumus Haversine dari
  koordinat GPS asli perangkat ke titik kantor. Check-in ditolak bila di luar
  radius, dan juga bila akurasi GPS lebih buruk dari 100 m.
- **Batas radius tidak diperlihatkan kepada pegawai.** Aplikasi hanya
  mengatakan "Anda berada di kantor" atau "Belum berada di kantor" — tanpa
  angka jarak, tanpa besar radius, dan petanya pun tidak menggambar lingkaran
  geofence maupun titik posisi pegawai. Lihat bagian "Kerahasiaan radius"
  di bawah.
- **Kamera sungguhan.** Selfie diambil dari kamera depan, dikompres ke JPEG
  ±40 KB. Bila kamera tidak tersedia, alur tetap berlanjut tanpa foto.
- **Status keterlambatan otomatis** dengan membandingkan jam check-in
  terhadap batas shift (`07:30`, terlambat bila lewat `08:00`).
- **Peta asli** (Leaflet + OpenStreetMap, basemap CARTO Positron) dengan
  lingkaran radius kantor dan titik pengguna yang bergerak mengikuti GPS.
  Gratis dan tanpa API key.

**Panel admin** — Dashboard · Kehadiran · **Bukti Absen** · Pegawai ·
Izin & Cuti · Lokasi Kantor · Laporan.

- 5 kartu statistik, grafik tren 7 hari, tabel kehadiran, widget sebaran
  check-in, dan panel pengajuan menunggu.
- **Menu Bukti Absen**: galeri foto verifikasi wajah per check-in, bukan
  sekadar status hadir. Lihat bagian di bawah.
- **Kelola data pegawai**: tambah, edit, dan hapus pegawai beserta unit kerja
  dan jabatannya, lengkap dengan validasi (NIP harus angka 8–20 digit dan
  tidak boleh kembar). Pemilik akun aplikasi pegawai dilindungi dari
  penghapusan, dan perubahan datanya langsung terlihat di aplikasi pegawai.
- **Kelola unit kerja** lewat tombol **Unit Kerja** di menu Pegawai: tambah,
  ganti nama, dan hapus — lihat bagian di bawah.
- Pencarian, penyaringan (status & unit kerja), dan paginasi daftar pegawai.
- Persetujuan izin/cuti yang langsung memperbarui seluruh angka terkait.
- **Peta interaktif di menu Lokasi Kantor**: klik peta atau tarik pin emas
  untuk memindahkan titik kantor, dan lingkaran radius langsung berubah saat
  angkanya diketik — jadi cakupannya terlihat sebelum disimpan.
- Widget "Sebaran Check-in" di Dashboard juga memakai peta asli.
- Pengaturan titik kantor & radius, termasuk tombol "pakai lokasi saya".
- Ekspor **CSV siap-Excel** (pemisah titik-koma + BOM UTF-8, sehingga kolom
  langsung rapi di Excel berbahasa Indonesia) dan **cetak PDF** lewat dialog
  cetak browser.

---

## Struktur berkas

```
index.html               halaman pembuka
pegawai.html             aplikasi pegawai (mobile)
admin.html               panel admin (desktop)
jalankan-server.ps1      server lokal, dipanggil oleh berkas .bat
Jalankan Aplikasi.bat    klik ganda untuk menjalankan

assets/css/
  tokens.css             warna, tipografi, radius, bayangan, animasi
  app.css                gaya aplikasi pegawai
  admin.css              gaya panel admin

assets/js/
  icons.js               kumpulan ikon SVG
  util.js                Haversine, format tanggal Indonesia, ekspor CSV/PDF
  data.js                data contoh + penyimpanan localStorage
  peta.js                peta Leaflet: pin kantor, lingkaran radius, titik pegawai
  app.js                 logika aplikasi pegawai
  admin.js               logika panel admin
```

---

## Batas penting: data terikat pada perangkat

Aplikasi ini belum punya server. Seluruh data — presensi, foto bukti, titik
kantor, pengajuan cuti — disimpan di dalam browser **perangkat itu sendiri**
(`localStorage`). Akibatnya, dan ini bukan kerusakan melainkan konsekuensi
langsung dari memilih prototipe tanpa backend:

- Absen di HP **tidak** muncul di panel admin yang dibuka di laptop.
- Titik kantor yang diubah di laptop **tidak** ikut berubah di HP.
- Menghapus data peramban akan menghapus seluruh presensi dan fotonya.

Yang **sudah** tersinkron: dua tab pada **perangkat dan peramban yang sama**.
Membuka aplikasi pegawai dan panel admin berdampingan akan saling memperbarui
seketika — pengajuan cuti yang dikirim pegawai langsung muncul di admin, dan
titik kantor yang digeser admin langsung dipakai aplikasi pegawai.

### Menyiapkan beberapa perangkat: tautan pengaturan

Supaya titik kantor tidak perlu disetel ulang satu per satu, buka
**Panel Admin → Lokasi Kantor → Kirim ke perangkat lain**. Akan muncul tautan
yang memuat titik kantor dan radiusnya. Kirim lewat WhatsApp atau email, lalu
buka di perangkat tujuan — pengaturannya langsung terpasang di sana dan
tersimpan permanen.

Tautan itu hanya membawa titik kantor. Data presensi, foto, dan pengajuan
tetap milik masing-masing perangkat.

### Kalau memang butuh benar-benar universal

Satu-satunya jalan adalah memasang backend (Firebase, Supabase, atau server
instansi sendiri). Seluruh aplikasi membaca lewat objek `DB` di
`assets/js/data.js`, jadi yang perlu diganti hanya lapisan itu — bukan
merombak aplikasinya.

---

## Menu Bukti Absen

Menu ini menjawab pertanyaan yang tidak bisa dijawab kolom status: *benarkah
orang itu sendiri yang absen, dan dari mana?* Isinya galeri kartu — satu kartu
per pegawai — berisi foto verifikasi wajah, jam masuk, dan penanda merah
**LUAR** bila check-in tercatat di luar radius kantor.

Klik sebuah kartu untuk membuka detailnya: foto ukuran penuh berdampingan
dengan sebelas baris metadata — NIP, unit kerja, jabatan, tanggal, jam masuk
dan keluar, status, **koordinat lengkap**, jarak ke kantor, akurasi GPS, dan
posisi dalam/luar radius. Inilah bahan yang dibutuhkan admin saat sebuah
kehadiran perlu dipertanyakan.

Penyaringnya: tanggal, ketersediaan foto (ada / tidak ada), status, unit kerja,
dan pencarian nama atau NIP. Seluruh daftar dapat diunduh sebagai CSV lengkap
dengan koordinat dan akurasinya.

**Foto asli vs foto contoh.** Setiap kartu diberi penanda. Yang bertanda hijau
**ASLI** adalah selfie sungguhan yang diambil kamera lewat aplikasi pegawai —
foto ini juga bisa diunduh dari dialog detail. Yang bertanda **CONTOH** adalah
gambar bikinan untuk 247 pegawai fiktif; gambarnya berupa siluet bergaris
tulisan "FOTO CONTOH", bukan wajah orang sungguhan, supaya tidak pernah
tertukar dengan bukti asli.

**Penyimpanan dan arsip.** Foto check-in tersimpan bersama presensinya. Saat
hari berganti, presensi kemarin tidak dibuang melainkan dipindahkan ke arsip
lengkap dengan fotonya, dan tanggal-tanggal itu muncul di penyaring tanggal.
Arsip dibatasi 40 hari terakhir. Kalau penyimpanan browser penuh, yang
dilepaskan lebih dulu adalah **foto arsip paling lama** — catatan jam, lokasi,
dan statusnya tidak pernah ikut hilang, sehingga rekap tetap utuh.

Pada prototipe ini hanya akun pegawai yang dipakai demo yang punya arsip
sungguhan; di versi berbackend seluruh pegawai memilikinya.

---

## Mengelola unit kerja

Tombol **Unit Kerja** di menu Pegawai membuka daftar unit beserta jumlah
pegawai di masing-masing unit. Setiap baris punya tombol ganti nama dan hapus.

**Ganti nama** memperbarui seluruh pegawai di unit tersebut sekaligus — tidak
ada yang tertinggal memakai nama lama, termasuk di tabel kehadiran, laporan,
dan aplikasi pegawai. Untuk unit bawaan, nama aslinya tetap dicatat dan
ditampilkan sebagai keterangan "Semula: …", supaya jejak perubahannya jelas.

**Hapus** tidak pernah membuat pegawai kehilangan unit. Kalau unit yang
dihapus masih berisi pegawai, dialognya mewajibkan memilih unit tujuan lebih
dulu, lalu seluruh pegawai dipindahkan ke sana sebelum unitnya dihapus. Unit
yang sudah kosong bisa langsung dihapus. Unit kerja terakhir tidak bisa
dihapus — harus selalu ada minimal satu.

Unit bawaan yang dihapus dapat **dimunculkan kembali** dengan menambahkannya
lagi memakai nama yang sama; sistem memulihkannya, bukan membuat entri kedua.

Satu catatan kecil: pengajuan izin/cuti menyimpan nama unit pada saat
diajukan. Selama pegawainya masih terdaftar, tabel dan laporan menampilkan
unitnya yang sekarang, sehingga penggantian nama tidak meninggalkan nama lama
berserakan.

---

## Kerahasiaan radius

Pegawai sengaja **tidak diberi tahu** seberapa jauh mereka dari kantor maupun
berapa besar radiusnya. Yang mereka lihat hanya dua keadaan: sudah di kantor,
atau belum. Alasannya sederhana — begitu seseorang tahu "kurang 12 meter lagi",
batas itu berubah dari aturan menjadi sesuatu yang bisa dicoba-coba dari
seberang jalan atau dari tempat parkir.

Yang dihilangkan dari aplikasi pegawai:

| Dulu | Sekarang |
|---|---|
| "45 m dari titik · radius 100 m" | "Anda berada di kantor" |
| "Anda 400 m di luar radius kantor" | "Anda belum berada di lokasi kantor" |
| Kartu "Jarak Anda" & "Radius Kantor" | Baris jam kerja |
| Peta dengan lingkaran radius + titik pengguna | Peta rujukan letak kantor saja |
| "Akurasi GPS 120 m, terlalu kasar (maks 100 m)" | "Sinyal GPS belum akurat…" |

> Catatan: dokumen desain `design_handoff_presensiku` sebenarnya menampilkan
> jarak kepada pegawai ("Anda 240 m di luar area kantor"). Instruksi Anda untuk
> menyembunyikannya lebih diutamakan, jadi bagian itu **sengaja tidak diikuti**.

**Data lengkapnya tetap dicatat** — koordinat, akurasi, dan jarak dalam meter
ikut tersimpan pada setiap check-in, dan admin tetap melihat kolom
Dalam/Luar radius di menu Kehadiran serta angka radius di Lokasi Kantor.
Yang berubah hanya apa yang ditampilkan ke pegawai.

Konsekuensi yang perlu diketahui: pegawai yang berdiri tepat di luar batas
karena GPS meleset tidak tahu seberapa dekat mereka, jadi petunjuknya
diarahkan ke tindakan yang benar ("masuk ke area kantor", "pindah ke tempat
lebih terbuka"). Kalau nanti dirasa terlalu ketat, tampilkan kembali jaraknya
dengan mengubah pesan di fungsi `bolehAbsen()` dan `kartuGPS()`
di `assets/js/app.js`.

---

**Catatan soal peta.** Leaflet dimuat dari CDN (unpkg) dan ubin petanya dari
CARTO/OpenStreetMap, jadi peta butuh koneksi internet. Bila koneksi tidak ada,
pustaka gagal dimuat dan aplikasi **otomatis kembali ke peta ilustratif** —
seluruh fungsi lain (jarak, radius, check-in) tetap berjalan normal karena
perhitungannya memakai koordinat GPS, bukan peta. Atribusi OpenStreetMap dan
CARTO dirender manual di bawah peta agar tidak tertutup panel.

Data contoh dibangkitkan **deterministik** (seeded random), sehingga angka
yang muncul selalu sama setiap halaman dibuka — penting agar demo tidak
berubah-ubah. Roster uji berisi **3 pegawai** pada satu unit kerja
(**PPK PSDA**); unit lain ditambahkan sendiri lewat panel admin.

Komposisi kehadirannya dikunci: satu pegawai contoh tepat waktu, satu
terlambat dan tercatat di luar radius (bahan audit untuk menu Bukti Absen).
Pemilik akun tidak diberi status karangan — statusnya dibaca dari presensi
sungguhan, sehingga angka di dashboard admin benar-benar berubah saat
tombol absen ditekan.

---

## Langkah berikutnya menuju versi produksi

1. **Backend.** Ganti isi objek `DB` di `assets/js/data.js` dengan pemanggilan
   API. Bagian aplikasi lainnya membaca lewat `DB`, jadi tidak perlu diubah.
   Endpoint yang dibutuhkan sudah tercantum di dokumen handoff:
   `POST /attendance/checkin`, `POST /attendance/checkout`,
   `GET /attendance/history`, `GET /dashboard/summary`,
   `POST|GET /leave`, `PATCH /leave/:id`, `GET /offices`, `GET /me`.
2. **Autentikasi sungguhan.** Saat ini form login menerima isian apa pun.
3. **Validasi di sisi server.** Pengecekan radius saat ini terjadi di
   perangkat, jadi secara teknis masih bisa diakali. Untuk produksi, kirim
   koordinat + waktu ke server dan lakukan pengecekan ulang di sana — jangan
   percaya jam perangkat. Tambahkan pula deteksi *mock location*
   (`isFromMockProvider` di Android).
4. **Peta.** Sudah memakai peta asli (Leaflet + OpenStreetMap). Bila instansi
   mensyaratkan Google Maps, ganti isi `assets/js/peta.js` saja — seluruh
   pemanggilnya lewat `buatPetaPresensi()`. Untuk pemakaian dengan trafik
   tinggi, pertimbangkan penyedia ubin berbayar atau server ubin sendiri,
   sesuai kebijakan wajar-pakai OpenStreetMap.
5. **Penyimpanan foto.** Selfie kini disimpan di localStorage dan diarsipkan
   40 hari. Untuk produksi, pindahkan ke object storage dan simpan URL-nya
   saja, lalu ganti `DB.bukti()` di `assets/js/data.js` dengan pemanggilan
   API — menu Bukti Absen membaca seluruh datanya lewat fungsi itu.
6. **Excel asli.** Ekspor sekarang berupa CSV yang dibuka Excel dengan rapi.
   Bila perlu berkas `.xlsx` sungguhan lengkap dengan format, tambahkan
   pustaka SheetJS.
