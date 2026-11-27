const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseCsv, parseTgl, parseYmd, toObjects } = require('../scripts/import-csv');

test('parser CSV: kutip, koma, baris baru, CRLF, BOM', () => {
  const rows = parseCsv('\uFEFFa,b,c\r\n1,"x, y","baris1\nbaris2 ""kutip"""\r\n\r\n3,,\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x, y', 'baris1\nbaris2 "kutip"'], ['3', '', '']]);
});

test('tanggal dibaca sebagai WIB (UTC+7)', () => {
  assert.equal(new Date(parseTgl('26/11/2026 20:30')).toISOString(), '2026-11-26T13:30:00.000Z');
  assert.equal(new Date(parseTgl('2026-11-26 20:30')).toISOString(), '2026-11-26T13:30:00.000Z');
  assert.equal(new Date(parseTgl('01/01/2027')).toISOString(), '2026-12-31T17:00:00.000Z');
  assert.equal(parseTgl('bukan tanggal'), null);
  assert.equal(parseYmd('05/03/2027'), '2027-03-05');
});

test('impor CSV: data masuk, ID dipertahankan, aman diulang', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
  const w = (n, t) => { fs.writeFileSync(path.join(dir, n), t); return path.join(dir, n); };
  const catatan = w('catatan.csv', [
    'ID,Tanggal,Judul,Isi,Suasana,Kategori,Tag,Diubah',
    'J-0001,24/11/2026 20:30,Hari pertama,"Menulis, lalu ""berhenti""\nbaris dua",Penuh harap,Refleksi,"Awal, Harapan, awal",24/11/2026 20:31',
    ',25/11/2026 08:00,,Tanpa ID,Tenang,,,',
    'J-0005,,,,,,,',          // isi kosong -> dilewati
    ''
  ].join('\n'));
  const riwayat = w('riwayat.csv', 'ID,Tahun,Jenjang,Tempat,Cerita,Diubah\nR-0001,2013-2014,TK,TK Negeri 2 Liwa,,\n,2023-2026,SMA/SMK,SMK Negeri 1 Liwa,Kelas favorit,\n');
  const tujuan = w('tujuan.csv', 'ID,Tujuan,Titik awal,Target,Status,Tenggat,Progres,Catatan,Dicapai,Diubah\nT-0001,Lulus kuliah,SMK,S1,Berjalan,31/12/2027,40%,,,\n,Rajin olahraga,,,Tercapai,,70%,,10/11/2026,\n');
  const kutipan = w('kutipan.csv', 'ID,Kutipan,Tokoh,Sumber,Tag,Dibuat,Diubah\nK-0001,Satu langkah kecil,Seseorang,Buku,x,20/11/2026 10:00,\n');
  const db = 'file:' + path.join(dir, 'uji.db');
  const env = { ...process.env, TURSO_DATABASE_URL: db, TURSO_AUTH_TOKEN: '' };
  const run = (...extra) => execFileSync('node', ['scripts/import-csv.js', '--catatan', catatan, '--riwayat', riwayat, '--tujuan', tujuan, '--kutipan', kutipan, ...extra], { env, encoding: 'utf8' });

  assert.match(run('--dry-run'), /Uji coba selesai/);
  const out = run();
  assert.match(out, /catatan: 2 baris siap, 1 dilewati/);
  run(); // ulangi: tidak menggandakan
  const q = (sql) => execFileSync('node', ['-e', `const {createClient}=require('@libsql/client');createClient({url:${JSON.stringify(db)}}).execute(${JSON.stringify(sql)}).then(r=>console.log(JSON.stringify(r.rows)))`], { encoding: 'utf8' });
  const rows = (sql) => JSON.parse(q(sql));
  const notes = rows('SELECT id, judul, isi, kategori, tag, tanggal FROM catatan ORDER BY id');
  assert.deepEqual(notes.map((n) => n.id), ['J-0001', 'J-0002']);   // baris tanpa ID mendapat nomor berikutnya
  assert.equal(notes[0].isi, 'Menulis, lalu "berhenti"\nbaris dua');
  assert.equal(notes[0].tag, 'awal, harapan');
  assert.equal(new Date(notes[0].tanggal).toISOString(), '2026-11-24T13:30:00.000Z');
  assert.deepEqual(rows('SELECT id FROM riwayat ORDER BY id').map((r) => r.id), ['R-0001', 'R-0002']);
  const t = rows('SELECT id, status, progres, tenggat, dicapai FROM tujuan ORDER BY id');
  assert.equal(t[0].tenggat, '2027-12-31'); assert.equal(t[0].progres, 40);
  assert.equal(t[1].status, 'Tercapai'); assert.equal(t[1].progres, 100); assert.ok(t[1].dicapai > 0);
  assert.equal(rows('SELECT COUNT(*) AS n FROM kutipan')[0].n, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
