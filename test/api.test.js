const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

test('API jurnal', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const { rpc } = s;
  const ok = async (fn, ...a) => { const r = await rpc(fn, ...a); assert.equal(r.status, 200, fn + ': ' + JSON.stringify(r.body)); return r.body.data; };
  const bad = async (fn, status, re, ...a) => { const r = await rpc(fn, ...a); assert.equal(r.status, status, fn + ': ' + JSON.stringify(r.body)); if (re) assert.match(r.body.error, re); return r; };

  await t.test('status awal dan daftar referensi', async () => {
    const st = await ok('getStatus');
    assert.equal(st.needPin, false);
    assert.ok(st.kategori.includes('Memoar') && st.kategori.includes('Refleksi'));
    assert.ok(st.moods.includes('Tenang') && st.jenjang.includes('TK') && st.status.length === 3);
  });

  await t.test('fungsi terlindungi menolak tanpa sesi', async () => {
    const r = await bad('getNotes', 401, /Sesi/);
    assert.equal(r.body.code, 'AUTH');
  });

  await t.test('buat PIN: validasi, cookie aman, tidak bisa dibuat dua kali', async () => {
    await bad('buatPin', 400, /4 sampai 12/, 'ab');
    const r = await rpc('buatPin', '1234');
    assert.equal(r.status, 200);
    assert.match(r.setCookie, /HttpOnly/); assert.match(r.setCookie, /SameSite=Strict/);
    await bad('buatPin', 400, /sudah dibuat/, '9999');
    assert.equal((await ok('getStatus')).needPin, true);
  });

  await t.test('PIN tersimpan sebagai hash, bukan teks asli', async () => {
    const { all } = s.db();
    const r = await all("SELECT nilai FROM pengaturan WHERE kunci = 'pin_hash'");
    assert.match(String(r[0].nilai), /^s1\$[0-9a-f]+\$[0-9a-f]+$/);
    assert.ok(!String(r[0].nilai).includes('1234'));
  });

  await t.test('catatan: validasi, ID berurutan, urutan terbaru, tag dirapikan', async () => {
    await bad('saveNote', 400, /tidak boleh kosong/, { isi: '   ' });
    await bad('saveNote', 400, /terlalu panjang/, { isi: 'x'.repeat(20001) });
    assert.equal(await ok('saveNote', { judul: 'A', isi: 'satu', suasana: 'Tenang', kategori: 'Refleksi', tag: 'Syukur, awal, SYUKUR, #baru' }), 'J-0001');
    assert.equal(await ok('saveNote', { isi: 'dua', kategori: 'Memoar' }), 'J-0002');
    const l = await ok('getNotes');
    assert.deepEqual(l.map((n) => n.id), ['J-0002', 'J-0001']);
    assert.equal(l[1].tag, 'syukur, awal, baru');
    assert.ok(l[0].ts > 0 && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(l[0].tgl), l[0].tgl);
    await ok('saveNote', { id: 'J-0001', judul: 'A2', isi: 'satu diubah', suasana: '', kategori: 'Pendidikan', tag: '' });
    const u = (await ok('getNotes')).find((n) => n.id === 'J-0001');
    assert.equal(u.isi, 'satu diubah'); assert.equal(u.kategori, 'Pendidikan');
    await bad('saveNote', 400, /tidak ditemukan/, { id: 'J-9999', isi: 'x' });
    await ok('deleteNote', 'J-0002');
    await bad('deleteNote', 400, /tidak ditemukan/, 'J-0002');
    assert.equal((await ok('saveNote', { isi: 'tiga' })), 'J-0002'); // nomor terbesar + 1
  });

  await t.test('catatan tahan injeksi SQL dan HTML disimpan apa adanya', async () => {
    const evil = "x'); DROP TABLE catatan; --";
    const id = await ok('saveNote', { judul: '<b>x</b>', isi: evil });
    const n = (await ok('getNotes')).find((x) => x.id === id);
    assert.equal(n.isi, evil); assert.equal(n.judul, '<b>x</b>');
  });

  await t.test('riwayat: urut tahun terkecil dan validasi', async () => {
    for (const [tahun, tempat] of [['2023-2026', 'SMK'], ['2013-2014', 'TK'], ['2013', 'Lahir di desa'], ['2021 - sekarang', 'Kerja'], ['2017-2020', 'SMP']]) {
      await ok('saveRiwayat', { tahun, jenjang: 'Momen penting', tempat, cerita: '' });
    }
    await bad('saveRiwayat', 400, /Tahun tidak valid/, { tahun: 'abc', jenjang: 'TK', tempat: 'x' });
    await bad('saveRiwayat', 400, /jenjang/i, { tahun: '2015', jenjang: '', tempat: 'x' });
    await bad('saveRiwayat', 400, /Tempat/, { tahun: '2015', jenjang: 'TK', tempat: ' ' });
    const l = await ok('getRiwayat');
    assert.deepEqual(l.map((r) => r.tempat), ['Lahir di desa', 'TK', 'SMP', 'Kerja', 'SMK']);
    assert.equal(l[0].id.startsWith('R-'), true);
  });

  await t.test('tujuan: status, progres, tanggal tercapai, validasi tenggat', async () => {
    const id = await ok('saveTujuan', { tujuan: 'Lulus', awal: 'SMK', target: 'S1', status: 'Rencana', tenggat: '2027-01-31', progres: 30, catatan: 'c' });
    assert.equal(id, 'T-0001');
    let g = (await ok('getTujuan'))[0];
    assert.equal(g.progres, 30); assert.equal(g.tenggatTampil, '31/01/2027'); assert.equal(g.dicapai, '');
    await ok('saveTujuan', { id, tujuan: 'Lulus', status: 'Tercapai', progres: 10 });
    g = (await ok('getTujuan'))[0];
    assert.equal(g.progres, 100); assert.match(g.dicapai, /^\d{2}\/\d{2}\/\d{4}$/);
    await ok('saveTujuan', { id, tujuan: 'Lulus', status: 'Berjalan', progres: 55 });
    g = (await ok('getTujuan'))[0];
    assert.equal(g.progres, 55); assert.equal(g.dicapai, '');
    await bad('saveTujuan', 400, /tidak boleh kosong/, { tujuan: '' });
    await bad('saveTujuan', 400, /tenggat/, { tujuan: 'x', tenggat: '2026-02-30' });
    assert.equal((await ok('saveTujuan', { tujuan: 'y', status: 'Aneh', progres: 999 })), 'T-0002');
    const g2 = (await ok('getTujuan')).find((x) => x.id === 'T-0002');
    assert.equal(g2.status, 'Rencana'); assert.equal(g2.progres, 100);
    await ok('deleteTujuan', 'T-0002');
  });

  await t.test('kutipan: tambah, ubah, daftar terbaru dulu, hapus', async () => {
    await bad('saveKutipan', 400, /tidak boleh kosong/, { kutipan: ' ' });
    await ok('saveKutipan', { kutipan: 'Satu', tokoh: 'A', sumber: 'Buku', tag: 'x' });
    const id2 = await ok('saveKutipan', { kutipan: 'Dua' });
    assert.deepEqual((await ok('getKutipan')).map((k) => k.kutipan), ['Dua', 'Satu']);
    await ok('saveKutipan', { id: id2, kutipan: 'Dua diubah', tokoh: 'B' });
    assert.equal((await ok('getKutipan'))[0].tokoh, 'B');
    await ok('deleteKutipan', id2);
    assert.equal((await ok('getKutipan')).length, 1);
  });

  await t.test('keamanan permintaan: tipe konten, asal, fungsi tak dikenal', async () => {
    const h = { Cookie: s.getCookie() };
    let r = await fetch(s.base + '/api/rpc/getNotes', { method: 'POST', headers: { ...h, 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(r.status, 415);
    r = await fetch(s.base + '/api/rpc/getNotes', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json', Origin: 'https://situs-jahat.example' }, body: '{}' });
    assert.equal(r.status, 403);
    for (const fn of ['nope', '__proto__', 'constructor', 'hasOwnProperty']) {
      r = await fetch(s.base + '/api/rpc/' + fn, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(r.status, 404, fn);
    }
    r = await fetch(s.base + '/api/rpc/getNotes');
    assert.equal(r.status, 404); // GET tidak diizinkan
    r = await fetch(s.base + '/');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
  });

  await t.test('cookie palsu atau kedaluwarsa ditolak', async () => {
    const good = s.getCookie();
    const [exp, ver, sig] = good.replace('sid=', '').split('.');
    for (const c of ['sid=abc', 'sid=' + exp + '.' + ver + '.AAAA', 'sid=' + (Date.now() + 99999999) + '.' + ver + '.' + sig, 'sid=' + (Date.now() - 1000) + '.' + ver + '.' + sig]) {
      s.setCookie(c); await bad('getNotes', 401, /Sesi/);
    }
    s.setCookie(good); await ok('getNotes');
  });

  await t.test('logout menghapus cookie; login dengan PIN benar membuka kembali', async () => {
    const r = await rpc('logout');
    assert.match(r.setCookie, /Max-Age=0/); s.setCookie('');
    await bad('getNotes', 401);
    await ok('login', '1234');
    await ok('getNotes');
  });

  await t.test('ubah PIN mencabut sesi lama', async () => {
    const old = s.getCookie();
    await bad('ubahPin', 400, /salah/, '0000', '5678');
    await bad('ubahPin', 400, /4 sampai 12/, '1234', 'x');
    await ok('ubahPin', '1234', '567890');
    const fresh = s.getCookie();
    assert.notEqual(old, fresh);
    s.setCookie(old); await bad('getNotes', 401);
    s.setCookie(fresh); await ok('getNotes');
    s.setCookie(''); await bad('login', 400, /salah/, '1234');
    await ok('login', '567890');
  });

  await t.test('salah PIN 5 kali mengunci sementara, walau PIN benar', async () => {
    s.setCookie('');
    for (let i = 0; i < 5; i++) await bad('login', 400, /salah/, '000000');
    await bad('login', 400, /Terlalu banyak/, '567890');
    await s.db().run("UPDATE pengaturan SET nilai = '0' WHERE kunci = 'lock_until'");
    await ok('login', '567890');
  });
});
