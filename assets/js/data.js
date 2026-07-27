/* ============================================================
   Kompas — Data contoh & penyimpanan
   ------------------------------------------------------------
   Ini prototipe tanpa backend. Roster pegawai dan riwayat dibangkitkan
   secara deterministik (seeded RNG) supaya angkanya konsisten setiap kali
   halaman dibuka, sementara hal-hal yang bisa diubah pengguna — presensi
   hari ini, pengajuan cuti, titik kantor — disimpan di localStorage
   sehingga app pegawai dan panel admin saling melihat perubahan.

   Saat backend dipasang, cukup ganti isi objek `DB` di bagian bawah file
   ini dengan pemanggilan API; sisa aplikasi tidak perlu diubah.
   ============================================================ */

/* ---------- Pembangkit acak deterministik (mulberry32) ---------- */
function bikinRng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- Konstanta organisasi ---------- */

const KANTOR_DEFAULT = {
  nama: 'Gedung Utama Kementerian PU',
  alamat: 'Jl. Pattimura No. 20, Kebayoran Baru, Jakarta Selatan',
  lat: -6.23553,
  lng: 106.79752,
  radius: 100,          // meter
};

const SHIFT = {
  nama: 'Shift Pagi',
  masuk: '07:30',
  batasTerlambat: '08:00',   // lewat jam ini dihitung terlambat
  pulang: '16:00',
};

/** Akurasi GPS terburuk yang masih diterima (meter). */
const AKURASI_MAKS = 100;

/* ---------- Verifikasi wajah: tantangan gerak acak ----------
   Foto selfie biasa mudah diakali: pegawai bisa memotret foto lama dari
   layar HP lain, atau menempelkan foto cetak di depan kamera. Karena itu
   aplikasi meminta satu gerakan yang diundi SAAT ITU JUGA, lalu memotret
   dua kali — sebelum dan sesudah aba-aba. Kedua foto dibandingkan: bila
   nyaris tidak ada perubahan, berarti yang ada di depan kamera tidak
   bergerak mengikuti perintah dan verifikasinya ditolak.

   Perintahnya diundi setelah tombol ditekan, jadi tidak bisa disiapkan
   dari rumah. Perintah yang keluar ikut disimpan bersama fotonya, sehingga
   admin bisa memeriksa sendiri apakah wajah di foto benar melakukannya.

   Tiap tantangan punya ambangnya sendiri, karena besar perubahannya jauh
   berbeda: menoleh menggeser hampir seluruh wajah, sedangkan membuka mulut
   hanya mengubah sebagian kecil bingkai. Menyamakan ambangnya akan membuat
   perintah ekspresi selalu dianggap gagal. */
const TANTANGAN = [
  { id: 'kanan', teks: 'Tolehkan kepala ke kanan', ikon: 'chevron', ambang: 8 },
  { id: 'kiri', teks: 'Tolehkan kepala ke kiri', ikon: 'chevron-left', ambang: 8 },
  { id: 'atas', teks: 'Tengadahkan kepala ke atas', ikon: 'chevron-up', ambang: 7 },
  { id: 'dekat', teks: 'Dekatkan wajah ke kamera', ikon: 'target', ambang: 9 },
  { id: 'mulut', teks: 'Buka mulut lebar-lebar', ikon: 'mulut', ambang: 4 },
  { id: 'senyum', teks: 'Tersenyum sambil miringkan kepala', ikon: 'senyum', ambang: 5 },
];

/** Undi satu tantangan. Sengaja Math.random, bukan RNG deterministik —
    justru tidak boleh bisa ditebak. */
function pilihTantangan() {
  return TANTANGAN[Math.floor(Math.random() * TANTANGAN.length)];
}

/** Ambang cadangan bila sebuah tantangan tidak menetapkan ambangnya sendiri. */
const AMBANG_GERAK = 6;

const PROFIL = {
  nama: 'Budi Santoso',
  nip: '198504122010011003',
  jabatan: 'Staf Teknik Jalan & Jembatan',
  unit: 'Ditjen Bina Marga',
  cutiKuota: 12,
  cutiTerpakai: 4,
};

/**
 * Kredensial demo panel admin.
 *
 * Ini prototipe tanpa backend, jadi pemeriksaannya berjalan di peramban.
 * Gerbang ini menahan orang yang tidak tahu kata sandinya — bukan orang
 * yang bisa membuka alat pengembang. Pengamanan sungguhan baru mungkin
 * setelah ada backend yang memeriksa sandi di sisi server.
 */
const AKUN_ADMIN = { nip: '196804251994031002', sandi: 'admin123' };

const UNIT_KERJA = [
  'Ditjen Bina Marga',
  'Ditjen Cipta Karya',
  'Ditjen Sumber Daya Air',
  'Ditjen Perumahan',
  'Ditjen Bina Konstruksi',
  'Sekretariat Jenderal',
  'Inspektorat Jenderal',
  'Badan Pengembangan SDM',
];

const JABATAN = [
  'Staf Teknik Jalan & Jembatan', 'Analis Kepegawaian', 'Perencana Muda',
  'Pengelola Data', 'Surveyor Teknik', 'Bendahara Pengeluaran',
  'Arsiparis', 'Pranata Komputer', 'Auditor Muda', 'Staf Tata Usaha',
];

/* ---------- Pembangkit roster pegawai ---------- */

const DEPAN = ['Budi', 'Siti', 'Agus', 'Dewi', 'Rizky', 'Putri', 'Bambang', 'Ratna',
  'Hendra', 'Maya', 'Andi', 'Nurul', 'Joko', 'Indah', 'Fajar', 'Lestari',
  'Dimas', 'Anisa', 'Yudi', 'Rina', 'Teguh', 'Sari', 'Iwan', 'Fitri',
  'Arif', 'Wulan', 'Bagus', 'Hesti', 'Reza', 'Tiara'];
const BELAKANG = ['Santoso', 'Nurhayati', 'Prasetyo', 'Wijaya', 'Hidayat', 'Rahmawati',
  'Setiawan', 'Kusuma', 'Gunawan', 'Puspita', 'Saputra', 'Anggraini',
  'Firmansyah', 'Maulida', 'Pratama', 'Handayani', 'Nugroho', 'Safitri',
  'Permana', 'Wibowo'];

const TOTAL_PEGAWAI = 248;

/**
 * Bangun daftar pegawai lengkap. Deterministik: seed tetap 20260101 supaya
 * nama dan statistik tidak berubah-ubah tiap refresh.
 */
function bangunPegawai() {
  const r = bikinRng(20260101);
  const daftar = [];
  for (let i = 0; i < TOTAL_PEGAWAI; i++) {
    const nama = `${DEPAN[Math.floor(r() * DEPAN.length)]} ${BELAKANG[Math.floor(r() * BELAKANG.length)]}`;
    daftar.push({
      id: i + 1,
      nama,
      nip: `19${80 + Math.floor(r() * 20)}${pad2(1 + Math.floor(r() * 12))}${pad2(1 + Math.floor(r() * 28))}20${pad2(5 + Math.floor(r() * 15))}${Math.floor(r() * 2) + 1}001`,
      unit: UNIT_KERJA[Math.floor(r() * UNIT_KERJA.length)],
      jabatan: JABATAN[Math.floor(r() * JABATAN.length)],
      inisial: inisial(nama),
    });
  }
  // Pegawai pertama adalah pemilik akun yang sedang login.
  daftar[0] = { id: 1, ...PROFIL, inisial: inisial(PROFIL.nama) };
  return daftar;
}

/**
 * Status kehadiran seluruh pegawai untuk hari ini.
 * Komposisinya dikunci ke angka yang dipakai di desain — 213 tepat waktu,
 * 18 terlambat, 9 izin/cuti, 8 belum absen dari 248 pegawai — supaya
 * persentase di kartu statistik admin (85,9% dan 7,3%) selalu cocok.
 */
const KOMPOSISI_HARI_INI = { 'Tepat waktu': 213, 'Terlambat': 18, 'Izin/Cuti': 9, 'Belum absen': 8 };

function bangunKehadiranHariIni(pegawai) {
  const r = bikinRng(4242);

  // Susun daftar status sesuai kuota, lalu acak urutannya (Fisher–Yates)
  // agar sebarannya tidak berkelompok di tabel.
  const status = [];
  for (const [s, n] of Object.entries(KOMPOSISI_HARI_INI)) {
    for (let i = 0; i < n; i++) status.push(s);
  }
  while (status.length < pegawai.length) status.push('Tepat waktu');
  for (let i = status.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [status[i], status[j]] = [status[j], status[i]];
  }

  // Sebagian kecil yang hadir tercatat di luar radius — ini yang perlu diaudit admin.
  let sisaLuarRadius = 7;

  const k = KANTOR_DEFAULT;
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos(k.lat * Math.PI / 180);

  return pegawai.map((p, i) => {
    const s = status[i];
    let jamMasuk = '—', jamKeluar = '—', lokasi = '—', dalamRadius = false;

    if (s === 'Tepat waktu') {
      jamMasuk = `07:${pad2(5 + Math.floor(r() * 25))}`;
      lokasi = 'Gedung Utama';
      dalamRadius = true;
    } else if (s === 'Terlambat') {
      jamMasuk = `08:${pad2(1 + Math.floor(r() * 40))}`;
      lokasi = r() < 0.7 ? 'Gedung Utama' : 'Gedung Menteri';
      dalamRadius = true;
    }
    if (dalamRadius && sisaLuarRadius > 0 && r() < 0.04) {
      dalamRadius = false;
      sisaLuarRadius--;
    }

    // Koordinat & akurasi ikut dibangkitkan supaya menu Bukti Absen punya
    // metadata yang bisa diperiksa admin, bukan cuma jam dan status.
    let lat = null, lng = null, akurasi = null, jarak = null;
    if (jamMasuk !== '—') {
      const arah = r() * Math.PI * 2;
      jarak = Math.round(dalamRadius ? r() * k.radius * 0.9 : k.radius * (1.2 + r() * 0.9));
      lat = k.lat + (Math.sin(arah) * jarak) / mPerLat;
      lng = k.lng + (Math.cos(arah) * jarak) / mPerLng;
      akurasi = 5 + Math.floor(r() * 25);
      jamKeluar = r() < 0.75 ? `16:${pad2(2 + Math.floor(r() * 45))}` : '—';
    }

    return { ...p, status: s, jamMasuk, jamKeluar, lokasi, dalamRadius, lat, lng, akurasi, jarak };
  });
}

/**
 * Gambar pengganti foto selfie untuk pegawai contoh.
 * Dibuat sebagai SVG (bukan foto orang sungguhan) dan diberi tulisan
 * "FOTO CONTOH" supaya tidak pernah tertukar dengan bukti asli.
 */
function fotoContoh(p) {
  const hue = (p.id * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" viewBox="0 0 240 300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue},30%,74%)"/>
      <stop offset="1" stop-color="hsl(${hue},26%,48%)"/>
    </linearGradient>
  </defs>
  <rect width="240" height="300" fill="url(#g)"/>
  <circle cx="120" cy="116" r="44" fill="rgba(255,255,255,.42)"/>
  <path d="M42 300c0-45 35-77 78-77s78 32 78 77Z" fill="rgba(255,255,255,.42)"/>
  <text x="120" y="176" text-anchor="middle" transform="rotate(-16 120 176)"
        font-family="system-ui,sans-serif" font-size="26" font-weight="700"
        fill="rgba(255,255,255,.55)" letter-spacing="1.5">FOTO CONTOH</text>
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** Tren tujuh hari terakhir untuk grafik batang di dashboard admin. */
function bangunTren() {
  const r = bikinRng(777);
  const hasil = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const akhirPekan = d.getDay() === 0 || d.getDay() === 6;
    const tepat = akhirPekan ? 8 + Math.floor(r() * 10) : 185 + Math.floor(r() * 30);
    const telat = akhirPekan ? 1 + Math.floor(r() * 3) : 10 + Math.floor(r() * 18);
    hasil.push({ tanggal: new Date(d), label: NAMA_HARI[d.getDay()].slice(0, 3), tepat, telat });
  }
  return hasil;
}

/**
 * Riwayat presensi pemilik akun untuk satu bulan tertentu.
 * Hari Sabtu/Minggu dilewati; hari yang belum terjadi juga dilewati.
 */
function bangunRiwayat(tahun, bulan) {
  const r = bikinRng(tahun * 100 + bulan);
  const hariIni = new Date();
  const hasil = [];
  const jml = new Date(tahun, bulan + 1, 0).getDate();

  for (let tgl = 1; tgl <= jml; tgl++) {
    const d = new Date(tahun, bulan, tgl);
    if (d > hariIni) break;
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const u = r();
    let status, masuk, keluar;
    if (u < 0.08) {
      status = 'Izin';
      masuk = '—'; keluar = '—';
    } else if (u < 0.19) {
      status = 'Terlambat';
      masuk = `08:${pad2(2 + Math.floor(r() * 35))}`;
      keluar = `16:${pad2(5 + Math.floor(r() * 40))}`;
    } else {
      status = 'Tepat waktu';
      masuk = `07:${pad2(20 + Math.floor(r() * 39))}`;
      keluar = `16:${pad2(2 + Math.floor(r() * 45))}`;
    }
    hasil.push({ tanggal: kunciTanggal(d), tgl, hari: NAMA_HARI[d.getDay()].slice(0, 3), status, masuk, keluar });
  }
  return hasil.reverse();   // terbaru di atas
}

/* ---------- Warna per status (dipakai chip & kotak tanggal) ---------- */

const WARNA_STATUS = {
  'Tepat waktu': { color: 'var(--green)',  bg: 'var(--green-bg)',  chip: 'chip-green' },
  'Hadir':       { color: 'var(--green)',  bg: 'var(--green-bg)',  chip: 'chip-green' },
  'Terlambat':   { color: 'var(--red)',    bg: 'var(--red-bg)',    chip: 'chip-red' },
  'Izin':        { color: 'var(--yellow)', bg: 'var(--yellow-bg)', chip: 'chip-yellow' },
  'Izin/Cuti':   { color: 'var(--yellow)', bg: 'var(--yellow-bg)', chip: 'chip-yellow' },
  'Belum absen': { color: 'var(--text-muted)', bg: 'var(--field)', chip: 'chip-grey' },
  'Menunggu':    { color: 'var(--yellow)', bg: 'var(--yellow-bg)', chip: 'chip-yellow' },
  'Disetujui':   { color: 'var(--green-dark)', bg: 'var(--green-bg)', chip: 'chip-green' },
  'Ditolak':     { color: 'var(--red)',    bg: 'var(--red-bg)',    chip: 'chip-red' },
};
const warnaStatus = s => WARNA_STATUS[s] || WARNA_STATUS['Belum absen'];

/* ---------- Pengajuan izin & cuti ---------- */

function bangunPengajuan(pegawai) {
  const r = bikinRng(9090);
  const jenis = ['Cuti Tahunan', 'Izin', 'Sakit'];
  const alasan = [
    'Acara keluarga di luar kota', 'Kontrol rutin ke dokter',
    'Mengurus administrasi sekolah anak', 'Demam dan flu, surat dokter terlampir',
    'Menghadiri pernikahan saudara', 'Keperluan pribadi mendesak',
    'Perawatan pasca operasi ringan', 'Mengantar orang tua berobat',
  ];
  const hasil = [];
  for (let i = 0; i < 14; i++) {
    const p = pegawai[1 + Math.floor(r() * 60)];
    const mulai = new Date();
    mulai.setDate(mulai.getDate() - 10 + Math.floor(r() * 24));
    const durasi = 1 + Math.floor(r() * 3);
    const selesai = new Date(mulai);
    selesai.setDate(selesai.getDate() + durasi - 1);
    const u = r();
    hasil.push({
      id: `P${1000 + i}`,
      pegawaiId: p.id,
      nama: p.nama,
      inisial: p.inisial,
      unit: p.unit,
      jenis: jenis[Math.floor(r() * jenis.length)],
      mulai: kunciTanggal(mulai),
      selesai: kunciTanggal(selesai),
      hari: hariKerja(mulai, selesai) || 1,
      alasan: alasan[Math.floor(r() * alasan.length)],
      status: u < 0.45 ? 'Menunggu' : (u < 0.85 ? 'Disetujui' : 'Ditolak'),
      dibuat: kunciTanggal(mulai),
    });
  }
  // Beberapa pengajuan milik pemilik akun, agar layar "Izin & Cuti" tidak kosong.
  const akuMulai = new Date(); akuMulai.setDate(akuMulai.getDate() - 3);
  const akuSelesai = new Date(akuMulai); akuSelesai.setDate(akuSelesai.getDate() + 1);
  hasil.unshift({
    id: 'P0999', pegawaiId: 1, nama: PROFIL.nama, inisial: inisial(PROFIL.nama),
    unit: PROFIL.unit, jenis: 'Cuti Tahunan',
    mulai: kunciTanggal(akuMulai), selesai: kunciTanggal(akuSelesai),
    hari: 2, alasan: 'Acara keluarga di luar kota', status: 'Menunggu',
    dibuat: kunciTanggal(akuMulai),
  });
  return hasil;
}

/* ============================================================
   Tautan pengaturan
   ------------------------------------------------------------
   Tanpa backend, tiap perangkat punya penyimpanannya sendiri. Supaya titik
   kantor tidak perlu disetel ulang satu per satu di HP, laptop, dan tablet,
   admin bisa menyalin sebuah tautan berisi pengaturannya. Membuka tautan itu
   di perangkat lain langsung menerapkannya.

   Ini bukan pengganti sinkronisasi sungguhan — sekali kirim, bukan otomatis —
   tetapi cukup untuk menyiapkan beberapa perangkat sebelum peragaan.
   ============================================================ */

/** Padatkan objek jadi teks aman-URL (base64url dari JSON UTF-8). */
function kodeSetup(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Kebalikan kodeSetup(). Melempar bila kodenya rusak. */
function bacaSetup(kode) {
  const b64 = kode.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ============================================================
   DB — satu-satunya sumber kebenaran untuk aplikasi
   ============================================================ */

const KUNCI_SIMPAN = 'presensiku.v1';

const DB = {
  pegawai: [],
  kehadiranHariIni: [],
  tren: [],

  /** Bagian yang berubah dan perlu bertahan antar-halaman. */
  simpanan: {
    kantor: { ...KANTOR_DEFAULT },
    // presensi: { tanggal, jamMasuk, jamKeluar, status,
    //             selfie, verifikasi, lat, lng, akurasi, jarak,
    //             selfieKeluar, verifikasiKeluar,
    //             latKeluar, lngKeluar, akurasiKeluar, jarakKeluar }
    // `verifikasi` = { tantangan, teks, gerak, ambang, saatFoto, hasil }.
    // Satu foto saja per tahap; pembanding geraknya hanya hidup di memori
    // selama layar verifikasi terbuka, tidak pernah ikut disimpan.
    presensi: null,
    pengajuan: [],
    masuk: false,        // status login pemilik akun di aplikasi pegawai
    masukAdmin: false,   // status login di panel admin
    modeDemo: false,     // lewati pengecekan lokasi (untuk demo di luar kantor)

    // Suntingan data pegawai dari panel admin. Roster dasar tetap
    // dibangkitkan ulang tiap muat, lalu tiga daftar ini ditumpangkan
    // di atasnya — jadi hanya perubahan nyata yang perlu disimpan.
    pegawaiUbah: {},     // { [id]: {nama, nip, unit, jabatan} }
    pegawaiBaru: [],     // pegawai yang ditambahkan admin
    arsipPresensi: [],   // presensi hari-hari sebelumnya, lengkap dengan fotonya
    pegawaiHapus: [],    // id pegawai yang dinonaktifkan
    unitTambahan: [],    // unit kerja di luar delapan unit bawaan
    unitUbah: {},        // { namaAsal: namaSekarang } — penggantian nama unit
    unitHapus: [],       // nama asal unit yang dinonaktifkan
  },

  muat() {
    this.tren = bangunTren();

    let tersimpan = null;
    try {
      tersimpan = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || 'null');
    } catch {
      // Data rusak (mis. diedit manual) — mulai bersih daripada gagal total.
      tersimpan = null;
    }

    const pertamaKali = !(tersimpan && tersimpan.versi === 1);
    if (!pertamaKali) Object.assign(this.simpanan, tersimpan.data);

    // Roster dibangun setelah simpanan dimuat, supaya suntingan admin ikut terpakai.
    this.susunPegawai();

    if (pertamaKali) {
      this.simpanan.pengajuan = bangunPengajuan(this.pegawai);
      this.tulis();
    }

    // Presensi hari sebelumnya tidak berlaku lagi hari ini, tetapi tidak
    // dibuang — dipindahkan ke arsip supaya buktinya tetap bisa diperiksa
    // admin di kemudian hari.
    const hariIni = kunciTanggal(new Date());
    if (this.simpanan.presensi && this.simpanan.presensi.tanggal !== hariIni) {
      this.arsipkanPresensi(this.simpanan.presensi);
      this.simpanan.presensi = null;
      this.tulis();
    }
    return this;
  },

  /**
   * Baca ulang data dari localStorage tanpa menulis apa pun.
   *
   * Dipakai saat tab lain mengubah data — misalnya admin memindahkan titik
   * kantor sementara aplikasi pegawai sedang terbuka. Sengaja tidak memanggil
   * tulis(), supaya tidak memicu balik peristiwa `storage` di tab seberang
   * dan membuat keduanya saling menimpa.
   *
   * @returns true bila ada data yang berhasil dibaca
   */
  segarkanDariPenyimpanan() {
    let tersimpan = null;
    try {
      tersimpan = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || 'null');
    } catch {
      return false;
    }
    if (!tersimpan || tersimpan.versi !== 1) return false;

    Object.assign(this.simpanan, tersimpan.data);
    this.susunPegawai();
    return true;
  },

  /* Urutan foto yang dikorbankan lebih dulu saat kuota penyimpanan habis.
     Foto pulang dilepas duluan; foto masuk dipertahankan paling akhir. */
  URUT_LEPAS: ['selfieKeluar', 'selfie'],

  tulis() {
    const coba = () => {
      localStorage.setItem(KUNCI_SIMPAN, JSON.stringify({ versi: 1, data: this.simpanan }));
      return true;
    };

    try { return coba(); } catch { /* lanjut ke penyusutan di bawah */ }

    // Kuota localStorage penuh — hampir selalu karena foto. Yang dikorbankan
    // lebih dulu adalah foto arsip paling lama; catatan jam, lokasi, dan
    // statusnya tetap utuh sehingga rekap tidak pernah kehilangan data.
    console.warn('Penyimpanan penuh — melepas foto arsip terlama.');
    const arsip = this.simpanan.arsipPresensi;
    for (const bidang of this.URUT_LEPAS) {
      for (let i = arsip.length - 1; i >= 0; i--) {
        if (!arsip[i][bidang]) continue;
        arsip[i][bidang] = null;
        try { return coba(); } catch { /* masih penuh, lanjut lepas berikutnya */ }
      }
    }

    // Pilihan terakhir: lepas foto presensi hari ini, urutan sama.
    const p = this.simpanan.presensi;
    if (p) {
      for (const bidang of this.URUT_LEPAS) {
        if (!p[bidang]) continue;
        p[bidang] = null;
        try { return coba(); } catch { /* menyerah */ }
      }
    }
    console.error('Data tidak dapat disimpan; perubahan hanya berlaku di sesi ini.');
    return false;
  },

  /** Kembalikan seluruh data contoh ke kondisi awal. */
  reset() {
    localStorage.removeItem(KUNCI_SIMPAN);
    location.reload();
  },

  /* ============================================================
     Roster pegawai
     ============================================================ */

  /** Bangun ulang daftar pegawai dari roster dasar + suntingan admin. */
  susunPegawai() {
    const s = this.simpanan;
    const dihapus = new Set(s.pegawaiHapus);

    this.pegawai = bangunPegawai()
      .filter(p => !dihapus.has(p.id))
      .map(p => {
        const ubah = s.pegawaiUbah[p.id];
        if (!ubah) return p;
        const gabung = { ...p, ...ubah };
        gabung.inisial = inisial(gabung.nama);
        return gabung;
      })
      .concat(s.pegawaiBaru.filter(p => !dihapus.has(p.id)))
      // Unit yang pernah diganti namanya oleh admin ikut diperbarui di sini,
      // sehingga tidak perlu menulis satu suntingan per pegawai.
      .map(p => (s.unitUbah[p.unit] ? { ...p, unit: s.unitUbah[p.unit] } : p));

    this.kehadiranHariIni = bangunKehadiranHariIni(this.pegawai);
  },

  /* ---- Unit kerja ---- */

  /**
   * Daftar unit untuk dikelola.
   * `asal` adalah nama bawaannya (dipakai sebagai kunci penyimpanan),
   * `nama` adalah nama yang sedang berlaku setelah kemungkinan diganti.
   */
  daftarUnit() {
    const s = this.simpanan;
    const dihapus = new Set(s.unitHapus);
    return [...UNIT_KERJA, ...s.unitTambahan]
      .filter(u => !dihapus.has(u))
      .map(asal => {
        const nama = s.unitUbah[asal] ?? asal;
        return {
          asal,
          nama,
          bawaan: UNIT_KERJA.includes(asal),
          diganti: nama !== asal,
          jumlah: this.pegawai.filter(p => p.unit === nama).length,
        };
      });
  },

  /** Nama unit kerja yang sedang berlaku. */
  unitKerja() {
    return this.daftarUnit().map(u => u.nama);
  },

  /** Tetapkan unit seorang pegawai tanpa mengubah data lainnya. */
  setUnitPegawai(id, unit) {
    const s = this.simpanan;
    const i = s.pegawaiBaru.findIndex(p => p.id === id);
    if (i >= 0) s.pegawaiBaru[i] = { ...s.pegawaiBaru[i], unit };
    else s.pegawaiUbah[id] = { ...(s.pegawaiUbah[id] || {}), unit };
  },

  /**
   * Ganti nama unit kerja. Selain mencatat penggantian, nilai unit yang
   * sudah pernah ditulis ke suntingan pegawai ikut ditimpa — kalau tidak,
   * pegawai itu akan menggantung di nama unit yang tidak ada lagi.
   */
  gantiNamaUnit(asal, namaBaru) {
    const s = this.simpanan;
    const lama = s.unitUbah[asal] ?? asal;

    s.unitUbah[asal] = namaBaru;
    for (const id of Object.keys(s.pegawaiUbah)) {
      if (s.pegawaiUbah[id].unit === lama) s.pegawaiUbah[id].unit = namaBaru;
    }
    s.pegawaiBaru.forEach(p => { if (p.unit === lama) p.unit = namaBaru; });

    this.susunPegawai();
    this.tulis();
  },

  /**
   * Hapus unit kerja. Seluruh pegawai di dalamnya dipindahkan ke
   * `unitTujuan` lebih dulu supaya tidak ada yang kehilangan unit.
   */
  hapusUnit(asal, unitTujuan) {
    const s = this.simpanan;
    const nama = s.unitUbah[asal] ?? asal;

    this.pegawai
      .filter(p => p.unit === nama)
      .forEach(p => this.setUnitPegawai(p.id, unitTujuan));

    const i = s.unitTambahan.indexOf(asal);
    if (i >= 0) s.unitTambahan.splice(i, 1);      // unit tambahan dibuang seluruhnya
    else if (!s.unitHapus.includes(asal)) s.unitHapus.push(asal);
    delete s.unitUbah[asal];

    this.susunPegawai();
    this.tulis();
  },

  pegawaiById(id) {
    return this.pegawai.find(p => p.id === id) || null;
  },

  /**
   * Profil pemilik akun aplikasi pegawai (id 1).
   * Dibaca dari roster agar suntingan admin langsung terlihat di aplikasi
   * pegawai — bukan dari konstanta PROFIL yang tidak bisa berubah.
   */
  profil() {
    return { ...PROFIL, ...(this.pegawaiById(1) || {}) };
  },

  /** Simpan pegawai baru atau perubahan pegawai yang sudah ada. */
  simpanPegawai(data) {
    const s = this.simpanan;
    if (data.id == null) {
      const idBaru = Math.max(0, ...this.pegawai.map(p => p.id)) + 1;
      s.pegawaiBaru.push({ ...data, id: idBaru, inisial: inisial(data.nama) });
    } else if (s.pegawaiBaru.some(p => p.id === data.id)) {
      // Pegawai tambahan disunting langsung di daftarnya sendiri.
      const i = s.pegawaiBaru.findIndex(p => p.id === data.id);
      s.pegawaiBaru[i] = { ...s.pegawaiBaru[i], ...data, inisial: inisial(data.nama) };
    } else {
      s.pegawaiUbah[data.id] = {
        nama: data.nama, nip: data.nip, unit: data.unit, jabatan: data.jabatan,
      };
    }
    this.susunPegawai();
    this.tulis();
  },

  hapusPegawai(id) {
    const s = this.simpanan;
    if (!s.pegawaiHapus.includes(id)) s.pegawaiHapus.push(id);
    delete s.pegawaiUbah[id];
    this.susunPegawai();
    this.tulis();
  },

  tambahUnit(nama) {
    const bersih = nama.trim();
    if (!bersih || this.namaUnitDipakai(bersih)) return false;

    // Menambahkan kembali unit bawaan yang tadinya dihapus = memulihkannya,
    // bukan membuat entri kedua dengan nama sama.
    const s = this.simpanan;
    const i = s.unitHapus.indexOf(bersih);
    if (i >= 0) s.unitHapus.splice(i, 1);
    else s.unitTambahan.push(bersih);

    this.tulis();
    return true;
  },

  /** Apakah nama unit sudah dipakai? `kecualiAsal` melewati unit itu sendiri. */
  namaUnitDipakai(nama, kecualiAsal) {
    const bersih = nama.trim().toLowerCase();
    return this.daftarUnit().some(u => u.asal !== kecualiAsal && u.nama.toLowerCase() === bersih);
  },

  /** Apakah NIP sudah dipakai pegawai lain? */
  nipDipakai(nip, kecualiId) {
    return this.pegawai.some(p => p.nip === nip && p.id !== kecualiId);
  },

  /* ============================================================
     Bukti absen (foto selfie + metadata lokasi)
     ============================================================ */

  /** Banyaknya hari presensi lama yang disimpan lengkap dengan fotonya. */
  MAKS_ARSIP: 40,

  arsipkanPresensi(presensi) {
    const a = this.simpanan.arsipPresensi;
    if (a.some(x => x.tanggal === presensi.tanggal)) return;
    a.unshift(presensi);
    // Foto memakan ruang paling besar di localStorage, jadi arsipnya dibatasi.
    if (a.length > this.MAKS_ARSIP) a.length = this.MAKS_ARSIP;
  },

  /** Presensi pemilik akun pada tanggal tertentu (hari ini atau arsip). */
  presensiPada(tanggal) {
    if (this.simpanan.presensi && this.simpanan.presensi.tanggal === tanggal) {
      return this.simpanan.presensi;
    }
    return this.simpanan.arsipPresensi.find(x => x.tanggal === tanggal) || null;
  },

  /** Tanggal-tanggal yang punya bukti tersimpan, terbaru dulu. */
  tanggalBukti() {
    const set = new Set([kunciTanggal(new Date())]);
    if (this.simpanan.presensi) set.add(this.simpanan.presensi.tanggal);
    this.simpanan.arsipPresensi.forEach(x => set.add(x.tanggal));
    return [...set].sort().reverse();
  },

  /**
   * Daftar bukti absen untuk satu tanggal.
   *
   * Hari ini: seluruh pegawai, dengan foto contoh — kecuali pemilik akun
   * yang memakai selfie sungguhan bila sudah check-in.
   * Tanggal lampau: hanya yang benar-benar tersimpan di arsip, karena
   * prototipe ini tidak membangkitkan riwayat foto untuk 248 pegawai.
   */
  bukti(tanggal) {
    const hariIni = kunciTanggal(new Date());
    const rekamAku = this.presensiPada(tanggal);
    const aku = this.pegawaiById(1);

    const dariAku = (rekamAku && aku) ? [{
      pegawaiId: aku.id,
      nama: aku.nama, inisial: aku.inisial, nip: aku.nip,
      unit: aku.unit, jabatan: aku.jabatan,
      tanggal,
      jamMasuk: rekamAku.jamMasuk,
      jamKeluar: rekamAku.jamKeluar || '—',
      status: rekamAku.status,
      foto: rekamAku.selfie || null,
      fotoAsli: !!rekamAku.selfie,
      lat: rekamAku.lat, lng: rekamAku.lng,
      akurasi: rekamAku.akurasi, jarak: rekamAku.jarak,
      dalamRadius: rekamAku.jarak == null ? null : rekamAku.jarak <= this.kantor.radius,

      // Bukti presensi pulang dan hasil tantangan gerak.
      verifikasi: rekamAku.verifikasi || null,
      fotoKeluar: rekamAku.selfieKeluar || null,
      verifikasiKeluar: rekamAku.verifikasiKeluar || null,
      latKeluar: rekamAku.latKeluar ?? null, lngKeluar: rekamAku.lngKeluar ?? null,
      akurasiKeluar: rekamAku.akurasiKeluar ?? null, jarakKeluar: rekamAku.jarakKeluar ?? null,
      dalamRadiusKeluar: rekamAku.jarakKeluar == null
        ? null : rekamAku.jarakKeluar <= this.kantor.radius,
    }] : [];

    if (tanggal !== hariIni) return dariAku;

    const lain = this.kehadiranHariIni
      .filter(p => p.id !== 1)
      .map(p => ({
        pegawaiId: p.id,
        nama: p.nama, inisial: p.inisial, nip: p.nip,
        unit: p.unit, jabatan: p.jabatan,
        tanggal,
        jamMasuk: p.jamMasuk,
        jamKeluar: p.jamKeluar,
        status: p.status,
        foto: p.jamMasuk === '—' ? null : fotoContoh(p),
        fotoAsli: false,
        lat: p.lat, lng: p.lng,
        akurasi: p.akurasi, jarak: p.jarak,
        dalamRadius: p.jamMasuk === '—' ? null : p.dalamRadius,
        // Pegawai contoh tidak punya rekaman tantangan gerak — hanya akun
        // yang dipakai demo yang benar-benar melewati verifikasi wajah.
        verifikasi: null,
        fotoKeluar: p.jamKeluar === '—' ? null : fotoContoh(p),
        verifikasiKeluar: null,
        latKeluar: null, lngKeluar: null, akurasiKeluar: null,
        jarakKeluar: null, dalamRadiusKeluar: null,
      }));

    // Pemilik akun yang belum check-in tetap ditampilkan agar daftarnya utuh.
    if (!dariAku.length && aku) {
      const p = this.kehadiranHariIni.find(x => x.id === 1);
      if (p) {
        lain.unshift({
          pegawaiId: aku.id, nama: aku.nama, inisial: aku.inisial, nip: aku.nip,
          unit: aku.unit, jabatan: aku.jabatan, tanggal,
          jamMasuk: '—', jamKeluar: '—', status: 'Belum absen',
          foto: null, fotoAsli: false,
          lat: null, lng: null, akurasi: null, jarak: null, dalamRadius: null,
          verifikasi: null,
          fotoKeluar: null, verifikasiKeluar: null,
          latKeluar: null, lngKeluar: null, akurasiKeluar: null,
          jarakKeluar: null, dalamRadiusKeluar: null,
        });
      }
    }
    return [...dariAku, ...lain];
  },

  /* ============================================================
     Tautan pengaturan antar perangkat
     ============================================================ */

  /** Susun tautan yang membawa titik kantor ke perangkat lain. */
  tautanPengaturan(halaman = 'pegawai.html') {
    const k = this.kantor;
    const kode = kodeSetup({
      v: 1,
      kantor: { nama: k.nama, alamat: k.alamat, lat: k.lat, lng: k.lng, radius: k.radius },
    });
    const dasar = location.href.replace(/[^/]*$/, '');   // buang nama berkas, sisakan folder
    return `${dasar}${halaman}?setup=${kode}`;
  },

  /**
   * Terapkan pengaturan dari parameter ?setup= bila ada.
   * Nilai dari URL tidak pernah dipercaya begitu saja — semuanya diperiksa
   * dulu, dan yang tidak masuk akal diabaikan.
   *
   * @returns {null|{ok:boolean, pesan:string}}
   */
  terapkanSetupDariUrl() {
    const kode = new URLSearchParams(location.search).get('setup');
    if (!kode) return null;

    // Bersihkan alamat lebih dulu, supaya menyegarkan halaman tidak
    // menerapkan ulang pengaturan yang sama.
    const bersih = location.pathname + location.hash;
    history.replaceState(null, '', bersih);

    let data;
    try {
      data = bacaSetup(kode);
    } catch {
      return { ok: false, pesan: 'Tautan pengaturan tidak dapat dibaca.' };
    }
    if (!data || data.v !== 1 || !data.kantor) {
      return { ok: false, pesan: 'Tautan pengaturan tidak dikenali.' };
    }

    const k = data.kantor;
    const lat = Number(k.lat), lng = Number(k.lng), radius = parseInt(k.radius, 10);
    const sah = Number.isFinite(lat) && Math.abs(lat) <= 90
      && Number.isFinite(lng) && Math.abs(lng) <= 180
      && Number.isFinite(radius) && radius >= 20 && radius <= 2000;
    if (!sah) return { ok: false, pesan: 'Isi tautan pengaturan tidak valid.' };

    this.simpanan.kantor = {
      nama: String(k.nama || KANTOR_DEFAULT.nama).slice(0, 80),
      alamat: String(k.alamat || '').slice(0, 160),
      lat, lng, radius,
    };
    this.tulis();
    return { ok: true, pesan: `Titik kantor disetel ke ${this.simpanan.kantor.nama}.` };
  },

  /* ---- Turunan yang sering dipakai ---- */
  get kantor() { return this.simpanan.kantor; },
  get presensi() { return this.simpanan.presensi; },
  get pengajuan() { return this.simpanan.pengajuan; },

  pengajuanSaya() { return this.pengajuan.filter(p => p.pegawaiId === 1); },
  pengajuanMenunggu() { return this.pengajuan.filter(p => p.status === 'Menunggu'); },

  /** Ringkasan angka untuk kartu statistik dashboard admin. */
  ringkasan() {
    const k = this.kehadiranHariIni;
    const hitung = s => k.filter(x => x.status === s).length;
    const tepat = hitung('Tepat waktu');
    const terlambat = hitung('Terlambat');
    return {
      total: k.length,
      hadir: tepat,                 // kartu "Hadir Hari Ini" = tepat waktu
      tepat,
      terlambat,
      absen: tepat + terlambat,     // total yang benar-benar melakukan presensi
      izin: hitung('Izin/Cuti'),
      belum: hitung('Belum absen'),
      unit: this.unitKerja().length,
      dalamRadius: k.filter(x => x.dalamRadius).length,
      luarRadius: k.filter(x => x.jamMasuk !== '—' && !x.dalamRadius).length,
    };
  },
};
