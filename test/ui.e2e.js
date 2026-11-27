// Uji ujung-ke-ujung: tampilan (jsdom) <-> server Express <-> database SQLite sementara. Jalankan: npm run test:ui
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { startServer } = require('./helpers');

const errors = [];
const check = (name, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + name); if (!cond) errors.push(name); };

(async () => {
  const s = await startServer();
  const base = s.base;

  // pemeriksaan statis: tidak ada skrip atau gaya inline (agar sesuai CSP ketat)
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  check('index.html tanpa <script> inline', !/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));
  check('index.html tanpa atribut style inline', !/\sstyle=/i.test(html));

  let jar = '';
  // jsdom versi baru tidak punya ResourceLoader: markup dimuat dari server, app.js dijalankan manual
  const page = (await (await fetch(base + '/')).text()).replace(/<link[^>]*>/g, '').replace(/<script[^>]*src="\/app\.js"[^>]*><\/script>/, '');
  const appJs = await (await fetch(base + '/app.js')).text();
  const dom = new JSDOM(page, {
    url: base + '/', runScripts: 'outside-only', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = async (url, opts = {}) => {
        const res = await fetch(new URL(url, base), { ...opts, headers: { ...(opts.headers || {}), ...(jar ? { Cookie: jar } : {}) } });
        const sc = res.headers.getSetCookie(); if (sc.length) { const c = sc[0].split(';')[0]; jar = /=$/.test(c) ? '' : c; }
        return res;
      };
    }
  });
  dom.window.eval(appJs);
  const w = dom.window, d = w.document;
  const q = (x) => d.querySelector(x), qa = (x) => [...d.querySelectorAll(x)];
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, label, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await sleep(20); } check('(timeout) ' + label, false); return false; };
  const btn = (txt, root) => [...(root || d).querySelectorAll('button')].find((b) => b.textContent.trim() === txt);
  const fields = () => [...q('#sheetBody').querySelectorAll('input,textarea,select')];
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const sheetOpen = () => !q('#sheetWrap').classList.contains('hidden');
  const nav = async (i) => { click(qa('#nav button')[i]); await sleep(60); };

  try {
    await until(() => !q('#lock').classList.contains('hidden'), 'layar PIN');
    check('CSS dimuat dari server', (await fetch(base + '/style.css')).status === 200 && (await fetch(base + '/app.js')).status === 200);
    check('PIN pertama: mode buat (dua kolom)', !q('#pin2').classList.contains('hidden') && q('#btnOpen').textContent === 'Simpan PIN');
    type(q('#pin'), '12'); type(q('#pin2'), '12'); click(q('#btnOpen'));
    check('PIN pendek ditolak di tampilan', /4 sampai 12/.test(q('#lockMsg').textContent));
    type(q('#pin'), '1234'); type(q('#pin2'), '9999'); click(q('#btnOpen'));
    check('ulangi PIN beda ditolak', /tidak sama/.test(q('#lockMsg').textContent));
    type(q('#pin2'), '1234'); click(q('#btnOpen'));
    await until(() => !q('#app').classList.contains('hidden') && q('.hello'), 'beranda terbuka');
    check('beranda kosong: pesan awal', /Belum ada catatan/.test(q('#view').textContent));

    // catatan baru lewat tombol +
    click(q('#fab')); await until(sheetOpen, 'sheet');
    let f = fields(); // judul, isi, suasana, kategori, tag
    type(f[0], 'Hari pertama'); type(f[1], 'Isi catatan pertama'); f[2].value = 'Tenang'; f[3].value = 'Refleksi'; type(f[4], 'Awal, Syukur');
    click(btn('Simpan', q('#sheetBody')));
    await until(() => !sheetOpen() && /Isi catatan pertama/.test(q('#view').textContent), 'catatan muncul di beranda');
    check('catatan tersimpan ke database', (await s.db().all('SELECT isi, kategori, tag FROM catatan'))[0].tag === 'awal, syukur');
    click(q('#fab')); await until(sheetOpen, 'sheet 2');
    click(btn('Simpan', q('#sheetBody'))); await until(() => /tidak boleh kosong/.test(q('#sheetBody .msg').textContent), 'validasi server tampil di sheet');
    check('sheet tetap terbuka saat error', sheetOpen());
    click(btn('Batal', q('#sheetBody')));

    // jurnal + filter
    await nav(1); await until(() => qa('#view article.card').length === 1, 'jurnal 1 kartu');
    click(btn('Memoar')); check('filter Memoar -> kosong', /Tidak ada catatan yang cocok/.test(q('#view').textContent));
    click(btn('Refleksi')); check('filter Refleksi -> 1', qa('#view article.card').length === 1);
    click(btn('#syukur')); check('filter tag #syukur -> 1', qa('#view article.card').length === 1);
    click(btn('Ubah', q('#view'))); await until(sheetOpen, 'sheet ubah');
    check('formulir ubah terisi', fields()[1].value === 'Isi catatan pertama');
    type(fields()[1], 'Isi diubah'); click(btn('Simpan perubahan', q('#sheetBody')));
    await until(() => /Isi diubah/.test(q('#view').textContent), 'perubahan tampil');

    // perjalanan: linimasa dan tujuan
    await nav(2); await until(() => /Belum ada riwayat/.test(q('#view').textContent), 'linimasa kosong');
    for (const [tahun, tempat] of [['2023-2026', 'SMK Negeri 1 Liwa'], ['2013-2014', 'TK Negeri 2 Liwa']]) {
      click(q('#fab')); await until(sheetOpen, 'sheet riwayat');
      f = fields(); type(f[0], tahun); f[1].value = 'TK'; type(f[2], tempat);
      click(btn('Simpan', q('#sheetBody'))); await until(() => !sheetOpen(), 'sheet riwayat tertutup');
      await sleep(60);
    }
    await until(() => qa('#view .tl .it').length === 2, 'dua riwayat');
    check('linimasa urut tahun terkecil', q('#view').textContent.indexOf('TK Negeri 2') < q('#view').textContent.indexOf('SMK Negeri 1'));
    click(btn('Tujuan', q('#view'))); await sleep(40);
    click(q('#fab')); await until(sheetOpen, 'sheet tujuan');
    f = fields(); type(f[0], 'Lulus kuliah'); type(f[1], 'SMK'); type(f[2], 'S1'); f[3].value = 'Berjalan';
    const range = q('#sheetBody input[type=range]'); type(range, '40');
    click(btn('Simpan', q('#sheetBody'))); await until(() => !sheetOpen() && /Lulus kuliah/.test(q('#view').textContent), 'tujuan muncul');
    check('progres 40% tampil', /40%/.test(q('#view').textContent) && q('#view .bar2 i').style.width === '40%');

    // refleksi
    await nav(3); await until(() => qa('#view .stat').length === 3, 'statistik');
    check('refleksi: 1 catatan, suasana Tenang', /Tenang/.test(q('#view .stats').textContent) && qa('#view .stat b')[0].textContent === '1');
    check('refleksi: catatan refleksi tampil', /Isi diubah/.test(q('#view').textContent));

    // kutipan
    await nav(4); click(qa('#view .menu')[2]); await until(() => /Belum ada kutipan/.test(q('#view').textContent), 'kutipan kosong');
    click(q('#fab')); await until(sheetOpen, 'sheet kutipan');
    f = fields(); type(f[0], 'Satu langkah kecil'); type(f[1], 'Seseorang');
    click(btn('Simpan', q('#sheetBody'))); await until(() => q('#view .quote'), 'kutipan acak muncul');
    check('kutipan acak menampilkan tokoh', /Seseorang/.test(q('#view .quote').textContent));

    // kunci, salah PIN, buka lagi, data tetap ada
    click(q('#btnLock')); await until(() => !q('#lock').classList.contains('hidden'), 'terkunci');
    check('kunci: layar PIN mode buka & data dibersihkan', q('#pin2').classList.contains('hidden') && q('#view').textContent === '');
    type(q('#pin'), '0000'); click(btn('Buka jurnal')); await until(() => /PIN salah/.test(q('#lockMsg').textContent), 'PIN salah');
    type(q('#pin'), '1234'); click(btn('Buka jurnal')); await until(() => !q('#app').classList.contains('hidden') && q('.hello'), 'terbuka lagi');
    await until(() => /Isi diubah/.test(q('#view').textContent), 'data tetap ada setelah buka kembali');
    check('data tetap ada setelah kunci dan buka lagi', /Isi diubah/.test(q('#view').textContent));

    // sesi kedaluwarsa di server -> tampilan kembali ke layar PIN
    jar = 'sid=rusak';
    click(q('#fab')); await until(sheetOpen, 'sheet saat sesi rusak');
    f = fields(); type(f[1], 'Catatan saat sesi habis'); click(btn('Simpan', q('#sheetBody')));
    await until(() => !q('#lock').classList.contains('hidden'), 'kembali ke layar PIN saat sesi habis');
    check('sheet ditutup saat sesi habis', !sheetOpen());
    check('pesan sesi berakhir tampil', /Sesi berakhir/.test(q('#lockMsg').textContent));
    check('tidak ada data tersisa di layar', q('#view').textContent === '');
  } catch (e) { errors.push('CRASH: ' + (e.stack || e)); console.log('CRASH', e); }

  await s.close();
  console.log(errors.length ? '\nGAGAL:\n' + errors.join('\n') : '\nSemua uji UI lolos');
  process.exit(errors.length ? 1 : 0);
})();
