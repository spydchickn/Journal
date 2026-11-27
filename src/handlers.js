// Fungsi-fungsi yang dipanggil tampilan lewat POST /api/rpc/:fn (nama sama dengan versi Apps Script)
const { all, run, ready, getDb, STATUS } = require('./db');
const auth = require('./auth');
const { UserError } = require('./errors');

const MAX_ISI = 20000;
const TZ = process.env.APP_TZ || 'Asia/Jakarta';
const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function tagNorm(v) {
  const seen = {}, out = [];
  String(v || '').split(/[,#\n]/).forEach((t) => {
    t = t.trim().toLowerCase();
    if (t && !seen[t] && out.length < 10) { seen[t] = 1; out.push(t); }
  });
  return out.join(', ').slice(0, 100);
}
function fmtTgl(ms) {
  if (!ms) return '';
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return f.format(new Date(Number(ms))).replace(',', '');
}
function fmtTglSaja(ms) { return fmtTgl(ms).split(' ')[0] || ''; }
function ymdTampil(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }

// INSERT dengan ID berurutan (J-0001, R-0001, ...) dalam satu perintah; ulangi bila bentrok
async function insertWithId(table, prefix, cols, vals) {
  const ph = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (id, ${cols.join(', ')})
    SELECT '${prefix}-' || printf('%04d', COALESCE(MAX(CAST(SUBSTR(id, 3) AS INTEGER)), 0) + 1), ${ph} FROM ${table} RETURNING id`;
  for (let i = 0; i < 3; i++) {
    try { return String((await run(sql, vals)).rows[0].id); }
    catch (e) { if (!/UNIQUE|PRIMARY KEY|constraint/i.test(String(e.message)) || i === 2) throw e; }
  }
}
async function hapus(table, id) {
  const r = await run(`DELETE FROM ${table} WHERE id = ?`, [String(id || '')]);
  if (!r.rowsAffected) throw new UserError('Data tidak ditemukan.');
}
const obj = (a) => (a && typeof a === 'object' ? a : {});

const handlers = {
  /* ----- Tanpa login ----- */
  async getStatus() {
    await ready();
    const rows = await all('SELECT jenis, nilai FROM referensi ORDER BY jenis, urut');
    const g = (j) => rows.filter((r) => r.jenis === j).map((r) => String(r.nilai));
    return { needPin: await auth.hasPin(), moods: g('suasana'), jenjang: g('jenjang'), status: g('status').length ? g('status') : STATUS, kategori: g('kategori') };
  },
  async buatPin([pin], ctx) {
    await ready();
    await auth.createPin(pin);
    await auth.issueSession(ctx.res);
    return true;
  },
  async login([pin], ctx) {
    await ready();
    await auth.verifyPin(pin);
    await auth.issueSession(ctx.res);
    return true;
  },
  async logout(_a, ctx) { auth.clearSession(ctx.res); return true; },

  /* ----- Perlu login ----- */
  async ubahPin([lama, baru], ctx) {
    await auth.verifyPin(lama);
    await auth.changePin(baru);
    await auth.issueSession(ctx.res); // sesi baru; sesi lama otomatis tidak berlaku
    ctx.noRenew = true;
    return true;
  },

  // Catatan
  async getNotes() {
    const rows = await all('SELECT id, tanggal, judul, isi, suasana, kategori, tag FROM catatan ORDER BY tanggal DESC, rowid DESC');
    return rows.map((r) => ({ id: r.id, ts: r.tanggal, tgl: fmtTgl(r.tanggal), judul: r.judul, isi: r.isi, suasana: r.suasana, kategori: r.kategori, tag: r.tag }));
  },
  async saveNote([n]) {
    n = obj(n);
    const isi = String(n.isi || '').trim();
    if (!isi) throw new UserError('Isi catatan tidak boleh kosong.');
    if (isi.length > MAX_ISI) throw new UserError('Catatan terlalu panjang (maksimal ' + MAX_ISI + ' karakter).');
    const f = [cut(n.judul, 120), isi, cut(n.suasana, 40), cut(n.kategori, 40), tagNorm(n.tag)];
    const now = Date.now();
    if (n.id) {
      const r = await run('UPDATE catatan SET judul = ?, isi = ?, suasana = ?, kategori = ?, tag = ?, diubah = ? WHERE id = ?', [...f, now, String(n.id)]);
      if (!r.rowsAffected) throw new UserError('Catatan tidak ditemukan.');
      return n.id;
    }
    return insertWithId('catatan', 'J', ['tanggal', 'judul', 'isi', 'suasana', 'kategori', 'tag', 'diubah'], [now, ...f, now]);
  },
  async deleteNote([id]) { await hapus('catatan', id); },

  // Riwayat (linimasa)
  async getRiwayat() {
    const rows = await all('SELECT rowid AS urut, id, tahun, jenjang, tempat, cerita FROM riwayat');
    const out = rows.map((r) => {
      const m = /^(\d{4})(?:\D+(\d{4}|sekarang))?/i.exec(String(r.tahun));
      const mulai = m ? Number(m[1]) : 9999;
      const akhir = m && m[2] ? (/sekarang/i.test(m[2]) ? 9999 : Number(m[2])) : mulai;
      return { id: r.id, tahun: r.tahun, mulai, akhir, urut: Number(r.urut), jenjang: r.jenjang, tempat: r.tempat, cerita: r.cerita };
    });
    out.sort((a, b) => a.mulai - b.mulai || a.akhir - b.akhir || a.urut - b.urut);
    return out;
  },
  async saveRiwayat([r]) {
    r = obj(r);
    const tahun = cut(r.tahun, 20).replace(/\s+/g, '');
    if (!/^\d{4}([-\u2013](\d{4}|sekarang))?$/i.test(tahun)) throw new UserError('Tahun tidak valid. Contoh: 2015, 2010-2013, atau 2021-sekarang.');
    const jenjang = cut(r.jenjang, 40), tempat = cut(r.tempat, 150), cerita = cut(r.cerita, MAX_ISI);
    if (!jenjang) throw new UserError('Pilih jenjang.');
    if (!tempat) throw new UserError('Tempat tidak boleh kosong.');
    const now = Date.now();
    if (r.id) {
      const x = await run('UPDATE riwayat SET tahun = ?, jenjang = ?, tempat = ?, cerita = ?, diubah = ? WHERE id = ?', [tahun, jenjang, tempat, cerita, now, String(r.id)]);
      if (!x.rowsAffected) throw new UserError('Data tidak ditemukan.');
      return r.id;
    }
    return insertWithId('riwayat', 'R', ['tahun', 'jenjang', 'tempat', 'cerita', 'diubah'], [tahun, jenjang, tempat, cerita, now]);
  },
  async deleteRiwayat([id]) { await hapus('riwayat', id); },

  // Tujuan
  async getTujuan() {
    const rows = await all('SELECT id, tujuan, awal, target, status, tenggat, progres, catatan, dicapai FROM tujuan ORDER BY rowid');
    return rows.map((r) => ({ id: r.id, tujuan: r.tujuan, awal: r.awal, target: r.target, status: r.status, tenggat: r.tenggat, tenggatTampil: ymdTampil(r.tenggat),
      progres: Number(r.progres) || 0, catatan: r.catatan, dicapai: r.dicapai ? fmtTglSaja(r.dicapai) : '' }));
  },
  async saveTujuan([t]) {
    t = obj(t);
    const tujuan = cut(t.tujuan, 200);
    if (!tujuan) throw new UserError('Tujuan tidak boleh kosong.');
    const status = STATUS.includes(t.status) ? t.status : 'Rencana';
    let progres = Math.round(Number(t.progres));
    if (isNaN(progres) || progres < 0) progres = 0;
    if (progres > 100) progres = 100;
    if (status === 'Tercapai') progres = 100;
    let tenggat = '';
    if (t.tenggat) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t.tenggat));
      const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (!m || d.getUTCMonth() !== +m[2] - 1) throw new UserError('Format tenggat tidak valid.');
      tenggat = String(t.tenggat);
    }
    const awal = cut(t.awal, 300), target = cut(t.target, 300), catatan = cut(t.catatan, MAX_ISI), now = Date.now();
    if (t.id) {
      const cur = await all('SELECT status, dicapai FROM tujuan WHERE id = ?', [String(t.id)]);
      if (!cur.length) throw new UserError('Data tidak ditemukan.');
      const dicapai = status !== 'Tercapai' ? null : (cur[0].status === 'Tercapai' && cur[0].dicapai ? cur[0].dicapai : now);
      await run('UPDATE tujuan SET tujuan = ?, awal = ?, target = ?, status = ?, tenggat = ?, progres = ?, catatan = ?, dicapai = ?, diubah = ? WHERE id = ?',
        [tujuan, awal, target, status, tenggat, progres, catatan, dicapai, now, String(t.id)]);
      return t.id;
    }
    return insertWithId('tujuan', 'T', ['tujuan', 'awal', 'target', 'status', 'tenggat', 'progres', 'catatan', 'dicapai', 'diubah'],
      [tujuan, awal, target, status, tenggat, progres, catatan, status === 'Tercapai' ? now : null, now]);
  },
  async deleteTujuan([id]) { await hapus('tujuan', id); },

  // Kutipan
  async getKutipan() {
    const rows = await all('SELECT id, kutipan, tokoh, sumber, tag FROM kutipan ORDER BY rowid DESC');
    return rows.map((r) => ({ id: r.id, kutipan: r.kutipan, tokoh: r.tokoh, sumber: r.sumber, tag: r.tag }));
  },
  async saveKutipan([k]) {
    k = obj(k);
    const teks = cut(k.kutipan, 1000);
    if (!teks) throw new UserError('Kutipan tidak boleh kosong.');
    const f = [teks, cut(k.tokoh, 100), cut(k.sumber, 200), cut(k.tag, 100)], now = Date.now();
    if (k.id) {
      const x = await run('UPDATE kutipan SET kutipan = ?, tokoh = ?, sumber = ?, tag = ?, diubah = ? WHERE id = ?', [...f, now, String(k.id)]);
      if (!x.rowsAffected) throw new UserError('Data tidak ditemukan.');
      return k.id;
    }
    return insertWithId('kutipan', 'K', ['kutipan', 'tokoh', 'sumber', 'tag', 'dibuat', 'diubah'], [...f, now, now]);
  },
  async deleteKutipan([id]) { await hapus('kutipan', id); }
};

const PUBLIC = new Set(['getStatus', 'buatPin', 'login', 'logout']);
module.exports = { handlers, PUBLIC, getDb, tagNorm };
