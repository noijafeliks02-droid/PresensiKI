/* ============================================================
   PresensiKu — Peta asli (Leaflet + OpenStreetMap)
   ------------------------------------------------------------
   Basemap memakai CARTO Positron: gratis, tanpa API key, dan warnanya
   kalem sehingga pin emas & lingkaran radius tetap menonjol.

   Leaflet dimuat dari CDN. Bila tidak ada koneksi, `petaTersedia()`
   mengembalikan false dan aplikasi otomatis kembali memakai peta
   ilustratif — jadi demo tetap bisa jalan tanpa internet.
   ============================================================ */

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_SUBDOMAIN = 'abcd';

/** Teks atribusi. Wajib ditampilkan; kita render sendiri agar tidak
 *  tertutup bottom-sheet, sehingga kontrol bawaan Leaflet dimatikan. */
const ATRIBUSI_HTML =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · ' +
  '<a href="https://carto.com/attributions" target="_blank" rel="noopener">© CARTO</a>';

/** Apakah pustaka Leaflet berhasil dimuat? */
const petaTersedia = () => typeof L !== 'undefined' && typeof L.map === 'function';

/* ---------- Ikon ---------- */

function ikonKantor(nama) {
  return L.divIcon({
    className: 'marker-kosong',
    html: `<div class="marker-kantor">
             <div class="label">${esc(nama)}</div>
             <div class="arrow"></div>
             <div class="dot"></div>
           </div>`,
    iconSize: [180, 66],
    iconAnchor: [90, 51],   // titik jangkar = tengah bulatan emas
  });
}

function ikonUser() {
  return L.divIcon({
    className: 'marker-kosong',
    html: '<div class="marker-user"><span class="pulse"></span><span class="core"></span></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function ikonTitik(warna) {
  return L.divIcon({
    className: 'marker-kosong',
    html: `<span class="marker-titik" style="background:${warna}"></span>`,
    iconSize: [11, 11],
    iconAnchor: [5.5, 5.5],
  });
}

/* ---------- Pabrik peta ---------- */

/**
 * Bangun peta presensi lengkap dengan pin kantor dan lingkaran radius.
 *
 * @param {HTMLElement} el       wadah peta
 * @param {object} opsi
 *   kantor      {nama, lat, lng, radius}
 *   zoom        level awal (default 17)
 *   interaktif  boleh digeser/zoom (default true)
 *   kontrolZoom tampilkan tombol +/- (default = interaktif)
 *   onKlik      fungsi(lat, lng) saat peta diklik — untuk memindah titik kantor
 *   kantorGeser marker kantor bisa ditarik (default false)
 * @returns objek pengendali, atau null bila Leaflet tidak tersedia
 */
function buatPetaPresensi(el, opsi = {}) {
  if (!petaTersedia() || !el) return null;

  const k = opsi.kantor;
  const interaktif = opsi.interaktif !== false;

  const map = L.map(el, {
    zoomControl: opsi.kontrolZoom ?? interaktif,
    attributionControl: false,          // atribusi dirender manual, lihat ATRIBUSI_HTML
    dragging: interaktif,
    scrollWheelZoom: interaktif,
    doubleClickZoom: interaktif,
    touchZoom: interaktif,
    boxZoom: interaktif,
    keyboard: interaktif,
    tap: interaktif,
  }).setView([k.lat, k.lng], opsi.zoom ?? 17);

  L.tileLayer(TILE_URL, { maxZoom: 20, subdomains: TILE_SUBDOMAIN }).addTo(map);

  // Lingkaran radius sengaja bisa dimatikan: di aplikasi pegawai, batas
  // geofence tidak boleh terlihat (lihat catatan di app.js → bolehAbsen).
  const lingkaran = opsi.tanpaRadius ? null : L.circle([k.lat, k.lng], {
    radius: k.radius,
    color: '#E8941A',
    weight: 2,
    dashArray: '6 6',
    fillColor: '#F5A623',
    fillOpacity: 0.14,
    interactive: false,
  }).addTo(map);

  const markerKantor = L.marker([k.lat, k.lng], {
    icon: ikonKantor(opsi.labelKantor ?? k.nama),
    draggable: !!opsi.kantorGeser,
    keyboard: false,
    zIndexOffset: 400,
  }).addTo(map);

  let markerUser = null;
  const titikPegawai = [];

  if (opsi.onKlik) {
    map.on('click', e => opsi.onKlik(e.latlng.lat, e.latlng.lng));
    if (opsi.kantorGeser) {
      markerKantor.on('dragend', () => {
        const p = markerKantor.getLatLng();
        opsi.onKlik(p.lat, p.lng);
      });
    }
  }

  // Wadah baru sering belum punya ukuran final saat peta dibuat.
  requestAnimationFrame(() => map.invalidateSize());

  return {
    map,

    /** Pindahkan titik kantor beserta lingkaran radiusnya. */
    setKantor(lat, lng, radius, nama) {
      markerKantor.setLatLng([lat, lng]);
      if (lingkaran) {
        lingkaran.setLatLng([lat, lng]);
        if (radius != null) lingkaran.setRadius(radius);
      }
      if (nama != null) markerKantor.setIcon(ikonKantor(nama));
    },

    setRadius(radius) { if (lingkaran) lingkaran.setRadius(radius); },

    /** Tampilkan/pindahkan posisi pengguna. */
    setUser(lat, lng) {
      if (lat == null || lng == null) return;
      if (markerUser) markerUser.setLatLng([lat, lng]);
      else markerUser = L.marker([lat, lng], { icon: ikonUser(), keyboard: false, zIndexOffset: 500 }).addTo(map);
    },

    hapusUser() {
      if (markerUser) { map.removeLayer(markerUser); markerUser = null; }
    },

    /** Taburkan titik pegawai (dipakai widget "Sebaran Check-in"). */
    setTitik(daftar) {
      titikPegawai.forEach(m => map.removeLayer(m));
      titikPegawai.length = 0;
      daftar.forEach(t => {
        titikPegawai.push(
          L.marker([t.lat, t.lng], { icon: ikonTitik(t.warna), keyboard: false, interactive: false }).addTo(map)
        );
      });
    },

    /** Atur tampilan agar seluruh lingkaran radius (dan pengguna) terlihat. */
    pas(sertakanUser = true) {
      if (!lingkaran) {                       // tanpa radius, cukup pusatkan kantor
        map.setView(markerKantor.getLatLng(), opsi.zoom ?? 17);
        return;
      }
      const batas = lingkaran.getBounds();
      if (sertakanUser && markerUser) batas.extend(markerUser.getLatLng());
      map.fitBounds(batas, { padding: [40, 40], maxZoom: 18 });
    },

    pusatkanKantor(zoom) {
      map.setView(markerKantor.getLatLng(), zoom ?? map.getZoom());
    },

    segarkan() { map.invalidateSize(); },

    hancurkan() { map.remove(); },
  };
}
