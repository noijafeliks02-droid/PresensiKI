/* ============================================================
   Kompas — Sambungan ke Supabase
   ------------------------------------------------------------
   Berkas ini hanya membuat sambungan dan menerjemahkan galat.
   Seluruh pembacaan dan penulisan data ada di data.js.

   Pustakanya (assets/js/vendor/supabase.js) disimpan di dalam
   proyek, bukan dipanggil dari CDN. Kalau layanan CDN sedang
   bermasalah, aplikasi presensi tidak ikut mati.
   ============================================================ */

/* ---------- Alamat & kunci ----------
   Kunci di bawah SENGAJA terlihat. Ini kunci `publishable`, yang
   memang dirancang tertanam di aplikasi dan pasti terbaca siapa pun
   yang membuka kode sumber halaman — Kompas adalah berkas statis,
   tidak ada tempat menyembunyikan apa pun di dalamnya.

   Yang menahan penyusup bukan kerahasiaan kunci ini, melainkan
   kebijakan Row Level Security di server. Sudah diuji dari luar
   memakai kunci ini juga: seluruh tabel terbaca kosong, dan setiap
   percobaan menulis dijawab HTTP 401.

   Yang TIDAK BOLEH ada di sini adalah kunci `sb_secret_...`.
   Kunci itu melewati seluruh kebijakan di atas. Menaruhnya di berkas
   ini sama dengan menyerahkan seluruh data presensi ke publik. */
const SUPABASE_URL = 'https://cglhnnjuyweudxiwzjof.supabase.co';
const SUPABASE_KUNCI = 'sb_publishable_eurrh82Lh6tLaY1PPmhp6g_sJ7qimEW';

const SB = supabase.createClient(SUPABASE_URL, SUPABASE_KUNCI, {
  auth: {
    persistSession: true,      // tetap masuk setelah HP ditutup
    autoRefreshToken: true,
    detectSessionInUrl: true,  // dibutuhkan tautan "Lupa kata sandi?"
    flowType: 'pkce',
  },
});

/* ============================================================
   Terjemahan galat
   ------------------------------------------------------------
   Supabase menjawab dalam bahasa Inggris dan sering menyebut istilah
   basis data. "Database error saving new user" tidak berarti apa pun
   bagi pegawai yang sedang mencoba mendaftar — padahal artinya cuma
   emailnya belum didaftarkan admin.
   ============================================================ */

const GALAT = [
  // Pendaftaran ditolak daftar putih. Pesan aslinya menyebut "Database
  // error" karena penolakan terjadi di dalam pemicu basis data.
  [/database error saving new user|belum didaftarkan/i,
    'Email Anda belum didaftarkan oleh admin. Hubungi bagian kepegawaian.'],
  [/sudah pernah dipakai mendaftar|user already registered|already been registered/i,
    'Email ini sudah pernah dipakai mendaftar. Silakan masuk, atau pakai "Lupa kata sandi?".'],

  [/invalid login credentials/i, 'Email atau kata sandi salah.'],
  [/email not confirmed/i, 'Email Anda belum dikonfirmasi. Periksa kotak masuk.'],
  [/password should be at least (\d+)/i, 'Kata sandi minimal $1 karakter.'],
  [/for security purposes.*(\d+) seconds/i, 'Terlalu sering mencoba. Tunggu $1 detik lagi.'],
  [/email rate limit exceeded|over_email_send_rate_limit/i,
    'Terlalu banyak email terkirim. Coba lagi beberapa menit lagi.'],
  [/invalid.*email/i, 'Alamat email tidak valid.'],
  [/new password should be different/i, 'Kata sandi baru harus berbeda dari yang lama.'],

  // Kegagalan kebijakan keamanan. Pegawai tidak perlu tahu istilah RLS.
  [/row-level security|violates row-level/i,
    'Anda tidak berhak melakukan tindakan ini.'],
  [/duplicate key.*presensi_pegawai_id_tanggal/i,
    'Anda sudah melakukan presensi hari ini.'],
  [/sudah tercatat dan tidak dapat diubah/i,
    'Presensi hari ini sudah terkunci dan tidak dapat diubah.'],

  [/failed to fetch|network|networkerror/i,
    'Tidak dapat menghubungi server. Periksa sambungan internet Anda.'],
  [/jwt expired|invalid jwt|session.*expired/i,
    'Sesi Anda berakhir. Silakan masuk kembali.'],
];

/**
 * Ubah galat Supabase jadi kalimat yang bisa dibaca pegawai.
 * Galat yang tidak dikenali dikembalikan apa adanya — lebih baik
 * pesan asing yang bisa disalin ke saya daripada "Terjadi kesalahan"
 * yang tidak memberi petunjuk apa pun.
 */
function pesanGalat(e) {
  if (!e) return 'Terjadi kesalahan yang tidak diketahui.';
  const teks = String(e.message || e.error_description || e.msg || e);

  for (const [pola, ganti] of GALAT) {
    const cocok = teks.match(pola);
    if (cocok) return ganti.replace(/\$(\d)/g, (_, n) => cocok[n] ?? '');
  }
  return teks;
}

/* ============================================================
   Keadaan sambungan
   ============================================================ */

/**
 * Apakah server bisa dihubungi?
 *
 * Memakai tabel `pengaturan` karena isinya hanya satu baris — panggilan
 * paling murah yang tetap membuktikan alamat, kunci, dan kebijakan
 * keamanannya bekerja. Tanpa login hasilnya kosong, dan itu tetap
 * dihitung tersambung: yang diuji sambungannya, bukan haknya.
 */
async function ujiSambungan() {
  try {
    const { error } = await SB.from('pengaturan').select('id').limit(1);
    if (error) return { ok: false, pesan: pesanGalat(error) };
    return { ok: true, pesan: 'Tersambung ke server.' };
  } catch (e) {
    return { ok: false, pesan: pesanGalat(e) };
  }
}

/** Sesi yang sedang berjalan, atau null bila belum masuk. */
async function sesiKini() {
  const { data } = await SB.auth.getSession();
  return data?.session || null;
}
