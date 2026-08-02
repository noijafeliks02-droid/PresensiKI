/* ============================================================
   Kompas — Data panel admin dari server
   ------------------------------------------------------------
   Hampir seluruh panel admin dibangun dari dua array: DB.pegawai dan
   DB.kehadiranHariIni. Kartu statistik, tabel kehadiran, menu Bukti
   Absen, dan laporan semuanya menurunkan angkanya dari sana.

   Jadi berkas ini tidak menulis ulang tampilan apa pun. Ia hanya
   mengganti ISI kedua array itu — dari data karangan menjadi jawaban
   server — dengan bentuk yang sama persis seperti sebelumnya.

   Yang tidak bisa diambil dari server dibiarkan kosong, bukan diisi
   angka karangan. Dashboard yang mencampur data nyata dengan data
   contoh lebih berbahaya daripada dashboard yang mengaku kosong.
   ============================================================ */

const SRV = {
  /** Daftar putih: siapa yang boleh mendaftar. */
  terdaftar: [],

  /** Pengajuan izin & cuti dari server. */
  pengajuan: [],

  /* ============================================================
     Roster pegawai
     ============================================================ */

  async muatPegawai() {
    const { data, error } = await SB
      .from('pegawai')
      .select('id, email, nik, nama, jabatan, peran, aktif, cuti_kuota, unit_kerja(id, nama)')
      .order('nama');

    if (error) throw error;

    DB.pegawaiServer = data.map(p => ({
      id: p.id,
      email: p.email,
      nik: p.nik,
      nama: p.nama,
      jabatan: p.jabatan || '—',
      unit: p.unit_kerja?.nama || '—',
      unitId: p.unit_kerja?.id || null,
      peran: p.peran,
      aktif: p.aktif,
      cutiKuota: p.cuti_kuota,
      inisial: inisial(p.nama),
    }));
    DB.pegawai = DB.pegawaiServer.filter(p => p.aktif);
    return DB.pegawai;
  },

  /**
   * Sunting data pegawai yang sudah punya akun.
   *
   * Tidak ada fungsi "tambah pegawai": barisnya dibuat pemicu server
   * saat orangnya mendaftar. Menambahkannya dari panel akan membuat
   * baris tanpa akun — tidak ada yang bisa memakainya untuk absen.
   */
  async simpanPegawai(id, { nama, nik, jabatan, unit }) {
    const u = (DB.unitServer || []).find(x => x.nama === unit);
    const { error } = await SB.from('pegawai').update({
      nama: nama.trim(),
      nik: nik.trim(),
      jabatan: jabatan.trim() || null,
      unit_id: u ? u.id : null,
    }).eq('id', id);

    if (error) return { ok: false, pesan: this.pesanTerdaftar(error) };
    await this.muatPegawai();
    await this.muatKehadiran();
    return { ok: true };
  },

  /**
   * Nonaktifkan pegawai — bukan hapus.
   *
   * Menghapus barisnya akan ikut menghapus seluruh riwayat presensinya,
   * dan riwayat itu dokumen kepegawaian. Yang dihentikan hanya aksesnya:
   * sesi berikutnya ditolak, dan namanya keluar dari daftar aktif.
   */
  async nonaktifkanPegawai(id) {
    const { error } = await SB.from('pegawai').update({ aktif: false }).eq('id', id);
    if (error) return { ok: false, pesan: pesanGalat(error) };
    await this.muatPegawai();
    await this.muatKehadiran();
    return { ok: true };
  },

  /* ============================================================
     Kehadiran hari ini
     ------------------------------------------------------------
     Pegawai yang belum absen TETAP muncul, berstatus "Belum absen".
     Daftar yang hanya memuat orang yang sudah absen menyembunyikan
     justru yang paling perlu ditindaklanjuti admin.
     ============================================================ */

  async muatKehadiran(tanggal = PRESENSI.tanggalServer()) {
    const { data, error } = await SB
      .from('presensi')
      .select('*')
      .eq('tanggal', tanggal);

    if (error) throw error;

    const perPegawai = new Map(data.map(r => [r.pegawai_id, r]));
    const k = DB.kantor;

    DB.kehadiranHariIni = DB.pegawai.map(p => {
      const r = perPegawai.get(p.id);
      if (!r || !r.jam_masuk) {
        return {
          ...p, status: 'Belum absen', jamMasuk: '—', jamKeluar: '—',
          lokasi: '—', dalamRadius: false,
          lat: null, lng: null, akurasi: null, jarak: null,
          fotoMasuk: null, fotoKeluar: null,
          verifikasi: null, verifikasiKeluar: null,
          latKeluar: null, lngKeluar: null, akurasiKeluar: null,
          jarakKeluar: null, dalamRadiusKeluar: null,
        };
      }
      const dalam = r.jarak_masuk == null || r.jarak_masuk <= k.radius;
      return {
        ...p,
        status: r.status,
        jamMasuk: PRESENSI.jamWit(r.jam_masuk) || '—',
        jamKeluar: PRESENSI.jamWit(r.jam_keluar) || '—',
        lokasi: dalam ? 'Area kantor' : 'Di luar area kantor',
        dalamRadius: dalam,
        lat: r.lat_masuk, lng: r.lng_masuk,
        akurasi: r.akurasi_masuk, jarak: r.jarak_masuk,

        // Jalur berkas, bukan tautan. Tautan bertanda tangan baru dibuat
        // saat fotonya benar-benar dibuka — membuat puluhan sekaligus
        // hanya memperlambat halaman tanpa ada yang melihatnya.
        fotoMasuk: r.foto_masuk,
        fotoKeluar: r.foto_keluar,
        verifikasi: r.verifikasi_masuk,
        verifikasiKeluar: r.verifikasi_keluar,
        latKeluar: r.lat_keluar, lngKeluar: r.lng_keluar,
        akurasiKeluar: r.akurasi_keluar, jarakKeluar: r.jarak_keluar,
        dalamRadiusKeluar: r.jarak_keluar == null ? null : r.jarak_keluar <= k.radius,
      };
    });

    await this.tandatanganiFoto(DB.kehadiranHariIni);
    return DB.kehadiranHariIni;
  },

  /**
   * Buatkan tautan bertanda tangan untuk semua foto sekaligus.
   *
   * Satu panggilan untuk seluruh daftar, bukan satu per foto. Panel
   * kehadiran bisa memuat puluhan baris; meminta tanda tangan satu per
   * satu berarti puluhan perjalanan bolak-balik ke server sebelum
   * halamannya tampil.
   */
  async tandatanganiFoto(daftar) {
    const jalur = [];
    for (const p of daftar) {
      if (p.fotoMasuk) jalur.push(p.fotoMasuk);
      if (p.fotoKeluar) jalur.push(p.fotoKeluar);
    }
    if (!jalur.length) return;

    const { data, error } = await SB.storage
      .from(PRESENSI.BUCKET)
      .createSignedUrls(jalur, PRESENSI.UMUR_TAUTAN);
    if (error) return;

    const peta = new Map(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
    for (const p of daftar) {
      p.fotoMasukUrl = p.fotoMasuk ? peta.get(p.fotoMasuk) || null : null;
      p.fotoKeluarUrl = p.fotoKeluar ? peta.get(p.fotoKeluar) || null : null;
    }
  },

  /* ============================================================
     Bukti absen
     ------------------------------------------------------------
     Bentuknya dibuat sama dengan DB.bukti() yang lama supaya galeri,
     dialog pemeriksaan, dan ekspornya tidak perlu diubah.

     Bedanya satu: tidak ada lagi "foto contoh". Pegawai yang belum
     absen tampil tanpa foto, bukan dengan gambar pengganti. Foto
     tiruan di layar bukti justru berbahaya — admin bisa mengira sudah
     ada bukti padahal belum ada.
     ============================================================ */

  bukti(tanggal) {
    const hariIni = PRESENSI.tanggalServer();
    if (tanggal !== hariIni) return this.buktiArsip || [];

    const k = DB.kantor;
    return DB.kehadiranHariIni.map(p => ({
      pegawaiId: p.id,
      nama: p.nama, inisial: p.inisial, nik: p.nik,
      unit: p.unit, jabatan: p.jabatan,
      tanggal,
      jamMasuk: p.jamMasuk, jamKeluar: p.jamKeluar,
      status: p.status,
      foto: p.fotoMasukUrl || null, fotoAsli: !!p.fotoMasuk,
      lat: p.lat, lng: p.lng, akurasi: p.akurasi, jarak: p.jarak,
      dalamRadius: p.jamMasuk === '—' ? null : p.dalamRadius,
      verifikasi: p.verifikasi,
      fotoKeluar: p.fotoKeluarUrl || null,
      verifikasiKeluar: p.verifikasiKeluar,
      latKeluar: p.latKeluar, lngKeluar: p.lngKeluar,
      akurasiKeluar: p.akurasiKeluar, jarakKeluar: p.jarakKeluar,
      dalamRadiusKeluar: p.jarakKeluar == null ? null : p.jarakKeluar <= k.radius,
    }));
  },

  /**
   * Bukti pada tanggal lampau.
   * Dimuat sesuai permintaan, bukan sekaligus — riwayat 26 pegawai
   * dikali puluhan hari tidak ada gunanya diambil kalau admin hanya
   * membuka satu tanggal.
   */
  async muatBuktiTanggal(tanggal) {
    if (tanggal === PRESENSI.tanggalServer()) {
      await this.muatKehadiran(tanggal);
      this.buktiArsip = null;
      return this.bukti(tanggal);
    }
    await this.muatKehadiran(tanggal);
    this.buktiArsip = this.bukti(PRESENSI.tanggalServer());
    // muatKehadiran menimpa kehadiran hari ini; kembalikan ke hari ini
    // supaya dashboard dan tabel kehadiran tidak ikut berubah.
    const hasil = this.buktiArsip;
    await this.muatKehadiran();
    return hasil;
  },

  /** Tanggal-tanggal yang punya bukti tersimpan, terbaru dulu. */
  async muatTanggalBukti() {
    const { data, error } = await SB
      .from('presensi')
      .select('tanggal')
      .order('tanggal', { ascending: false })
      .limit(400);
    if (error) return [PRESENSI.tanggalServer()];
    const set = new Set([PRESENSI.tanggalServer(), ...data.map(r => r.tanggal)]);
    this.tanggalBukti = [...set].sort().reverse();
    return this.tanggalBukti;
  },

  /* ============================================================
     Tren tujuh hari
     ============================================================ */

  async muatTren() {
    const mulai = new Date();
    mulai.setDate(mulai.getDate() - 6);
    const dariTgl = new Intl.DateTimeFormat('en-CA', { timeZone: PRESENSI.ZONA }).format(mulai);

    const { data, error } = await SB
      .from('presensi')
      .select('tanggal, status')
      .gte('tanggal', dariTgl);

    if (error) throw error;

    const hitung = new Map();
    for (const r of data) {
      const h = hitung.get(r.tanggal) || { tepat: 0, telat: 0 };
      if (r.status === 'Tepat waktu') h.tepat++;
      else if (r.status === 'Terlambat') h.telat++;
      hitung.set(r.tanggal, h);
    }

    DB.tren = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const kunci = new Intl.DateTimeFormat('en-CA', { timeZone: PRESENSI.ZONA }).format(d);
      const h = hitung.get(kunci) || { tepat: 0, telat: 0 };
      DB.tren.push({
        tanggal: new Date(d), label: NAMA_HARI[d.getDay()].slice(0, 3),
        tepat: h.tepat, telat: h.telat,
      });
    }
    return DB.tren;
  },

  /* ============================================================
     Unit kerja
     ============================================================ */

  async muatUnit() {
    const { data, error } = await SB
      .from('unit_kerja')
      .select('id, nama, aktif')
      .eq('aktif', true)
      .order('nama');
    if (error) throw error;
    DB.unitServer = data;
    return data;
  },

  async tambahUnit(nama) {
    const { error } = await SB.from('unit_kerja').insert({ nama: nama.trim() });
    if (error) return { ok: false, pesan: pesanGalat(error) };
    await this.muatUnit();
    return { ok: true, pesan: `Unit "${nama}" ditambahkan.` };
  },

  async gantiNamaUnit(id, nama) {
    const { error } = await SB.from('unit_kerja').update({ nama: nama.trim() }).eq('id', id);
    if (error) return { ok: false, pesan: pesanGalat(error) };
    await this.muatUnit();
    await this.muatPegawai();
    return { ok: true, pesan: `Unit diganti menjadi "${nama}".` };
  },

  /* ============================================================
     Daftar putih pendaftaran
     ------------------------------------------------------------
     Inilah pintu masuk satu-satunya. Selama sebuah email belum ada di
     sini, orangnya tidak bisa membuat akun — walau tahu alamat Kompas.
     ============================================================ */

  async muatTerdaftar() {
    const { data, error } = await SB
      .from('pegawai_terdaftar')
      .select('id, email, nik, nama, jabatan, peran, sudah_daftar, unit_kerja(id, nama)')
      .order('nama');
    if (error) throw error;
    this.terdaftar = data.map(t => ({
      ...t,
      unit: t.unit_kerja?.nama || '—',
      unitId: t.unit_kerja?.id || null,
    }));
    return this.terdaftar;
  },

  async tambahTerdaftar({ email, nik, nama, jabatan, unitId, peran = 'pegawai' }) {
    const { error } = await SB.from('pegawai_terdaftar').insert({
      email: email.trim().toLowerCase(),
      nik: nik.trim(),
      nama: nama.trim(),
      jabatan: jabatan?.trim() || null,
      unit_id: unitId || null,
      peran,
    });
    if (error) return { ok: false, pesan: this.pesanTerdaftar(error) };
    await this.muatTerdaftar();
    return { ok: true, pesan: `${nama} didaftarkan. Beri tahu untuk mendaftar di Kompas.` };
  },

  async hapusTerdaftar(id) {
    const { error } = await SB.from('pegawai_terdaftar').delete().eq('id', id);
    if (error) return { ok: false, pesan: pesanGalat(error) };
    await this.muatTerdaftar();
    return { ok: true, pesan: 'Dihapus dari daftar.' };
  },

  /** Terjemahan galat khas tabel daftar putih. */
  pesanTerdaftar(e) {
    const t = String(e.message || e);
    if (/pegawai_terdaftar_email_key|duplicate.*email/i.test(t)) {
      return 'Email itu sudah ada di daftar.';
    }
    if (/pegawai_terdaftar_nik_key|duplicate.*nik/i.test(t)) {
      return 'NIK itu sudah dipakai orang lain di daftar.';
    }
    if (/pegawai_terdaftar_nik_check|nik ~/i.test(t)) {
      return 'NIK harus tepat 16 angka.';
    }
    if (/pegawai_terdaftar_email_check|position/i.test(t)) {
      return 'Alamat email tidak valid.';
    }
    return pesanGalat(e);
  },

  /* ============================================================
     Pengajuan izin & cuti
     ============================================================ */

  async muatPengajuan() {
    const { data, error } = await SB
      .from('pengajuan')
      /* Tabel pengajuan punya DUA kaitan ke pegawai: `pegawai_id` (yang
         mengajukan) dan `diputus_oleh` (yang menyetujui). Tanpa menyebut
         yang mana, server menolak dengan PGRST201 — "more than one
         relationship was found". Yang dimaksud di sini si pengaju. */
      .select('*, pegawai!pengajuan_pegawai_id_fkey(id, nama, nik, unit_kerja(nama))')
      .order('mulai', { ascending: false });
    if (error) throw error;

    this.pengajuan = data.map(p => ({
      id: p.id,
      pegawaiId: p.pegawai_id,
      nama: p.pegawai?.nama || '—',
      inisial: inisial(p.pegawai?.nama || '?'),
      unit: p.pegawai?.unit_kerja?.nama || '—',
      jenis: p.jenis,
      mulai: p.mulai,
      selesai: p.selesai,
      hari: p.hari,
      alasan: p.alasan,
      status: p.status,
      lampiran: p.lampiran,
      dibuat: p.dibuat?.slice(0, 10),
    }));

    // Tautan lampiran dibuatkan sekaligus, seperti foto bukti.
    const jalur = this.pengajuan.map(p => p.lampiran).filter(Boolean);
    if (jalur.length) {
      const { data: t, error: e2 } = await SB.storage
        .from(PRESENSI.BUCKET)
        .createSignedUrls(jalur, PRESENSI.UMUR_TAUTAN);
      if (!e2) {
        const peta = new Map(t.filter(x => x.signedUrl).map(x => [x.path, x.signedUrl]));
        this.pengajuan.forEach(p => { p.lampiranUrl = p.lampiran ? peta.get(p.lampiran) || null : null; });
      }
    }

    DB.simpanan.pengajuan = this.pengajuan;
    return this.pengajuan;
  },

  async putuskanPengajuan(id, status) {
    const { error } = await SB.from('pengajuan').update({ status }).eq('id', id);
    if (error) return { ok: false, pesan: pesanGalat(error) };
    await this.muatPengajuan();
    return { ok: true };
  },

  /* ============================================================
     Pengaturan kantor
     ============================================================ */

  async simpanKantor({ nama, alamat, lat, lng, radius }) {
    const { error } = await SB.from('pengaturan').update({
      kantor_nama: nama, kantor_alamat: alamat,
      kantor_lat: lat, kantor_lng: lng, radius,
      diubah: new Date().toISOString(),
    }).eq('id', 1);
    if (error) return { ok: false, pesan: pesanGalat(error) };
    await PRESENSI.muatPengaturan();
    return { ok: true, pesan: 'Titik kantor tersimpan. Seluruh perangkat ikut memakainya.' };
  },

  /* ============================================================
     Muat semuanya
     ============================================================ */

  async muat() {
    await PRESENSI.muatPengaturan();
    await this.muatUnit();
    await this.muatPegawai();
    await this.muatKehadiran();
    await this.muatTanggalBukti();
    await this.muatTren();
    await this.muatTerdaftar();
    await this.muatPengajuan();
    return this;
  },
};

/** Dipanggil gerbang admin setelah berhasil masuk. */
async function muatDataAdmin() {
  return SRV.muat();
}
