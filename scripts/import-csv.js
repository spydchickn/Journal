#!/usr/bin/env node
// Impor data dari spreadsheet lama (File > Download > CSV, satu file per sheet).
// Contoh: npm run import -- --catatan catatan.csv --riwayat riwayat.csv --tujuan tujuan.csv --kutipan kutipan.csv
// Tambahkan --dry-run untuk hanya memeriksa tanpa menulis. Aman dijalankan ulang: ID yang sama diperbarui, bukan digandakan.
const fs = require('fs');

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

function toObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => String(h).trim().toLowerCase());
  return rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { o[h] = r[i] == null ? '' : String(r[i]).trim(); }); return o; });
}

const OFFSET_MIN = Number(process.env.APP_TZ_OFFSET_MIN || 420); // WIB = UTC+7

// "26/11/2026 20:30", "26/11/2026", atau "2026-11-26 20:30" -> milidetik epoch (atau null)
function parseTgl(s) {
  s = String(s || '').trim(); if (!s) return null;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2})[.:](\d{2})(?::(\d{2}))?)?$/.exec(s), y, mo, d, h, mi, se;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0); }
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2})[.:](\d{2})(?::(\d{2}))?)?/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0); }
  else return null;
  return Date.UTC(y, mo - 1, d, h, mi, se) - OFFSET_MIN * 60000;
}
function parseYmd(s) { // "31/12/2026" -> "2026-12-31"
  s = String(s || '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${('0' + m[2]).slice(-2)}-${('0' + m[1]).slice(-2)}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

// Aturan tiap jenis data: baris valid, kolom, nilai, dan kunci pencocokan untuk baris tanpa ID
const KIND = {
  catatan: { prefix: 'J', ok: (r) => r['isi'], cols: ['tanggal', 'judul', 'isi', 'suasana', 'kategori', 'tag', 'diubah'], key: ['tanggal', 'isi'],
    vals: (r, now, tagNorm) => { const t = parseTgl(r['tanggal']) || now; return [t, r['judul'], r['isi'], r['suasana'], r['kategori'], tagNorm(r['tag']), parseTgl(r['diubah']) || t]; } },
  riwayat: { prefix: 'R', ok: (r) => r['tempat'] && r['tahun'], cols: ['tahun', 'jenjang', 'tempat', 'cerita', 'diubah'], key: ['tahun', 'tempat'],
    vals: (r, now) => [r['tahun'].replace(/\s+/g, ''), r['jenjang'], r['tempat'], r['cerita'], parseTgl(r['diubah']) || now] },
  tujuan: { prefix: 'T', ok: (r) => r['tujuan'], cols: ['tujuan', 'awal', 'target', 'status', 'tenggat', 'progres', 'catatan', 'dicapai', 'diubah'], key: ['tujuan', 'awal', 'target'],
    vals: (r, now) => {
      const status = ['Rencana', 'Berjalan', 'Tercapai'].includes(r['status']) ? r['status'] : 'Rencana';
      let pr = parseInt(String(r['progres']).replace('%', ''), 10); if (isNaN(pr)) pr = 0; pr = Math.max(0, Math.min(100, pr));
      if (status === 'Tercapai') pr = 100;
      return [r['tujuan'], r['titik awal'], r['target'], status, parseYmd(r['tenggat']), pr, r['catatan'], status === 'Tercapai' ? (parseTgl(r['dicapai']) || now) : null, parseTgl(r['diubah']) || now];
    } },
  kutipan: { prefix: 'K', ok: (r) => r['kutipan'], cols: ['kutipan', 'tokoh', 'sumber', 'tag', 'dibuat', 'diubah'], key: ['kutipan', 'tokoh'],
    vals: (r, now) => { const t = parseTgl(r['dibuat']) || now; return [r['kutipan'], r['tokoh'], r['sumber'], r['tag'], t, parseTgl(r['diubah']) || t]; } }
};
// Kolom yang dibandingkan untuk mengenali baris yang sama (nilai di sheet, bentuk akhir di database)
const KEYVAL = {
  catatan: (v) => [v[0], v[2]], riwayat: (v) => [v[0], v[2]], tujuan: (v) => [v[0], v[1], v[2]], kutipan: (v) => [v[0], v[1]]
};

// Menyusun perintah SQL. Baris ber-ID diperbarui (upsert); baris tanpa ID dibuatkan ID berikutnya
// di dalam SQL dan dilewati bila datanya sudah ada, sehingga impor aman diulang.
function plan(kind, rows, tagNorm) {
  const K = KIND[kind], now = Date.now();
  const ph = K.cols.map(() => '?').join(', ');
  const withId = [], noId = [], skipped = [];
  rows.forEach((r, i) => {
    if (!K.ok(r)) return skipped.push(i + 2);
    const vals = K.vals(r, now, tagNorm);
    if (r['id']) {
      withId.push({ sql: `INSERT INTO ${kind} (id, ${K.cols.join(', ')}) VALUES (?, ${ph})
        ON CONFLICT(id) DO UPDATE SET ${K.cols.map((c) => `${c} = excluded.${c}`).join(', ')}`, args: [r['id'], ...vals] });
    } else {
      const kv = KEYVAL[kind](vals);
      noId.push({ sql: `INSERT INTO ${kind} (id, ${K.cols.join(', ')})
        SELECT '${K.prefix}-' || printf('%04d', COALESCE((SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) FROM ${kind}), 0) + 1), ${ph}
        WHERE NOT EXISTS (SELECT 1 FROM ${kind} WHERE ${K.key.map((c) => `${c} = ?`).join(' AND ')})`, args: [...vals, ...kv] });
    }
  });
  return { statements: [...withId, ...noId], skipped }; // ber-ID dulu agar nomor baru melanjutkan yang terbesar
}

async function main() {
  require('dotenv').config();
  const { getDb, ready } = require('../src/db');
  const { tagNorm } = require('../src/handlers');
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const files = {};
  for (let i = 0; i < argv.length; i++) if (/^--(catatan|riwayat|tujuan|kutipan)$/.test(argv[i])) files[argv[i].slice(2)] = argv[++i];
  if (!Object.keys(files).length) {
    console.log('Pemakaian: npm run import -- --catatan catatan.csv --riwayat riwayat.csv --tujuan tujuan.csv --kutipan kutipan.csv [--dry-run]');
    process.exit(1);
  }
  await ready();
  for (const kind of ['catatan', 'riwayat', 'tujuan', 'kutipan']) {
    if (!files[kind]) continue;
    const { statements, skipped } = plan(kind, toObjects(fs.readFileSync(files[kind], 'utf8')), tagNorm);
    console.log(`${kind}: ${statements.length} baris siap${skipped.length ? `, ${skipped.length} dilewati (baris kosong/tidak lengkap: ${skipped.slice(0, 10).join(', ')})` : ''}`);
    if (!dry && statements.length) await getDb().batch(statements, 'write');
  }
  console.log(dry ? 'Uji coba selesai (tidak ada data yang ditulis).' : 'Impor selesai.');
}

module.exports = { parseCsv, toObjects, parseTgl, parseYmd, plan };
if (require.main === module) main().catch((e) => { console.error('Gagal:', e.message); process.exit(1); });
