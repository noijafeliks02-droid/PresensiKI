/* ============================================================
   Kompas — Fungsi bantu bersama
   Geofencing, format tanggal Indonesia, dan ekspor laporan.
   ============================================================ */

/* ---------- Geofencing ---------- */

/**
 * Jarak dua koordinat dalam meter (rumus Haversine).
 * Inilah inti validasi radius: check-in diizinkan bila hasilnya <= radius kantor.
 */
function jarakMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---------- Format waktu & tanggal (locale id-ID) ---------- */

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const NAMA_BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const pad2 = n => String(n).padStart(2, '0');

/** "08:02" — bentuk penyimpanan & pembanding (jangan diubah) */
const fmtJam = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/**
 * "08.02" — bentuk tampilan. Konvensi Indonesia memakai titik sebagai
 * pemisah jam dan menit. Penyimpanan tetap memakai titik dua supaya
 * perbandingan string (mis. terhadap batas jam terlambat) tetap sahih.
 */
const jamTampil = s => (s == null || s === '—' ? '—' : String(s).replace(':', '.'));

/** "08:02:47" */
const fmtJamDetik = d => `${fmtJam(d)}:${pad2(d.getSeconds())}`;

/** "Sabtu, 25 Juli 2026" */
const fmtTanggalPanjang = d =>
  `${NAMA_HARI[d.getDay()]}, ${d.getDate()} ${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;

/** "25 Jul 2026" */
const fmtTanggalPendek = d =>
  `${pad2(d.getDate())} ${NAMA_BULAN_PENDEK[d.getMonth()]} ${d.getFullYear()}`;

/** "2026-07-25" — kunci penyimpanan, bukan untuk ditampilkan */
const kunciTanggal = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Sapaan yang menyesuaikan jam. */
function salam(d = new Date()) {
  const j = d.getHours();
  if (j < 11) return 'Selamat pagi';
  if (j < 15) return 'Selamat siang';
  if (j < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/** "Budi Santoso" -> "BS" */
function inisial(nama) {
  return nama.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/** Jumlah hari kerja (Senin–Jumat) antara dua tanggal, inklusif. */
function hariKerja(mulai, selesai) {
  const a = new Date(mulai), b = new Date(selesai);
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const h = d.getDay();
    if (h !== 0 && h !== 6) n++;
  }
  return n;
}

/**
 * Rentang tanggal pengajuan yang ringkas:
 * "10 Jun 2026" bila sehari, "25 – 26 Jun 2026" bila masih satu bulan,
 * "28 Jun 2026 – 02 Jul 2026" bila melintasi bulan.
 */
function periodeTeks(p) {
  const a = new Date(p.mulai + 'T00:00:00');
  const b = new Date(p.selesai + 'T00:00:00');
  if (p.mulai === p.selesai) return fmtTanggalPendek(a);
  const samaBulan = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return samaBulan
    ? `${pad2(a.getDate())} – ${fmtTanggalPendek(b)}`
    : `${fmtTanggalPendek(a)} – ${fmtTanggalPendek(b)}`;
}

/** Angka dengan pemisah ribuan gaya Indonesia: 1.248 */
const fmtAngka = n => n.toLocaleString('id-ID');

/** Persen satu desimal gaya Indonesia: "85,9%" */
const fmtPersen = (bagian, total) =>
  total ? `${(bagian / total * 100).toFixed(1).replace('.', ',')}%` : '0%';

/* ---------- Mode gelap ---------- */

const KUNCI_TEMA = 'presensiku.tema';

/** Apakah mode gelap sedang aktif? */
const temaGelap = () => document.documentElement.dataset.tema === 'gelap';

/**
 * Pasang tema dan simpan pilihannya.
 * Berkas HTML sudah memasang tema lebih dulu lewat skrip kecil di <head>,
 * jadi fungsi ini hanya menangani perubahan setelah halaman hidup.
 */
function setTema(gelap) {
  if (gelap) document.documentElement.dataset.tema = 'gelap';
  else delete document.documentElement.dataset.tema;
  try {
    localStorage.setItem(KUNCI_TEMA, gelap ? 'gelap' : 'terang');
  } catch { /* penyimpanan diblokir — tema tetap berlaku untuk sesi ini */ }
}

/** Balik tema, kembalikan status barunya. */
function toggleTema() {
  const gelap = !temaGelap();
  setTema(gelap);
  return gelap;
}

/* ---------- Keamanan render ---------- */

/**
 * Semua nilai yang berasal dari input pengguna wajib lewat sini sebelum
 * dimasukkan ke innerHTML, supaya isian seperti alasan cuti tidak bisa
 * menyuntikkan markup.
 */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Ekspor laporan ---------- */

/**
 * Unduh data tabel sebagai CSV yang langsung rapi saat dibuka di Excel.
 * Memakai pemisah titik-koma + BOM UTF-8, yaitu kombinasi yang dikenali
 * Excel berlokal Indonesia sehingga kolom tidak menumpuk jadi satu.
 */
function exportCSV(namaFile, judulKolom, baris) {
  const cell = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const isi = [judulKolom, ...baris].map(r => r.map(cell).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${namaFile}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Buka jendela cetak berisi laporan yang sudah diformat.
 * Pengguna memilih "Save as PDF" di dialog cetak browser — tidak perlu
 * pustaka PDF apa pun.
 */
function exportPDF(judul, subjudul, judulKolom, baris) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.');
    return;
  }
  const thead = judulKolom.map(h => `<th>${esc(h)}</th>`).join('');
  const tbody = baris.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>${esc(judul)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { font-family: system-ui, sans-serif; color: #16202E; }
  h1 { font-size: 18px; margin: 0; }
  .sub { font-size: 12px; color: #7A8597; margin: 4px 0 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #0E2A47; color: #fff; text-align: left; padding: 8px 10px; }
  td { padding: 7px 10px; border-bottom: 1px solid #E6EAEF; }
  tr:nth-child(even) td { background: #FAFBFC; }
  footer { margin-top: 20px; font-size: 10px; color: #9AA6B6; }
</style></head><body>
<h1>${esc(judul)}</h1>
<div class="sub">${esc(subjudul)}</div>
<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
<footer>Dicetak ${fmtTanggalPanjang(new Date())} pukul ${fmtJam(new Date())} WIB · Kompas</footer>
</body></html>`);
  w.document.close();
  w.focus();
  // Beri jeda sesaat agar layout selesai dirender sebelum dialog cetak muncul.
  setTimeout(() => w.print(), 250);
}
