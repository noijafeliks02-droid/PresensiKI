/* ============================================================
   Kompas — Aplikasi Pegawai
   Arah visual "Kop Surat" (design_handoff_presensiku).

   Satu state machine sederhana (`S.layar`) menggerakkan sembilan layar.
   Setiap layar adalah fungsi yang mengembalikan string HTML; interaksi
   ditangani lewat delegasi event pada atribut data-aksi.
   ============================================================ */

DB.muat();

/** Hasil penerapan tautan ?setup=, ditampilkan setelah layar pertama dirender. */
const HASIL_SETUP = DB.terapkanSetupDariUrl();

const S = {
  layar: DB.simpanan.masuk ? 'home' : 'login',
  sekarang: new Date(),
  bulan: { tahun: new Date().getFullYear(), bulan: new Date().getMonth() },
  gps: { status: 'menunggu', lat: null, lng: null, akurasi: null, jarak: null, dalam: false, pesan: '' },
  stream: null,
  peta: null,
  form: { jenis: 'Izin', mulai: '', selesai: '', alasan: '', lampiran: '' },
  lihatSandi: false,

  /** Tahap presensi yang sedang dijalani: 'masuk' (datang) atau 'keluar' (pulang). */
  mode: 'masuk',

  /** Keadaan tantangan verifikasi wajah pada layar Selfie. */
  verif: kosongkanVerif(),
};

/** Keadaan awal tantangan verifikasi — dipakai tiap kali layar Selfie dibuka. */
function kosongkanVerif() {
  return {
    fase: 'kalibrasi',   // kalibrasi → menunggu → lolos | lewat
    tantangan: null,
    dasar: null,         // contoh piksel saat wajah masih diam
    terakhir: null,
    diamBerturut: 0,
    gerakBerturut: 0,
    puncak: 0,           // perubahan terbesar yang pernah terbaca
    kameraGagal: false,
    timer: null,
    mulai: 0,
    sibuk: false,
  };
}

const $layar = document.getElementById('layar');
const $nav = document.getElementById('nav');
const $toast = document.getElementById('toast');

/**
 * Profil pemilik akun. Dibaca dari DB, bukan dari konstanta PROFIL,
 * supaya perubahan data yang dilakukan admin langsung terlihat di sini.
 */
let AKU = DB.profil();
let inisialAku = inisial(AKU.nama);

function segarkanProfil() {
  AKU = DB.profil();
  inisialAku = inisial(AKU.nama);
}

/* ============================================================
   Utilitas tampilan
   ============================================================ */

let toastTimer;
function toast(pesan, jenis = '') {
  clearTimeout(toastTimer);
  $toast.innerHTML = `<div class="toast ${jenis}">
    ${icon(jenis === 'err' ? 'alert' : 'check', 18, 'currentColor', 2.6)}
    <span>${esc(pesan)}</span></div>`;
  toastTimer = setTimeout(() => { $toast.innerHTML = ''; }, 2600);
}

/** Layar yang menampilkan bottom navigation. */
const LAYAR_BERNAV = ['home', 'riwayat', 'cuti', 'profil'];

/** Header navy dengan eyebrow, garis emas, dan judul Caprasimo. */
function headerNavy({ eyebrow, judul, kanan = '', kembali = null, sub = '' }) {
  return `
    <header class="hdr">
      ${kembali ? `
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
          <button class="btn-kembali" data-aksi="${kembali}" aria-label="Kembali">
            ${icon('chevron-left', 20, '#fff', 2.6)}
          </button>
        </div>` : ''}
      <div class="eyebrow">${esc(eyebrow)}</div>
      <hr class="garis-emas">
      <div class="hdr-baris">
        <div style="min-width:0">
          <div class="hdr-judul">${esc(judul)}</div>
          ${sub ? `<div class="hdr-sub">${esc(sub)}</div>` : ''}
        </div>
        ${kanan}
      </div>
    </header>`;
}

/* ============================================================
   GPS — lokasi nyata dari perangkat
   ============================================================ */

function mulaiGPS() {
  if (!('geolocation' in navigator)) {
    S.gps.status = 'gagal';
    S.gps.pesan = 'Perangkat ini tidak mendukung GPS.';
    return;
  }
  navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude, accuracy } = pos.coords;
      const k = DB.kantor;
      const jarak = jarakMeter(latitude, longitude, k.lat, k.lng);
      const berubah = S.gps.status !== 'ok' || Math.abs((S.gps.jarak ?? 0) - jarak) >= 1;

      Object.assign(S.gps, {
        status: 'ok', lat: latitude, lng: longitude, akurasi: accuracy,
        jarak: Math.round(jarak), dalam: jarak <= k.radius, pesan: '',
      });
      if (!berubah) return;
      if (S.layar === 'peta') perbaruiLayarPeta();
      else if (S.layar === 'home') render();
    },
    err => {
      S.gps.status = 'gagal';
      S.gps.pesan = err.code === err.PERMISSION_DENIED
        ? 'Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser.'
        : 'Lokasi tidak dapat dibaca. Pastikan GPS aktif.';
      if (S.layar === 'peta') perbaruiLayarPeta();
      else if (S.layar === 'home') render();
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}

/**
 * Boleh check-in? Mode demo melewati pengecekan lokasi & akurasi.
 *
 * Catatan penting soal kata-kata: pesan yang dikembalikan di sini tampil
 * di layar pegawai, jadi tidak boleh menyebut jarak dalam meter maupun
 * besar radius. Pegawai cukup tahu bahwa presensi harus dilakukan di
 * kantor. Angka lengkapnya tetap dicatat untuk audit admin.
 */
function bolehAbsen() {
  if (DB.simpanan.modeDemo) return { ok: true };
  if (S.gps.status !== 'ok') return { ok: false, alasan: S.gps.pesan || 'Menunggu sinyal GPS…' };
  if (S.gps.akurasi > AKURASI_MAKS) {
    return { ok: false, alasan: 'Sinyal GPS belum akurat. Tunggu sebentar atau pindah ke tempat yang lebih terbuka.' };
  }
  if (!S.gps.dalam) return { ok: false, alasan: 'Anda belum berada di lokasi kantor.' };
  return { ok: true };
}

/** Ringkasan status lokasi, tanpa angka jarak maupun radius. */
function statusLokasi() {
  if (DB.simpanan.modeDemo) {
    return { kelas: '', judul: 'Mode demo aktif', sub: 'Pengecekan lokasi dilewati' };
  }
  if (S.gps.status === 'menunggu') {
    return { kelas: 'netral', judul: 'Mencari sinyal GPS…', sub: 'Izinkan akses lokasi bila diminta' };
  }
  if (S.gps.status === 'gagal') {
    return { kelas: 'luar', judul: 'GPS tidak aktif', sub: S.gps.pesan };
  }
  return S.gps.dalam
    ? { kelas: '', judul: 'Anda berada di kantor', sub: 'Presensi dapat dilakukan' }
    : { kelas: 'luar', judul: 'Belum berada di kantor', sub: 'Presensi hanya bisa dilakukan di kantor' };
}

/* ============================================================
   Layar 1 — Login
   ============================================================ */

function layarLogin() {
  return `
  <div class="login">
    <div class="login-atas">
      <img class="login-logo" src="assets/logo-pu.svg" alt="">
      <h1 class="login-wordmark">Kompas</h1>
      <hr class="garis-emas login-garis">
      <p class="login-desk">Konsultan On-site Mobile Presence &amp; Attendance System.</p>
    </div>

    <form class="login-panel" id="formLogin" novalidate>
      <h2>Masuk</h2>
      <div class="sub">Gunakan NIP dan kata sandi kepegawaian Anda.</div>

      <div class="login-form">
        <div>
          <label class="field-label" for="inpNip">NIP</label>
          <div class="field">
            ${icon('user', 18, 'var(--mut)', 2.2)}
            <input id="inpNip" name="nip" type="text" autocomplete="username"
                   placeholder="198504122010011003" value="${esc(AKU.nip)}">
          </div>
        </div>
        <div>
          <label class="field-label" for="inpSandi">Kata sandi</label>
          <div class="field">
            ${icon('lock', 18, 'var(--mut)', 2.2)}
            <input id="inpSandi" name="sandi" type="${S.lihatSandi ? 'text' : 'password'}"
                   autocomplete="current-password" placeholder="Kata sandi" value="presensi123">
            <button type="button" class="toggle" data-aksi="lihatSandi"
                    aria-label="${S.lihatSandi ? 'Sembunyikan' : 'Tampilkan'} kata sandi">
              ${icon(S.lihatSandi ? 'eye-off' : 'eye', 18, 'var(--mut)', 2.2)}
            </button>
          </div>
        </div>
      </div>

      <div id="errLogin"></div>
      <button type="submit" class="btn-gold login-masuk">Masuk</button>
      <button type="button" class="login-lupa" data-aksi="lupaSandi">Lupa kata sandi?</button>
    </form>
  </div>`;
}

/* ============================================================
   Layar 2 — Beranda
   ============================================================ */

function layarHome() {
  const p = DB.presensi;
  const izin = bolehAbsen();
  const st = statusLokasi();
  const kini = new Date();
  const sisaCuti = hitungSisaCuti();

  const blokAbsen = p
    ? `<div class="kotak-checkin">
         <span class="ikon">${icon('check', 20, 'var(--sageInk)', 3)}</span>
         <div class="teks">
           <div class="judul">${p.jamKeluar ? 'Presensi hari ini selesai' : 'Sudah check-in'}</div>
           <div class="sub">Masuk pukul ${jamTampil(p.jamMasuk)}${p.jamKeluar ? ` · pulang ${jamTampil(p.jamKeluar)}` : ''}</div>
         </div>
         ${p.jamKeluar ? '' : '<button class="btn-pil-bahaya" data-aksi="mulaiCheckout">Pulang</button>'}
       </div>
       ${p.jamKeluar ? '' : '<div class="ket-izin">Presensi pulang juga memerlukan verifikasi wajah.</div>'}`
    : `<button class="btn-gold" style="margin-top:20px" data-aksi="mulaiCheckin" ${izin.ok ? '' : 'disabled'}>
         ${icon('check-clipboard', 20, 'currentColor', 2.6)} Check-in sekarang
       </button>
       ${izin.ok ? '' : `<div class="ket-izin">${esc(izin.alasan)}</div>`}`;

  return `
  <div class="screen">
    ${headerNavy({
    eyebrow: salam(S.sekarang),
    judul: AKU.nama,
    sub: AKU.jabatan,
    kanan: `<div class="hdr-avatar">${inisialAku}</div>`,
  })}

    <div class="isi">
      <div class="eyebrow">Waktu sekarang</div>
      <span class="jam-besar" id="jamBesar">${jamTampil(fmtJam(S.sekarang))}</span>
      <div class="tanggal-hero">${fmtTanggalPanjang(S.sekarang)}</div>

      <button class="kartu-lokasi ${st.kelas}" data-aksi="peta">
        <span class="titik-denyut"><i></i><b></b></span>
        <span class="teks">
          <span class="judul" style="display:block">${esc(st.judul)}</span>
          <span class="sub" style="display:block">${esc(st.sub)}</span>
        </span>
        ${icon('chevron', 17, 'currentColor', 2.6)}
      </button>

      ${blokAbsen}

      <div class="bagian">
        <div class="eyebrow">Catatan hari ini</div>
        <button class="tautan" data-aksi="riwayat">Riwayat</button>
      </div>
      <div>
        <div class="baris"><span class="kiri">Jam masuk</span><span class="kanan tnum">${p ? jamTampil(p.jamMasuk) : '—'}</span></div>
        <div class="baris"><span class="kiri">Jam pulang</span><span class="kanan tnum">${p && p.jamKeluar ? jamTampil(p.jamKeluar) : '—'}</span></div>
        <div class="baris"><span class="kiri">Jam kerja</span><span class="kanan tnum">${jamTampil(SHIFT.masuk)} – ${jamTampil(SHIFT.pulang)}</span></div>
        <div class="baris"><span class="kiri">Sisa cuti tahunan</span><span class="kanan">${sisaCuti.sisa} hari</span></div>
      </div>
    </div>
  </div>`;
}

/** Saldo cuti tahunan, memperhitungkan pengajuan yang sudah disetujui. */
function hitungSisaCuti() {
  const terpakai = DB.pengajuanSaya()
    .filter(p => p.status === 'Disetujui' && p.jenis === 'Cuti Tahunan')
    .reduce((n, p) => n + p.hari, AKU.cutiTerpakai ?? 0);
  return { terpakai, sisa: Math.max(0, (AKU.cutiKuota ?? 12) - terpakai), kuota: AKU.cutiKuota ?? 12 };
}

/* ============================================================
   Layar 3 — Verifikasi lokasi
   ============================================================ */

/** Peta ilustratif — cadangan bila Leaflet gagal dimuat (offline). */
function petaIlustratif() {
  return `
    <div class="peta-ilustrasi">
      <div class="blok" style="top:56px;left:26px;width:110px;height:78px"></div>
      <div class="blok blok2" style="top:210px;right:22px;width:120px;height:96px"></div>
      <div class="blok blok2" style="bottom:40px;left:44px;width:86px;height:80px"></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true">
        <line x1="0" y1="44" x2="100" y2="52" stroke="var(--mapJalan)" stroke-width="8"/>
        <line x1="58" y1="0" x2="50" y2="100" stroke="var(--mapJalan)" stroke-width="8"/>
      </svg>
      <div class="pin-kantor">
        <div class="label">${esc(DB.kantor.nama.replace('Gedung Utama ', ''))}</div>
        <div class="arrow"></div>
        <div class="dot"></div>
      </div>
    </div>`;
}

/** Apakah tahap presensi yang sedang dijalani sudah selesai? */
function sudahTahapIni() {
  const p = DB.presensi;
  return S.mode === 'keluar' ? !!(p && p.jamKeluar) : !!p;
}

function layarPeta() {
  const k = DB.kantor;
  const izin = bolehAbsen();
  const sudah = sudahTahapIni();
  const pulang = S.mode === 'keluar';
  const st = statusLokasi();
  const adaPeta = petaTersedia();

  return `
  <div class="peta-layar">
    <div class="peta-wadah">
      ${adaPeta ? '<div class="peta-nyata" id="petaPegawai"></div>' : petaIlustratif()}
    </div>
    <div class="peta-tudung"></div>

    <div class="peta-kepala">
      <button class="btn-kembali" data-aksi="home" aria-label="Kembali">
        ${icon('chevron-left', 20, '#fff', 2.6)}
      </button>
      <div class="judul">Verifikasi lokasi${pulang ? ' — pulang' : ''}</div>
    </div>

    <div class="peta-sheet">
      <div class="handle"></div>
      <div class="eyebrow">${pulang ? 'Presensi pulang' : 'Titik presensi'}</div>
      <div class="nama">${esc(k.nama)}</div>
      <div class="alamat">${esc(k.alamat)}</div>

      <div class="kartu-sage ${st.kelas}" id="kartuSagePeta">
        ${icon(st.kelas === 'luar' ? 'alert' : 'check', 18, 'currentColor', 2.6)}
        <span>${esc(st.judul)}</span>
      </div>

      <div id="aksiPeta">
        ${sudah
      ? `<div class="catatan-privasi" style="margin-top:22px">Anda sudah melakukan presensi ${pulang ? 'pulang' : 'masuk'} hari ini.</div>`
      : `<button class="btn-gold" style="margin-top:20px" data-aksi="lanjutSelfie" ${izin.ok ? '' : 'disabled'}>
               ${icon('camera', 20, 'currentColor', 2.4)} Lanjut verifikasi wajah
             </button>
             ${izin.ok ? '' : `<div class="ket-izin">${esc(izin.alasan)}</div>`}`}
      </div>

      <div class="catatan-privasi">Lokasi hanya dibaca saat Anda menekan tombol presensi.</div>
      ${adaPeta ? `<div class="atribusi" style="text-align:center;margin-top:14px">${ATRIBUSI_HTML}</div>` : ''}
    </div>
  </div>`;
}

/**
 * Peta rujukan letak kantor: tanpa lingkaran radius dan tanpa titik posisi
 * pengguna. Menampilkan keduanya sama saja dengan memberi tahu pegawai
 * persis di mana batas geofence berada.
 */
function pasangPetaPegawai() {
  const el = document.getElementById('petaPegawai');
  if (!el) return;
  S.peta = buatPetaPresensi(el, {
    kantor: DB.kantor,
    labelKantor: DB.kantor.nama.replace('Gedung Utama ', ''),
    zoom: 17,
    tanpaRadius: true,
    kontrolZoom: false,
  });
}

function lepasPeta() {
  if (S.peta) { S.peta.hancurkan(); S.peta = null; }
}

/**
 * Saat posisi GPS berubah dan pengguna sedang di layar Peta, perbarui
 * bagian yang berubah saja — merender ulang seluruh layar akan membuat
 * peta dibangun dari nol dan berkedip setiap kali sinyal masuk.
 */
function perbaruiLayarPeta() {
  const st = statusLokasi();
  const $k = document.getElementById('kartuSagePeta');
  if ($k) {
    $k.className = `kartu-sage ${st.kelas}`;
    $k.innerHTML = `${icon(st.kelas === 'luar' ? 'alert' : 'check', 18, 'currentColor', 2.6)}<span>${esc(st.judul)}</span>`;
  }

  const $a = document.getElementById('aksiPeta');
  if ($a && !sudahTahapIni()) {
    const izin = bolehAbsen();
    const tombol = $a.querySelector('button');
    if (tombol) tombol.disabled = !izin.ok;
    let ket = $a.querySelector('.ket-izin');
    if (izin.ok) { if (ket) ket.remove(); }
    else {
      if (!ket) {
        ket = document.createElement('div');
        ket.className = 'ket-izin';
        $a.appendChild(ket);
      }
      ket.textContent = izin.alasan;
    }
  }
}

/* ============================================================
   Layar 4 — Selfie
   ============================================================ */

function layarSelfie() {
  const pulang = S.mode === 'keluar';
  return `
  <div class="selfie">
    <div class="selfie-kepala">
      <button class="btn-kembali" data-aksi="peta" aria-label="Kembali">
        ${icon('chevron-left', 20, '#fff', 2.6)}
      </button>
      <div class="judul">Verifikasi wajah${pulang ? ' — pulang' : ''}</div>
    </div>
    <div class="selfie-tengah">
      <div class="viewport" id="viewport">
        <video id="kamera" autoplay playsinline muted></video>
        <span class="ph" id="phKamera">menyalakan kamera…</span>
        <div class="guide"></div>
        <div class="flash" id="flash"></div>
      </div>

      <!-- Kartu perintah sengaja di LUAR bingkai kamera. Bingkai itu lonjong
           dan memotong isinya (overflow: hidden), sehingga ujung kiri-kanan
           tulisan ikut terpangkas bila diletakkan di dalam. -->
      <div class="aba" id="aba" hidden>
        <span class="aba-ikon" id="abaIkon"></span>
        <span class="aba-teks" id="abaTeks"></span>
      </div>

      <!-- Bilah kemajuan tanpa angka. Pegawai perlu tahu gerakannya sedang
           terbaca, tetapi menampilkan persentasenya sama saja dengan
           memberi tahu persis seberapa sedikit gerakan yang bisa lolos. -->
      <div class="maju" id="maju" hidden><i id="majuIsi"></i></div>

      <div class="t" id="verifJudul">Menyiapkan verifikasi…</div>
      <div class="s" id="verifKet">Tatap kamera dan diam sejenak.</div>
    </div>
    <div class="shutter-wrap">
      <button class="shutter" data-aksi="jepret" disabled
              aria-label="Ambil foto presensi"><span></span></button>
    </div>
  </div>`;
}

async function nyalakanKamera() {
  const video = document.getElementById('kamera');
  const ph = document.getElementById('phKamera');
  if (!video) return;
  video.style.display = 'none';
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 800 } },
      audio: false,
    });
    video.srcObject = S.stream;
    video.style.display = '';
    if (ph) ph.remove();
  } catch (e) {
    // Kamera ditolak / tidak ada — alur tetap dilanjutkan dengan placeholder,
    // supaya prototipe bisa didemokan di komputer tanpa webcam.
    console.warn('Kamera tidak tersedia:', e);
    if (ph) ph.textContent = 'kamera tidak tersedia — foto dilewati';
    S.verif.kameraGagal = true;
  }
}

function matikanKamera() {
  if (S.stream) {
    S.stream.getTracks().forEach(t => t.stop());
    S.stream = null;
  }
}

/** Ambil frame dari video dan simpan sebagai JPEG kecil (~40 KB). */
function tangkapFoto(L = 320, T = 400, mutu = 0.7) {
  const video = document.getElementById('kamera');
  if (!video || !video.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = L; c.height = T;
  const ctx = c.getContext('2d');
  ctx.translate(L, 0);
  ctx.scale(-1, 1);
  const rasio = Math.max(L / video.videoWidth, T / video.videoHeight);
  const w = video.videoWidth * rasio, h = video.videoHeight * rasio;
  ctx.drawImage(video, (L - w) / 2, (T - h) / 2, w, h);
  return c.toDataURL('image/jpeg', mutu);
}

/* ============================================================
   Tantangan gerak — pengaman verifikasi wajah
   ------------------------------------------------------------
   Begitu layar Selfie terbuka, satu perintah gerak diundi dan langsung
   ditampilkan. Kamera lalu dipantau terus-menerus:

     1. kalibrasi — menunggu wajah diam beberapa saat, lalu keadaan diam
        itu dikunci sebagai pembanding;
     2. menunggu  — tiap cuplikan dibandingkan dengan pembanding tadi;
     3. lolos     — begitu perubahannya melewati ambang, tombol foto dibuka.

   Tombol presensi terkunci sampai gerakannya benar-benar terbaca, jadi
   tidak ada hitung mundur dan tidak ada foto yang diambil diam-diam —
   hanya satu foto, yaitu yang sengaja diambil pegawai sambil menahan pose.

   Perbandingannya memakai cuplikan piksel 64×80 di memori, tidak pernah
   disimpan. Ambang per piksel 26 membuat derau sensor dan getaran tangan
   terbaca nol, sehingga foto cetak yang didiamkan tidak pernah lolos.
   ============================================================ */

const VERIF = {
  LEBAR: 64, TINGGI: 80,   // ukuran cuplikan piksel yang dibandingkan
  AMBANG_PIKSEL: 26,       // selisih kecerahan yang dihitung sebagai berubah
  JEDA: 140,               // ms antar cuplikan
  PANAS_MS: 1500,          // pemanasan kamera sebelum pengukuran dimulai
  RAGAM_MIN: 6,            // di bawah ini gambarnya dianggap belum berisi
  DIAM_MAKS: 2,            // persen perubahan yang masih dianggap "diam"
  BUTUH_DIAM: 4,           // cuplikan diam berturut-turut sebelum dikunci
  BUTUH_SEGAR: 7,          // cuplikan diam sebelum pembanding disegarkan
  BUTUH_GERAK: 3,          // cuplikan berturut-turut di atas ambang
  BATAS_SABAR: 25000,      // ms; setelah ini presensi dibuka tetapi ditandai
};

/**
 * Cuplikan piksel abu-abu dari KOTAK TENGAH frame — kira-kira area di dalam
 * bingkai panduan. Bagian tepi sengaja dibuang: orang yang lewat di
 * belakang atau tirai yang bergoyang bukan gerakan wajah pegawai, tetapi
 * kalau ikut terukur akan terbaca seolah-olah perintahnya sudah dilakukan.
 */
function contohPiksel() {
  const video = document.getElementById('kamera');
  if (!video || !video.videoWidth) return null;
  const L = VERIF.LEBAR, T = VERIF.TINGGI;
  const c = document.createElement('canvas');
  c.width = L; c.height = T;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  const sisiL = video.videoWidth * 0.62;
  const sisiT = video.videoHeight * 0.68;
  ctx.drawImage(video,
    (video.videoWidth - sisiL) / 2, (video.videoHeight - sisiT) / 2, sisiL, sisiT,
    0, 0, L, T);

  const d = ctx.getImageData(0, 0, L, T).data;
  const abu = new Uint8ClampedArray(L * T);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    abu[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  }
  return abu;
}

/** Simpangan baku kecerahan — dipakai menolak gambar yang masih kosong. */
function ragamPiksel(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  const rata = s / a.length;
  let v = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - rata; v += d * d; }
  return Math.sqrt(v / a.length);
}

/**
 * Persentase piksel yang berubah antara dua cuplikan.
 *
 * Rata-rata kecerahan tiap cuplikan dikurangkan lebih dulu. Kamera HP terus
 * menyetel pencahayaannya sendiri, dan penyesuaian itu menggeser SELURUH
 * piksel sekaligus — tanpa penyeimbangan ini, layar yang tiba-tiba menjadi
 * lebih terang terbaca sebagai gerakan besar padahal wajahnya diam saja.
 */
function bedaPersen(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { sa += a[i]; sb += b[i]; }
  const ra = sa / a.length, rb = sb / b.length;

  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs((a[i] - ra) - (b[i] - rb)) > VERIF.AMBANG_PIKSEL) n++;
  }
  return Math.round((n / a.length) * 1000) / 10;
}

/** Tulis teks status di bawah bingkai kamera. */
function statusVerif(judul, ket, kelas = '') {
  const j = document.getElementById('verifJudul');
  const k = document.getElementById('verifKet');
  if (j) { j.textContent = judul; j.className = 't ' + kelas; }
  if (k) k.textContent = ket;
}

function tampilAbaAba(t) {
  const aba = document.getElementById('aba');
  if (!aba) return;
  document.getElementById('abaIkon').innerHTML = icon(t.ikon, 21, 'currentColor', 2.6);
  document.getElementById('abaTeks').textContent = t.teks;
  aba.hidden = false;
}

/** Isi bilah kemajuan, 0–1. Sengaja tanpa angka. */
function aturMaju(bagian) {
  const bar = document.getElementById('maju');
  const isi = document.getElementById('majuIsi');
  if (!bar || !isi) return;
  bar.hidden = false;
  isi.style.width = Math.min(100, Math.max(0, bagian * 100)).toFixed(0) + '%';
}

function ambangTantangan() {
  const t = S.verif.tantangan;
  return (t && t.ambang != null) ? t.ambang : AMBANG_GERAK;
}

/** Pindah fase dan sesuaikan seluruh tampilan layar Selfie. */
function setFase(f) {
  const v = S.verif;
  v.fase = f;

  const boleh = (f === 'lolos' || f === 'lewat');
  const tombol = document.querySelector('[data-aksi="jepret"]');
  if (tombol) tombol.disabled = !boleh;
  if (boleh) hentikanPantau();

  const bar = document.getElementById('maju');
  if (bar) bar.hidden = boleh;

  if (f === 'kalibrasi') {
    statusVerif('Menyiapkan verifikasi…', 'Tatap kamera dan diam sejenak.');
  } else if (f === 'menunggu') {
    statusVerif('Lakukan perintah di atas',
      'Tombol foto terbuka begitu gerakan Anda terbaca.');
  } else if (f === 'lolos') {
    statusVerif('Gerakan terverifikasi',
      'Tahan posisinya, lalu tekan tombol untuk mengambil foto.', 'lolos');
  } else {
    statusVerif('Gerakan tidak dapat dipastikan',
      'Presensi tetap bisa dilanjutkan, tetapi akan ditandai untuk diperiksa admin.',
      'gagal');
  }
}

/** Satu cuplikan pemantauan. Dipanggil berulang selama layar Selfie terbuka. */
function pantauGerak() {
  const v = S.verif;
  if (v.fase === 'lolos' || v.fase === 'lewat') return;

  // Kamera ditolak atau tidak ada — tidak ada yang bisa dipantau. Alur tetap
  // dibuka supaya prototipe bisa didemokan di komputer tanpa webcam.
  if (v.kameraGagal) { setFase('lewat'); return; }

  // Jaring pengaman: presensi tidak boleh terkunci total gara-gara cahaya
  // buruk atau kamera yang bermasalah.
  if (Date.now() - v.mulai > VERIF.BATAS_SABAR) { setFase('lewat'); return; }

  // Kamera yang baru menyala masih menyetel pencahayaan dan fokusnya, dan
  // cuplikan pertamanya sering gelap atau kosong. Bila keadaan itu terlanjur
  // dikunci sebagai pembanding, gambar yang menjadi normal beberapa saat
  // kemudian langsung terbaca sebagai gerakan besar.
  if (Date.now() - v.mulai < VERIF.PANAS_MS) return;

  const kini = contohPiksel();
  if (!kini) return;                                  // video belum berjalan
  if (ragamPiksel(kini) < VERIF.RAGAM_MIN) return;    // gambar masih rata/kosong

  const diam = v.terakhir ? bedaPersen(v.terakhir, kini) <= VERIF.DIAM_MAKS : false;
  v.terakhir = kini;
  if (diam) v.diamBerturut++; else v.diamBerturut = 0;

  if (v.fase === 'kalibrasi') {
    if (v.diamBerturut >= VERIF.BUTUH_DIAM) {
      v.dasar = kini;
      setFase('menunggu');
    }
    return;
  }

  const d = bedaPersen(v.dasar, kini);
  if (d > v.puncak) v.puncak = d;

  // Gerakan harus BERTAHAN beberapa cuplikan. Satu lonjakan sesaat — kamera
  // menyetel fokus, bayangan lewat — tidak boleh langsung meloloskan.
  if (d >= ambangTantangan()) {
    v.gerakBerturut++;
    aturMaju(1);
    if (v.gerakBerturut >= VERIF.BUTUH_GERAK) setFase('lolos');
    return;
  }
  v.gerakBerturut = 0;
  aturMaju(d / ambangTantangan());

  // Wajah kembali tenang → pembanding disegarkan ke keadaan tenang yang
  // baru. Inilah yang menahan pergeseran pelan (pencahayaan berangsur
  // berubah, HP sedikit bergeser di tangan) agar tidak menumpuk sampai
  // melewati ambang tanpa pegawai melakukan apa pun.
  if (v.diamBerturut >= VERIF.BUTUH_SEGAR) {
    v.dasar = kini;
    v.puncak = 0;
    aturMaju(0);
  }
}

function hentikanPantau() {
  if (S.verif.timer) { clearInterval(S.verif.timer); S.verif.timer = null; }
}

/** Siapkan layar Selfie: undi perintah, tampilkan, lalu mulai memantau. */
function siapkanVerifikasi() {
  hentikanPantau();
  // Dipanggil tepat setelah nyalakanKamera(). Fungsi itu menunggu izin
  // kamera, jadi penandaan gagalnya baru tiba setelah baris-baris ini —
  // aman untuk memulai dari keadaan bersih.
  S.verif = kosongkanVerif();
  S.verif.tantangan = pilihTantangan();
  S.verif.mulai = Date.now();

  tampilAbaAba(S.verif.tantangan);
  setFase('kalibrasi');
  aturMaju(0);
  S.verif.timer = setInterval(pantauGerak, VERIF.JEDA);
}

/** Ambil foto presensi. Hanya bisa dijalankan setelah gerakannya terbaca. */
function ambilFotoPresensi(tombol) {
  const v = S.verif;
  if (v.sibuk) return;
  if (v.fase !== 'lolos' && v.fase !== 'lewat') return;
  v.sibuk = true;
  tombol.disabled = true;
  hentikanPantau();

  const flash = document.getElementById('flash');
  if (flash) { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); }

  // Perubahan pada detik foto diambil ikut dicatat: bila pegawai sudah
  // kembali ke posisi netral, angkanya kecil dan admin bisa melihatnya.
  const saatFoto = v.dasar ? bedaPersen(v.dasar, contohPiksel()) : null;
  const foto = tangkapFoto();
  const t = v.tantangan;

  const verif = {
    tantangan: t.id,
    teks: t.teks,
    gerak: v.puncak,
    ambang: ambangTantangan(),
    saatFoto,
    hasil: v.fase === 'lolos' ? 'lolos' : (v.kameraGagal ? 'tanpaKamera' : 'lemah'),
  };

  setTimeout(() => {
    if (S.mode === 'keluar') simpanCheckOut(foto, verif);
    else simpanCheckIn(foto, verif);
    matikanKamera();
    pindah('sukses');
  }, 420);
}

/* ============================================================
   Layar 5 — Berhasil
   ============================================================ */

/** Label hasil tantangan gerak, dipakai di layar Berhasil dan panel admin. */
function labelVerifikasi(v) {
  if (!v) return { teks: 'Tanpa foto', chip: 'chip-grey' };
  if (v.hasil === 'lolos') return { teks: 'Gerak terverifikasi', chip: 'chip-green' };
  if (v.hasil === 'lemah') return { teks: 'Perlu diperiksa', chip: 'chip-red' };
  return { teks: 'Tanpa kamera', chip: 'chip-grey' };
}

function layarSukses() {
  const p = DB.presensi || {};
  const pulang = S.mode === 'keluar';
  const w = warnaStatus(p.status || 'Tepat waktu');

  const foto = pulang ? p.selfieKeluar : p.selfie;
  const verif = pulang ? p.verifikasiKeluar : p.verifikasi;
  const lv = labelVerifikasi(foto ? verif : null);

  return `
  <div class="sukses">
    <div class="sukses-navy"></div>
    <div class="sukses-isi">
      <div class="cincin">
        <div class="dalam">
          <svg width="40" height="40" viewBox="0 0 52 52" aria-hidden="true">
            <path d="M14 27l8 8 16-18" fill="none" stroke="#fff" stroke-width="5"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <h2>${pulang ? 'Presensi pulang tercatat' : 'Presensi tercatat'}</h2>
      <div class="sub">Kehadiran Anda sudah tersimpan.</div>

      <div class="sukses-baris">
        <div class="baris">
          <span class="kiri">${pulang ? 'Jam pulang' : 'Jam masuk'}</span>
          <span class="nilai-display">${jamTampil((pulang ? p.jamKeluar : p.jamMasuk) || '—')}</span>
        </div>
        <div class="baris">
          <span class="kiri">Status</span>
          <span class="chip ${w.chip}">${esc(p.status || '')}</span>
        </div>
        <div class="baris">
          <span class="kiri">Lokasi</span>
          <span class="kanan">${esc(DB.kantor.nama)}</span>
        </div>
        <div class="baris">
          <span class="kiri">Verifikasi wajah</span>
          <span style="display:flex;align-items:center;gap:10px">
            ${foto ? `<img class="thumb-selfie" src="${foto}" alt="Foto verifikasi">` : ''}
            <span class="chip ${lv.chip}">${lv.teks}</span>
          </span>
        </div>
        ${verif && verif.teks ? `
        <div class="baris">
          <span class="kiri">Perintah gerak</span>
          <span class="kanan">${esc(verif.teks)}</span>
        </div>` : ''}
      </div>

      <button class="btn-gold" data-aksi="selesaiCheckin">Selesai</button>
    </div>
  </div>`;
}

/* ============================================================
   Layar 6 — Riwayat
   ============================================================ */

/** Riwayat satu bulan, digabung dengan presensi hari ini yang tersimpan. */
function riwayatBulan(tahun, bulan) {
  const list = bangunRiwayat(tahun, bulan);
  const p = DB.presensi;
  if (p) {
    const d = new Date(p.tanggal + 'T00:00:00');
    if (d.getFullYear() === tahun && d.getMonth() === bulan) {
      const entri = {
        tanggal: p.tanggal, tgl: d.getDate(), hari: NAMA_HARI[d.getDay()].slice(0, 3),
        status: p.status, masuk: p.jamMasuk, keluar: p.jamKeluar || '—',
      };
      const i = list.findIndex(x => x.tanggal === p.tanggal);
      if (i >= 0) list[i] = entri; else list.unshift(entri);
    }
  }
  return list;
}

function layarRiwayat() {
  const { tahun, bulan } = S.bulan;
  const list = riwayatBulan(tahun, bulan);
  const n = s => list.filter(x => x.status === s).length;
  const bolehMaju = new Date(tahun, bulan + 1, 1) <= new Date();

  return `
  <div class="screen">
    ${headerNavy({
    eyebrow: 'Rekap kehadiran',
    judul: `${NAMA_BULAN[bulan]} ${tahun}`,
    kanan: `<div style="display:flex;gap:10px">
        <button class="hdr-bulat" data-aksi="bulanMundur" aria-label="Bulan sebelumnya">
          ${icon('chevron-left', 17, '#fff', 2.6)}
        </button>
        <button class="hdr-bulat" data-aksi="bulanMaju" aria-label="Bulan berikutnya" ${bolehMaju ? '' : 'disabled'}>
          ${icon('chevron', 17, '#fff', 2.6)}
        </button>
      </div>`,
  })}

    <div class="isi">
      <div class="stat-kolom">
        <div><div class="angka">${n('Tepat waktu')}</div><div class="label">Hadir</div></div>
        <div class="garis"></div>
        <div><div class="angka" style="color:var(--goldInk)">${n('Terlambat')}</div><div class="label">Terlambat</div></div>
        <div class="garis"></div>
        <div><div class="angka">${n('Izin')}</div><div class="label">Izin</div></div>
      </div>

      <div class="bagian"><div class="eyebrow">Rincian harian</div></div>
      <div>
        ${list.length ? list.map(r => {
      const w = warnaStatus(r.status);
      return `<div class="baris-hari">
            <div class="kol-tanggal">
              <div class="tgl">${r.tgl}</div>
              <div class="hari">${esc(r.hari)}</div>
            </div>
            <div class="tengah">
              <div class="jam">${jamTampil(r.masuk)} – ${jamTampil(r.keluar)}</div>
              <div class="lok">${esc(DB.kantor.nama)}</div>
            </div>
            <span class="chip ${w.chip}">${esc(r.status)}</span>
          </div>`;
    }).join('') : '<div class="kosong">Belum ada data presensi bulan ini</div>'}
      </div>
    </div>
  </div>`;
}

/* ============================================================
   Layar 7 — Izin & Cuti
   ============================================================ */

function layarCuti() {
  const milik = DB.pengajuanSaya();
  const c = hitungSisaCuti();
  const persen = Math.round(c.terpakai / c.kuota * 100);

  return `
  <div class="screen">
    ${headerNavy({ eyebrow: 'Pengajuan', judul: 'Izin & Cuti' })}

    <div class="isi">
      <div class="eyebrow">Sisa cuti tahunan</div>
      <div class="saldo-baris" style="margin-top:12px">
        <div>
          <span class="saldo-angka">${c.sisa}</span>
          <span class="saldo-satuan"> / ${c.kuota} hari</span>
        </div>
        <div style="text-align:right">
          <div class="eyebrow">Terpakai</div>
          <div class="saldo-terpakai">${c.terpakai}</div>
        </div>
      </div>
      <div class="bar"><i style="width:${Math.min(100, persen)}%"></i></div>

      <button class="btn-gold" style="margin-top:26px" data-aksi="cutiForm">
        ${icon('plus', 19, 'currentColor', 2.6)} Ajukan izin atau cuti
      </button>

      <div class="bagian"><div class="eyebrow">Pengajuan saya</div></div>
      <div>
        ${milik.length ? milik.map(p => `
          <div class="item-pengajuan">
            <div class="atas">
              <span class="jenis">${esc(p.jenis)}</span>
              <span class="chip ${warnaStatus(p.status).chip}">${esc(p.status)}</span>
            </div>
            <div class="meta">${periodeTeks(p)} · ${p.hari} hari</div>
            ${p.alasan ? `<div class="alasan">${esc(p.alasan)}</div>` : ''}
          </div>`).join('') : '<div class="kosong">Belum ada pengajuan</div>'}
      </div>
    </div>
  </div>`;
}

/* ============================================================
   Layar 8 — Form pengajuan
   ============================================================ */

function layarCutiForm() {
  const f = S.form;
  const durasi = f.mulai && f.selesai ? hariKerja(f.mulai, f.selesai) : 0;

  return `
  <div class="screen">
    <header class="hdr" style="padding:58px 26px 26px">
      <div style="display:flex;align-items:center;gap:14px">
        <button class="btn-kembali" data-aksi="cuti" aria-label="Kembali">
          ${icon('chevron-left', 20, '#fff', 2.6)}
        </button>
        <div class="hdr-judul" style="font-size:22px">Ajukan pengajuan</div>
      </div>
    </header>

    <form class="isi-rapat" id="formCuti">
      <div class="field-label">Jenis pengajuan</div>
      <div class="segmented">
        ${['Izin', 'Cuti Tahunan', 'Sakit'].map(j => `
          <button type="button" class="${f.jenis === j ? 'aktif' : ''}" data-aksi="setJenis" data-jenis="${j}">
            ${j === 'Cuti Tahunan' ? 'Cuti' : j}
          </button>`).join('')}
      </div>

      <div class="form-grup" style="display:flex;gap:12px">
        <div style="flex:1;min-width:0">
          <label class="field-label" for="inpMulai">Mulai</label>
          <div class="input-pil">
            <input id="inpMulai" name="mulai" type="date" value="${f.mulai}" required>
          </div>
        </div>
        <div style="flex:1;min-width:0">
          <label class="field-label" for="inpSelesai">Selesai</label>
          <div class="input-pil">
            <input id="inpSelesai" name="selesai" type="date" value="${f.selesai}" required>
          </div>
        </div>
      </div>

      <div class="kartu-sage" id="kotakDurasi" style="margin-top:18px">
        ${icon('calendar', 18, 'currentColor', 2.4)}
        <span>${durasi ? `Total ${durasi} hari kerja` : 'Pilih tanggal terlebih dahulu'}</span>
      </div>

      <div class="form-grup">
        <label class="field-label" for="inpAlasan">Alasan</label>
        <div class="textarea-kotak">
          <textarea id="inpAlasan" name="alasan" rows="4"
                    placeholder="Tuliskan keterangan pengajuan Anda…" required>${esc(f.alasan)}</textarea>
        </div>
      </div>

      <div class="form-grup">
        <div class="field-label">Lampiran (opsional)</div>
        <label class="dropzone" for="inpLampiran">
          <span class="ikon">${icon('upload', 20, 'var(--goldInk)', 2.4)}</span>
          <span class="t" id="namaLampiran">${f.lampiran ? esc(f.lampiran) : 'Unggah surat atau dokumen'}</span>
          <span class="s">JPG, PNG, atau PDF · maksimal 5 MB</span>
          <input id="inpLampiran" name="lampiran" type="file" class="sr-only" accept=".jpg,.jpeg,.png,.pdf">
        </label>
      </div>

      <button type="submit" class="btn-gold" style="margin-top:28px">Kirim pengajuan</button>
    </form>
  </div>`;
}

/* ============================================================
   Layar 9 — Profil
   ============================================================ */

function layarProfil() {
  const kini = new Date();
  const list = riwayatBulan(kini.getFullYear(), kini.getMonth());
  const hadir = list.filter(x => x.status !== 'Izin').length;
  const persen = list.length ? Math.round(hadir / list.length * 100) : 0;
  const demo = DB.simpanan.modeDemo;
  const gelap = temaGelap();

  return `
  <div class="screen">
    ${headerNavy({
    eyebrow: 'Akun',
    judul: AKU.nama,
    sub: AKU.jabatan,
    kanan: `<div class="hdr-avatar hdr-avatar-lg">${inisialAku}</div>`,
  })}

    <div class="isi">
      <div class="stat-kolom">
        <div><div class="angka">${persen}%</div><div class="label">Kehadiran</div></div>
        <div class="garis"></div>
        <div><div class="angka">${hadir}</div><div class="label">Hari hadir</div></div>
        <div class="garis"></div>
        <div><div class="angka">${hadir * 8}</div><div class="label">Jam kerja</div></div>
      </div>

      <div class="bagian"><div class="eyebrow">Data kepegawaian</div></div>
      <div>
        <div class="baris"><span class="kiri">NIP</span><span class="kanan tnum">${esc(AKU.nip)}</span></div>
        <div class="baris"><span class="kiri">Unit kerja</span><span class="kanan">${esc(AKU.unit)}</span></div>
        <div class="baris"><span class="kiri">Jabatan</span><span class="kanan">${esc(AKU.jabatan)}</span></div>
        <div class="baris"><span class="kiri">Titik presensi</span><span class="kanan">${esc(DB.kantor.nama)}</span></div>
      </div>

      <div class="bagian"><div class="eyebrow">Preferensi</div></div>
      <div>
        <div class="baris-switch">
          <div class="teks">
            <div class="judul">Mode gelap</div>
            <div class="sub">Tampilan redup untuk ruangan minim cahaya</div>
          </div>
          <button class="switch" data-aksi="toggleGelap" role="switch"
                  aria-checked="${gelap}" aria-label="Mode gelap">
            <span class="knob"></span>
          </button>
        </div>
        <div class="baris-switch">
          <div class="teks">
            <div class="judul">Mode demo</div>
            <div class="sub">Lewati pengecekan lokasi saat presentasi</div>
          </div>
          <button class="switch" data-aksi="toggleDemo" role="switch"
                  aria-checked="${demo}" aria-label="Mode demo">
            <span class="knob"></span>
          </button>
        </div>
        <button class="baris-aksi" data-aksi="notif">
          <span class="teks"><span class="judul">Pengingat presensi</span>
            <span class="sub">07.15 WIB setiap hari kerja</span></span>
          ${icon('chevron', 17, 'var(--mut)', 2.6)}
        </button>
        <button class="baris-aksi" data-aksi="resetData">
          <span class="teks"><span class="judul">Kembalikan data contoh</span>
            <span class="sub">Hapus presensi dan pengajuan yang Anda buat</span></span>
          ${icon('refresh', 17, 'var(--mut)', 2.6)}
        </button>
      </div>

      <button class="btn-outline-red" style="width:100%;margin-top:30px" data-aksi="logout">
        ${icon('logout', 18, 'currentColor', 2.4)} Keluar
      </button>
    </div>
  </div>`;
}

/* ============================================================
   Bottom navigation
   ============================================================ */

const NAV = [
  { id: 'home', label: 'Beranda', ikon: 'home' },
  { id: 'riwayat', label: 'Riwayat', ikon: 'clock' },
  { id: 'cuti', label: 'Izin', ikon: 'calendar' },
  { id: 'profil', label: 'Profil', ikon: 'user' },
];

function renderNav() {
  const tampil = LAYAR_BERNAV.includes(S.layar);
  $nav.hidden = !tampil;
  if (!tampil) return;
  $nav.innerHTML = NAV.map(n => `
    <button data-aksi="${n.id}" class="${S.layar === n.id ? 'aktif' : ''}"
            aria-current="${S.layar === n.id ? 'page' : 'false'}">
      ${icon(n.ikon, 21, 'currentColor', 2.75)}<span>${n.label}</span>
    </button>`).join('');
}

/* ============================================================
   Render utama
   ============================================================ */

const LAYAR = {
  login: layarLogin,
  home: layarHome,
  peta: layarPeta,
  selfie: layarSelfie,
  sukses: layarSukses,
  riwayat: layarRiwayat,
  profil: layarProfil,
  cuti: layarCuti,
  cutiForm: layarCutiForm,
};

/* Layar login harus muat utuh tanpa digulir — kalau tombol "Lupa kata
   sandi?" tersembunyi di bawah lipatan, pegawai yang lupa sandinya tidak
   punya jalan keluar. Tinggi layar HP terlalu beragam untuk ditebak lewat
   media query, jadi di sini layarnya benar-benar diukur: selama isinya
   masih meluber, spasi login dirapatkan satu tingkat. Ukuran tiap tingkat
   ada di app.css (.login[data-rapat="1"] dan "2"). */
const RAPAT_MAKS = 2;

function paskanLogin() {
  const el = $layar.querySelector('.login');
  if (!el) return;
  el.removeAttribute('data-rapat');
  for (let n = 1; n <= RAPAT_MAKS && el.scrollHeight > el.clientHeight + 1; n++) {
    el.dataset.rapat = String(n);
  }
}

function render() {
  segarkanProfil();
  lepasPeta();
  $layar.innerHTML = LAYAR[S.layar]();
  renderNav();
  if (S.layar === 'selfie') { nyalakanKamera(); siapkanVerifikasi(); }
  if (S.layar === 'peta') pasangPetaPegawai();
  pasangFormHandler();
  if (S.layar === 'login') paskanLogin();
}

// Tinggi layar berubah saat HP diputar atau bilah peramban muncul/hilang;
// ukur ulang supaya tingkat perapatannya ikut menyesuaikan.
window.addEventListener('resize', () => {
  if (S.layar !== 'login') return;
  // Kecuali saat papan ketik terbuka: tinggi layar menyusut drastis dan
  // ukuran tulisan akan melompat-lompat di tengah pengetikan. Peramban
  // sudah menggeser sendiri kolom yang sedang diisi ke area terlihat,
  // jadi pengukuran ditunda sampai fokusnya lepas.
  const f = document.activeElement;
  if (f && f.tagName === 'INPUT' && f.closest('.login')) return;
  paskanLogin();
});
window.addEventListener('orientationchange', () => {
  if (S.layar === 'login') setTimeout(paskanLogin, 250);
});

// Caprasimo dan Figtree dimuat dari internet. Sebelum keduanya siap,
// teks memakai huruf cadangan yang tingginya berbeda — ukur ulang setelah
// huruf aslinya terpasang.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { if (S.layar === 'login') paskanLogin(); });
}

function pindah(layar) {
  if (S.layar === 'selfie' && layar !== 'selfie') {
    // Pemantauan kamera harus berhenti begitu layarnya ditinggalkan.
    hentikanPantau();
    S.verif.sibuk = false;
    matikanKamera();
  }
  S.layar = layar;
  render();
  $layar.scrollTop = 0;
}

/* ============================================================
   Aksi
   ============================================================ */

const AKSI = {
  // Kembali ke beranda selalu mengakhiri alur presensi yang sedang berjalan,
  // supaya tahap 'keluar' tidak tertinggal aktif di layar berikutnya.
  home: () => { S.mode = 'masuk'; pindah('home'); },
  peta: () => pindah('peta'),
  riwayat: () => pindah('riwayat'),
  profil: () => pindah('profil'),
  cuti: () => pindah('cuti'),
  cutiForm: () => {
    const hariIni = kunciTanggal(new Date());
    if (!S.form.mulai) { S.form.mulai = hariIni; S.form.selesai = hariIni; }
    pindah('cutiForm');
  },

  lihatSandi: () => { S.lihatSandi = !S.lihatSandi; render(); },
  lupaSandi: () => toast('Hubungi Biro SDM untuk mengatur ulang kata sandi.'),
  notif: () => toast('Pengingat presensi aktif setiap hari kerja.'),

  /* Alur presensi: Beranda → Verifikasi lokasi → Selfie → Berhasil */
  mulaiCheckin: () => {
    const izin = bolehAbsen();
    if (!izin.ok) { toast(izin.alasan, 'err'); return; }
    S.mode = 'masuk';
    pindah('peta');
  },

  /* Presensi pulang menempuh jalur yang sama dengan presensi masuk:
     lokasi diperiksa, lalu wajah diverifikasi dengan tantangan gerak. */
  mulaiCheckout: () => {
    const p = DB.presensi;
    if (!p || p.jamKeluar) return;
    const izin = bolehAbsen();
    if (!izin.ok) { toast(izin.alasan, 'err'); return; }
    S.mode = 'keluar';
    pindah('peta');
  },

  lanjutSelfie: () => {
    const izin = bolehAbsen();
    if (!izin.ok) { toast(izin.alasan, 'err'); return; }
    pindah('selfie');   // siapkanVerifikasi() dijalankan dari render()
  },

  jepret: (el) => ambilFotoPresensi(el),

  selesaiCheckin: () => {
    const pulang = S.mode === 'keluar';
    S.mode = 'masuk';
    pindah('home');
    toast(pulang ? 'Presensi pulang tersimpan.' : 'Presensi masuk tersimpan.');
  },

  bulanMundur: () => {
    const d = new Date(S.bulan.tahun, S.bulan.bulan - 1, 1);
    S.bulan = { tahun: d.getFullYear(), bulan: d.getMonth() };
    render();
  },
  bulanMaju: () => {
    const d = new Date(S.bulan.tahun, S.bulan.bulan + 1, 1);
    if (d > new Date()) return;
    S.bulan = { tahun: d.getFullYear(), bulan: d.getMonth() };
    render();
  },

  setJenis: (el) => { S.form.jenis = el.dataset.jenis; render(); },

  toggleGelap: () => {
    const gelap = toggleTema();
    render();
    toast(gelap ? 'Mode gelap aktif.' : 'Mode terang aktif.');
  },

  toggleDemo: () => {
    DB.simpanan.modeDemo = !DB.simpanan.modeDemo;
    DB.tulis();
    render();
    toast(DB.simpanan.modeDemo ? 'Mode demo aktif.' : 'Mode demo dimatikan.');
  },

  resetData: () => {
    if (confirm('Kembalikan seluruh data contoh ke kondisi awal? Presensi dan pengajuan yang Anda buat akan hilang.')) {
      DB.reset();
    }
  },

  logout: () => {
    DB.simpanan.masuk = false;
    DB.tulis();
    matikanKamera();
    pindah('login');
  },
};

/** Catat presensi masuk ke penyimpanan. */
function simpanCheckIn(foto, verif) {
  const now = new Date();
  const jam = fmtJam(now);
  DB.simpanan.presensi = {
    tanggal: kunciTanggal(now),
    jamMasuk: jam,
    jamKeluar: null,
    status: jam <= SHIFT.batasTerlambat ? 'Tepat waktu' : 'Terlambat',
    selfie: foto,
    verifikasi: verif,
    lat: S.gps.lat,
    lng: S.gps.lng,
    akurasi: S.gps.akurasi,
    jarak: S.gps.status === 'ok' ? S.gps.jarak : null,
  };
  DB.tulis();
}

/** Catat presensi pulang — foto, lokasi, dan hasil verifikasinya sendiri. */
function simpanCheckOut(foto, verif) {
  const p = DB.simpanan.presensi;
  if (!p || p.jamKeluar) return;
  p.jamKeluar = fmtJam(new Date());
  p.selfieKeluar = foto;
  p.verifikasiKeluar = verif;
  p.latKeluar = S.gps.lat;
  p.lngKeluar = S.gps.lng;
  p.akurasiKeluar = S.gps.akurasi;
  p.jarakKeluar = S.gps.status === 'ok' ? S.gps.jarak : null;
  DB.tulis();
}

/* ============================================================
   Event listener
   ============================================================ */

function tanganiKlik(e) {
  const el = e.target.closest('[data-aksi]');
  if (!el || el.disabled) return;
  const fn = AKSI[el.dataset.aksi];
  if (fn) { e.preventDefault(); fn(el, e); }
}
$layar.addEventListener('click', tanganiKlik);
$nav.addEventListener('click', tanganiKlik);

/** Form login & form pengajuan dipasang ulang tiap kali layarnya dirender. */
function pasangFormHandler() {
  const login = document.getElementById('formLogin');
  if (login) {
    login.addEventListener('submit', e => {
      e.preventDefault();
      const nip = login.nip.value.trim();
      const sandi = login.sandi.value;
      const err = document.getElementById('errLogin');
      if (!nip || !sandi) {
        err.innerHTML = '<div class="form-error">NIP dan kata sandi wajib diisi.</div>';
        return;
      }
      DB.simpanan.masuk = true;
      DB.tulis();
      pindah('home');
    });
  }

  const cuti = document.getElementById('formCuti');
  if (cuti) {
    const sinkron = () => {
      S.form.mulai = cuti.mulai.value;
      S.form.selesai = cuti.selesai.value;
      S.form.alasan = cuti.alasan.value;
      const n = hariKerja(S.form.mulai, S.form.selesai);
      const kotak = document.getElementById('kotakDurasi');
      kotak.querySelector('span').textContent =
        n ? `Total ${n} hari kerja` : 'Pilih tanggal terlebih dahulu';
    };
    cuti.mulai.addEventListener('change', () => {
      if (cuti.selesai.value < cuti.mulai.value) cuti.selesai.value = cuti.mulai.value;
      sinkron();
    });
    cuti.selesai.addEventListener('change', sinkron);
    cuti.alasan.addEventListener('input', sinkron);

    cuti.lampiran.addEventListener('change', () => {
      const f = cuti.lampiran.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) {
        toast('Ukuran lampiran melebihi 5 MB.', 'err');
        cuti.lampiran.value = '';
        return;
      }
      S.form.lampiran = f.name;
      document.getElementById('namaLampiran').textContent = f.name;
    });

    cuti.addEventListener('submit', e => {
      e.preventDefault();
      sinkron();
      const { mulai, selesai, alasan, jenis } = S.form;
      if (!mulai || !selesai) { toast('Tanggal mulai dan selesai wajib diisi.', 'err'); return; }
      if (selesai < mulai) { toast('Tanggal selesai tidak boleh sebelum tanggal mulai.', 'err'); return; }
      if (!alasan.trim()) { toast('Alasan pengajuan wajib diisi.', 'err'); return; }

      const hari = hariKerja(mulai, selesai) || 1;
      if (jenis === 'Cuti Tahunan' && hari > hitungSisaCuti().sisa) {
        toast('Durasi melebihi sisa cuti tahunan Anda.', 'err');
        return;
      }

      DB.simpanan.pengajuan.unshift({
        id: 'P' + Date.now(),
        pegawaiId: 1,
        nama: AKU.nama,
        inisial: inisialAku,
        unit: AKU.unit,
        jenis, mulai, selesai, hari,
        alasan: alasan.trim(),
        lampiran: S.form.lampiran || null,
        status: 'Menunggu',
        dibuat: kunciTanggal(new Date()),
      });
      DB.tulis();
      S.form = { jenis: 'Izin', mulai: '', selesai: '', alasan: '', lampiran: '' };
      pindah('cuti');
      toast('Pengajuan terkirim ke atasan.');
    });
  }
}

/* ============================================================
   Sinkron dengan panel admin
   ------------------------------------------------------------
   Peristiwa `storage` hanya menyala di tab LAIN pada peramban yang sama.
   Jadi ketika admin memindahkan titik kantor atau menyunting data pegawai,
   aplikasi ini ikut menyesuaikan tanpa perlu dimuat ulang.
   ============================================================ */

window.addEventListener('storage', e => {
  if (e.key !== KUNCI_SIMPAN) return;
  const kantorLama = JSON.stringify(DB.kantor);
  const profilLama = JSON.stringify(DB.profil());

  if (!DB.segarkanDariPenyimpanan()) return;

  // Jarak dihitung ulang terhadap titik kantor yang baru sebelum dirender.
  if (S.gps.status === 'ok') {
    const k = DB.kantor;
    const jarak = jarakMeter(S.gps.lat, S.gps.lng, k.lat, k.lng);
    S.gps.jarak = Math.round(jarak);
    S.gps.dalam = jarak <= k.radius;
  }
  render();

  if (JSON.stringify(DB.kantor) !== kantorLama) toast('Titik kantor diperbarui oleh admin.');
  else if (JSON.stringify(DB.profil()) !== profilLama) toast('Data pegawai Anda diperbarui oleh admin.');
});

/* ============================================================
   Jam berdetak
   ------------------------------------------------------------
   Hanya jam besar di Beranda yang diperbarui. Status bar tiruan sudah
   dihapus, jadi tidak ada lagi jam kecil di pojok kiri atas.
   ============================================================ */

setInterval(() => {
  S.sekarang = new Date();
  const j = document.getElementById('jamBesar');
  if (j) j.textContent = jamTampil(fmtJam(S.sekarang));
}, 1000);

/* ============================================================
   Mulai
   ============================================================ */

render();
mulaiGPS();

if (HASIL_SETUP) toast(HASIL_SETUP.pesan, HASIL_SETUP.ok ? 'ok' : 'err');
