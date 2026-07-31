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

/**
 * Apakah ada sesi tersimpan di perangkat ini?
 *
 * Diperiksa serentak (bukan lewat server) hanya untuk memilih layar
 * pertama. Memastikan sesinya masih sah butuh panggilan ke server yang
 * memakan waktu; tanpa penanda ini, pegawai yang sudah masuk akan
 * melihat layar login berkelebat dulu setiap kali membuka aplikasi.
 * Ini penanda tampilan, bukan penentu hak akses — yang menentukan
 * tetap jawaban server.
 */
const ADA_SESI_TERSIMPAN = (() => {
  try {
    return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k));
  } catch { return false; }
})();

const S = {
  layar: ADA_SESI_TERSIMPAN ? 'memuat' : 'login',
  emailIsian: '',
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
    langkah: 0,          // 0 = menunduk, 1 = menengadah
    arah1: 0,            // arah tegak langkah pertama; langkah kedua wajib lawannya
    hasilLangkah: [],    // geseran yang meloloskan tiap langkah, untuk bukti admin
    beku: false,         // pembanding dibekukan begitu langkah pertama lolos
    dasar: null,         // contoh piksel saat wajah masih diam
    terakhir: null,
    dasarCiri: null,     // tanda wajah saat tenang — pembanding bentuk gerakan
    dasarNorm: null,     // cuplikan tenang yang sudah dinormalkan, untuk cariGeseran
    ciriTerakhir: null,
    lolosCiri: null,     // tanda gerak pada saat perintahnya dinyatakan lolos
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
 * Profil pemilik akun.
 *
 * Sumber utamanya adalah tabel `pegawai` di server — nama, NIK, jabatan,
 * dan unit selalu ikut perubahan yang dilakukan admin, dan tidak pernah
 * tertinggal di HP setelah orangnya keluar. Data contoh dari data.js
 * hanya dipakai sebelum ada yang masuk, supaya layar tidak kosong.
 */
let AKU = DB.profil();
let inisialAku = inisial(AKU.nama);

function segarkanProfil() {
  if (AKUN.profil) {
    AKU = {
      ...AKUN.profil,
      // Sisa cuti masih dihitung dari pengajuan yang tersimpan di
      // perangkat; pindah ke server bersama menu Izin & Cuti nanti.
      cutiTerpakai: DB.profil().cutiTerpakai,
    };
  } else {
    AKU = DB.profil();
  }
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

/** Kepala layar masuk/daftar — logo, wordmark, dan keterangan. */
function kepalaLogin() {
  return `
    <div class="login-atas">
      <img class="login-logo" src="assets/logo-pu.svg" alt="">
      <h1 class="login-wordmark">Kompas</h1>
      <hr class="garis-emas login-garis">
      <p class="login-desk">Konsultan On-site Mobile Presence &amp; Attendance System.</p>
    </div>`;
}

/** Kotak kata sandi dengan tombol mata. */
function isianSandi({ id, nama, label, autocomplete = 'current-password', placeholder = 'Kata sandi' }) {
  return `
    <div>
      <label class="field-label" for="${id}">${esc(label)}</label>
      <div class="field">
        ${icon('lock', 18, 'var(--mut)', 2.2)}
        <input id="${id}" name="${nama}" type="${S.lihatSandi ? 'text' : 'password'}"
               autocomplete="${autocomplete}" placeholder="${esc(placeholder)}">
        <button type="button" class="toggle" data-aksi="lihatSandi"
                aria-label="${S.lihatSandi ? 'Sembunyikan' : 'Tampilkan'} kata sandi">
          ${icon(S.lihatSandi ? 'eye-off' : 'eye', 18, 'var(--mut)', 2.2)}
        </button>
      </div>
    </div>`;
}

/**
 * Layar masuk.
 *
 * Emailnya yang diketik, bukan NIK. NIK tidak pernah diminta di layar
 * mana pun aplikasi pegawai: itu data pribadi, dan sudah tersimpan di
 * server sejak admin mendaftarkan orangnya.
 */
function layarLogin() {
  return `
  <div class="login">
    ${kepalaLogin()}

    <form class="login-panel" id="formLogin" novalidate>
      <h2>Masuk</h2>
      <div class="sub">Gunakan email dan kata sandi Anda.</div>

      <div class="login-form">
        <div>
          <label class="field-label" for="inpEmail">Email</label>
          <div class="field">
            ${icon('user', 18, 'var(--mut)', 2.2)}
            <input id="inpEmail" name="email" type="email" autocomplete="username"
                   inputmode="email" placeholder="nama@email.com" value="${esc(S.emailIsian)}">
          </div>
        </div>
        ${isianSandi({ id: 'inpSandi', nama: 'sandi', label: 'Kata sandi' })}
      </div>

      <div id="errLogin"></div>
      <button type="submit" class="btn-gold login-masuk">Masuk</button>
      <button type="button" class="login-lupa" data-aksi="lupaSandi">Lupa kata sandi?</button>
      <button type="button" class="login-lupa" data-aksi="keDaftar">Belum punya akun? Daftar</button>
    </form>
  </div>`;
}

/**
 * Layar daftar.
 *
 * Emailnya harus sudah dimasukkan admin lebih dulu; kalau tidak,
 * pendaftarannya ditolak server. Aplikasi sengaja tidak memeriksanya
 * lebih awal — kalau layar ini bisa menjawab "email itu terdaftar",
 * orang luar bisa memakainya untuk menebak siapa saja yang bekerja
 * di kantor ini.
 */
function layarDaftar() {
  return `
  <div class="login">
    ${kepalaLogin()}

    <form class="login-panel" id="formDaftar" novalidate>
      <h2>Daftar</h2>
      <div class="sub">Pakai email yang sudah didaftarkan admin kepegawaian.</div>

      <div class="login-form">
        <div>
          <label class="field-label" for="dafEmail">Email</label>
          <div class="field">
            ${icon('user', 18, 'var(--mut)', 2.2)}
            <input id="dafEmail" name="email" type="email" autocomplete="username"
                   inputmode="email" placeholder="nama@email.com" value="${esc(S.emailIsian)}">
          </div>
        </div>
        ${isianSandi({
          id: 'dafSandi', nama: 'sandi', label: 'Buat kata sandi',
          autocomplete: 'new-password', placeholder: 'Minimal 8 karakter',
        })}
        ${isianSandi({
          id: 'dafUlang', nama: 'ulang', label: 'Ulangi kata sandi',
          autocomplete: 'new-password', placeholder: 'Ketik ulang',
        })}
      </div>

      <div id="errDaftar"></div>
      <button type="submit" class="btn-gold login-masuk">Buat akun</button>
      <button type="button" class="login-lupa" data-aksi="keLogin">Sudah punya akun? Masuk</button>
    </form>
  </div>`;
}

/** Layar buat kata sandi baru — muncul setelah tautan dari email diklik. */
function layarSandiBaru() {
  return `
  <div class="login">
    ${kepalaLogin()}

    <form class="login-panel" id="formSandiBaru" novalidate>
      <h2>Kata sandi baru</h2>
      <div class="sub">Buat kata sandi baru untuk akun Anda.</div>

      <div class="login-form">
        ${isianSandi({
          id: 'barSandi', nama: 'sandi', label: 'Kata sandi baru',
          autocomplete: 'new-password', placeholder: 'Minimal 8 karakter',
        })}
        ${isianSandi({
          id: 'barUlang', nama: 'ulang', label: 'Ulangi kata sandi',
          autocomplete: 'new-password', placeholder: 'Ketik ulang',
        })}
      </div>

      <div id="errSandiBaru"></div>
      <button type="submit" class="btn-gold login-masuk">Simpan kata sandi</button>
    </form>
  </div>`;
}

/**
 * Layar antara saat sesi tersimpan sedang diperiksa ke server.
 *
 * Tanpa ini, pegawai yang membuka aplikasi dalam keadaan sudah masuk
 * akan melihat layar login berkelebat lebih dulu — terlihat seperti
 * aplikasi lupa siapa dirinya, padahal hanya sedang menunggu jawaban.
 */
function layarMemuat() {
  return `
  <div class="login">
    ${kepalaLogin()}
    <div class="login-panel">
      <h2>Memuat</h2>
      <div class="sub">Menghubungi server presensi…</div>
    </div>
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
      <div class="aba-nomor" id="abaNomor"></div>

      <!-- Bilah kemajuan tanpa angka. Pegawai perlu tahu gerakannya sedang
           terbaca, tetapi menampilkan persentasenya sama saja dengan
           memberi tahu persis seberapa sedikit gerakan yang bisa lolos. -->
      <div class="maju" id="maju" hidden><i id="majuIsi"></i></div>

      <div class="t" id="verifJudul">Menyiapkan verifikasi…</div>
      <div class="s" id="verifKet">Tatap kamera dan diam sejenak.</div>

      <!-- Angka mentah pengukuran, hanya muncul bila halaman dibuka dengan
           ?diagnostik. Dipakai untuk menyetel ambang berdasarkan gerakan
           sungguhan di HP pengguna, bukan tebakan. -->
      <div class="diagnostik" id="diag" hidden></div>
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
  BUTUH_SEGAR: 8,          // cuplikan diam sebelum pembanding disegarkan
  BUTUH_GERAK: 5,          // ±0,7 detik; gerakannya harus ditahan, bukan disentak
  BATAS_SABAR: 25000,      // ms; setelah ini presensi dibuka tetapi ditandai

  /* Ambang tanda gerak. Satuannya RELATIF terhadap ukuran wajah pengguna
     sendiri, bukan piksel layar — dengan begitu ambangnya tidak berubah
     mengikuti jarak wajah ke kamera maupun resolusi HP. */
  GESER_PIKSEL_MIN: 3,     // geseran rupa wajah, dalam piksel cuplikan 64×80

  /* Sumbu yang diminta harus mencapai sekian kali sumbu satunya.
     Semula 1,5 — menuntut gerakan lurus pada satu sumbu saja. Pengukuran
     di HP menunjukkan itu tidak realistis: saat menengadah, kepala ikut
     bergeser menyamping sehingga dx 0,27 justru melampaui dy 0,22.
     Gerakan kepala manusia diagonal, bukan lurus.

     Nilai 0,7 tetap menolak gerakan yang benar-benar tegak lurus terhadap
     perintah — menoleh murni (dy hampir nol) tidak akan meloloskan
     perintah tengadah, dan sebaliknya. */
  SUMBU_MIN: 0.7,
  /* Menggerakkan kepala saja sudah membuat paruh bawah berubah sampai 53
     persen pada pengukuran di HP, jadi ambang 7 terlalu rendah untuk
     menjadi pembeda. Yang benar-benar membedakan adalah rasio: membuka
     mulut hanya mengaduk paruh bawah, sedangkan menggerakkan kepala
     mengaduk kedua paruh hampir sama rata (45 lawan 40). */
  MULUT_MIN: 10,           // persen piksel berubah di paruh bawah
  MULUT_RASIO: 2.2,        // paruh bawah harus sekian kali paruh atas
  PITA_GESER_MAKS: 2,      // piksel; mulut dibuka TANPA kepala ikut berpindah

  JANGKAU: 12,             // piksel pencarian geseran gambar ke tiap arah
  SISA_MIN: 6,             // persen perubahan yang TIDAK terjelaskan geseran
  GOYANG_HP: 3,            // geseran sebesar ini dianggap HP-nya yang bergerak
};

/** Mode diagnostik: buka halaman dengan ?diagnostik untuk melihat angkanya. */
const DIAGNOSTIK = /(^|[?&])diagnostik(=|&|$)/.test(location.search);

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

  // Hampir seluruh bingkai diambil. Versi sebelumnya hanya 62% bagian
  // tengah — terlalu sempit: pada selfie HP wajah sudah memenuhi layar,
  // sehingga area ukurnya penuh oleh wajah saja. Akibatnya mendekatkan
  // wajah tidak terbaca sebagai membesar, karena yang keluar bingkai
  // sebanyak yang masuk.
  const sisiL = video.videoWidth * 0.92;
  const sisiT = video.videoHeight * 0.92;
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

/* ------------------------------------------------------------
   Pemisah gerakan kamera dari gerakan wajah
   ------------------------------------------------------------
   Menggoyang HP memindahkan SELURUH isi bingkai, persis seperti wajah
   yang bergerak — dari pikselnya keduanya tampak sama. Pembedanya begini:

     menggoyang HP     seluruh gambar bergeser utuh; kalau digeser balik,
                       ia kembali cocok dengan gambar semula
     menggerakkan wajah rupa wajahnya sendiri berubah — hidung berpindah
                       terhadap mata, satu pipi tersembunyi, mulut membuka.
                       Digeser ke mana pun, ia tidak akan pernah cocok lagi

   Jadi dicari dulu geseran terbaik yang membuat kedua cuplikan paling
   mirip. Sisa perbedaan SETELAH digeser itulah perubahan yang benar-benar
   berasal dari wajah. Geserannya sendiri dipakai untuk mengoreksi
   perpindahan titik berat, sehingga goyangan HP tidak lagi terhitung.
   ------------------------------------------------------------ */

/** Kurangi tiap piksel dengan rata-ratanya, agar kebal perubahan cahaya. */
function normalkan(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  const rata = s / a.length;
  const out = new Int16Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - rata;
  return out;
}

/** Persen piksel berbeda bila b digeser (sx, sy), dibatasi satu wilayah. */
function selisihGeser(a, b, sx, sy, w) {
  const L = VERIF.LEBAR;
  const x0 = Math.max(w.x0, w.x0 - sx), x1 = Math.min(w.x1, w.x1 - sx);
  const y0 = Math.max(w.y0, w.y0 - sy), y1 = Math.min(w.y1, w.y1 - sy);
  if (x1 <= x0 || y1 <= y0) return 100;

  let beda = 0, jumlah = 0;
  for (let y = y0; y < y1; y++) {
    const barisA = y * L, barisB = (y + sy) * L + sx;
    for (let x = x0; x < x1; x++) {
      if (Math.abs(a[barisA + x] - b[barisB + x]) > VERIF.AMBANG_PIKSEL) beda++;
      jumlah++;
    }
  }
  return (beda / jumlah) * 100;
}

const SELURUH = { x0: 0, y0: 0, x1: VERIF.LEBAR, y1: VERIF.TINGGI };
const AREA_WAJAH = {
  x0: Math.round(VERIF.LEBAR * 0.20), x1: Math.round(VERIF.LEBAR * 0.80),
  y0: Math.round(VERIF.TINGGI * 0.20), y1: Math.round(VERIF.TINGGI * 0.80),
};

/**
 * Cari geseran yang paling mencocokkan kedua cuplikan pada satu wilayah.
 * Dua tahap — kasar lalu halus — agar tetap ringan dijalankan tiap 140 ms.
 * @returns { sx, sy, sisa } sisa = persen beda yang TIDAK terjelaskan geseran
 */
function cariGeseran(a, b, w = SELURUH) {
  let terbaik = { sx: 0, sy: 0, sisa: selisihGeser(a, b, 0, 0, w) };
  const coba = (sx, sy) => {
    const s = selisihGeser(a, b, sx, sy, w);
    if (s < terbaik.sisa) terbaik = { sx, sy, sisa: s };
  };
  const J = VERIF.JANGKAU;
  for (let sy = -J; sy <= J; sy += 2) for (let sx = -J; sx <= J; sx += 2) coba(sx, sy);
  const { sx: kx, sy: ky } = terbaik;
  for (let sy = ky - 1; sy <= ky + 1; sy++) for (let sx = kx - 1; sx <= kx + 1; sx++) coba(sx, sy);
  return terbaik;
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

/* ------------------------------------------------------------
   Tanda gerak
   ------------------------------------------------------------
   bedaPersen() hanya tahu ADA perubahan, bukan perubahan APA. Itulah
   kelemahan yang membuat gerakan sekecil apa pun meloloskan perintah apa
   pun: wajah penuh tepi berkontras, jadi bergeser sedikit saja sudah
   mengubah persentase piksel yang besar.

   ciriFrame() memerikan bentuk gerakannya. Bobotnya memakai energi tepi
   (gradien), bukan kecerahan mentah, supaya titik beratnya mengikuti
   garis wajah — alis, hidung, mulut, tepi pipi — dan tidak tergeser oleh
   perubahan pencahayaan.
   ------------------------------------------------------------ */

function ciriFrame(abu) {
  const L = VERIF.LEBAR, T = VERIF.TINGGI;
  const e = new Float32Array(L * T);
  let total = 0;

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      const gx = x + 1 < L ? Math.abs(abu[i + 1] - abu[i]) : 0;
      const gy = y + 1 < T ? Math.abs(abu[i + L] - abu[i]) : 0;
      const g = gx + gy;
      e[i] = g;
      total += g;
    }
  }
  if (total < 500) return null;          // gambar terlalu rata, belum ada wajah

  let sx = 0, sy = 0;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < L; x++) { const g = e[y * L + x]; sx += x * g; sy += y * g; }
  }
  const cx = sx / total, cy = sy / total;

  let vx = 0, vy = 0;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < L; x++) {
      const g = e[y * L + x];
      vx += (x - cx) * (x - cx) * g;
      vy += (y - cy) * (y - cy) * g;
    }
  }
  const sebarX = Math.sqrt(vx / total), sebarY = Math.sqrt(vy / total);

  return { total, cx, cy, sebarX, sebarY };
}

/**
 * Persentase piksel berubah, dipisah paruh ATAS dan paruh BAWAH bingkai.
 *
 * Inilah pembeda antara membuka mulut dan menggerakkan kepala. Membuka
 * mulut hanya mengaduk paruh bawah — mata dan dahi tetap di tempatnya.
 * Menggerakkan kepala mengaduk keduanya kira-kira sama rata. Mengukur
 * energi pita mulut saja tidak cukup peka; selisih atas-bawah jauh lebih
 * tegas.
 */
function bedaPerParuh(a, b) {
  if (!a || !b || a.length !== b.length) return { atas: 0, bawah: 0 };
  let sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { sa += a[i]; sb += b[i]; }
  const ra = sa / a.length, rb = sb / b.length;

  const L = VERIF.LEBAR, T = VERIF.TINGGI;
  const batas = Math.floor(T / 2) * L;
  let nAtas = 0, nBawah = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs((a[i] - ra) - (b[i] - rb)) > VERIF.AMBANG_PIKSEL) {
      if (i < batas) nAtas++; else nBawah++;
    }
  }
  const separuh = a.length / 2;
  return {
    atas: Math.round((nAtas / separuh) * 1000) / 10,
    bawah: Math.round((nBawah / separuh) * 1000) / 10,
  };
}

/**
 * Bandingkan ciri sekarang dengan ciri saat wajah masih tenang.
 *
 * `geser` adalah perpindahan seluruh gambar yang terdeteksi — biasanya
 * karena HP-nya yang bergoyang. Perpindahan itu DIKURANGKAN dari
 * perpindahan titik berat, sehingga yang tersisa hanyalah gerakan wajah
 * relatif terhadap bingkainya sendiri.
 */
function bandingkanCiri(dasar, kini, geser) {
  const sx = Math.max(dasar.sebarX, 4);   // jaga-jaga pembagian oleh angka kecil
  const sy = Math.max(dasar.sebarY, 4);
  const gx = geser ? geser.sx : 0;
  const gy = geser ? geser.sy : 0;
  return {
    dx: (kini.cx - dasar.cx - gx) / sx,
    dy: (kini.cy - dasar.cy - gy) / sy,
    skala: (kini.sebarX + kini.sebarY) / (dasar.sebarX + dasar.sebarY),
    geserX: gx,
    geserY: gy,
    sisa: geser ? geser.sisa : 0,
  };
}

/**
 * Kemajuan gabungan dari beberapa syarat.
 *
 * Bilah kemajuan HARUS mencerminkan syarat yang paling tertinggal, bukan
 * yang paling maju. Sebelumnya ia hanya mengikuti besar gerakan, sehingga
 * bilahnya nyaris penuh padahal yang menahan adalah syarat arah — pengguna
 * melihat "hampir cukup" dan terus mencoba lebih keras ke arah yang keliru.
 */
function majuGabungan(...bagian) {
  return Math.min(...bagian.map(x => (isFinite(x) ? Math.max(0, x) : 1)));
}

/**
 * Uji satu langkah gerakan tegak — menunduk atau menengadah.
 *
 * Besar dan arahnya diambil dari GESERAN rupa wajah yang terdeteksi, bukan
 * dari perpindahan titik berat: titik berat terlalu mudah terkecoh latar
 * berpola dan wajah yang terpotong tepi bingkai.
 *
 * Yang membedakannya dari HP yang digoyang adalah `sisa`. Goyangan HP
 * memindahkan gambar tanpa mengubahnya, sehingga digeser balik ia kembali
 * cocok dan sisanya nol. Wajah yang berputar tidak akan pernah cocok lagi.
 *
 * @param arahWajib  0 = arah mana pun (langkah pertama);
 *                   +1/-1 = wajib ke arah itu (langkah kedua, berlawanan)
 */
function ujiLangkah(c, arahWajib = 0) {
  // Geseran sebesar jangkauan pencarian berarti gambarnya berpindah sangat
  // jauh — hampir pasti HP-nya yang diayun, bukan kepala yang bergerak.
  if (Math.max(Math.abs(c.geserX), Math.abs(c.geserY)) >= VERIF.JANGKAU) {
    return { lolos: false, maju: 0 };
  }

  // Arah tegak yang salah tidak boleh dihitung sama sekali — bukan sekadar
  // kurang. Kalau tidak, kembali dari menunduk ke netral akan terbaca
  // sebagai langkah kedua yang berhasil.
  const tegakBerarah = arahWajib === 0 ? Math.abs(c.geserY) : c.geserY * arahWajib;
  if (tegakBerarah <= 0) return { lolos: false, maju: 0 };

  const cukupJauh = tegakBerarah / VERIF.GESER_PIKSEL_MIN;
  const mendatar = Math.abs(c.geserX);
  const cukupTegak = mendatar > 0 ? tegakBerarah / (mendatar * VERIF.SUMBU_MIN) : 1;
  const cukupNyata = c.sisa / VERIF.SISA_MIN;

  return {
    lolos: cukupJauh >= 1 && cukupTegak >= 1 && cukupNyata >= 1,
    maju: majuGabungan(cukupJauh, cukupTegak, cukupNyata),
  };
}

/** Tulis teks status di bawah bingkai kamera. */
function statusVerif(judul, ket, kelas = '') {
  const j = document.getElementById('verifJudul');
  const k = document.getElementById('verifKet');
  if (j) { j.textContent = judul; j.className = 't ' + kelas; }
  if (k) k.textContent = ket;
}

/** Tampilkan perintah untuk langkah ke-n beserta penomorannya. */
function tampilAbaAba(n) {
  const aba = document.getElementById('aba');
  if (!aba) return;
  const t = URUTAN_VERIFIKASI[n];
  document.getElementById('abaIkon').innerHTML = icon(t.ikon, 21, 'currentColor', 2.6);
  document.getElementById('abaTeks').textContent = t.teks;
  const no = document.getElementById('abaNomor');
  if (no) no.textContent = `Langkah ${n + 1} dari ${URUTAN_VERIFIKASI.length}`;
  aba.hidden = false;
}

/** Perintah yang sedang berlaku. */
function langkahKini() {
  return URUTAN_VERIFIKASI[Math.min(S.verif.langkah, URUTAN_VERIFIKASI.length - 1)];
}

/** Isi bilah kemajuan, 0–1. Sengaja tanpa angka. */
function aturMaju(bagian) {
  const bar = document.getElementById('maju');
  const isi = document.getElementById('majuIsi');
  if (!bar || !isi) return;
  bar.hidden = false;
  isi.style.width = Math.min(100, Math.max(0, bagian * 100)).toFixed(0) + '%';
}

/**
 * Tulis angka pengukuran — hanya aktif di mode diagnostik.
 *
 * Yang ditampilkan bukan hanya nilai sesaat, tetapi juga PUNCAK yang pernah
 * dicapai beserta targetnya. Dengan begitu satu kali percobaan sudah cukup
 * untuk mengetahui seberapa jauh gerakan sungguhan dari ambangnya, tanpa
 * pengguna harus memotret layar tepat pada detik yang pas.
 */
function tulisDiagnostik(beda, c, uji) {
  if (!DIAGNOSTIK || !c) return;
  const el = document.getElementById('diag');
  if (!el) return;
  const v = S.verif;
  v.puncakDx = Math.max(v.puncakDx || 0, Math.abs(c.dx));
  v.puncakDy = Math.max(v.puncakDy || 0, Math.abs(c.dy));
  v.puncakSkala = Math.max(v.puncakSkala || 1, c.skala);
  v.puncakBawah = Math.max(v.puncakBawah || 0, c.bawah);
  v.puncakAtas = Math.max(v.puncakAtas || 0, c.atas);
  v.puncakSisa = Math.max(v.puncakSisa || 0, c.sisa);

  const n = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
  el.hidden = false;
  el.textContent =
    `langkah ${v.langkah + 1} · ${langkahKini().id} · `
    + `maju ${n(uji.maju)} ${uji.lolos ? 'LOLOS' : ''}\n`
    + `geser wajah  x ${c.geserX}   y ${c.geserY}/${VERIF.GESER_PIKSEL_MIN}\n`
    + `sisa ${n(c.sisa, 1)} pk ${n(v.puncakSisa, 1)}/${VERIF.SISA_MIN}   `
    + `arah1 ${v.arah1 || '-'}`;
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
      v.langkah === 0
        ? 'Ada dua langkah. Lakukan berurutan, jangan gerakkan HP-nya.'
        : 'Langkah pertama selesai. Tinggal satu lagi.');
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
      const ciri = ciriFrame(kini);
      if (!ciri) return;            // wajah belum terbaca, tunggu cuplikan lain
      v.dasar = kini;
      v.dasarCiri = ciri;
      v.dasarNorm = normalkan(kini);
      setFase('menunggu');
    }
    return;
  }

  const d = bedaPersen(v.dasar, kini);
  if (d > v.puncak) v.puncak = d;

  /* Dua pengukuran, dua peran.

     `sisaSeluruh` dihitung dari SELURUH bingkai: bila seluruh gambar hanya
     bergeser — HP yang digoyang — ia akan kembali cocok setelah digeser
     balik, dan sisanya nol. Wajah yang berputar tidak pernah cocok lagi.

     Arahnya diambil dari AREA WAJAH saja. Pada latar berpola, geseran
     seluruh bingkai terkunci ke latar yang diam sehingga arah gerak wajah
     hilang; mengukurnya di area wajah membuatnya tetap terbaca. */
  const kiniNorm = normalkan(kini);
  const geserWajah = cariGeseran(v.dasarNorm, kiniNorm, AREA_WAJAH);
  const geser = {
    sx: geserWajah.sx,
    sy: geserWajah.sy,
    sisa: cariGeseran(v.dasarNorm, kiniNorm, SELURUH).sisa,
  };
  const ciri = ciriFrame(kini);
  const c = (ciri && v.dasarCiri) ? bandingkanCiri(v.dasarCiri, ciri, geser) : null;
  if (c) Object.assign(c, bedaPerParuh(v.dasar, kini));
  // Langkah pertama menerima arah tegak mana pun; langkah kedua WAJIB
  // berlawanan dengannya. Tandanya tidak dipatok di kode karena sebagian
  // HP mencerminkan gambar kamera depan dan sebagian tidak — yang dijaga
  // adalah keberlawanannya, dan itu tidak bergantung pada pencerminan.
  const arahWajib = v.langkah === 0 ? 0 : -v.arah1;
  const uji = c ? ujiLangkah(c, arahWajib) : { lolos: false, maju: 0 };
  v.ciriTerakhir = c;
  tulisDiagnostik(d, c, uji);

  // Bila gambarnya bergeser jauh tetapi hampir tidak menyisakan perubahan,
  // berarti yang bergerak HP-nya, bukan wajahnya. Beri tahu pegawainya —
  // tanpa ini ia hanya melihat bilah yang tidak mau naik tanpa sebab.
  if (c && Math.hypot(c.geserX, c.geserY) >= VERIF.GOYANG_HP && c.sisa < VERIF.SISA_MIN) {
    statusVerif('Tahan HP Anda', 'Yang perlu bergerak wajahnya, bukan kameranya.', 'gagal');
  } else if (v.fase === 'menunggu') {
    setFase('menunggu');
  }

  // Semua syarat harus terpenuhi sekaligus — besar gerakan, arahnya, dan
  // perubahan yang tersisa setelah geseran gambar dibuang — dan harus
  // BERTAHAN beberapa cuplikan. Sentakan sesaat tidak dihitung.
  if (uji.lolos) {
    v.gerakBerturut++;
    aturMaju(Math.max(0.55, v.gerakBerturut / VERIF.BUTUH_GERAK));
    if (v.gerakBerturut >= VERIF.BUTUH_GERAK) selesaikanLangkah(c);
    return;
  }
  v.gerakBerturut = 0;
  // Bilahnya menunjukkan kemajuan yang SEBENARNYA. Versi sebelumnya
  // mengalikannya 0,5 dan memotongnya di 50%, sehingga gerakan yang sudah
  // hampir cukup pun terlihat seperti nyaris tidak terbaca.
  aturMaju(Math.min(0.95, uji.maju));

  // Wajah kembali tenang → pembanding disegarkan ke keadaan tenang yang
  // baru. Inilah yang menahan pergeseran pelan (pencahayaan berangsur
  // berubah, HP sedikit bergeser di tangan) agar tidak menumpuk sampai
  // melewati ambang tanpa pegawai melakukan apa pun.
  //
  // Setelah langkah pertama lolos pembandingnya DIBEKUKAN: kalau tidak,
  // menahan posisi menunduk akan membuat posisi itu menjadi netral yang
  // baru, dan langkah kedua kehilangan titik acuannya.
  if (!v.beku && v.diamBerturut >= VERIF.BUTUH_SEGAR) {
    const segar = ciriFrame(kini);
    if (segar) {
      v.dasar = kini;
      v.dasarCiri = segar;
      v.dasarNorm = normalkan(kini);
      v.puncak = 0;
      aturMaju(0);
    }
  }
}

/** Satu langkah tuntas: lanjut ke langkah berikutnya, atau selesai. */
function selesaikanLangkah(c) {
  const v = S.verif;
  v.hasilLangkah.push({
    id: langkahKini().id,
    teks: langkahKini().teks,
    geserY: c.geserY,
    geserX: c.geserX,
    sisa: Math.round(c.sisa * 10) / 10,
  });

  if (v.langkah === 0) {
    v.arah1 = Math.sign(c.geserY);
    v.beku = true;               // netral awal dikunci sebagai acuan langkah 2
    v.langkah = 1;
    v.gerakBerturut = 0;
    v.puncakDy = 0;
    tampilAbaAba(1);
    aturMaju(0);
    setFase('menunggu');
    toast('Langkah 1 selesai.');
    return;
  }

  v.lolosCiri = c;
  setFase('lolos');
}

function hentikanPantau() {
  if (S.verif.timer) { clearInterval(S.verif.timer); S.verif.timer = null; }
}

/** Siapkan layar Selfie: tampilkan langkah pertama, lalu mulai memantau. */
function siapkanVerifikasi() {
  hentikanPantau();
  // Dipanggil tepat setelah nyalakanKamera(). Fungsi itu menunggu izin
  // kamera, jadi penandaan gagalnya baru tiba setelah baris-baris ini —
  // aman untuk memulai dari keadaan bersih.
  S.verif = kosongkanVerif();
  S.verif.mulai = Date.now();

  tampilAbaAba(0);
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

  const verif = {
    teks: URUTAN_VERIFIKASI.map(t => t.teks).join(' → '),
    gerak: v.puncak,
    saatFoto,
    // Rekaman tiap langkah — inilah yang bisa diperiksa admin bila sebuah
    // presensi terasa mencurigakan.
    langkah: v.hasilLangkah,
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
  memuat: layarMemuat,
  login: layarLogin,
  daftar: layarDaftar,
  sandiBaru: layarSandiBaru,
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

/* Layar Daftar punya tiga kolom isian, bukan dua — justru yang paling
   mudah meluber. Keempat layar berkerangka .login diukur dengan aturan
   yang sama. */
const LAYAR_AKUN = ['memuat', 'login', 'daftar', 'sandiBaru'];
const layarAkun = () => LAYAR_AKUN.includes(S.layar);

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
  if (layarAkun()) paskanLogin();
}

// Tinggi layar berubah saat HP diputar atau bilah peramban muncul/hilang;
// ukur ulang supaya tingkat perapatannya ikut menyesuaikan.
window.addEventListener('resize', () => {
  if (!layarAkun()) return;
  // Kecuali saat papan ketik terbuka: tinggi layar menyusut drastis dan
  // ukuran tulisan akan melompat-lompat di tengah pengetikan. Peramban
  // sudah menggeser sendiri kolom yang sedang diisi ke area terlihat,
  // jadi pengukuran ditunda sampai fokusnya lepas.
  const f = document.activeElement;
  if (f && f.tagName === 'INPUT' && f.closest('.login')) return;
  paskanLogin();
});
window.addEventListener('orientationchange', () => {
  if (layarAkun()) setTimeout(paskanLogin, 250);
});

// Caprasimo dan Figtree dimuat dari internet. Sebelum keduanya siap,
// teks memakai huruf cadangan yang tingginya berbeda — ukur ulang setelah
// huruf aslinya terpasang.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { if (layarAkun()) paskanLogin(); });
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

  /**
   * Perlihatkan / sembunyikan kata sandi.
   *
   * Sengaja TIDAK memanggil render(): merender ulang membangun formnya
   * dari awal dan menghapus kata sandi yang sudah diketik. Dulu tidak
   * terasa karena kolomnya berisi nilai contoh — sekarang kolomnya
   * kosong, dan pegawai akan kehilangan ketikannya tepat saat ingin
   * memeriksanya. Jadi kolomnya diubah di tempat.
   */
  lihatSandi: () => {
    S.lihatSandi = !S.lihatSandi;
    const jenis = S.lihatSandi ? 'text' : 'password';
    $layar.querySelectorAll('.login input[type="password"], .login input[type="text"][name="sandi"], .login input[type="text"][name="ulang"]')
      .forEach(i => { if (i.name === 'sandi' || i.name === 'ulang') i.type = jenis; });
    $layar.querySelectorAll('.login .toggle').forEach(b => {
      b.innerHTML = icon(S.lihatSandi ? 'eye-off' : 'eye', 18, 'var(--mut)', 2.2);
      b.setAttribute('aria-label', `${S.lihatSandi ? 'Sembunyikan' : 'Tampilkan'} kata sandi`);
    });
  },
  keDaftar: () => { S.emailIsian = emailDiketik(); pindah('daftar'); },
  keLogin: () => { S.emailIsian = emailDiketik(); pindah('login'); },

  /**
   * Kirim tautan setel ulang sandi.
   *
   * Emailnya diambil dari kolom yang sedang diisi, bukan dari layar
   * terpisah — orang yang menekan tombol ini biasanya sudah mengetik
   * emailnya lalu gagal menebak sandinya.
   */
  lupaSandi: async () => {
    const email = emailDiketik();
    if (!email) {
      tulisGalat('errLogin', 'Isi email Anda dulu, lalu tekan "Lupa kata sandi?".');
      document.getElementById('inpEmail')?.focus();
      return;
    }
    S.emailIsian = email;
    const r = await AKUN.lupaSandi(email);
    toast(r.pesan, r.ok ? 'ok' : 'err');
  },
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

  logout: async () => {
    matikanKamera();
    await AKUN.keluar();
    // Profil disegarkan supaya nama dan NIK orang sebelumnya tidak
    // tertinggal di layar berikutnya.
    S.emailIsian = '';
    segarkanProfil();
    pindah('login');
    toast('Anda sudah keluar.');
  },
};

/** Email yang sedang diketik di layar masuk atau daftar. */
function emailDiketik() {
  const el = document.getElementById('inpEmail') || document.getElementById('dafEmail');
  return (el?.value || S.emailIsian || '').trim();
}

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

/* ============================================================
   Form akun — masuk, daftar, kata sandi baru
   ------------------------------------------------------------
   Ketiganya memanggil server, jadi ada jeda. Tombolnya dikunci selama
   menunggu supaya tidak tertekan dua kali — tekanan kedua saat mendaftar
   akan dijawab "email sudah pernah dipakai", padahal yang memakainya
   adalah tekanan pertama orang itu sendiri.
   ============================================================ */

/** Panjang kata sandi terpendek yang diterima. */
const SANDI_MIN = 8;

function tulisGalat(idKotak, pesan) {
  const el = document.getElementById(idKotak);
  if (el) el.innerHTML = pesan ? `<div class="form-error">${esc(pesan)}</div>` : '';
}

/** Jalankan aksi server sambil mengunci tombol kirimnya. */
async function kirimForm(form, idGalat, jalankan) {
  const tombol = form.querySelector('button[type="submit"]');
  const labelAsli = tombol ? tombol.textContent : '';
  if (tombol) { tombol.disabled = true; tombol.textContent = 'Mohon tunggu…'; }
  tulisGalat(idGalat, '');
  try {
    return await jalankan();
  } catch (e) {
    tulisGalat(idGalat, pesanGalat(e));
    return { ok: false };
  } finally {
    if (tombol && document.body.contains(tombol)) {
      tombol.disabled = false;
      tombol.textContent = labelAsli;
    }
  }
}

function pasangFormAkun() {
  const login = document.getElementById('formLogin');
  if (login) {
    login.addEventListener('submit', async e => {
      e.preventDefault();
      const email = login.email.value.trim();
      const sandi = login.sandi.value;
      S.emailIsian = email;
      if (!email || !sandi) {
        return tulisGalat('errLogin', 'Email dan kata sandi wajib diisi.');
      }
      const r = await kirimForm(login, 'errLogin', () => AKUN.masuk(email, sandi));
      if (!r.ok) return tulisGalat('errLogin', r.pesan);

      S.emailIsian = '';
      segarkanProfil();
      pindah('home');
      toast(r.pesan);
    });
  }

  const daftar = document.getElementById('formDaftar');
  if (daftar) {
    daftar.addEventListener('submit', async e => {
      e.preventDefault();
      const email = daftar.email.value.trim();
      const sandi = daftar.sandi.value;
      const ulang = daftar.ulang.value;
      S.emailIsian = email;

      if (!email || !sandi) return tulisGalat('errDaftar', 'Email dan kata sandi wajib diisi.');
      if (sandi.length < SANDI_MIN) {
        return tulisGalat('errDaftar', `Kata sandi minimal ${SANDI_MIN} karakter.`);
      }
      if (sandi !== ulang) return tulisGalat('errDaftar', 'Kedua kata sandi tidak sama.');

      const r = await kirimForm(daftar, 'errDaftar', () => AKUN.daftar(email, sandi));
      if (!r.ok) return tulisGalat('errDaftar', r.pesan);

      if (r.perluKonfirmasi) {
        tulisGalat('errDaftar', '');
        pindah('login');
        toast(r.pesan);
        return;
      }
      S.emailIsian = '';
      segarkanProfil();
      pindah('home');
      toast(r.pesan);
    });
  }

  const baru = document.getElementById('formSandiBaru');
  if (baru) {
    baru.addEventListener('submit', async e => {
      e.preventDefault();
      const sandi = baru.sandi.value;
      const ulang = baru.ulang.value;

      if (sandi.length < SANDI_MIN) {
        return tulisGalat('errSandiBaru', `Kata sandi minimal ${SANDI_MIN} karakter.`);
      }
      if (sandi !== ulang) return tulisGalat('errSandiBaru', 'Kedua kata sandi tidak sama.');

      const r = await kirimForm(baru, 'errSandiBaru', () => AKUN.gantiSandi(sandi));
      if (!r.ok) return tulisGalat('errSandiBaru', r.pesan);

      // Alamat dibersihkan dari sisa tanda pemulihan supaya menyegarkan
      // halaman tidak membuka layar ini lagi.
      history.replaceState(null, '', location.pathname);
      segarkanProfil();
      pindah(AKUN.masuk_() ? 'home' : 'login');
      toast(r.pesan);
    });
  }
}

/** Form login & form pengajuan dipasang ulang tiap kali layarnya dirender. */
function pasangFormHandler() {
  pasangFormAkun();

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

/**
 * Periksa sesi ke server, lalu tentukan layar sebenarnya.
 *
 * Sampai jawaban server datang, layar "memuat" yang tampil. Yang
 * menentukan pegawai boleh masuk atau tidak adalah jawaban itu — bukan
 * penanda di perangkat, yang bisa saja tertinggal setelah akunnya
 * dinonaktifkan admin.
 */
(async () => {
  try {
    await AKUN.muat();
  } catch (e) {
    // Server tidak terjangkau. Jangan biarkan layar "memuat" menggantung
    // selamanya — turunkan ke layar masuk dengan keterangan apa adanya.
    segarkanProfil();
    pindah('login');
    toast(pesanGalat(e), 'err');
    return;
  }

  segarkanProfil();

  // Tautan setel ulang sandi dari email sudah membuka layarnya sendiri
  // lewat peristiwa PASSWORD_RECOVERY; jangan ditimpa ke beranda.
  if (AKUN.modePulihkanSandi) return;

  pindah(AKUN.masuk_() ? 'home' : 'login');
})();
