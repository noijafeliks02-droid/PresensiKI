/* ============================================================
   Kompas — Presensi di server
   ------------------------------------------------------------
   Menggantikan penyimpanan di HP. Yang berubah bukan sekadar tempat
   datanya, melainkan siapa yang menentukan isinya:

     Jam absen ditetapkan server, bukan jam HP. Mengubah jam di
     pengaturan HP tidak lagi mengubah jam masuk.

     Status "Tepat waktu / Terlambat" dihitung server dari jam server
     dan batas shift di tabel pengaturan. Aplikasi tidak mengirim
     status sama sekali — kalau dikirim pun akan ditimpa.

     Bukti yang sudah tercatat tidak bisa ditimpa. Pemicu di basis data
     menolak perubahan pada jam dan foto yang sudah terisi, kecuali oleh
     admin.

   Bentuk data yang dikembalikan sengaja dibuat sama persis dengan
   bentuk lama di localStorage, supaya seluruh kode layar tidak perlu
   diubah — hanya sumbernya yang berganti.
   ============================================================ */

const PRESENSI = {
  BUCKET: 'bukti',

  /** Berapa lama tautan foto berlaku (detik). */
  UMUR_TAUTAN: 3600,

  hariIni: null,
  riwayat: [],

  /* ============================================================
     Pengaturan kantor & shift
     ============================================================ */

  /**
   * Ambil titik kantor dan jam kerja dari server.
   *
   * Hasilnya ditulis ke DB.simpanan.kantor supaya seluruh kode yang
   * sudah ada — peta, perhitungan jarak, layar verifikasi lokasi —
   * tetap membacanya dari tempat yang sama seperti sebelumnya.
   *
   * Sekali disetel admin, seluruh perangkat ikut. Tautan pengaturan
   * antar perangkat yang dulu dipakai jadi tidak diperlukan lagi.
   */
  async muatPengaturan() {
    const { data, error } = await SB
      .from('pengaturan')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return false;

    DB.simpanan.kantor = {
      nama: data.kantor_nama,
      alamat: data.kantor_alamat || '',
      lat: data.kantor_lat,
      lng: data.kantor_lng,
      radius: data.radius,
    };
    SHIFT.masuk = (data.jam_masuk || '07:30').slice(0, 5);
    SHIFT.batasTerlambat = (data.batas_terlambat || '08:00').slice(0, 5);
    SHIFT.pulang = (data.jam_pulang || '16:00').slice(0, 5);
    this.akurasiMaks = data.akurasi_maks || AKURASI_MAKS;
    return true;
  },

  /* ============================================================
     Membaca presensi
     ============================================================ */

  /* ============================================================
     Waktu selalu ditampilkan dalam WIT
     ------------------------------------------------------------
     Catatan presensi adalah dokumen kepegawaian: jam yang sama harus
     terbaca sama di perangkat mana pun. Kalau dipakai jam lokal HP,
     pegawai yang HP-nya masih tersetel WIB akan melihat absennya
     mundur dua jam dari yang tercatat di server — dan mengira sistemnya
     salah, padahal HP-nya yang beda zona.

     Server menghitung batas terlambat memakai Asia/Jayapura. Tampilan
     di sini mengikuti zona yang sama supaya tidak pernah berselisih.
     ============================================================ */
  ZONA: 'Asia/Jayapura',

  /** Tanggal hari ini menurut WIT, sama dengan yang dipakai server. */
  tanggalServer() {
    // en-CA menghasilkan format YYYY-MM-DD, sama dengan kunciTanggal().
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.ZONA }).format(new Date());
  },

  /** Jam WIT dari cap waktu server, bentuk HH:MM. */
  jamWit(t) {
    if (!t) return null;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: this.ZONA, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(t));
  },

  async muatHariIni() {
    if (!AKUN.profil) { this.hariIni = null; return null; }
    const { data, error } = await SB
      .from('presensi')
      .select('*')
      .eq('pegawai_id', AKUN.profil.id)
      .eq('tanggal', this.tanggalServer())
      .maybeSingle();

    if (error) { this.hariIni = null; return null; }
    this.hariIni = data ? await this.keBentukLama(data, true) : null;
    return this.hariIni;
  },

  /**
   * Riwayat presensi pemilik akun.
   * Fotonya sengaja tidak diambilkan tautan di sini — daftar riwayat
   * hanya menampilkan jam dan status, dan membuat puluhan tautan
   * bertanda tangan sekaligus hanya memperlambat tanpa gunanya.
   */
  async muatRiwayat(batas = 120) {
    if (!AKUN.profil) { this.riwayat = []; return []; }
    const { data, error } = await SB
      .from('presensi')
      .select('*')
      .eq('pegawai_id', AKUN.profil.id)
      .order('tanggal', { ascending: false })
      .limit(batas);

    if (error) { this.riwayat = []; return []; }
    this.riwayat = await Promise.all(data.map(r => this.keBentukLama(r, false)));
    return this.riwayat;
  },

  /**
   * Ubah baris server jadi bentuk yang sudah dikenal kode layar.
   * `denganFoto` menentukan apakah tautan bertanda tangan ikut dibuatkan.
   */
  async keBentukLama(r, denganFoto) {
    const jam = t => this.jamWit(t);
    return {
      tanggal: r.tanggal,
      jamMasuk: jam(r.jam_masuk) || '—',
      jamKeluar: jam(r.jam_keluar),
      status: r.status,
      selfie: denganFoto ? await this.tautanFoto(r.foto_masuk) : null,
      verifikasi: r.verifikasi_masuk,
      lat: r.lat_masuk, lng: r.lng_masuk,
      akurasi: r.akurasi_masuk, jarak: r.jarak_masuk,

      selfieKeluar: denganFoto ? await this.tautanFoto(r.foto_keluar) : null,
      verifikasiKeluar: r.verifikasi_keluar,
      latKeluar: r.lat_keluar, lngKeluar: r.lng_keluar,
      akurasiKeluar: r.akurasi_keluar, jarakKeluar: r.jarak_keluar,
    };
  },

  /* ============================================================
     Foto bukti
     ============================================================ */

  /**
   * Tautan sementara untuk menampilkan foto.
   *
   * Bucket-nya privat, jadi fotonya tidak punya alamat tetap yang bisa
   * dibuka siapa saja. Tautan ini bertanda tangan dan kedaluwarsa
   * sendiri setelah sejam.
   */
  async tautanFoto(jalur) {
    if (!jalur) return null;
    const { data, error } = await SB.storage
      .from(this.BUCKET)
      .createSignedUrl(jalur, this.UMUR_TAUTAN);
    return error ? null : data.signedUrl;
  },

  /** Ubah hasil tangkapFoto() (data URL) jadi Blob untuk diunggah. */
  keBlob(dataUrl) {
    const [kepala, isi] = dataUrl.split(',');
    const tipe = kepala.match(/:(.*?);/)[1];
    const biner = atob(isi);
    const buf = new Uint8Array(biner.length);
    for (let i = 0; i < biner.length; i++) buf[i] = biner.charCodeAt(i);
    return new Blob([buf], { type: tipe });
  },

  /**
   * Unggah foto ke folder milik pegawai sendiri.
   *
   * Nama berkasnya memakai cap waktu, bukan tanggal saja, supaya dua
   * unggahan tidak pernah bertabrakan. Kebijakan Storage menolak
   * penimpaan, jadi nama yang berulang akan gagal — bukan menimpa.
   *
   * Kegagalan di sini TIDAK membatalkan presensi. Jam, lokasi, dan
   * hasil verifikasi tetap tercatat; yang hilang hanya fotonya, dan
   * pegawai diberi tahu. Menolak presensi hanya karena foto gagal
   * terkirim berarti menghukum orang atas sinyal yang buruk.
   */
  async unggahFoto(dataUrl, tahap) {
    if (!dataUrl || !AKUN.profil) return null;
    const jalur = `${AKUN.profil.id}/${this.tanggalServer()}-${tahap}-${Date.now()}.jpg`;
    const { error } = await SB.storage
      .from(this.BUCKET)
      .upload(jalur, this.keBlob(dataUrl), { contentType: 'image/jpeg', upsert: false });
    return error ? null : jalur;
  },

  /* ============================================================
     Menulis presensi
     ------------------------------------------------------------
     Perhatikan yang TIDAK dikirim: jam dan status. Keduanya ditetapkan
     server. `jam_masuk: new Date()` di bawah hanya penanda "isi kolom
     ini" — nilainya langsung ditimpa waktu server oleh pemicu.
     ============================================================ */

  async checkIn({ foto, verifikasi, lat, lng, akurasi, jarak }) {
    if (!AKUN.profil) return { ok: false, pesan: 'Anda belum masuk.' };

    const jalur = await this.unggahFoto(foto, 'masuk');

    const { data, error } = await SB
      .from('presensi')
      .insert({
        pegawai_id: AKUN.profil.id,
        jam_masuk: new Date().toISOString(),   // ditimpa waktu server
        foto_masuk: jalur,
        verifikasi_masuk: verifikasi,
        lat_masuk: lat, lng_masuk: lng,
        akurasi_masuk: akurasi, jarak_masuk: jarak,
      })
      .select()
      .single();

    if (error) return { ok: false, pesan: pesanGalat(error) };

    this.hariIni = await this.keBentukLama(data, true);
    return {
      ok: true,
      fotoGagal: !!foto && !jalur,
      pesan: `Presensi masuk tercatat pukul ${jamTampil(this.hariIni.jamMasuk)}.`,
    };
  },

  async checkOut({ foto, verifikasi, lat, lng, akurasi, jarak }) {
    if (!AKUN.profil) return { ok: false, pesan: 'Anda belum masuk.' };
    if (!this.hariIni) return { ok: false, pesan: 'Belum ada presensi masuk hari ini.' };

    const jalur = await this.unggahFoto(foto, 'keluar');

    const { data, error } = await SB
      .from('presensi')
      .update({
        jam_keluar: new Date().toISOString(),  // ditimpa waktu server
        foto_keluar: jalur,
        verifikasi_keluar: verifikasi,
        lat_keluar: lat, lng_keluar: lng,
        akurasi_keluar: akurasi, jarak_keluar: jarak,
      })
      .eq('pegawai_id', AKUN.profil.id)
      .eq('tanggal', this.tanggalServer())
      .select()
      .single();

    if (error) return { ok: false, pesan: pesanGalat(error) };

    this.hariIni = await this.keBentukLama(data, true);
    return {
      ok: true,
      fotoGagal: !!foto && !jalur,
      pesan: `Presensi pulang tercatat pukul ${jamTampil(this.hariIni.jamKeluar)}.`,
    };
  },

  /* ============================================================
     Pengajuan izin & cuti
     ------------------------------------------------------------
     Dulu tersimpan di localStorage, sementara panel admin membacanya
     dari server — pengajuan pegawai tidak pernah sampai ke siapa pun,
     padahal aplikasi menjawab "Pengajuan terkirim ke atasan".
     ============================================================ */

  async muatPengajuanSaya() {
    if (!AKUN.profil) { DB.simpanan.pengajuan = []; return []; }
    const { data, error } = await SB
      .from('pengajuan')
      .select('*')
      .eq('pegawai_id', AKUN.profil.id)
      .order('mulai', { ascending: false });

    if (error) { DB.simpanan.pengajuan = []; return []; }

    DB.simpanan.pengajuan = data.map(p => ({
      id: p.id,
      pegawaiId: p.pegawai_id,
      nama: AKUN.profil.nama,
      inisial: AKUN.profil.inisial,
      unit: AKUN.profil.unit,
      jenis: p.jenis,
      mulai: p.mulai,
      selesai: p.selesai,
      hari: p.hari,
      alasan: p.alasan,
      status: p.status,
      catatanAdmin: p.catatan_admin,
      dibuat: p.dibuat?.slice(0, 10),
    }));
    return DB.simpanan.pengajuan;
  },

  /**
   * Kirim pengajuan baru.
   *
   * Statusnya tidak dikirim — kebijakan server hanya menerima
   * 'Menunggu', jadi tidak ada cara mengajukan cuti yang langsung
   * berstatus disetujui.
   */
  async kirimPengajuan({ jenis, mulai, selesai, hari, alasan }) {
    if (!AKUN.profil) return { ok: false, pesan: 'Anda belum masuk.' };

    const { error } = await SB.from('pengajuan').insert({
      pegawai_id: AKUN.profil.id,
      jenis, mulai, selesai, hari,
      alasan: alasan.trim(),
      status: 'Menunggu',
    });
    if (error) return { ok: false, pesan: pesanGalat(error) };

    await this.muatPengajuanSaya();
    return { ok: true, pesan: 'Pengajuan terkirim ke atasan.' };
  },

  /** Tarik kembali pengajuan yang belum diputus. */
  async tarikPengajuan(id) {
    const { error } = await SB.from('pengajuan').delete().eq('id', id);
    if (error) return { ok: false, pesan: pesanGalat(error) };
    await this.muatPengajuanSaya();
    return { ok: true, pesan: 'Pengajuan ditarik.' };
  },

  /* ============================================================
     Muat semuanya sekaligus
     ============================================================ */

  async muat() {
    await this.muatPengaturan();
    await this.muatHariIni();
    await this.muatRiwayat();
    await this.muatPengajuanSaya();

    // Presensi hari ini ditaruh di tempat lama supaya seluruh kode
    // layar membacanya seperti sebelumnya.
    DB.simpanan.presensi = this.hariIni;
    return this;
  },
};
