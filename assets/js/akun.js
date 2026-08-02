/* ============================================================
   Kompas — Akun pegawai
   ------------------------------------------------------------
   Masuk memakai EMAIL, bukan NIK.

   Supabase Auth dibangun di atas email, dan itulah yang membuat
   "Lupa kata sandi?" benar-benar berfungsi: servernya sendiri yang
   mengirim tautan setel ulang. Kalau NIK yang dipakai masuk, tombol
   itu tidak punya alamat tujuan dan setiap pegawai yang lupa sandi
   harus mengganggu admin.

   NIK tetap ada sebagai identitas kepegawaian — dibaca dari tabel
   `pegawai` setelah masuk, bukan diketik saat login.
   ============================================================ */

const AKUN = {
  /** Sesi Supabase yang sedang berjalan, atau null bila belum masuk. */
  sesi: null,

  /** Baris `pegawai` milik pemilik sesi, atau null. */
  profil: null,

  /** Diisi saat pengguna membuka tautan setel ulang sandi dari email. */
  modePulihkanSandi: false,

  masuk_() { return !!this.sesi && !!this.profil; },

  /* ============================================================
     Memuat keadaan
     ============================================================ */

  /**
   * Baca sesi yang tersimpan, lalu ambil profilnya dari server.
   *
   * Profil TIDAK disimpan di perangkat. Nama, NIK, jabatan, dan unit
   * selalu diambil dari server supaya perubahan yang dilakukan admin
   * langsung terlihat, dan supaya data pegawai tidak tertinggal di HP
   * setelah orangnya keluar.
   */
  async muat() {
    const { data } = await SB.auth.getSession();
    this.sesi = data?.session || null;
    this.profil = this.sesi ? await this.ambilProfil() : null;

    // Sesi ada tetapi profilnya tidak terbaca berarti akunnya sudah
    // dinonaktifkan atau dihapus admin. Sesi basi itu dibuang, kalau
    // tidak aplikasi akan menampilkan layar utama tanpa identitas.
    if (this.sesi && !this.profil) {
      await SB.auth.signOut();
      this.sesi = null;
    }
    return this;
  },

  /** Ambil baris pegawai milik pengguna yang sedang masuk. */
  async ambilProfil() {
    const { data, error } = await SB
      .from('pegawai')
      .select('id, email, nik, nama, jabatan, peran, aktif, cuti_kuota, unit_kerja(nama)')
      .eq('id', this.sesi.user.id)
      .maybeSingle();

    if (error || !data || !data.aktif) return null;

    return {
      id: data.id,
      email: data.email,
      nik: data.nik,
      nama: data.nama,
      jabatan: data.jabatan || '—',
      unit: data.unit_kerja?.nama || '—',
      peran: data.peran,
      aktif: data.aktif,
      cutiKuota: data.cuti_kuota,
      inisial: inisial(data.nama),
    };
  },

  /* ============================================================
     Masuk, daftar, keluar
     ------------------------------------------------------------
     Semuanya mengembalikan { ok, pesan } — tidak pernah melempar,
     supaya pemanggilnya cukup menampilkan `pesan` apa adanya.
     ============================================================ */

  async masuk(email, sandi) {
    const { error } = await SB.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: sandi,
    });
    if (error) return { ok: false, pesan: pesanGalat(error) };

    await this.muat();
    if (!this.masuk_()) {
      return { ok: false, pesan: 'Akun Anda belum aktif. Hubungi admin kepegawaian.' };
    }
    return { ok: true, pesan: `Selamat datang, ${this.profil.nama}.` };
  },

  /**
   * Daftar akun baru.
   *
   * Yang menentukan boleh atau tidaknya bukan aplikasi ini, melainkan
   * daftar putih di server: emailnya harus sudah dimasukkan admin lebih
   * dulu. Pemeriksaannya sengaja TIDAK dilakukan di sini — kalau aplikasi
   * boleh menanyakan "apakah email ini terdaftar?", siapa pun bisa
   * menebak-nebak siapa saja yang bekerja di kantor ini.
   */
  async daftar(email, sandi) {
    const { data, error } = await SB.auth.signUp({
      email: email.trim().toLowerCase(),
      password: sandi,
    });
    if (error) return { ok: false, pesan: pesanGalat(error) };

    // Bila konfirmasi email diaktifkan di Supabase, sesi belum terbit
    // sampai tautannya diklik. Keduanya ditangani.
    if (!data.session) {
      return {
        ok: true, perluKonfirmasi: true,
        pesan: 'Akun dibuat. Buka email Anda dan klik tautan konfirmasinya.',
      };
    }

    await this.muat();
    if (!this.masuk_()) {
      return { ok: false, pesan: 'Akun dibuat, tetapi profilnya belum terbaca. Hubungi admin.' };
    }
    return { ok: true, pesan: `Akun dibuat. Selamat datang, ${this.profil.nama}.` };
  },

  async keluar() {
    await SB.auth.signOut();
    this.sesi = null;
    this.profil = null;
  },

  /* ============================================================
     Lupa kata sandi
     ============================================================ */

  /**
   * Alamat tujuan tautan setel ulang.
   * Dibangun dari alamat halaman yang sedang dibuka supaya sama-sama
   * benar saat diuji di localhost maupun setelah terbit di GitHub Pages.
   */
  alamatPulihkan() {
    return location.origin + location.pathname;
  },

  async lupaSandi(email) {
    const { error } = await SB.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: this.alamatPulihkan() },
    );
    if (error) return { ok: false, pesan: pesanGalat(error) };

    // Jawabannya sengaja sama untuk email yang terdaftar maupun tidak.
    // Kalau dibedakan, orang luar bisa memakai layar ini untuk memeriksa
    // siapa saja yang punya akun di sini.
    return {
      ok: true,
      pesan: 'Bila email itu terdaftar, tautan setel ulang sudah dikirim. Periksa kotak masuk.',
    };
  },

  async gantiSandi(sandiBaru) {
    const { error } = await SB.auth.updateUser({ password: sandiBaru });
    if (error) return { ok: false, pesan: pesanGalat(error) };

    this.modePulihkanSandi = false;
    await this.muat();
    return { ok: true, pesan: 'Kata sandi berhasil diganti.' };
  },
};

/* ============================================================
   Tautan setel ulang dari email
   ------------------------------------------------------------
   Membuka tautan itu membuat Supabase menerbitkan sesi sementara dan
   memancarkan peristiwa PASSWORD_RECOVERY. Sesi itu hanya cukup untuk
   mengganti sandi. Penanda di bawah dipakai aplikasi untuk menampilkan
   layar "Buat kata sandi baru" alih-alih langsung masuk ke beranda.
   ============================================================ */

SB.auth.onAuthStateChange((peristiwa) => {
  if (peristiwa === 'PASSWORD_RECOVERY') {
    AKUN.modePulihkanSandi = true;
    if (typeof pindah === 'function') pindah('sandiBaru');
  }
});
