// Koneksi database. Lokal: file SQLite (data/jurnal.db). Produksi: Turso (libSQL) lewat variabel lingkungan.
const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const MOODS = ['Tenang', 'Senang', 'Semangat', 'Bersyukur', 'Biasa saja', 'Capek', 'Bingung', 'Cemas', 'Sedih', 'Kesal', 'Rindu', 'Penuh harap'];
const JENJANG = ['TK', 'SD', 'SMP', 'SMA/SMK', 'Kuliah', 'Kursus/Pelatihan', 'Pekerjaan', 'Momen penting'];
const KATEGORI = [
  ['Posisi saat ini', 'Kondisi, perasaan, dan situasi hari ini'],
  ['Pendidikan', 'Perjalanan sekolah dan pendidikan'],
  ['Tujuan', 'Apa yang ingin dicapai ke depan'],
  ['Proses', 'Bagaimana menjalani proses saat ini'],
  ['Refleksi', 'Perenungan kondisi dan perasaan'],
  ['Pertumbuhan', 'Perkembangan diri dari titik awal ke tujuan'],
  ['Memoar', 'Cerita dan kenangan']
];
const STATUS = ['Rencana', 'Berjalan', 'Tercapai'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS catatan (
    id TEXT PRIMARY KEY, tanggal INTEGER NOT NULL, judul TEXT NOT NULL DEFAULT '', isi TEXT NOT NULL,
    suasana TEXT NOT NULL DEFAULT '', kategori TEXT NOT NULL DEFAULT '', tag TEXT NOT NULL DEFAULT '', diubah INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_catatan_tanggal ON catatan(tanggal DESC)`,
  `CREATE TABLE IF NOT EXISTS riwayat (
    id TEXT PRIMARY KEY, tahun TEXT NOT NULL, jenjang TEXT NOT NULL DEFAULT '', tempat TEXT NOT NULL,
    cerita TEXT NOT NULL DEFAULT '', diubah INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tujuan (
    id TEXT PRIMARY KEY, tujuan TEXT NOT NULL, awal TEXT NOT NULL DEFAULT '', target TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Rencana', tenggat TEXT NOT NULL DEFAULT '', progres INTEGER NOT NULL DEFAULT 0,
    catatan TEXT NOT NULL DEFAULT '', dicapai INTEGER, diubah INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS kutipan (
    id TEXT PRIMARY KEY, kutipan TEXT NOT NULL, tokoh TEXT NOT NULL DEFAULT '', sumber TEXT NOT NULL DEFAULT '',
    tag TEXT NOT NULL DEFAULT '', dibuat INTEGER NOT NULL, diubah INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS referensi (
    jenis TEXT NOT NULL, nilai TEXT NOT NULL, ket TEXT NOT NULL DEFAULT '', urut INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (jenis, nilai))`,
  `CREATE TABLE IF NOT EXISTS pengaturan (kunci TEXT PRIMARY KEY, nilai TEXT NOT NULL)`
];

let client = null;
let readyPromise = null;

function getDb() {
  if (client) return client;
  let url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      throw new Error('TURSO_DATABASE_URL belum diatur.');
    }
    const dir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    url = 'file:' + path.join(dir, 'jurnal.db').replace(/\\/g, '/');
  }
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  return client;
}

async function init() {
  const db = getDb();
  await db.batch(SCHEMA, 'write');
  const c = await db.execute('SELECT COUNT(*) AS n FROM referensi');
  if (Number(c.rows[0].n) === 0) {
    const seed = [];
    const add = (jenis, nilai, ket, urut) =>
      seed.push({ sql: 'INSERT OR IGNORE INTO referensi (jenis, nilai, ket, urut) VALUES (?, ?, ?, ?)', args: [jenis, nilai, ket || '', urut] });
    MOODS.forEach((m, i) => add('suasana', m, '', i));
    JENJANG.forEach((j, i) => add('jenjang', j, '', i));
    KATEGORI.forEach((k, i) => add('kategori', k[0], k[1], i));
    STATUS.forEach((s, i) => add('status', s, '', i));
    await db.batch(seed, 'write');
  }
}

// Menyiapkan tabel sekali per proses (aman dipanggil berulang)
function ready() {
  if (!readyPromise) readyPromise = init().catch((e) => { readyPromise = null; throw e; });
  return readyPromise;
}

async function all(sql, args) {
  const r = await getDb().execute({ sql, args: args || [] });
  return r.rows;
}

async function run(sql, args) {
  return getDb().execute({ sql, args: args || [] });
}

function closeDb() {
  if (client) { client.close(); client = null; }
  readyPromise = null;
}

module.exports = { getDb, ready, all, run, closeDb, MOODS, JENJANG, KATEGORI, STATUS };
