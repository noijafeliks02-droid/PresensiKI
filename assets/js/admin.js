/* ============================================================
   Kompas — Panel Admin
   Enam view yang dipilih lewat sidebar. Sidebar & topbar dirender ulang
   hanya saat view berganti; isi konten dirender ulang setiap kali filter
   atau data berubah, sehingga fokus kotak pencarian tidak hilang.
   ============================================================ */

DB.muat();

/** Hasil penerapan tautan ?setup=, ditampilkan setelah render pertama. */
const HASIL_SETUP = DB.terapkanSetupDariUrl();

const V = {
  view: 'dashboard',
  cari: '',
  filterStatus: 'semua',
  filterUnit: 'semua',
  halaman: 1,
  laporan: { tahun: new Date().getFullYear(), bulan: new Date().getMonth(), unit: 'semua' },
  buktiTanggal: kunciTanggal(new Date()),
  buktiFoto: 'semua',      // semua | ada | tidak
};

const PER_HALAMAN = 15;
const PER_GALERI = 24;

const $gerbang = document.getElementById('gerbang');
const $app = document.getElementById('app');
const $sidebar = document.getElementById('sidebar');
const $topbar = document.getElementById('topbar');
const $konten = document.getElementById('konten');
const $toast = document.getElementById('toast');

const ADMIN = { nama: 'Admin Kepegawaian', unit: 'Biro SDM', inisial: 'HR' };

/* ============================================================
   Utilitas
   ============================================================ */

let toastTimer;
function toast(pesan, jenis = 'ok') {
  clearTimeout(toastTimer);
  $toast.innerHTML = `<div class="toast-admin ${jenis}">
    ${icon(jenis === 'err' ? 'alert' : 'check', 18, 'currentColor', 2.6)}
    <span>${esc(pesan)}</span></div>`;
  toastTimer = setTimeout(() => { $toast.innerHTML = ''; }, 2800);
}

function chip(status) {
  return `<span class="chip ${warnaStatus(status).chip}">${esc(status)}</span>`;
}

/**
 * Deretan statistik bergaris — pola utama arah visual "Kop Surat":
 * sel dipisah garis vertikal dan dibingkai garis atas-bawah, angka besar
 * memakai Caprasimo. Tanpa kartu bertumpuk, tanpa bayangan.
 */
function stripStatistik(kartu, kelasExtra = '') {
  return `
  <div class="stat-grid ${kelasExtra}">
    ${kartu.map(c => `
      <div class="stat">
        <div class="k">${esc(c.k)}</div>
        <div class="v"${c.warna ? ` style="color:${c.warna}"` : ''}>${c.v}</div>
        ${c.n ? `<div class="n">${esc(c.n)}</div>` : ''}
      </div>`).join('')}
  </div>`;
}

const HALAMAN = {
  dashboard: { judul: 'Dashboard Kehadiran', sub: 'Ringkasan presensi pegawai hari ini', ikon: 'grid' },
  kehadiran: { judul: 'Kehadiran', sub: 'Daftar presensi seluruh pegawai hari ini', ikon: 'check-clipboard' },
  bukti: { judul: 'Bukti Absen', sub: 'Foto verifikasi wajah datang & pulang beserta hasil tantangan geraknya', ikon: 'camera' },
  pegawai: { judul: 'Pegawai', sub: 'Data induk pegawai dan unit kerja', ikon: 'users' },
  cuti: { judul: 'Izin & Cuti', sub: 'Persetujuan pengajuan izin, cuti, dan sakit', ikon: 'calendar' },
  lokasi: { judul: 'Lokasi Kantor', sub: 'Titik koordinat dan radius geofencing', ikon: 'pin' },
  laporan: { judul: 'Laporan', sub: 'Unduh rekap kehadiran untuk keperluan kepegawaian', ikon: 'chart' },
};

/* ============================================================
   Sidebar & topbar
   ============================================================ */

function renderSidebar() {
  const menunggu = DB.pengajuanMenunggu().length;
  const gelap = temaGelap();
  $sidebar.innerHTML = `
    <div class="brand">
      <img class="mark" src="assets/logo-pu.svg" alt="">
      <div>
        <div class="nama">Kompas</div>
        <div class="sub">Panel Admin</div>
      </div>
    </div>
    <hr class="garis-emas">

    <div class="menu-label">Menu</div>
    ${Object.entries(HALAMAN).map(([id, h]) => `
      <button class="menu-item ${V.view === id ? 'aktif' : ''}" data-view="${id}"
              aria-current="${V.view === id ? 'page' : 'false'}">
        ${icon(h.ikon, 19, 'currentColor', 2.75)}
        <span class="teks">${h.judul === 'Dashboard Kehadiran' ? 'Dashboard' : h.judul}</span>
        ${id === 'cuti' && menunggu ? `<span class="badge-gold">${menunggu}</span>` : ''}
      </button>`).join('')}

    <div class="sidebar-bawah">
      <div class="sidebar-tema">
        <span>Mode gelap</span>
        <button class="switch switch-sm" data-aksi="toggleGelap" role="switch"
                aria-checked="${gelap}" aria-label="Mode gelap">
          <span class="knob"></span>
        </button>
      </div>
      <div class="sidebar-foot">
        <div class="av">${ADMIN.inisial}</div>
        <div style="flex:1;min-width:0">
          <div class="nm">${ADMIN.nama}</div>
          <div class="rl">${ADMIN.unit}</div>
        </div>
      </div>
      <button class="tombol-keluar" data-aksi="keluar">
        ${icon('logout', 17, 'currentColor', 2.4)}<span>Keluar</span>
      </button>
    </div>`;
}

function renderTopbar() {
  const h = HALAMAN[V.view];
  const pakaiCari = ['kehadiran', 'bukti', 'pegawai', 'cuti'].includes(V.view);
  $topbar.innerHTML = `
    <div style="flex:1;min-width:0">
      <div class="eyebrow">Balai Wilayah Sungai Maluku</div>
      <div class="judul">${h.judul}</div>
      <div class="sub">${h.sub}</div>
    </div>
    ${pakaiCari ? `
      <label class="cari">
        ${icon('search', 17, 'var(--mut)', 2.4)}
        <input id="inpCari" type="search" placeholder="Cari pegawai atau NIP…" value="${esc(V.cari)}"
               aria-label="Cari pegawai atau NIP">
      </label>` : ''}
    <button class="tb-btn" data-aksi="notif" aria-label="Notifikasi">
      ${icon('bell', 19, 'var(--ink)', 2.4)}<span class="dot"></span>
    </button>`;

  const inp = document.getElementById('inpCari');
  if (inp) {
    inp.addEventListener('input', () => {
      V.cari = inp.value;
      V.halaman = 1;
      renderKonten();          // topbar sengaja tidak ikut dirender agar fokus tetap
    });
  }
}

/* ============================================================
   View: Dashboard
   ============================================================ */

function viewDashboard() {
  const r = DB.ringkasan();
  const menunggu = DB.pengajuanMenunggu();
  const maks = Math.max(...DB.tren.map(d => d.tepat + d.telat));

  const kartu = [
    { k: 'Total pegawai', v: fmtAngka(r.total), n: `${r.unit} unit kerja` },
    { k: 'Hadir hari ini', v: fmtAngka(r.hadir), n: `${fmtPersen(r.hadir, r.total)} kehadiran`, warna: 'var(--sageInk)' },
    { k: 'Terlambat', v: r.terlambat, n: `${fmtPersen(r.terlambat, r.total)} dari total`, warna: 'var(--goldInk)' },
    { k: 'Izin / cuti', v: r.izin, n: 'disetujui hari ini' },
    { k: 'Belum absen', v: r.belum, n: 'perlu ditindak', warna: 'var(--danger)' },
  ];

  const hariIni = DB.kehadiranHariIni.filter(p => p.jamMasuk !== '—').slice(0, 6);

  return `
  ${stripStatistik(kartu)}

  <div class="dua-kolom">
    <div class="kolom">

      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="t">Tren kehadiran mingguan</div>
            <div class="s">${fmtTanggalPendek(DB.tren[0].tanggal)} – ${fmtTanggalPendek(DB.tren[6].tanggal)}</div>
          </div>
          <div class="legend">
            <div><i style="background:var(--sage)"></i><span>Tepat waktu</span></div>
            <div><i style="background:var(--gold)"></i><span>Terlambat</span></div>
          </div>
        </div>
        <div class="chart">
          ${DB.tren.map(d => {
    const tTepat = Math.round(d.tepat / maks * 170);
    const tTelat = Math.round(d.telat / maks * 170);
    return `<div class="kol" title="${d.label}: ${d.tepat} tepat waktu, ${d.telat} terlambat">
              <div class="batang">
                <div class="telat" style="height:${tTelat}px"></div>
                <div class="tepat" style="height:${tTepat}px"></div>
              </div>
              <span class="lbl">${d.label}</span>
            </div>`;
  }).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="t">Kehadiran hari ini</div>
          <button class="btn" data-view="kehadiran">Lihat semua</button>
        </div>
        <div class="tabel-bungkus">
          <table class="tabel tabel-sempit">
            <thead><tr><th>Pegawai</th><th>Unit kerja</th><th>Masuk</th><th>Lokasi</th><th>Status</th></tr></thead>
            <tbody>
              ${hariIni.map(p => `
                <tr>
                  <td><div class="sel-pegawai"><div class="av-tabel">${esc(p.inisial)}</div><span class="nama-tabel">${esc(p.nama)}</span></div></td>
                  <td>${esc(p.unit)}</td>
                  <td class="tegas">${jamTampil(p.jamMasuk)}</td>
                  <td>${esc(p.lokasi)}</td>
                  <td>${chip(p.status)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="kolom">
      ${panelSebaran(r)}
      ${panelMenunggu(menunggu)}
    </div>
  </div>`;
}

/**
 * Sebaran posisi check-in di sekitar kantor.
 * Dibangkitkan deterministik lalu diubah dari (jarak, arah) menjadi
 * koordinat sungguhan, sehingga titiknya jatuh di tempat yang masuk akal
 * pada peta asli — bukan sekadar hiasan.
 */
function titikSebaran() {
  const k = DB.kantor;
  const rng = bikinRng(31337);
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos(k.lat * Math.PI / 180);

  return Array.from({ length: 18 }, () => {
    const dalam = rng() > 0.18;
    const arah = rng() * Math.PI * 2;
    const jarak = dalam ? rng() * k.radius * 0.9 : k.radius * (1.15 + rng() * 0.85);
    return {
      lat: k.lat + (Math.sin(arah) * jarak) / mPerLat,
      lng: k.lng + (Math.cos(arah) * jarak) / mPerLng,
      warna: dalam ? 'var(--user-dot)' : 'var(--red)',
      // Posisi persen, dipakai versi ilustratif saat peta tidak tersedia.
      x: 50 + Math.cos(arah) * (dalam ? 26 : 40),
      y: 50 + Math.sin(arah) * (dalam ? 26 : 40),
    };
  });
}

function panelSebaran(r) {
  const titik = titikSebaran();

  return `
  <div class="panel">
    <div class="t" style="font-size:15.5px;font-weight:800">Sebaran Check-in</div>
    <div class="s" style="font-size:12px;color:var(--text-idle);font-weight:600;margin-top:1px">
      Real-time · radius kantor ${DB.kantor.radius} m
    </div>
    ${petaTersedia()
      ? '<div class="peta-kotak" style="height:230px;margin-top:14px"><div class="peta-nyata" id="petaSebaran"></div></div>' +
      `<div class="atribusi" style="margin-top:8px;text-align:right">${ATRIBUSI_HTML}</div>`
      : `<div class="sebaran">
           <div class="blok" style="top:30px;left:24px;width:80px;height:60px;background:#DDE5DC"></div>
           <div class="blok" style="bottom:34px;right:22px;width:90px;height:70px;background:#E7E3D7"></div>
           <div class="ring"></div>
           ${titik.map(t => `<div class="titik" style="top:${t.y.toFixed(1)}%;left:${t.x.toFixed(1)}%;background:${t.warna}"></div>`).join('')}
           <div class="kantor"></div>
         </div>`}
    <div style="display:flex;margin-top:20px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
      <div style="flex:1;padding:18px 0">
        <div class="eyebrow">Dalam radius</div>
        <div class="angka-peta" style="margin-top:8px">${r.dalamRadius}</div>
      </div>
      <div style="width:1px;background:var(--line)"></div>
      <div style="flex:1;padding:18px 0 18px 24px">
        <div class="eyebrow">Di luar radius</div>
        <div class="angka-peta" style="margin-top:8px;color:var(--danger)">${r.luarRadius}</div>
      </div>
    </div>
  </div>`;
}

function panelMenunggu(menunggu) {
  return `
  <div class="panel">
    <div class="panel-head">
      <div class="t">Pengajuan Menunggu</div>
      ${menunggu.length ? `<button class="btn" data-view="cuti">Semua</button>` : ''}
    </div>
    ${menunggu.length ? menunggu.slice(0, 4).map(p => `
      <div class="approve-card">
        <div style="display:flex;align-items:center;gap:11px">
          <div class="av-tabel">${esc(p.inisial)}</div>
          <div style="flex:1;min-width:0">
            <div class="nama-tabel">${esc(p.nama)}</div>
            <div class="sub-tabel">${esc(p.jenis)} · ${p.hari} hari</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);font-weight:600;margin:10px 0 12px">
          ${periodeTeks(p)}
        </div>
        <div class="aksi-baris">
          <button class="btn-setuju" data-aksi="setujui" data-id="${p.id}">Setujui</button>
          <button class="btn-tolak" data-aksi="tolak" data-id="${p.id}">Tolak</button>
        </div>
      </div>`).join('')
      : '<div class="kosong-panel">Tidak ada pengajuan menunggu</div>'}
  </div>`;
}

/* ============================================================
   View: Kehadiran
   ============================================================ */

function daftarKehadiranTersaring() {
  const q = V.cari.trim().toLowerCase();
  return DB.kehadiranHariIni.filter(p => {
    if (V.filterStatus !== 'semua' && p.status !== V.filterStatus) return false;
    if (V.filterUnit !== 'semua' && p.unit !== V.filterUnit) return false;
    if (q && !(p.nama.toLowerCase().includes(q) || p.nip.includes(q))) return false;
    return true;
  });
}

function viewKehadiran() {
  const semua = daftarKehadiranTersaring();
  const totalHalaman = Math.max(1, Math.ceil(semua.length / PER_HALAMAN));
  V.halaman = Math.min(V.halaman, totalHalaman);   // jaga-jaga setelah data menyusut
  const mulai = (V.halaman - 1) * PER_HALAMAN;
  const halamanIni = semua.slice(mulai, mulai + PER_HALAMAN);

  return `
  <div class="filter-bar">
    <select class="select-box" data-filter="status" aria-label="Saring berdasarkan status">
      ${['semua', 'Tepat waktu', 'Terlambat', 'Izin/Cuti', 'Belum absen'].map(s =>
    `<option value="${s}" ${V.filterStatus === s ? 'selected' : ''}>${s === 'semua' ? 'Semua status' : s}</option>`).join('')}
    </select>
    <select class="select-box" data-filter="unit" aria-label="Saring berdasarkan unit kerja">
      <option value="semua" ${V.filterUnit === 'semua' ? 'selected' : ''}>Semua unit kerja</option>
      ${DB.unitKerja().map(u => `<option value="${esc(u)}" ${V.filterUnit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
    </select>
    <div style="flex:1"></div>
    <button class="btn" data-aksi="exportKehadiranCSV">${icon('download', 16, 'currentColor')} Excel</button>
    <button class="btn btn-navy" data-aksi="exportKehadiranPDF">${icon('printer', 16, 'currentColor')} PDF</button>
  </div>

  <div class="panel">
    <div class="panel-head">
      <div>
        <div class="t">Presensi ${fmtTanggalPanjang(new Date())}</div>
        <div class="s">${fmtAngka(semua.length)} pegawai ditampilkan dari ${fmtAngka(DB.kehadiranHariIni.length)}</div>
      </div>
    </div>
    <div class="tabel-bungkus">
      <table class="tabel">
        <thead><tr><th>Pegawai</th><th>NIP</th><th>Unit Kerja</th><th>Jam Masuk</th><th>Lokasi</th><th>Radius</th><th>Status</th></tr></thead>
        <tbody>
          ${halamanIni.length ? halamanIni.map(p => `
            <tr>
              <td><div class="sel-pegawai"><div class="av-tabel">${esc(p.inisial)}</div>
                <div><div class="nama-tabel">${esc(p.nama)}</div><div class="sub-tabel">${esc(p.jabatan)}</div></div></div></td>
              <td>${esc(p.nip)}</td>
              <td>${esc(p.unit)}</td>
              <td class="tegas">${jamTampil(p.jamMasuk)}</td>
              <td>${esc(p.lokasi)}</td>
              <td>${p.jamMasuk === '—' ? '—' : (p.dalamRadius
      ? '<span class="chip chip-green">Dalam</span>'
      : '<span class="chip chip-red">Luar</span>')}</td>
              <td>${chip(p.status)}</td>
            </tr>`).join('')
      : '<tr><td colspan="7"><div class="kosong-panel">Tidak ada pegawai yang cocok dengan filter</div></td></tr>'}
        </tbody>
      </table>
    </div>
    ${paginasi(totalHalaman)}
  </div>`;
}

function paginasi(totalHalaman) {
  if (totalHalaman <= 1) return '';
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px">
    <button class="btn" data-aksi="halamanMundur" ${V.halaman === 1 ? 'disabled style="opacity:.45;cursor:default"' : ''}>
      ${icon('chevron-left', 15, 'currentColor')} Sebelumnya
    </button>
    <span style="font-size:13px;font-weight:700;color:var(--text-muted)">Halaman ${V.halaman} dari ${totalHalaman}</span>
    <button class="btn" data-aksi="halamanMaju" ${V.halaman >= totalHalaman ? 'disabled style="opacity:.45;cursor:default"' : ''}>
      Berikutnya ${icon('chevron', 15, 'currentColor')}
    </button>
  </div>`;
}

/* ============================================================
   View: Bukti Absen
   ============================================================ */

function daftarBuktiTersaring() {
  const q = V.cari.trim().toLowerCase();
  return DB.bukti(V.buktiTanggal).filter(b => {
    if (V.filterStatus !== 'semua' && b.status !== V.filterStatus) return false;
    if (V.filterUnit !== 'semua' && b.unit !== V.filterUnit) return false;
    if (V.buktiFoto === 'ada' && !b.foto) return false;
    if (V.buktiFoto === 'tidak' && b.foto) return false;
    if (q && !(b.nama.toLowerCase().includes(q) || b.nip.includes(q))) return false;
    return true;
  });
}

function viewBukti() {
  const semua = DB.bukti(V.buktiTanggal);
  const saring = daftarBuktiTersaring();
  const totalHalaman = Math.max(1, Math.ceil(saring.length / PER_GALERI));
  V.halaman = Math.min(V.halaman, totalHalaman);
  const mulai = (V.halaman - 1) * PER_GALERI;
  const halamanIni = saring.slice(mulai, mulai + PER_GALERI);

  const berfoto = semua.filter(b => b.foto).length;
  const tanpaFoto = semua.length - berfoto;
  const diLuar = semua.filter(b => b.dalamRadius === false).length;
  const hariIni = kunciTanggal(new Date());
  const tanggalList = DB.tanggalBukti();

  const kartu = [
    { k: 'Bukti terkumpul', v: fmtAngka(berfoto), n: `${fmtPersen(berfoto, semua.length || 1)} dari daftar`, warna: 'var(--sageInk)' },
    { k: 'Tanpa bukti', v: fmtAngka(tanpaFoto), n: 'belum absen atau izin' },
    { k: 'Di luar radius', v: fmtAngka(diLuar), n: 'perlu diperiksa', warna: diLuar ? 'var(--danger)' : undefined },
  ];

  return `
  ${stripStatistik(kartu, 'stat-grid-3')}

  <div class="filter-bar" style="margin-top:26px">
    <select class="select-box" data-filter="buktiTanggal" aria-label="Pilih tanggal">
      ${tanggalList.map(t => `
        <option value="${t}" ${t === V.buktiTanggal ? 'selected' : ''}>
          ${t === hariIni ? 'Hari ini · ' : ''}${fmtTanggalPendek(new Date(t + 'T00:00:00'))}
        </option>`).join('')}
    </select>
    <select class="select-box" data-filter="buktiFoto" aria-label="Saring ketersediaan foto">
      <option value="semua" ${V.buktiFoto === 'semua' ? 'selected' : ''}>Semua</option>
      <option value="ada" ${V.buktiFoto === 'ada' ? 'selected' : ''}>Ada bukti foto</option>
      <option value="tidak" ${V.buktiFoto === 'tidak' ? 'selected' : ''}>Tanpa bukti foto</option>
    </select>
    <select class="select-box" data-filter="status" aria-label="Saring berdasarkan status">
      ${['semua', 'Tepat waktu', 'Terlambat', 'Izin/Cuti', 'Belum absen'].map(s =>
    `<option value="${s}" ${V.filterStatus === s ? 'selected' : ''}>${s === 'semua' ? 'Semua status' : s}</option>`).join('')}
    </select>
    <select class="select-box" data-filter="unit" aria-label="Saring berdasarkan unit kerja">
      <option value="semua" ${V.filterUnit === 'semua' ? 'selected' : ''}>Semua unit kerja</option>
      ${DB.unitKerja().map(u => `<option value="${esc(u)}" ${V.filterUnit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
    </select>
    <div style="flex:1"></div>
    <button class="btn" data-aksi="exportBuktiCSV">${icon('download', 16, 'currentColor')} Excel</button>
  </div>

  <div class="panel">
    <div class="panel-head">
      <div>
        <div class="t">Bukti Presensi ${esc(fmtTanggalPanjang(new Date(V.buktiTanggal + 'T00:00:00')))}</div>
        <div class="s">${fmtAngka(saring.length)} bukti ditampilkan · klik kartu untuk melihat detail dan foto ukuran penuh</div>
      </div>
    </div>

    ${halamanIni.length ? `
      <div class="galeri">
        ${halamanIni.map(b => kartuBukti(b)).join('')}
      </div>
      ${paginasi(totalHalaman)}`
      : `<div class="kosong-panel">
           ${V.buktiTanggal === hariIni
        ? 'Tidak ada bukti yang cocok dengan filter.'
        : 'Belum ada bukti tersimpan untuk tanggal ini. Prototipe hanya mengarsipkan presensi dari akun pegawai yang dipakai demo — pada versi berbackend, seluruh pegawai punya arsip.'}
         </div>`}
  </div>`;
}

/** Label hasil tantangan gerak pada verifikasi wajah. */
function labelVerifikasi(v) {
  if (!v) return { teks: 'Tidak ada rekaman', chip: 'chip-grey' };
  if (v.hasil === 'lolos') return { teks: 'Gerak terverifikasi', chip: 'chip-green' };
  if (v.hasil === 'lemah') return { teks: 'Perlu diperiksa', chip: 'chip-red' };
  return { teks: 'Tanpa kamera', chip: 'chip-grey' };
}

/**
 * Ringkasan tanda gerak yang meloloskan verifikasi.
 * Ditampilkan apa adanya supaya admin bisa menilai sendiri: menoleh
 * menghasilkan pergeseran mendatar besar, membuka mulut menaikkan angka
 * pita tanpa kepala berpindah, dan seterusnya.
 */
function tandaGerak(v) {
  if (!v || !Array.isArray(v.langkah) || !v.langkah.length) return '—';
  return v.langkah.map((l, i) =>
    `<div class="mono" style="font-size:12px">${i + 1}. ${esc(l.teks)} —
      geser ↕ ${l.geserY}, sisa ${l.sisa}%</div>`).join('');
}

/** Ada tahap yang lolos tanpa gerakan meyakinkan? */
function perluDiperiksa(b) {
  return (b.verifikasi && b.verifikasi.hasil === 'lemah')
    || (b.verifikasiKeluar && b.verifikasiKeluar.hasil === 'lemah');
}

function kartuBukti(b) {
  const w = warnaStatus(b.status);
  return `
  <button class="bukti-kartu" data-aksi="lihatBukti" data-id="${b.pegawaiId}"
          aria-label="Lihat bukti absen ${esc(b.nama)}">
    <div class="bukti-foto">
      ${b.foto
      ? `<img src="${b.foto}" alt="Bukti foto check-in ${esc(b.nama)}">
           <span class="bukti-tanda ${b.fotoAsli ? 'asli' : 'contoh'}">${b.fotoAsli ? 'ASLI' : 'CONTOH'}</span>`
      : `<div class="kosong">
             ${icon('camera', 24, 'var(--text-idle)', 1.8)}
             <span>${b.status === 'Izin/Cuti' ? 'Izin / cuti'
        : b.jamMasuk === '—' ? 'Belum absen' : 'Absen tanpa foto'}</span>
           </div>`}
      ${b.jamMasuk !== '—' ? `<span class="bukti-jam">${jamTampil(b.jamMasuk)}</span>` : ''}
      ${b.dalamRadius === false ? '<span class="bukti-luar">LUAR</span>' : ''}
      ${perluDiperiksa(b) ? '<span class="bukti-curiga">PERIKSA</span>' : ''}
      ${b.fotoKeluar ? '<span class="bukti-pulang">+ PULANG</span>' : ''}
    </div>
    <div class="bukti-info">
      <div class="nm">${esc(b.nama)}</div>
      <div class="un">${esc(b.unit)}</div>
      <span class="chip ${w.chip}">${esc(b.status)}</span>
    </div>
  </button>`;
}

/** Dialog detail satu bukti absen: foto besar + seluruh metadatanya. */
function dialogBukti(pegawaiId) {
  const b = DB.bukti(V.buktiTanggal).find(x => x.pegawaiId === pegawaiId);
  if (!b) { toast('Bukti tidak ditemukan.', 'err'); return; }

  const w = warnaStatus(b.status);
  const koor = (la, ln) => (la != null && ln != null)
    ? `${la.toFixed(6)}, ${ln.toFixed(6)}` : '—';

  /** Baris-baris metadata untuk satu tahap (datang atau pulang). */
  const barisTahap = (jam, lat, lng, jarak, akurasi, dalam, verif) => {
    const lv = labelVerifikasi(verif);
    return [
      ['Jam', `<span class="mono">${jamTampil(jam)}</span>`],
      ['Koordinat', `<span class="mono">${esc(koor(lat, lng))}</span>`],
      ['Jarak ke Kantor', jarak != null ? `<span class="mono">${jarak} m</span>` : '—'],
      ['Akurasi GPS', akurasi != null ? `<span class="mono">± ${Math.round(akurasi)} m</span>` : '—'],
      ['Posisi', dalam == null ? '—'
        : (dalam
          ? '<span class="chip chip-green">Dalam radius</span>'
          : '<span class="chip chip-red">Di luar radius</span>')],
      ['Urutan Gerak', verif && verif.teks ? esc(verif.teks) : '—'],
      ['Hasil Verifikasi', `<span class="chip ${lv.chip}">${lv.teks}</span>`],
      ['Saat Difoto', verif && verif.saatFoto != null
        ? `<span class="mono">${verif.saatFoto}%</span>` : '—'],
      // Rekaman tiap langkah — arah geraknya harus berlawanan.
      ['Rekaman Langkah', tandaGerak(verif)],
    ];
  };

  const barisUmum = [
    ['NIP', esc(b.nip)],
    ['Unit Kerja', esc(b.unit)],
    ['Jabatan', esc(b.jabatan)],
    ['Tanggal', esc(fmtTanggalPanjang(new Date(b.tanggal + 'T00:00:00')))],
    ['Status', `<span class="chip ${w.chip}">${esc(b.status)}</span>`],
  ];
  const barisDatang = barisTahap(b.jamMasuk, b.lat, b.lng, b.jarak, b.akurasi, b.dalamRadius, b.verifikasi);
  const barisPulang = b.jamKeluar !== '—'
    ? barisTahap(b.jamKeluar, b.latKeluar, b.lngKeluar, b.jarakKeluar,
      b.akurasiKeluar, b.dalamRadiusKeluar, b.verifikasiKeluar)
    : null;

  // Foto pulang ditampilkan berdampingan dengan foto datang. Sejak
  // verifikasi memakai pemantauan langsung, tidak ada lagi frame netral
  // yang disimpan — cukup satu foto per tahap.
  const fotoTahap = (src, label) => `
    <figure>
      <div class="bingkai">${src
      ? `<img src="${src}" alt="${esc(label)}">`
      : '<span class="kosong">Tidak ada foto</span>'}</div>
      <figcaption>${esc(label)}</figcaption>
    </figure>`;

  const daftarBaris = (arr) => arr.map(([k, v]) =>
    `<div class="meta-baris"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');

  bukaModal(`
    <div class="modal-head">
      <div style="flex:1">
        <div class="t">${esc(b.nama)}</div>
        <div class="s">Bukti presensi · ${esc(fmtTanggalPendek(new Date(b.tanggal + 'T00:00:00')))}</div>
      </div>
      <button type="button" class="modal-tutup" data-aksi="tutupModal" aria-label="Tutup">
        ${icon('close', 18, 'var(--text-2)', 2.4)}
      </button>
    </div>
    <div class="modal-isi">
      <div class="bukti-detail">
        <div>
          <div class="gambar">
            ${b.foto
      ? `<img src="${b.foto}" alt="Bukti foto check-in ${esc(b.nama)}">`
      : `<div style="text-align:center;color:var(--text-idle);font-size:12.5px;font-weight:700;padding:20px">
                   ${icon('camera', 30, 'var(--text-idle)', 1.6)}<div style="margin-top:10px">Tidak ada bukti foto</div></div>`}
          </div>
          ${b.foto ? `
            <div style="margin-top:12px;background:${b.fotoAsli ? 'var(--green-bg)' : 'var(--field)'};border-radius:12px;padding:11px 13px;font-size:11.5px;font-weight:700;color:${b.fotoAsli ? 'var(--green-dark)' : 'var(--text-muted)'};line-height:1.5">
              ${b.fotoAsli
        ? 'Foto asli hasil verifikasi wajah dari aplikasi pegawai.'
        : 'Gambar contoh untuk prototipe — bukan foto pegawai sungguhan.'}
            </div>` : ''}

          ${b.fotoKeluar ? `
            <div class="tajuk-tahap" style="margin-top:22px">Foto kedua tahap</div>
            <div class="pasangan">
              ${fotoTahap(b.foto, 'Datang')}
              ${fotoTahap(b.fotoKeluar, 'Pulang')}
            </div>` : ''}
        </div>
        <div>
          <div class="tajuk-tahap">Data pegawai</div>
          ${daftarBaris(barisUmum)}
          <div class="tajuk-tahap">Presensi datang</div>
          ${daftarBaris(barisDatang)}
          <div class="tajuk-tahap">Presensi pulang</div>
          ${barisPulang
      ? daftarBaris(barisPulang)
      : '<div class="meta-baris"><span class="k">Status</span><span class="v">Belum absen pulang</span></div>'}
        </div>
      </div>
    </div>
    <div class="modal-kaki">
      <button type="button" class="btn" data-aksi="tutupModal">Tutup</button>
      ${b.foto && b.fotoAsli
      ? `<a class="btn btn-navy" href="${b.foto}" download="bukti-${esc(b.nip)}-${esc(b.tanggal)}.jpg">
             ${icon('download', 16, 'currentColor')} Unduh Foto</a>`
      : ''}
    </div>`, 'modal-lebar');
}

/* ============================================================
   View: Pegawai
   ============================================================ */

function viewPegawai() {
  const q = V.cari.trim().toLowerCase();
  const unitList = DB.unitKerja();
  const semua = DB.pegawai.filter(p => {
    if (V.filterUnit !== 'semua' && p.unit !== V.filterUnit) return false;
    if (q && !(p.nama.toLowerCase().includes(q) || p.nip.includes(q))) return false;
    return true;
  });
  const totalHalaman = Math.max(1, Math.ceil(semua.length / PER_HALAMAN));
  V.halaman = Math.min(V.halaman, totalHalaman);   // jaga-jaga setelah data menyusut
  const mulai = (V.halaman - 1) * PER_HALAMAN;
  const halamanIni = semua.slice(mulai, mulai + PER_HALAMAN);

  // Jumlah pegawai per unit, untuk kartu ringkasan di atas tabel.
  const perUnit = unitList.map(u => ({ u, n: DB.pegawai.filter(p => p.unit === u).length }));
  const idBaru = new Set(DB.simpanan.pegawaiBaru.map(p => p.id));

  return `
  <div class="filter-bar">
    <select class="select-box" data-filter="unit" aria-label="Saring berdasarkan unit kerja">
      <option value="semua" ${V.filterUnit === 'semua' ? 'selected' : ''}>Semua unit kerja</option>
      ${unitList.map(u => `<option value="${esc(u)}" ${V.filterUnit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
    </select>
    <div style="flex:1"></div>
    <button class="btn" data-aksi="kelolaUnit">${icon('building-2', 16, 'currentColor')} Unit Kerja</button>
    <button class="btn" data-aksi="exportPegawaiCSV">${icon('download', 16, 'currentColor')} Excel</button>
    <button class="btn btn-emas" data-aksi="tambahPegawai">${icon('user-plus', 16, 'currentColor')} Tambah Pegawai</button>
  </div>

  <div class="panel" style="margin-bottom:20px">
    <div class="panel-head"><div class="t">Sebaran Pegawai per Unit Kerja</div></div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px">
      ${perUnit.map(x => `
        <div style="flex:1 1 180px;background:var(--field);border-radius:14px;padding:13px 15px">
          <div style="font-size:22px;font-weight:800;color:var(--navy)">${x.n}</div>
          <div style="font-size:12px;color:var(--text-muted);font-weight:700;margin-top:3px">${esc(x.u)}</div>
        </div>`).join('')}
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <div>
        <div class="t">Data Induk Pegawai</div>
        <div class="s">${fmtAngka(semua.length)} pegawai ditampilkan dari ${fmtAngka(DB.pegawai.length)}</div>
      </div>
    </div>
    <div class="tabel-bungkus">
      <table class="tabel">
        <thead><tr>
          <th>Pegawai</th><th>NIP</th><th>Unit Kerja</th><th>Jabatan</th>
          <th style="text-align:right">Aksi</th>
        </tr></thead>
        <tbody>
          ${halamanIni.length ? halamanIni.map(p => `
            <tr>
              <td>
                <div class="sel-pegawai">
                  <div class="av-tabel">${esc(p.inisial)}</div>
                  <div>
                    <div class="nama-tabel">${esc(p.nama)}</div>
                    ${p.id === 1 ? '<div class="sub-tabel">Pemilik akun aplikasi pegawai</div>'
        : idBaru.has(p.id) ? '<div class="sub-tabel">Ditambahkan admin</div>' : ''}
                  </div>
                </div>
              </td>
              <td>${esc(p.nip)}</td>
              <td>${esc(p.unit)}</td>
              <td>${esc(p.jabatan)}</td>
              <td>
                <div class="aksi-sel">
                  <button class="btn-ikon" data-aksi="editPegawai" data-id="${p.id}"
                          title="Edit ${esc(p.nama)}" aria-label="Edit ${esc(p.nama)}">
                    ${icon('edit', 16, 'var(--text-2)')}
                  </button>
                  <button class="btn-ikon bahaya" data-aksi="hapusPegawai" data-id="${p.id}"
                          title="Hapus ${esc(p.nama)}" aria-label="Hapus ${esc(p.nama)}">
                    ${icon('hapus', 16, 'var(--red)')}
                  </button>
                </div>
              </td>
            </tr>`).join('')
      : '<tr><td colspan="5"><div class="kosong-panel">Tidak ada pegawai yang cocok</div></td></tr>'}
        </tbody>
      </table>
    </div>
    ${paginasi(totalHalaman)}
  </div>`;
}

/* ============================================================
   Dialog kelola pegawai & unit kerja
   ============================================================ */

const $modal = document.getElementById('modal');

function bukaModal(html, kelas = '') {
  $modal.innerHTML = `<div class="modal-latar"><div class="modal ${kelas}" role="dialog" aria-modal="true">${html}</div></div>`;
  const fokus = $modal.querySelector('input, select, button');
  if (fokus) fokus.focus();
}

function tutupModal() { $modal.innerHTML = ''; }

/** Form tambah / edit pegawai. `id` null berarti pegawai baru. */
function dialogPegawai(id) {
  const p = id == null ? null : DB.pegawaiById(id);
  if (id != null && !p) { toast('Data pegawai tidak ditemukan.', 'err'); return; }

  const unitList = DB.unitKerja();
  const unitTerpilih = p ? p.unit : unitList[0];

  bukaModal(`
    <form id="formPegawai">
      <div class="modal-head">
        <div style="flex:1">
          <div class="t">${p ? 'Edit Data Pegawai' : 'Tambah Pegawai'}</div>
          <div class="s">${p ? esc(p.nama) : 'Lengkapi data pegawai baru'}</div>
        </div>
        <button type="button" class="modal-tutup" data-aksi="tutupModal" aria-label="Tutup">
          ${icon('close', 18, 'var(--text-2)', 2.4)}
        </button>
      </div>

      <div class="modal-isi">
        <div class="form-grid">
          <div class="form-row kolom-penuh">
            <label for="pgNama">Nama Lengkap</label>
            <input id="pgNama" name="nama" type="text" value="${p ? esc(p.nama) : ''}"
                   placeholder="Contoh: Siti Nurhayati" required maxlength="60">
          </div>
          <div class="form-row kolom-penuh">
            <label for="pgNip">NIP</label>
            <input id="pgNip" name="nip" type="text" inputmode="numeric" value="${p ? esc(p.nip) : ''}"
                   placeholder="18 digit" required pattern="[0-9]{8,20}">
            <div class="bantu">Hanya angka, 8–20 digit, dan tidak boleh sama dengan pegawai lain</div>
          </div>
          <div class="form-row">
            <label for="pgUnit">Unit Kerja</label>
            <select id="pgUnit" name="unit" class="select-box" style="width:100%" required>
              ${unitList.map(u => `<option value="${esc(u)}" ${u === unitTerpilih ? 'selected' : ''}>${esc(u)}</option>`).join('')}
              <option value="__baru__">+ Unit kerja baru…</option>
            </select>
          </div>
          <div class="form-row">
            <label for="pgJabatan">Jabatan</label>
            <input id="pgJabatan" name="jabatan" type="text" value="${p ? esc(p.jabatan) : ''}"
                   placeholder="Contoh: Analis Kepegawaian" required maxlength="60">
          </div>
          <div class="form-row kolom-penuh" id="barisUnitBaru" hidden>
            <label for="pgUnitBaru">Nama Unit Kerja Baru</label>
            <input id="pgUnitBaru" name="unitBaru" type="text" placeholder="Contoh: Pusat Data dan Teknologi Informasi" maxlength="60">
          </div>
        </div>
        <div id="errPegawai"></div>
      </div>

      <div class="modal-kaki">
        <button type="button" class="btn" data-aksi="tutupModal">Batal</button>
        <button type="submit" class="btn btn-emas">${icon('check', 16, 'currentColor', 2.4)} Simpan</button>
      </div>
    </form>`);

  const f = document.getElementById('formPegawai');
  const baris = document.getElementById('barisUnitBaru');

  // Pilihan "+ Unit kerja baru…" memunculkan kolom isian tambahan.
  f.unit.addEventListener('change', () => {
    const baru = f.unit.value === '__baru__';
    baris.hidden = !baru;
    if (baru) f.unitBaru.focus();
  });

  f.addEventListener('submit', e => {
    e.preventDefault();
    const err = document.getElementById('errPegawai');
    const gagal = pesan => { err.innerHTML = `<div class="modal-bahaya" style="margin-top:16px">${esc(pesan)}</div>`; };

    const nama = f.nama.value.trim();
    const nip = f.nip.value.trim();
    const jabatan = f.jabatan.value.trim();
    let unit = f.unit.value;

    if (nama.length < 3) return gagal('Nama lengkap minimal 3 karakter.');
    if (!/^[0-9]{8,20}$/.test(nip)) return gagal('NIP harus berupa 8–20 digit angka.');
    if (DB.nipDipakai(nip, id ?? undefined)) return gagal(`NIP ${nip} sudah dipakai pegawai lain.`);
    if (!jabatan) return gagal('Jabatan wajib diisi.');

    if (unit === '__baru__') {
      const namaUnit = f.unitBaru.value.trim();
      if (namaUnit.length < 3) return gagal('Nama unit kerja baru minimal 3 karakter.');
      DB.tambahUnit(namaUnit);
      unit = namaUnit;
    }

    DB.simpanPegawai({ id: id ?? null, nama, nip, unit, jabatan });
    tutupModal();
    render();
    toast(id == null ? `Pegawai ${nama} ditambahkan.` : `Data ${nama} diperbarui.`);
  });
}

function dialogHapusPegawai(id) {
  const p = DB.pegawaiById(id);
  if (!p) return;

  if (p.id === 1) {
    toast('Pemilik akun aplikasi pegawai tidak dapat dihapus.', 'err');
    return;
  }

  bukaModal(`
    <div class="modal-head">
      <div style="flex:1">
        <div class="t">Hapus Pegawai</div>
        <div class="s">Tindakan ini menghilangkan pegawai dari seluruh daftar</div>
      </div>
      <button type="button" class="modal-tutup" data-aksi="tutupModal" aria-label="Tutup">
        ${icon('close', 18, 'var(--text-2)', 2.4)}
      </button>
    </div>
    <div class="modal-isi">
      <div class="modal-bahaya">
        <strong>${esc(p.nama)}</strong> (NIP ${esc(p.nip)}, ${esc(p.unit)}) akan dihapus dari
        data induk, rekap kehadiran, dan laporan.
        Riwayat pengajuan izin/cuti yang pernah dibuat tetap tersimpan.
      </div>
    </div>
    <div class="modal-kaki">
      <button type="button" class="btn" data-aksi="tutupModal">Batal</button>
      <button type="button" class="btn-hapus" data-aksi="konfirmasiHapus" data-id="${p.id}">
        ${icon('hapus', 16, 'currentColor')} Ya, hapus
      </button>
    </div>`);
}

/** Daftar unit kerja: lihat jumlah pegawai, tambah, ganti nama, dan hapus. */
function dialogUnit() {
  const daftar = DB.daftarUnit();

  bukaModal(`
    <form id="formUnit">
      <div class="modal-head">
        <div style="flex:1">
          <div class="t">Unit Kerja</div>
          <div class="s">${daftar.length} unit · unit seorang pegawai diubah lewat tombol edit di tabel Pegawai</div>
        </div>
        <button type="button" class="modal-tutup" data-aksi="tutupModal" aria-label="Tutup">
          ${icon('close', 18, 'var(--text-2)', 2.4)}
        </button>
      </div>
      <div class="modal-isi">
        <div class="tabel-bungkus">
          <table class="tabel" style="min-width:0">
            <thead><tr>
              <th>Unit Kerja</th>
              <th style="text-align:right">Pegawai</th>
              <th style="text-align:right">Aksi</th>
            </tr></thead>
            <tbody>
              ${daftar.map(u => `
                <tr>
                  <td class="tegas">${esc(u.nama)}
                    ${!u.bawaan ? '<span class="chip chip-baru" style="margin-left:8px">baru</span>' : ''}
                    ${u.diganti ? `<div class="sub-tabel">Semula: ${esc(u.asal)}</div>` : ''}
                  </td>
                  <td style="text-align:right" class="tegas">${u.jumlah}</td>
                  <td>
                    <div class="aksi-sel">
                      <button type="button" class="btn-ikon" data-aksi="editUnit" data-asal="${esc(u.asal)}"
                              title="Ganti nama ${esc(u.nama)}" aria-label="Ganti nama ${esc(u.nama)}">
                        ${icon('edit', 15, 'var(--text-2)')}
                      </button>
                      <button type="button" class="btn-ikon bahaya" data-aksi="hapusUnit" data-asal="${esc(u.asal)}"
                              title="Hapus ${esc(u.nama)}" aria-label="Hapus ${esc(u.nama)}"
                              ${daftar.length < 2 ? 'disabled style="opacity:.4;cursor:default"' : ''}>
                        ${icon('hapus', 15, 'var(--red)')}
                      </button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="form-row" style="margin-top:20px">
          <label for="unitBaru">Tambah Unit Kerja</label>
          <input id="unitBaru" name="unitBaru" type="text" placeholder="Nama unit kerja baru" maxlength="60">
        </div>
        <div id="errUnit"></div>
      </div>
      <div class="modal-kaki">
        <button type="button" class="btn" data-aksi="tutupModal">Tutup</button>
        <button type="submit" class="btn btn-emas">${icon('plus', 16, 'currentColor', 2.4)} Tambah</button>
      </div>
    </form>`);

  document.getElementById('formUnit').addEventListener('submit', e => {
    e.preventDefault();
    const nama = document.getElementById('unitBaru').value.trim();
    const err = document.getElementById('errUnit');
    const gagal = pesan => { err.innerHTML = `<div class="modal-bahaya" style="margin-top:14px">${esc(pesan)}</div>`; };

    if (nama.length < 3) return gagal('Nama unit kerja minimal 3 karakter.');
    if (!DB.tambahUnit(nama)) return gagal('Unit kerja dengan nama itu sudah ada.');

    dialogUnit();
    render();
    toast(`Unit kerja "${nama}" ditambahkan.`);
  });
}

/** Ganti nama sebuah unit kerja. */
function dialogEditUnit(asal) {
  const u = DB.daftarUnit().find(x => x.asal === asal);
  if (!u) return;

  bukaModal(`
    <form id="formEditUnit">
      <div class="modal-head">
        <div style="flex:1">
          <div class="t">Ganti Nama Unit Kerja</div>
          <div class="s">${u.jumlah} pegawai ikut diperbarui</div>
        </div>
        <button type="button" class="modal-tutup" data-aksi="tutupModal" aria-label="Tutup">
          ${icon('close', 18, 'var(--text-2)', 2.4)}
        </button>
      </div>
      <div class="modal-isi">
        <div class="form-row">
          <label for="unitNama">Nama Unit Kerja</label>
          <input id="unitNama" name="unitNama" type="text" value="${esc(u.nama)}" maxlength="60" required>
          <div class="bantu">
            Nama baru langsung dipakai di seluruh tabel, laporan, dan aplikasi pegawai.
            ${u.bawaan ? `Nama bawaannya (<strong>${esc(u.asal)}</strong>) tetap disimpan sebagai acuan.` : ''}
          </div>
        </div>
        <div id="errEditUnit"></div>
      </div>
      <div class="modal-kaki">
        <button type="button" class="btn" data-aksi="kelolaUnit">Kembali</button>
        <button type="submit" class="btn btn-emas">${icon('check', 16, 'currentColor', 2.4)} Simpan</button>
      </div>
    </form>`);

  document.getElementById('formEditUnit').addEventListener('submit', e => {
    e.preventDefault();
    const nama = document.getElementById('unitNama').value.trim();
    const err = document.getElementById('errEditUnit');
    const gagal = pesan => { err.innerHTML = `<div class="modal-bahaya" style="margin-top:16px">${esc(pesan)}</div>`; };

    if (nama.length < 3) return gagal('Nama unit kerja minimal 3 karakter.');
    if (DB.namaUnitDipakai(nama, asal)) return gagal('Sudah ada unit kerja dengan nama itu.');

    if (nama === u.nama) { dialogUnit(); return; }

    DB.gantiNamaUnit(asal, nama);
    if (V.filterUnit === u.nama) V.filterUnit = nama;   // filter tabel ikut menyesuaikan
    dialogUnit();
    render();
    toast(`Unit kerja "${u.nama}" diganti menjadi "${nama}".`);
  });
}

/** Hapus unit kerja, dengan memindahkan pegawainya ke unit lain. */
function dialogHapusUnit(asal) {
  const daftar = DB.daftarUnit();
  const u = daftar.find(x => x.asal === asal);
  if (!u) return;

  if (daftar.length < 2) {
    toast('Unit kerja terakhir tidak dapat dihapus.', 'err');
    return;
  }
  const tujuan = daftar.filter(x => x.asal !== asal);

  bukaModal(`
    <form id="formHapusUnit">
      <div class="modal-head">
        <div style="flex:1">
          <div class="t">Hapus Unit Kerja</div>
          <div class="s">${esc(u.nama)}</div>
        </div>
        <button type="button" class="modal-tutup" data-aksi="tutupModal" aria-label="Tutup">
          ${icon('close', 18, 'var(--text-2)', 2.4)}
        </button>
      </div>
      <div class="modal-isi">
        ${u.jumlah
      ? `<div class="modal-bahaya">
             Unit ini masih memiliki <strong>${u.jumlah} pegawai</strong>. Pilih unit tujuan
             di bawah — seluruh pegawai tersebut akan dipindahkan sebelum unit ini dihapus.
           </div>
           <div class="form-row" style="margin-top:18px">
             <label for="unitTujuan">Pindahkan pegawai ke</label>
             <select id="unitTujuan" name="unitTujuan" class="select-box" style="width:100%" required>
               ${tujuan.map(x => `<option value="${esc(x.nama)}">${esc(x.nama)} (${x.jumlah} pegawai)</option>`).join('')}
             </select>
           </div>`
      : `<div class="modal-bahaya">
             Unit ini tidak memiliki pegawai, jadi bisa langsung dihapus.
             ${u.bawaan ? 'Unit bawaan dapat dimunculkan kembali dengan menambahkannya lagi memakai nama yang sama.' : ''}
           </div>`}
      </div>
      <div class="modal-kaki">
        <button type="button" class="btn" data-aksi="kelolaUnit">Batal</button>
        <button type="submit" class="btn-hapus">${icon('hapus', 16, 'currentColor')} Ya, hapus</button>
      </div>
    </form>`);

  document.getElementById('formHapusUnit').addEventListener('submit', e => {
    e.preventDefault();
    const sel = document.getElementById('unitTujuan');
    const ke = sel ? sel.value : null;

    DB.hapusUnit(asal, ke);
    if (V.filterUnit === u.nama) V.filterUnit = 'semua';
    dialogUnit();
    render();
    toast(u.jumlah
      ? `Unit "${u.nama}" dihapus, ${u.jumlah} pegawai dipindahkan ke "${ke}".`
      : `Unit "${u.nama}" dihapus.`, 'err');
  });
}

/* ============================================================
   View: Izin & Cuti
   ============================================================ */

/**
 * Unit kerja pada sebuah pengajuan.
 * Pengajuan menyimpan nama unit saat diajukan; kalau pegawainya masih ada,
 * pakai unitnya yang sekarang supaya penggantian nama unit tidak
 * meninggalkan nama lama berserakan di tabel dan laporan.
 */
function unitPengajuan(p) {
  return DB.pegawaiById(p.pegawaiId)?.unit ?? p.unit;
}

function viewCuti() {
  const q = V.cari.trim().toLowerCase();
  const semua = DB.pengajuan.filter(p => !q || p.nama.toLowerCase().includes(q));
  const n = s => DB.pengajuan.filter(p => p.status === s).length;

  const kartu = [
    { k: 'Menunggu persetujuan', v: n('Menunggu'), warna: 'var(--goldInk)' },
    { k: 'Disetujui', v: n('Disetujui'), warna: 'var(--sageInk)' },
    { k: 'Ditolak', v: n('Ditolak'), warna: 'var(--danger)' },
  ];

  return `
  ${stripStatistik(kartu, 'stat-grid-3')}

  <div class="filter-bar" style="margin-top:26px">
    <div style="flex:1"></div>
    <button class="btn" data-aksi="exportCutiCSV">${icon('download', 16, 'currentColor')} Excel</button>
    <button class="btn btn-navy" data-aksi="exportCutiPDF">${icon('printer', 16, 'currentColor')} PDF</button>
  </div>

  <div class="panel">
    <div class="panel-head"><div class="t">Daftar Pengajuan</div></div>
    <div class="tabel-bungkus">
      <table class="tabel">
        <thead><tr><th>Pegawai</th><th>Jenis</th><th>Periode</th><th>Alasan</th><th style="text-align:right">Aksi / Status</th></tr></thead>
        <tbody>
          ${semua.length ? semua.map(p => `
            <tr>
              <td><div class="sel-pegawai"><div class="av-tabel">${esc(p.inisial)}</div>
                <div><div class="nama-tabel">${esc(p.nama)}</div><div class="sub-tabel">${esc(unitPengajuan(p))}</div></div></div></td>
              <td><div class="nama-tabel" style="font-size:13px">${esc(p.jenis)}</div><div class="sub-tabel">${p.hari} hari</div></td>
              <td>${periodeTeks(p)}</td>
              <td style="max-width:240px">${esc(p.alasan)}${p.lampiran ? `<div class="sub-tabel">📎 ${esc(p.lampiran)}</div>` : ''}</td>
              <td style="text-align:right">
                ${p.status === 'Menunggu' ? `
                  <div class="aksi-baris" style="justify-content:flex-end">
                    <button class="btn-setuju" data-aksi="setujui" data-id="${p.id}">Setujui</button>
                    <button class="btn-tolak" data-aksi="tolak" data-id="${p.id}">Tolak</button>
                  </div>` : chip(p.status)}
              </td>
            </tr>`).join('')
      : '<tr><td colspan="5"><div class="kosong-panel">Belum ada pengajuan</div></td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* ============================================================
   View: Lokasi Kantor
   ============================================================ */

function viewLokasi() {
  const k = DB.kantor;
  return `
  <div class="dua-kolom" style="grid-template-columns:1.4fr 1fr;margin-top:0">
    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="t">Titik Kantor &amp; Radius</div>
          <div class="s">Pegawai hanya bisa check-in di dalam radius ini</div>
        </div>
      </div>
      <form id="formKantor" style="margin-top:18px">
        <div class="form-grid">
          <div class="form-row kolom-penuh">
            <label for="inpNama">Nama Lokasi</label>
            <input id="inpNama" name="nama" type="text" value="${esc(k.nama)}" required>
          </div>
          <div class="form-row kolom-penuh">
            <label for="inpAlamat">Alamat</label>
            <input id="inpAlamat" name="alamat" type="text" value="${esc(k.alamat)}" required>
          </div>
          <div class="form-row">
            <label for="inpLat">Latitude</label>
            <input id="inpLat" name="lat" type="number" step="0.000001" min="-90" max="90" value="${k.lat}" required>
            <div class="bantu">Contoh: -6.235530</div>
          </div>
          <div class="form-row">
            <label for="inpLng">Longitude</label>
            <input id="inpLng" name="lng" type="number" step="0.000001" min="-180" max="180" value="${k.lng}" required>
            <div class="bantu">Contoh: 106.797520</div>
          </div>
          <div class="form-row kolom-penuh" style="display:flex;flex-direction:column;justify-content:flex-end">
            <button type="button" class="btn" data-aksi="lokasiSaya" style="justify-content:center">
              ${icon('target', 16, 'currentColor', 2.4)} Pakai lokasi saya sekarang
            </button>
            <div class="bantu">Berguna saat menyiapkan aplikasi langsung di lokasi kantor</div>
          </div>
        </div>

        <div class="baris-radius">
          <div style="flex:none">
            <label for="inpRadius" style="display:block;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut)">
              Radius geofencing
            </label>
            <div class="nilai" id="bacaRadiusSlider" style="margin-top:8px">${k.radius} m</div>
          </div>
          <input id="inpRadius" name="radius" type="range" min="50" max="400" step="10"
                 value="${Math.min(400, Math.max(50, k.radius))}" style="flex:1"
                 aria-label="Radius geofencing dalam meter">
        </div>

        <div class="baris-radius" style="border-top:none;margin-top:0">
          <span style="font-size:13.5px;font-weight:600;color:var(--mut)">Jam kerja</span>
          <span style="font-size:15px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums">
            ${jamTampil(SHIFT.masuk)} – ${jamTampil(SHIFT.pulang)}
          </span>
        </div>
        <div style="display:flex;gap:10px;margin-top:22px">
          <button type="submit" class="btn btn-emas">${icon('check', 16, 'currentColor', 2.4)} Simpan Perubahan</button>
          <button type="button" class="btn" data-aksi="kantorDefault">Kembalikan ke bawaan</button>
          <div style="flex:1"></div>
          <button type="button" class="btn" data-aksi="tautanPengaturan">
            ${icon('upload', 16, 'currentColor')} Kirim ke perangkat lain
          </button>
        </div>
      </form>
    </div>

    <div class="panel">
      <div class="t" style="font-size:15.5px;font-weight:800">Peta Titik Kantor</div>
      <div class="s" style="font-size:12px;color:var(--text-idle);font-weight:600;margin-top:1px">
        ${petaTersedia()
      ? 'Klik peta atau tarik pin emas untuk memindahkan titik kantor'
      : 'Peta tidak dapat dimuat — periksa koneksi internet'}
      </div>
      ${petaTersedia()
      ? '<div class="peta-kotak" style="height:300px;margin-top:14px"><div class="peta-nyata" id="petaKantor"></div></div>'
      : `<div class="sebaran" style="height:300px">
             <div class="blok" style="top:30px;left:24px;width:80px;height:60px;background:#DDE5DC"></div>
             <div class="blok" style="bottom:34px;right:22px;width:90px;height:70px;background:#E7E3D7"></div>
             <div class="ring"></div><div class="kantor"></div>
           </div>`}
      ${petaTersedia() ? `<div class="atribusi" style="margin-top:8px;text-align:right">${ATRIBUSI_HTML}</div>` : ''}
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-muted);font-weight:700">Koordinat</span>
          <span style="font-weight:800;color:var(--text)" id="bacaKoordinat">${k.lat.toFixed(5)}, ${k.lng.toFixed(5)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-muted);font-weight:700">Radius</span>
          <span style="font-weight:800;color:var(--text)" id="bacaRadius">${k.radius} m</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-muted);font-weight:700">Jam masuk</span>
          <span style="font-weight:800;color:var(--text)">${SHIFT.masuk} · terlambat &gt; ${SHIFT.batasTerlambat}</span>
        </div>
      </div>
      <div style="margin-top:16px;background:var(--blue-bg);border-radius:12px;padding:13px 15px;font-size:12.5px;color:var(--blue);font-weight:600;line-height:1.5">
        Perubahan langsung dipakai aplikasi pegawai di perangkat yang sama.
        Pada versi berbackend, nilai ini disimpan di server dan disebarkan ke semua pegawai.
      </div>
    </div>
  </div>`;
}

/* ============================================================
   View: Laporan
   ============================================================ */

/**
 * Rekap sebulan per pegawai. Dibangkitkan deterministik dari id pegawai +
 * bulan, jadi laporan yang sama selalu menghasilkan angka yang sama.
 */
function rekapBulanan(tahun, bulan) {
  const jmlHari = new Date(tahun, bulan + 1, 0).getDate();
  let hariKerjaBulan = 0;
  for (let t = 1; t <= jmlHari; t++) {
    const h = new Date(tahun, bulan, t).getDay();
    if (h !== 0 && h !== 6) hariKerjaBulan++;
  }
  return DB.pegawai.map(p => {
    const r = bikinRng(p.id * 1000 + tahun * 12 + bulan);
    const izin = r() < 0.35 ? 1 + Math.floor(r() * 2) : 0;
    const terlambat = Math.floor(r() * 4);
    const hadir = hariKerjaBulan - izin - terlambat;
    return {
      ...p,
      hariKerja: hariKerjaBulan,
      hadir, terlambat, izin,
      persen: Math.round((hadir + terlambat) / hariKerjaBulan * 100),
    };
  });
}

function viewLaporan() {
  const { tahun, bulan } = V.laporan;
  const bulanPilihan = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    bulanPilihan.push({ tahun: d.getFullYear(), bulan: d.getMonth() });
  }

  const rekap = rekapBulanan(tahun, bulan);
  const rataKehadiran = Math.round(rekap.reduce((n, p) => n + p.persen, 0) / (rekap.length || 1));
  const totalTerlambat = rekap.reduce((n, p) => n + p.terlambat, 0);
  const hariKerjaBulan = rekap[0]?.hariKerja ?? 0;
  const cutiDisetujui = DB.pengajuan.filter(p => p.status === 'Disetujui').length;

  const kartuStat = [
    { k: 'Rata-rata kehadiran', v: `${rataKehadiran}%`, warna: 'var(--sageInk)' },
    { k: 'Total keterlambatan', v: fmtAngka(totalTerlambat), warna: 'var(--goldInk)' },
    { k: 'Hari kerja', v: hariKerjaBulan },
    { k: 'Izin & cuti disetujui', v: cutiDisetujui },
  ];

  const unduhan = [
    { jenis: 'harian', j: 'Rekap harian', d: 'Daftar kehadiran seluruh pegawai hari ini beserta jam masuk, lokasi, dan status.' },
    { jenis: 'bulanan', j: 'Rekap bulanan', d: `Rekapitulasi per pegawai sepanjang ${NAMA_BULAN[bulan]} ${tahun}: hadir, terlambat, izin, dan persentase kehadiran.` },
    { jenis: 'cuti', j: 'Rekap izin & cuti', d: 'Seluruh pengajuan izin, cuti, dan sakit beserta periode, alasan, dan status persetujuannya.' },
    { jenis: 'unit', j: 'Rekap per unit kerja', d: 'Ringkasan kehadiran yang dikelompokkan menurut unit kerja, untuk pembanding antar-satuan.' },
  ];

  return `
  ${stripStatistik(kartuStat, 'stat-grid-4')}

  <div class="panel" style="margin-top:36px">
    <div class="panel-head">
      <div>
        <div class="t">Unduh rekap</div>
        <div class="s">Pilih periode, lalu unduh dalam format Excel atau PDF</div>
      </div>
    </div>

    <div class="filter-bar" style="margin-top:20px">
      <select class="select-box" data-filter="periode" aria-label="Periode laporan">
        ${bulanPilihan.map(b => `
          <option value="${b.tahun}-${b.bulan}" ${b.tahun === tahun && b.bulan === bulan ? 'selected' : ''}>
            ${NAMA_BULAN[b.bulan]} ${b.tahun}
          </option>`).join('')}
      </select>
      <select class="select-box" data-filter="unitLaporan" aria-label="Unit kerja">
        <option value="semua" ${V.laporan.unit === 'semua' ? 'selected' : ''}>Semua unit kerja</option>
        ${DB.unitKerja().map(u => `<option value="${esc(u)}" ${V.laporan.unit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
      </select>
    </div>

    <div class="kartu-unduh-grid">
      ${unduhan.map(x => `
        <div class="kartu-unduh">
          <div class="j">${esc(x.j)}</div>
          <div class="d">${esc(x.d)}</div>
          <div class="aksi">
            <button class="btn" data-aksi="laporanCSV" data-jenis="${x.jenis}">
              ${icon('download', 16, 'currentColor', 2.4)} Excel
            </button>
            <button class="btn btn-navy" data-aksi="laporanPDF" data-jenis="${x.jenis}">
              ${icon('printer', 16, 'currentColor', 2.4)} PDF
            </button>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}


function judulLaporan(jenis) {
  const { tahun, bulan } = V.laporan;
  const per = V.laporan.unit === 'semua' ? '' : ` — ${V.laporan.unit}`;
  if (jenis === 'bulanan') return `Rekap Kehadiran Bulanan — ${NAMA_BULAN[bulan]} ${tahun}${per}`;
  if (jenis === 'cuti') return `Rekap Izin & Cuti${per}`;
  if (jenis === 'unit') return `Rekap Kehadiran per Unit Kerja — ${NAMA_BULAN[bulan]} ${tahun}`;
  return `Rekap Kehadiran Harian — ${fmtTanggalPanjang(new Date())}${per}`;
}

/** Saring menurut unit kerja yang dipilih di halaman Laporan. */
function saringUnit(daftar, ambilUnit = x => x.unit) {
  if (V.laporan.unit === 'semua') return daftar;
  return daftar.filter(x => ambilUnit(x) === V.laporan.unit);
}

/** Susun judul kolom + baris untuk sebuah jenis laporan. */
function dataLaporan(jenis) {
  const { tahun, bulan } = V.laporan;

  if (jenis === 'bulanan') {
    return {
      kolom: ['NIP', 'Nama', 'Unit Kerja', 'Jabatan', 'Hari Kerja', 'Hadir', 'Terlambat', 'Izin', 'Kehadiran (%)'],
      baris: saringUnit(rekapBulanan(tahun, bulan)).map(p =>
        [p.nip, p.nama, p.unit, p.jabatan, p.hariKerja, p.hadir, p.terlambat, p.izin, p.persen]),
    };
  }

  if (jenis === 'cuti') {
    return {
      kolom: ['ID', 'Nama', 'Unit Kerja', 'Jenis', 'Mulai', 'Selesai', 'Hari', 'Alasan', 'Status'],
      baris: saringUnit(DB.pengajuan, unitPengajuan).map(p =>
        [p.id, p.nama, unitPengajuan(p), p.jenis, p.mulai, p.selesai, p.hari, p.alasan, p.status]),
    };
  }

  if (jenis === 'unit') {
    // Ringkasan yang dikelompokkan per unit kerja, untuk membandingkan satuan.
    const rekap = rekapBulanan(tahun, bulan);
    return {
      kolom: ['Unit Kerja', 'Jumlah Pegawai', 'Hadir', 'Terlambat', 'Izin', 'Rata-rata Kehadiran (%)'],
      baris: DB.unitKerja().map(u => {
        const anggota = rekap.filter(p => p.unit === u);
        if (!anggota.length) return [u, 0, 0, 0, 0, 0];
        const jml = (f) => anggota.reduce((n, p) => n + f(p), 0);
        return [
          u, anggota.length,
          jml(p => p.hadir), jml(p => p.terlambat), jml(p => p.izin),
          Math.round(jml(p => p.persen) / anggota.length),
        ];
      }),
    };
  }

  return {
    kolom: ['NIP', 'Nama', 'Unit Kerja', 'Jabatan', 'Jam Masuk', 'Lokasi', 'Dalam Radius', 'Status'],
    baris: saringUnit(DB.kehadiranHariIni).map(p =>
      [p.nip, p.nama, p.unit, p.jabatan, jamTampil(p.jamMasuk), p.lokasi,
        p.jamMasuk === '—' ? '—' : (p.dalamRadius ? 'Ya' : 'Tidak'), p.status]),
  };
}

/* ============================================================
   Render
   ============================================================ */

const VIEWS = {
  dashboard: viewDashboard,
  kehadiran: viewKehadiran,
  bukti: viewBukti,
  pegawai: viewPegawai,
  cuti: viewCuti,
  lokasi: viewLokasi,
  laporan: viewLaporan,
};

/* ---------- Siklus hidup peta Leaflet ---------- */

/** Peta yang sedang hidup; dibuang sebelum markup induknya diganti. */
let petaAktif = [];

function lepasPeta() {
  petaAktif.forEach(p => p.hancurkan());
  petaAktif = [];
}

/** Peta kecil "Sebaran Check-in" di Dashboard — hanya untuk dilihat. */
function pasangPetaSebaran() {
  const el = document.getElementById('petaSebaran');
  if (!el) return;
  const p = buatPetaPresensi(el, {
    kantor: DB.kantor,
    labelKantor: 'Kantor',
    interaktif: false,
    zoom: 16,
  });
  if (!p) return;
  p.setTitik(titikSebaran());
  p.pas(false);
  petaAktif.push(p);
}

/** Peta "Lokasi Kantor" — klik atau tarik pin untuk memindahkan titik. */
function pasangPetaKantor() {
  const el = document.getElementById('petaKantor');
  if (!el) return;
  const f = document.getElementById('formKantor');

  const p = buatPetaPresensi(el, {
    kantor: DB.kantor,
    kantorGeser: true,
    zoom: 17,
    onKlik: (lat, lng) => {
      f.lat.value = lat.toFixed(6);
      f.lng.value = lng.toFixed(6);
      p.setKantor(lat, lng);
      bacaanKoordinat(lat, lng);
    },
  });
  if (!p) return;
  petaAktif.push(p);

  // Lingkaran di peta ikut membesar/mengecil saat slider digeser, jadi admin
  // bisa melihat cakupannya sebelum menekan Simpan.
  f.radius.addEventListener('input', () => {
    const r = parseInt(f.radius.value, 10);
    if (Number.isFinite(r)) p.setRadius(r);
  });

  // Begitu pula bila koordinat diketik manual.
  const dariInput = () => {
    const lat = parseFloat(f.lat.value), lng = parseFloat(f.lng.value);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      p.setKantor(lat, lng);
      p.pusatkanKantor();
      bacaanKoordinat(lat, lng);
    }
  };
  f.lat.addEventListener('change', dariInput);
  f.lng.addEventListener('change', dariInput);
}

function bacaanKoordinat(lat, lng) {
  const el = document.getElementById('bacaKoordinat');
  if (el) el.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function renderKonten() {
  lepasPeta();
  $konten.innerHTML = VIEWS[V.view]();
  pasangFormKantor();
  if (V.view === 'dashboard') pasangPetaSebaran();
  if (V.view === 'lokasi') pasangPetaKantor();
}

/* ============================================================
   Gerbang masuk panel admin
   ============================================================ */

function renderGerbang() {
  $app.hidden = true;
  // Isi panel dikosongkan, bukan sekadar disembunyikan: setelah keluar,
  // nama admin dan data pegawai tidak boleh tertinggal di halaman.
  $sidebar.innerHTML = '';
  $topbar.innerHTML = '';
  $konten.innerHTML = '';
  $gerbang.hidden = false;
  $gerbang.innerHTML = `
    <div class="masuk-panggung">
      <form class="masuk-kartu" id="formAdmin" novalidate>
        <img class="masuk-logo" src="assets/logo-pu.svg" alt="">
        <div class="eyebrow">Balai Wilayah Sungai Maluku</div>
        <h1>Panel Admin</h1>
        <hr class="garis-emas masuk-garis">
        <p class="masuk-desk">
          Masuk dengan akun kepegawaian yang berwenang mengelola data presensi.
        </p>

        <div class="form-row">
          <label for="admNip">NIP</label>
          <input id="admNip" name="nip" type="text" autocomplete="username"
                 value="${esc(AKUN_ADMIN.nip)}" placeholder="Nomor Induk Pegawai">
        </div>
        <div class="form-row">
          <label for="admSandi">Kata sandi</label>
          <input id="admSandi" name="sandi" type="password" autocomplete="current-password"
                 value="${esc(AKUN_ADMIN.sandi)}" placeholder="Kata sandi">
        </div>

        <div id="errAdmin"></div>
        <button type="submit" class="btn btn-emas masuk-tombol">
          ${icon('lock', 17, 'currentColor', 2.4)} Masuk ke Panel Admin
        </button>

        <div class="masuk-kaki">
          <a href="index.html">Kembali ke halaman depan</a>
          <a href="pegawai.html">Aplikasi pegawai</a>
        </div>
        <div class="masuk-catatan">
          Prototipe demonstrasi — kredensial contoh sudah terisi. Pemeriksaan
          sandi masih berjalan di peramban, sehingga belum menjadi pengamanan
          sungguhan sampai backend dipasang.
        </div>
      </form>
    </div>`;

  document.getElementById('formAdmin').addEventListener('submit', e => {
    e.preventDefault();
    const nip = document.getElementById('admNip').value.trim();
    const sandi = document.getElementById('admSandi').value;
    const err = document.getElementById('errAdmin');
    const gagal = (pesan) => {
      err.innerHTML = `<div class="modal-bahaya" style="margin-top:16px">${esc(pesan)}</div>`;
    };

    if (!nip || !sandi) return gagal('NIP dan kata sandi wajib diisi.');
    if (nip !== AKUN_ADMIN.nip || sandi !== AKUN_ADMIN.sandi) {
      return gagal('NIP atau kata sandi tidak cocok.');
    }

    DB.simpanan.masukAdmin = true;
    DB.tulis();
    render();
    toast(`Selamat datang, ${ADMIN.nama}.`);
  });
}

/* ============================================================
   Render utama
   ============================================================ */

function render() {
  // Selama belum masuk, tidak ada satu pun data panel yang dirender.
  if (!DB.simpanan.masukAdmin) { renderGerbang(); return; }

  $gerbang.hidden = true;
  $gerbang.innerHTML = '';
  $app.hidden = false;
  renderSidebar();
  renderTopbar();
  renderKonten();
}

function pindahView(view) {
  V.view = view;
  V.cari = '';
  V.filterStatus = 'semua';
  V.filterUnit = 'semua';
  V.buktiFoto = 'semua';
  V.halaman = 1;
  render();
  window.scrollTo({ top: 0 });
}

/* ============================================================
   Aksi
   ============================================================ */

const AKSI = {
  notif: () => toast(`${DB.pengajuanMenunggu().length} pengajuan menunggu persetujuan Anda.`),
  keluar: () => {
    bukaModal(`
      <div class="modal-head">
        <div style="flex:1">
          <div class="t">Keluar dari Panel Admin</div>
          <div class="s">Anda perlu memasukkan NIP dan kata sandi lagi untuk kembali masuk.</div>
        </div>
        <button type="button" class="modal-tutup" data-aksi="tutupModal" aria-label="Tutup">
          ${icon('close', 18, 'var(--text-2)', 2.4)}
        </button>
      </div>
      <div class="modal-kaki">
        <button type="button" class="btn" data-aksi="tutupModal">Batal</button>
        <button type="button" class="btn btn-navy" data-aksi="keluarPasti">
          ${icon('logout', 16, 'currentColor', 2.4)} Keluar
        </button>
      </div>`);
  },

  keluarPasti: () => {
    tutupModal();
    DB.simpanan.masukAdmin = false;
    DB.tulis();
    V.view = 'dashboard';       // sesi berikutnya mulai dari awal lagi
    V.cari = '';
    render();
    toast('Anda telah keluar dari panel admin.');
  },

  toggleGelap: () => {
    const gelap = toggleTema();
    render();
    toast(gelap ? 'Mode gelap aktif.' : 'Mode terang aktif.');
  },

  /* Kelola pegawai & unit kerja */
  tambahPegawai: () => dialogPegawai(null),
  editPegawai: (el) => dialogPegawai(Number(el.dataset.id)),
  hapusPegawai: (el) => dialogHapusPegawai(Number(el.dataset.id)),
  kelolaUnit: () => dialogUnit(),
  editUnit: (el) => dialogEditUnit(el.dataset.asal),
  hapusUnit: (el) => dialogHapusUnit(el.dataset.asal),
  tutupModal: () => tutupModal(),
  konfirmasiHapus: (el) => {
    const id = Number(el.dataset.id);
    const p = DB.pegawaiById(id);
    DB.hapusPegawai(id);
    tutupModal();
    render();
    toast(`${p ? p.nama : 'Pegawai'} dihapus dari data induk.`, 'err');
  },

  setujui: (el) => ubahStatusPengajuan(el.dataset.id, 'Disetujui'),
  tolak: (el) => ubahStatusPengajuan(el.dataset.id, 'Ditolak'),

  halamanMundur: () => { if (V.halaman > 1) { V.halaman--; renderKonten(); } },
  halamanMaju: () => { V.halaman++; renderKonten(); },

  /* Ekspor cepat dari tiap view */
  exportKehadiranCSV: () => {
    const d = daftarKehadiranTersaring();
    exportCSV(`kehadiran-${kunciTanggal(new Date())}`,
      ['NIP', 'Nama', 'Unit Kerja', 'Jabatan', 'Jam Masuk', 'Lokasi', 'Dalam Radius', 'Status'],
      d.map(p => [p.nip, p.nama, p.unit, p.jabatan, p.jamMasuk, p.lokasi, p.jamMasuk === '—' ? '—' : (p.dalamRadius ? 'Ya' : 'Tidak'), p.status]));
    toast(`${d.length} baris diunduh sebagai CSV.`);
  },
  exportKehadiranPDF: () => {
    const d = daftarKehadiranTersaring();
    exportPDF('Rekap Kehadiran Harian', fmtTanggalPanjang(new Date()),
      ['NIP', 'Nama', 'Unit Kerja', 'Jam Masuk', 'Lokasi', 'Status'],
      d.map(p => [p.nip, p.nama, p.unit, p.jamMasuk, p.lokasi, p.status]));
  },
  lihatBukti: (el) => dialogBukti(Number(el.dataset.id)),

  exportBuktiCSV: () => {
    const d = daftarBuktiTersaring();
    exportCSV(`bukti-absen-${V.buktiTanggal}`,
      ['NIP', 'Nama', 'Unit Kerja', 'Tanggal', 'Jam Masuk', 'Jam Keluar', 'Status',
        'Latitude', 'Longitude', 'Jarak (m)', 'Akurasi (m)', 'Dalam Radius', 'Bukti Foto',
        'Perintah Gerak Datang', 'Verifikasi Datang', 'Perubahan Datang (%)',
        'Bukti Foto Pulang', 'Perintah Gerak Pulang', 'Verifikasi Pulang', 'Perubahan Pulang (%)'],
      d.map(b => [
        b.nip, b.nama, b.unit, b.tanggal, b.jamMasuk, b.jamKeluar, b.status,
        b.lat != null ? b.lat.toFixed(6) : '—',
        b.lng != null ? b.lng.toFixed(6) : '—',
        b.jarak ?? '—',
        b.akurasi != null ? Math.round(b.akurasi) : '—',
        b.dalamRadius == null ? '—' : (b.dalamRadius ? 'Ya' : 'Tidak'),
        b.foto ? (b.fotoAsli ? 'Ada (asli)' : 'Ada (contoh)') : 'Tidak ada',
        b.verifikasi ? b.verifikasi.teks : '—',
        labelVerifikasi(b.verifikasi).teks,
        b.verifikasi && b.verifikasi.gerak != null ? b.verifikasi.gerak : '—',
        b.fotoKeluar ? 'Ada' : 'Tidak ada',
        b.verifikasiKeluar ? b.verifikasiKeluar.teks : '—',
        b.verifikasiKeluar ? labelVerifikasi(b.verifikasiKeluar).teks : '—',
        b.verifikasiKeluar && b.verifikasiKeluar.gerak != null ? b.verifikasiKeluar.gerak : '—',
      ]));
    toast(`${d.length} baris bukti diunduh sebagai CSV.`);
  },

  exportPegawaiCSV: () => {
    exportCSV('data-pegawai',
      ['NIP', 'Nama', 'Unit Kerja', 'Jabatan'],
      DB.pegawai.map(p => [p.nip, p.nama, p.unit, p.jabatan]));
    toast(`${DB.pegawai.length} pegawai diunduh sebagai CSV.`);
  },
  exportCutiCSV: () => {
    exportCSV('izin-cuti',
      ['ID', 'Nama', 'Unit Kerja', 'Jenis', 'Mulai', 'Selesai', 'Hari', 'Alasan', 'Status'],
      DB.pengajuan.map(p => [p.id, p.nama, unitPengajuan(p), p.jenis, p.mulai, p.selesai, p.hari, p.alasan, p.status]));
    toast('Rekap izin & cuti diunduh.');
  },
  exportCutiPDF: () => {
    exportPDF('Rekap Izin & Cuti', `Per ${fmtTanggalPanjang(new Date())}`,
      ['Nama', 'Unit Kerja', 'Jenis', 'Mulai', 'Selesai', 'Hari', 'Status'],
      DB.pengajuan.map(p => [p.nama, unitPengajuan(p), p.jenis, p.mulai, p.selesai, p.hari, p.status]));
  },

  laporanCSV: (el) => {
    const jenis = el.dataset.jenis;
    const { kolom, baris } = dataLaporan(jenis);
    const nama = judulLaporan(jenis).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    exportCSV(nama, kolom, baris);
    toast(`${baris.length} baris diunduh sebagai CSV.`);
  },
  laporanPDF: (el) => {
    const jenis = el.dataset.jenis;
    const { kolom, baris } = dataLaporan(jenis);
    exportPDF(judulLaporan(jenis), `${DB.kantor.nama} · dicetak oleh ${ADMIN.nama}`, kolom, baris);
  },

  /* Lokasi kantor */
  lokasiSaya: () => {
    if (!('geolocation' in navigator)) { toast('Browser ini tidak mendukung GPS.', 'err'); return; }
    toast('Membaca lokasi Anda…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = document.getElementById('inpLat');
        const lng = document.getElementById('inpLng');
        lat.value = pos.coords.latitude.toFixed(6);
        lng.value = pos.coords.longitude.toFixed(6);
        // Picu 'change' agar peta ikut berpindah ke titik baru.
        lat.dispatchEvent(new Event('change'));
        toast(`Koordinat terisi (akurasi ${Math.round(pos.coords.accuracy)} m). Jangan lupa Simpan.`);
      },
      err => toast(err.code === err.PERMISSION_DENIED
        ? 'Izin lokasi ditolak.'
        : 'Lokasi tidak terbaca. Pastikan GPS aktif.', 'err'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  },
  /**
   * Tampilkan tautan berisi titik kantor, untuk dibuka di perangkat lain.
   * Ini penambal keterbatasan "tanpa backend": tiap perangkat punya
   * penyimpanannya sendiri, jadi pengaturannya perlu dibawa manual.
   */
  tautanPengaturan: () => {
    const tautan = DB.tautanPengaturan('pegawai.html');
    const tautanAdmin = DB.tautanPengaturan('admin.html');

    bukaModal(`
      <div class="modal-head">
        <div style="flex:1">
          <div class="t">Kirim Pengaturan ke Perangkat Lain</div>
          <div class="s">Titik kantor &amp; radius yang sedang berlaku</div>
        </div>
        <button type="button" class="modal-tutup" data-aksi="tutupModal" aria-label="Tutup">
          ${icon('close', 18, 'var(--text-2)', 2.4)}
        </button>
      </div>
      <div class="modal-isi">
        <div style="background:var(--blue-bg);border-radius:14px;padding:14px 16px;font-size:12.5px;color:var(--blue);font-weight:600;line-height:1.6">
          Aplikasi ini belum punya server, sehingga tiap perangkat menyimpan datanya
          sendiri. Kirim tautan di bawah lewat WhatsApp atau email, lalu buka di HP
          atau laptop tujuan — titik kantornya akan langsung tersetel di sana.
        </div>

        <div class="form-row" style="margin-top:18px">
          <label for="tautanPegawai">Untuk aplikasi pegawai</label>
          <input id="tautanPegawai" type="text" readonly value="${esc(tautan)}"
                 onfocus="this.select()" style="font-size:12px">
        </div>
        <div class="form-row" style="margin-top:14px">
          <label for="tautanAdmin">Untuk panel admin</label>
          <input id="tautanAdmin" type="text" readonly value="${esc(tautanAdmin)}"
                 onfocus="this.select()" style="font-size:12px">
        </div>

        <div style="margin-top:16px;font-size:12px;color:var(--text-idle);font-weight:600;line-height:1.6">
          Tautan ini hanya membawa titik kantor. Data presensi, foto bukti, dan
          pengajuan cuti tetap tersimpan di perangkat masing-masing dan tidak
          ikut terkirim.
        </div>
        <div id="errTautan"></div>
      </div>
      <div class="modal-kaki">
        <button type="button" class="btn" data-aksi="tutupModal">Tutup</button>
        <button type="button" class="btn btn-emas" data-aksi="salinTautan" data-target="tautanPegawai">
          ${icon('download', 16, 'currentColor')} Salin tautan pegawai
        </button>
      </div>`, 'modal-lebar');
  },

  salinTautan: async (el) => {
    const inp = document.getElementById(el.dataset.target);
    if (!inp) return;
    inp.select();
    try {
      await navigator.clipboard.writeText(inp.value);
      toast('Tautan disalin. Kirim lewat WhatsApp atau email.');
    } catch {
      // Clipboard API diblokir (mis. bukan konteks aman) — teksnya sudah
      // tersorot, jadi pengguna tinggal menekan Ctrl+C.
      document.getElementById('errTautan').innerHTML =
        '<div class="modal-bahaya" style="margin-top:14px">Penyalinan otomatis diblokir browser. Tautannya sudah tersorot — tekan Ctrl+C untuk menyalin.</div>';
    }
  },

  kantorDefault: () => {
    DB.simpanan.kantor = { ...KANTOR_DEFAULT };
    DB.tulis();
    renderKonten();
    toast('Titik kantor dikembalikan ke pengaturan bawaan.');
  },
};

function ubahStatusPengajuan(id, status) {
  const p = DB.pengajuan.find(x => x.id === id);
  if (!p || p.status !== 'Menunggu') return;
  p.status = status;
  p.diproses = kunciTanggal(new Date());
  DB.tulis();
  render();   // sidebar ikut dirender karena badge jumlah menunggu berubah
  toast(`Pengajuan ${p.nama} ${status.toLowerCase()}.`, status === 'Disetujui' ? 'ok' : 'err');
}

/* ============================================================
   Event
   ============================================================ */

document.addEventListener('click', e => {
  // Klik pada latar gelap menutup dialog; klik di dalam kartunya tidak.
  if (e.target.classList.contains('modal-latar')) { tutupModal(); return; }

  const nav = e.target.closest('[data-view]');
  if (nav) { pindahView(nav.dataset.view); return; }

  const el = e.target.closest('[data-aksi]');
  if (!el || el.disabled) return;
  const fn = AKSI[el.dataset.aksi];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $modal.innerHTML) tutupModal();
});

document.addEventListener('change', e => {
  const f = e.target.closest('[data-filter]');
  if (!f) return;
  const nilai = f.value;
  switch (f.dataset.filter) {
    case 'status': V.filterStatus = nilai; break;
    case 'unit': V.filterUnit = nilai; break;
    case 'buktiTanggal': V.buktiTanggal = nilai; break;
    case 'buktiFoto': V.buktiFoto = nilai; break;
    case 'unitLaporan': V.laporan.unit = nilai; break;
    case 'periode': {
      const [t, b] = nilai.split('-').map(Number);
      V.laporan.tahun = t; V.laporan.bulan = b;
      break;
    }
  }
  V.halaman = 1;
  renderKonten();
});

/** Form titik kantor dipasang ulang tiap kali view Lokasi dirender. */
function pasangFormKantor() {
  const f = document.getElementById('formKantor');
  if (!f) return;

  // Angka radius mengikuti slider. Dipasang di sini, bukan di pemasang peta,
  // supaya tetap berfungsi walau Leaflet gagal dimuat.
  const tulisRadius = () => {
    const r = parseInt(f.radius.value, 10);
    if (!Number.isFinite(r)) return;
    const a = document.getElementById('bacaRadiusSlider');
    const b = document.getElementById('bacaRadius');
    if (a) a.textContent = `${r} m`;
    if (b) b.textContent = `${r} m`;
  };
  f.radius.addEventListener('input', tulisRadius);
  f.addEventListener('submit', e => {
    e.preventDefault();
    const lat = parseFloat(f.lat.value);
    const lng = parseFloat(f.lng.value);
    const radius = parseInt(f.radius.value, 10);

    if (!f.nama.value.trim()) { toast('Nama lokasi wajib diisi.', 'err'); return; }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) { toast('Latitude harus antara -90 dan 90.', 'err'); return; }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) { toast('Longitude harus antara -180 dan 180.', 'err'); return; }
    if (!Number.isFinite(radius) || radius < 20 || radius > 2000) { toast('Radius harus antara 20 dan 2000 meter.', 'err'); return; }

    DB.simpanan.kantor = {
      nama: f.nama.value.trim(),
      alamat: f.alamat.value.trim(),
      lat, lng, radius,
    };
    DB.tulis();
    renderKonten();
    toast('Titik kantor tersimpan. Aplikasi pegawai memakai nilai baru ini.');
  });
}

/* ============================================================
   Sinkron dengan aplikasi pegawai
   ------------------------------------------------------------
   Kebalikan dari pemantau di app.js: saat pegawai melakukan check-in atau
   mengirim pengajuan cuti dari tab lain, panel ini ikut memperbarui diri.
   Dialog yang sedang terbuka dibiarkan supaya isian admin tidak hilang.
   ============================================================ */

window.addEventListener('storage', e => {
  if (e.key !== KUNCI_SIMPAN) return;
  if ($modal.innerHTML) return;

  const menungguLama = DB.pengajuanMenunggu().length;
  if (!DB.segarkanDariPenyimpanan()) return;
  render();

  const selisih = DB.pengajuanMenunggu().length - menungguLama;
  if (selisih > 0) toast(`${selisih} pengajuan baru masuk dari aplikasi pegawai.`);
  else toast('Data diperbarui dari aplikasi pegawai.');
});

/* ============================================================
   Mulai
   ============================================================ */

render();

if (HASIL_SETUP) toast(HASIL_SETUP.pesan, HASIL_SETUP.ok ? 'ok' : 'err');
