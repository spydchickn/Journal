var authed = false, S = { notes: null, kut: null, tuj: null, riw: null };
var REF = { moods: [], jenjang: [], status: [], kategori: [] };
var page = 'home', seg = 'linimasa', F = { q: '', kat: '', tag: '' }, R = { mode: 'minggu', off: 0 };
var kShow = null, homeK = null, mode = 'buka', idleT, toastT, IDLE_MS = 5 * 60 * 1000;
var MN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var MS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
var $ = function (id) { return document.getElementById(id); };
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function opt(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; return o; }
function p2(n) { return (n < 10 ? '0' : '') + n; }
function ico(p, s) { return '<svg viewBox="0 0 24 24" width="' + (s || 22) + '" height="' + (s || 22) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
var IC = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  jurnal: '<path d="M2 4h7a3 3 0 013 3v13a2 2 0 00-2-2H2z"/><path d="M22 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"/>',
  perjalanan: '<path d="M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  refleksi: '<path d="M12 21s-8-5.5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.5-8 11-8 11z"/>',
  lainnya: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>'
};
var NAV = [['home', 'Beranda'], ['jurnal', 'Jurnal'], ['perjalanan', 'Perjalanan'], ['refleksi', 'Refleksi'], ['lainnya', 'Lainnya']];
var TITLE = { home: 'Beranda', jurnal: 'Jurnal', perjalanan: 'Perjalanan', refleksi: 'Refleksi', lainnya: 'Lainnya', memoar: 'Memoar', growth: 'Growth', kutipan: 'Kutipan' };
var SUB = ['memoar', 'growth', 'kutipan'];
var DATA = { home: ['notes', 'kut', 'tuj'], jurnal: ['notes'], perjalanan: ['riw', 'tuj'], refleksi: ['notes'], memoar: ['notes'], kutipan: ['kut'] };
var API = { notes: 'getNotes', kut: 'getKutipan', tuj: 'getTujuan', riw: 'getRiwayat' };

function call(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  return fetch('/api/rpc/' + fn, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: args })
  }).then(function (r) {
    return r.json().catch(function () { return { error: 'Respons server tidak valid.' }; }).then(function (j) {
      if (r.ok) return j.data;
      var e = new Error(j.error || ('Kesalahan ' + r.status)); e.code = j.code;
      if (e.code === 'AUTH' && authed) { lockApp(); $('lockMsg').textContent = 'Sesi berakhir. Masukkan PIN lagi.'; }
      throw e;
    });
  }, function () { throw new Error('Tidak bisa terhubung ke server.'); });
}
function toast(m, err) {
  var t = $('toast'); t.textContent = m; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add('hidden'); }, 3200);
}
function fail(e) { toast((e && e.message) || String(e), true); }

/* ---------- Data ---------- */
function load(k) { return call(API[k]).then(function (d) { S[k] = d; return d; }); }
function reload(ks) { return Promise.all(ks.map(load)).then(draw); }

/* ---------- Form sheet (dipakai semua formulir) ---------- */
function closeSheet() { $('sheetWrap').classList.add('hidden'); $('sheetBody').textContent = ''; }
function openForm(o) {
  var body = $('sheetBody'); body.textContent = ''; $('sheetTitle').textContent = o.title;
  var inputs = {}, vals = o.values || {};
  if (o.text) body.appendChild(el('p', 'lead', o.text));
  function mk(f, parent) {
    var lab = el('label', 'f'), cap = el('span', '', f.label), inp; lab.appendChild(cap);
    if (f.type === 'area') { inp = el('textarea', 'in'); inp.rows = f.rows || 4; }
    else if (f.type === 'select') {
      inp = el('select', 'in'); if (f.first !== undefined) inp.appendChild(opt('', f.first));
      f.opts.forEach(function (x) { inp.appendChild(opt(x, x)); });
    } else { inp = el('input', 'in'); inp.type = f.type || 'text'; }
    if (f.type === 'range') { inp.min = 0; inp.max = 100; inp.step = 5; }
    if (f.num) inp.inputMode = 'numeric';
    if (f.type === 'password') inp.autocomplete = 'off';
    if (f.ph) inp.placeholder = f.ph;
    if (f.max && f.type !== 'range') inp.maxLength = f.max;
    var v = vals[f.id]; inp.value = v != null ? v : (f.def != null ? f.def : '');
    if (f.type === 'range') {
      inp._upd = function () { cap.textContent = f.label + ': ' + inp.value + '%'; };
      inp.addEventListener('input', inp._upd); inp._upd();
    }
    lab.appendChild(inp); parent.appendChild(lab); inputs[f.id] = inp;
  }
  o.fields.forEach(function (it) {
    if (Array.isArray(it)) { var r = el('div', 'two'); it.forEach(function (f) { mk(f, r); }); body.appendChild(r); }
    else mk(it, body);
  });
  if (o.init) o.init(inputs);
  var msg = el('div', 'msg'); body.appendChild(msg);
  var row = el('div', 'row'); row.appendChild(el('span', 'sp'));
  var bc = el('button', '', 'Batal'), bs = el('button', o.danger ? 'danger' : 'p', o.saveLabel || 'Simpan');
  bc.onclick = closeSheet;
  bs.onclick = function () {
    var v = {}; Object.keys(inputs).forEach(function (k) { v[k] = inputs[k].value; });
    bs.disabled = true; msg.textContent = ''; msg.className = 'msg';
    o.onSave(v).then(closeSheet).catch(function (e) { msg.textContent = (e && e.message) || String(e); msg.className = 'msg err'; bs.disabled = false; });
  };
  row.appendChild(bc); row.appendChild(bs); body.appendChild(row);
  $('sheetWrap').classList.remove('hidden');
  var first = body.querySelector('input,textarea,select'); if (first) first.focus();
}
function confirmDel(label, fn) {
  openForm({ title: 'Hapus ' + label + '?', text: 'Tindakan ini tidak bisa dibatalkan.', fields: [], saveLabel: 'Hapus', danger: true, onSave: fn });
}

/* ---------- Komponen kecil ---------- */
function actions(onEdit, onDel) {
  var a = el('div', 'acts'), be = el('button', 'sm', 'Ubah'), bd = el('button', 'sm d', 'Hapus');
  be.onclick = onEdit; bd.onclick = onDel; a.appendChild(be); a.appendChild(bd); return a;
}
function secHead(title, linkText, fn) {
  var s = el('div', 'sec'); s.appendChild(el('h3', '', title));
  if (linkText) { var b = el('button', '', linkText); b.onclick = fn; s.appendChild(b); }
  return s;
}
function segCtl(items, cur, fn) {
  var d = el('div', 'seg');
  items.forEach(function (it) { var b = el('button', it[0] === cur ? 'on' : '', it[1]); b.onclick = function () { fn(it[0]); }; d.appendChild(b); });
  return d;
}
function quoteBlock(k) {
  var q = el('blockquote', 'quote'); q.appendChild(el('p', '', '\u201C' + k.kutipan + '\u201D'));
  var who = [k.tokoh, k.sumber].filter(Boolean).join(', '); if (who) q.appendChild(el('cite', '', who));
  return q;
}
function fmtTgl(ts) {
  if (!ts) return '';
  var d = new Date(ts); return d.getDate() + ' ' + MS[d.getMonth()] + ' ' + d.getFullYear() + ' \u00B7 ' + p2(d.getHours()) + '.' + p2(d.getMinutes());
}
function tagsOf(n) { return String(n.tag || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean); }
function noteCard(n, o) {
  o = o || {};
  var c = el('article', 'card' + (o.memo ? ' memo' : '')), meta = el('div', 'meta2');
  meta.appendChild(el('span', '', fmtTgl(n.ts)));
  if (n.suasana) meta.appendChild(el('span', 'chip sm mood', n.suasana));
  if (n.kategori) meta.appendChild(el('span', 'chip sm', n.kategori));
  c.appendChild(meta);
  if (n.judul) c.appendChild(el('h3', '', n.judul));
  var p = el('p', 'body' + (o.compact ? ' clamp' : ' clamp'), n.isi); p.onclick = function () { p.classList.toggle('clamp'); }; c.appendChild(p);
  var tg = tagsOf(n); if (tg.length) c.appendChild(el('div', 'tags', tg.map(function (t) { return '#' + t; }).join('  ')));
  if (!o.compact) c.appendChild(actions(function () { editNote(n); }, function () {
    confirmDel('catatan', function () { return call('deleteNote', n.id).then(function () { toast('Catatan dihapus.'); return reload(['notes']); }); });
  }));
  return c;
}
function goalCard(g, compact) {
  var c = el('article', 'card'); c.appendChild(el('h3', '', g.tujuan));
  if (g.awal || g.target) c.appendChild(el('div', 'path', (g.awal || 'Titik awal belum diisi') + '  \u2192  ' + (g.target || 'Target belum diisi')));
  var bar = el('div', 'bar2'), f = el('i'); f.style.width = g.progres + '%'; bar.appendChild(f);
  bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuenow', g.progres); bar.setAttribute('aria-valuemin', 0); bar.setAttribute('aria-valuemax', 100);
  c.appendChild(bar);
  var m = el('div', 'meta3'); m.appendChild(el('span', '', g.progres + '%'));
  m.appendChild(el('span', '', g.status === 'Tercapai' ? (g.dicapai ? 'Tercapai ' + g.dicapai : '') : (g.tenggatTampil ? 'Tenggat ' + g.tenggatTampil : '')));
  c.appendChild(m);
  if (g.catatan && !compact) c.appendChild(el('p', 'body', g.catatan));
  if (!compact) c.appendChild(actions(function () { editTuj(g); }, function () {
    confirmDel('tujuan', function () { return call('deleteTujuan', g.id).then(function () { toast('Tujuan dihapus.'); return reload(['tuj']); }); });
  }));
  return c;
}

/* ---------- Formulir ---------- */
function editNote(n, preKat) {
  openForm({
    title: n ? 'Ubah catatan' : 'Catatan baru', saveLabel: n ? 'Simpan perubahan' : 'Simpan', values: n || { kategori: preKat || '' },
    fields: [
      { id: 'judul', label: 'Judul (opsional)', max: 120 },
      { id: 'isi', label: 'Isi', type: 'area', rows: 7, ph: 'Tulis apa yang sedang kamu rasakan atau jalani.' },
      [{ id: 'suasana', label: 'Suasana', type: 'select', opts: REF.moods, first: 'Tidak dipilih' },
       { id: 'kategori', label: 'Kategori', type: 'select', opts: REF.kategori, first: 'Tanpa kategori' }],
      { id: 'tag', label: 'Tag', ph: 'Pisahkan dengan koma', max: 100 }
    ],
    onSave: function (v) {
      return call('saveNote', { id: n ? n.id : '', judul: v.judul, isi: v.isi, suasana: v.suasana, kategori: v.kategori, tag: v.tag })
        .then(function () { toast(n ? 'Perubahan tersimpan.' : 'Catatan tersimpan.'); return reload(['notes']); });
    }
  });
}
function editRiw(r) {
  openForm({
    title: r ? 'Ubah riwayat' : 'Riwayat baru', saveLabel: r ? 'Simpan perubahan' : 'Simpan', values: r || {},
    fields: [
      [{ id: 'tahun', label: 'Tahun', ph: '2015 atau 2010-2013', max: 20 }, { id: 'jenjang', label: 'Jenjang', type: 'select', opts: REF.jenjang, first: 'Pilih jenjang' }],
      { id: 'tempat', label: 'Tempat', ph: 'Sekolah, kampus, tempat kerja, atau tempat', max: 150 },
      { id: 'cerita', label: 'Cerita', type: 'area', rows: 5, ph: 'Apa yang kamu ingat atau pelajari pada masa itu?' }
    ],
    onSave: function (v) {
      return call('saveRiwayat', { id: r ? r.id : '', tahun: v.tahun, jenjang: v.jenjang, tempat: v.tempat, cerita: v.cerita })
        .then(function () { toast('Riwayat tersimpan.'); return reload(['riw']); });
    }
  });
}
function editTuj(g) {
  openForm({
    title: g ? 'Ubah tujuan' : 'Tujuan baru', saveLabel: g ? 'Simpan perubahan' : 'Simpan', values: g || { status: 'Rencana', progres: 0 },
    fields: [
      { id: 'tujuan', label: 'Tujuan', ph: 'Apa yang ingin dicapai?', max: 200 },
      [{ id: 'awal', label: 'Titik awal', ph: 'Posisi saat mulai', max: 300 }, { id: 'target', label: 'Target', ph: 'Hasil akhir yang dituju', max: 300 }],
      [{ id: 'status', label: 'Status', type: 'select', opts: REF.status }, { id: 'tenggat', label: 'Tenggat (opsional)', type: 'date' }],
      { id: 'progres', label: 'Progres', type: 'range', def: 0 },
      { id: 'catatan', label: 'Catatan', type: 'area', rows: 3, ph: 'Catatan proses atau pelajaran' }
    ],
    init: function (i) { i.status.onchange = function () { if (i.status.value === 'Tercapai') { i.progres.value = 100; i.progres._upd(); } }; },
    onSave: function (v) {
      return call('saveTujuan', { id: g ? g.id : '', tujuan: v.tujuan, awal: v.awal, target: v.target, status: v.status, tenggat: v.tenggat, progres: v.progres, catatan: v.catatan })
        .then(function () { toast('Tujuan tersimpan.'); return reload(['tuj']); });
    }
  });
}
function editKut(k) {
  openForm({
    title: k ? 'Ubah kutipan' : 'Kutipan baru', saveLabel: k ? 'Simpan perubahan' : 'Simpan', values: k || {},
    fields: [
      { id: 'kutipan', label: 'Kutipan', type: 'area', rows: 4, ph: 'Tulis kata-kata yang ingin kamu ingat', max: 1000 },
      [{ id: 'tokoh', label: 'Tokoh', ph: 'Siapa yang mengatakannya', max: 100 }, { id: 'sumber', label: 'Sumber', ph: 'Buku, pidato, wawancara', max: 200 }],
      { id: 'tag', label: 'Tag', ph: 'Contoh: disiplin, sabar', max: 100 }
    ],
    onSave: function (v) {
      return call('saveKutipan', { id: k ? k.id : '', kutipan: v.kutipan, tokoh: v.tokoh, sumber: v.sumber, tag: v.tag })
        .then(function () { toast('Kutipan tersimpan.'); return reload(['kut']); });
    }
  });
}
function ubahPin() {
  openForm({
    title: 'Ubah PIN', saveLabel: 'Simpan PIN',
    fields: [
      { id: 'o', label: 'PIN lama', type: 'password', num: true, max: 12 },
      [{ id: 'n', label: 'PIN baru', type: 'password', num: true, max: 12 }, { id: 'n2', label: 'Ulangi PIN baru', type: 'password', num: true, max: 12 }]
    ],
    onSave: function (v) {
      if (!/^\d{4,12}$/.test(v.n)) return Promise.reject(new Error('PIN baru harus 4 sampai 12 angka.'));
      if (v.n !== v.n2) return Promise.reject(new Error('Ulangi PIN baru tidak sama.'));
      return call('ubahPin', v.o, v.n).then(function () { toast('PIN diperbarui.'); });
    }
  });
}

/* ---------- Halaman ---------- */
function pHome(v) {
  var d = new Date(), h = d.getHours();
  v.appendChild(el('h2', 'hello', h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'));
  v.appendChild(el('div', 'sub2', HARI[d.getDay()] + ', ' + d.getDate() + ' ' + MN[d.getMonth()] + ' ' + d.getFullYear()));
  var w = el('button', 'compose'); w.innerHTML = ico(IC.pen, 18); w.appendChild(el('span', '', 'Apa yang sedang kamu rasakan hari ini?')); w.onclick = function () { editNote(null, ''); }; v.appendChild(w);
  if (S.kut.length) {
    if (!homeK || !S.kut.some(function (k) { return k.id === homeK; })) homeK = S.kut[Math.floor(Math.random() * S.kut.length)].id;
    v.appendChild(quoteBlock(S.kut.filter(function (k) { return k.id === homeK; })[0]));
  }
  var run = S.tuj.filter(function (g) { return g.status === 'Berjalan'; }).slice(0, 3);
  if (run.length) { v.appendChild(secHead('Tujuan berjalan', 'Lihat semua', function () { seg = 'tujuan'; go('perjalanan'); })); run.forEach(function (g) { v.appendChild(goalCard(g, true)); }); }
  v.appendChild(secHead('Catatan terbaru', S.notes.length ? 'Lihat semua' : '', function () { go('jurnal'); }));
  if (!S.notes.length) v.appendChild(el('div', 'empty', 'Belum ada catatan. Ketuk + untuk menulis catatan pertamamu.'));
  S.notes.slice(0, 3).forEach(function (n) { v.appendChild(noteCard(n, { compact: true })); });
}

function pJurnal(v) {
  var q = el('input', 'search'); q.type = 'search'; q.placeholder = 'Cari catatan'; q.value = F.q; q.setAttribute('aria-label', 'Cari catatan');
  var kc = el('div', 'chips'), tc = el('div', 'chips'), list = el('div');
  function chips(box, items, cur, fn) {
    box.textContent = '';
    items.forEach(function (it) { var b = el('button', 'chip' + (it[0] === cur ? ' on' : ''), it[1]); b.onclick = function () { fn(it[0] === cur && it[0] !== '' ? '' : it[0]); }; box.appendChild(b); });
  }
  function tagItems() {
    var c = {}; S.notes.forEach(function (n) { tagsOf(n).forEach(function (t) { c[t] = (c[t] || 0) + 1; }); });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 12).map(function (t) { return [t, '#' + t]; });
  }
  function paint() {
    chips(kc, [['', 'Semua']].concat(REF.kategori.map(function (k) { return [k, k]; })), F.kat, function (x) { F.kat = x; paint(); });
    var ti = tagItems(); tc.classList.toggle('hidden', !ti.length);
    chips(tc, ti, F.tag, function (x) { F.tag = x; paint(); });
    list.textContent = '';
    var qq = F.q.toLowerCase().trim();
    var items = S.notes.filter(function (n) {
      if (F.kat && n.kategori !== F.kat) return false;
      if (F.tag && tagsOf(n).indexOf(F.tag) < 0) return false;
      return !qq || [n.judul, n.isi, n.suasana, n.kategori, n.tag].join(' ').toLowerCase().indexOf(qq) >= 0;
    });
    if (!items.length) list.appendChild(el('div', 'empty', S.notes.length ? 'Tidak ada catatan yang cocok.' : 'Belum ada catatan. Ketuk + untuk menulis.'));
    items.forEach(function (n) { list.appendChild(noteCard(n)); });
  }
  q.oninput = function () { F.q = q.value; paint(); };
  v.appendChild(q); v.appendChild(kc); v.appendChild(tc); v.appendChild(list); paint();
}

function pPerjalanan(v) {
  v.appendChild(segCtl([['linimasa', 'Linimasa'], ['tujuan', 'Tujuan']], seg, function (x) { seg = x; draw(); }));
  if (seg === 'linimasa') {
    if (!S.riw.length) return v.appendChild(el('div', 'empty', 'Belum ada riwayat. Ketuk + untuk menambahkan sekolah pertamamu atau momen penting.'));
    var tl = el('div', 'tl');
    S.riw.forEach(function (r) {
      var it = el('div', 'it'), c = el('div', 'card'), m = el('div', 'meta2');
      m.appendChild(el('span', 'yr', r.tahun)); m.appendChild(el('span', 'chip sm', r.jenjang)); c.appendChild(m);
      c.appendChild(el('h3', '', r.tempat)); if (r.cerita) c.appendChild(el('p', 'body', r.cerita));
      c.appendChild(actions(function () { editRiw(r); }, function () {
        confirmDel('riwayat', function () { return call('deleteRiwayat', r.id).then(function () { toast('Riwayat dihapus.'); return reload(['riw']); }); });
      }));
      it.appendChild(c); tl.appendChild(it);
    });
    v.appendChild(tl);
  } else {
    if (!S.tuj.length) return v.appendChild(el('div', 'empty', 'Belum ada tujuan. Ketuk + untuk menambahkan satu hal yang ingin kamu capai.'));
    ['Berjalan', 'Rencana', 'Tercapai'].forEach(function (st) {
      var items = S.tuj.filter(function (g) { return g.status === st; }); if (!items.length) return;
      v.appendChild(el('div', 'grp', st + ' (' + items.length + ')')); items.forEach(function (g) { v.appendChild(goalCard(g)); });
    });
  }
}

function periode(m, off) {
  var n = new Date(), s, e;
  if (m === 'minggu') { var d = new Date(n.getFullYear(), n.getMonth(), n.getDate()); s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); e = new Date(s); e.setDate(s.getDate() + 7); }
  else { s = new Date(n.getFullYear(), n.getMonth() + off, 1); e = new Date(n.getFullYear(), n.getMonth() + off + 1, 1); }
  return [s, e];
}
function plabel(m, s, e) {
  if (m === 'bulan') return MN[s.getMonth()] + ' ' + s.getFullYear();
  var l = new Date(e.getTime() - 86400000);
  return s.getDate() + ' ' + MS[s.getMonth()] + ' \u2013 ' + l.getDate() + ' ' + MS[l.getMonth()] + ' ' + l.getFullYear();
}
function pRefleksi(v) {
  v.appendChild(segCtl([['minggu', 'Minggu'], ['bulan', 'Bulan']], R.mode, function (x) { R.mode = x; R.off = 0; draw(); }));
  var pr = periode(R.mode, R.off), s = pr[0], e = pr[1];
  var nav = el('div', 'pnav'), bp = el('button', 'icon'), bn = el('button', 'icon');
  bp.innerHTML = ico(IC.back); bp.setAttribute('aria-label', 'Periode sebelumnya'); bp.onclick = function () { R.off--; draw(); };
  bn.innerHTML = ico(IC.next); bn.setAttribute('aria-label', 'Periode berikutnya'); bn.disabled = R.off >= 0; bn.onclick = function () { R.off++; draw(); };
  nav.appendChild(bp); nav.appendChild(el('b', '', plabel(R.mode, s, e))); nav.appendChild(bn); v.appendChild(nav);
  var items = S.notes.filter(function (n) { return n.ts >= s.getTime() && n.ts < e.getTime(); });
  var days = {}, mc = {};
  items.forEach(function (n) { var d = new Date(n.ts); days[d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()] = 1; if (n.suasana) mc[n.suasana] = (mc[n.suasana] || 0) + 1; });
  var arr = Object.keys(mc).map(function (k) { return [k, mc[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  var st = el('div', 'stats');
  [[items.length, 'Catatan'], [Object.keys(days).length, 'Hari menulis'], [arr.length ? arr[0][0] : '-', 'Suasana dominan']].forEach(function (x) {
    var b = el('div', 'stat'); b.appendChild(el('b', '', String(x[0]))); b.appendChild(el('span', '', x[1])); st.appendChild(b);
  });
  v.appendChild(st);
  v.appendChild(secHead('Suasana', '', null));
  if (!arr.length) v.appendChild(el('div', 'empty', 'Belum ada catatan dengan suasana pada periode ini.'));
  arr.forEach(function (x) {
    var r = el('div', 'mrow'); r.appendChild(el('span', '', x[0]));
    var bar = el('div', 'bar2'), f = el('i'); f.style.width = Math.round(x[1] / arr[0][1] * 100) + '%'; bar.appendChild(f); r.appendChild(bar);
    r.appendChild(el('span', '', String(x[1]))); v.appendChild(r);
  });
  v.appendChild(secHead('Catatan refleksi', '', null));
  var ref = S.notes.filter(function (n) { return n.kategori === 'Refleksi'; }).slice(0, 20);
  if (!ref.length) v.appendChild(el('div', 'empty', 'Belum ada catatan refleksi. Ketuk + untuk menulis perenungan.'));
  ref.forEach(function (n) { v.appendChild(noteCard(n)); });
}

function pLainnya(v) {
  [['memoar', 'Memoar', 'Cerita dan kenangan', IC.jurnal], ['growth', 'Growth', 'Panduan pengembangan diri', IC.refleksi],
   ['kutipan', 'Kutipan', 'Kata-kata orang hebat', IC.home], ['pin', 'Ubah PIN', 'Ganti PIN pembuka jurnal', IC.lock],
   ['kunci', 'Kunci sekarang', 'Kembali ke layar PIN', IC.lock]].forEach(function (m) {
    var b = el('button', 'menu'), t = el('div'); t.appendChild(el('b', '', m[1])); t.appendChild(el('small', '', m[2]));
    b.innerHTML = ico(m[3]); b.appendChild(t); b.insertAdjacentHTML('beforeend', ico(IC.next, 18));
    b.onclick = function () { if (m[0] === 'pin') ubahPin(); else if (m[0] === 'kunci') lockApp(); else go(m[0]); };
    v.appendChild(b);
  });
}

function pMemoar(v) {
  v.appendChild(el('p', 'lead', 'Cerita dan kenangan yang ingin kamu simpan.'));
  var items = S.notes.filter(function (n) { return n.kategori === 'Memoar'; });
  if (!items.length) v.appendChild(el('div', 'empty', 'Belum ada memoar. Ketuk + untuk menulis ceritamu.'));
  items.forEach(function (n) { v.appendChild(noteCard(n, { memo: true })); });
}

function pGrowth(v) {
  v.appendChild(secHead('Aspek utama pengembangan diri', '', null));
  [['Mental', 'Melatih cara berpikir, belajar hal baru, dan membangun growth mindset.'],
   ['Emosional', 'Mengenali dan mengelola emosi, serta melatih empati dan ketahanan diri.'],
   ['Fisik', 'Menjaga tidur cukup, bergerak aktif, dan merawat kesehatan tubuh.'],
   ['Sosial', 'Meningkatkan komunikasi, mendengarkan secara aktif, dan membangun relasi yang sehat.'],
   ['Spiritual / makna hidup', 'Menyelaraskan tindakan dengan nilai pribadi dan tujuan hidup.']].forEach(function (a) {
    var r = el('div', 'aspek'); r.appendChild(el('b', '', a[0])); r.appendChild(el('p', '', a[1])); v.appendChild(r);
  });
  v.appendChild(secHead('Langkah awal yang praktis', '', null));
  var ol = el('ol', 'steps');
  [['Lakukan refleksi diri.', ' Catat kebiasaan, pemicu stres, dan kekuatanmu lewat jurnal.'],
   ['Bangun sistem kecil.', ' Fokus pada perubahan kecil yang konsisten setiap hari, bukan target besar sekaligus.'],
   ['Kurangi perbandingan.', ' Ukur kemajuan dari perkembangan dirimu sendiri, bukan standar orang lain.'],
   ['Belajar terukur.', ' Baca buku, latih satu keterampilan baru, atau minta umpan balik dari orang tepercaya.'],
   ['Jaga batasan dan belas kasih.', ' Berani menolak hal yang menguras energi, dan perlakukan dirimu dengan wajar saat gagal.']].forEach(function (x) {
    var li = el('li'); li.appendChild(el('b', '', x[0])); li.appendChild(document.createTextNode(x[1])); ol.appendChild(li);
  });
  v.appendChild(ol);
  v.appendChild(el('p', 'hint', 'Jika stres atau keluhan emosional terasa berat dan menetap, pertimbangkan berkonsultasi dengan tenaga profesional.'));
}

function pKutipan(v) {
  var top = el('div'), q = el('input', 'search'), list = el('div');
  q.type = 'search'; q.placeholder = 'Cari kutipan, tokoh, atau tag'; q.setAttribute('aria-label', 'Cari kutipan');
  function pick(excl) { var pool = S.kut.length > 1 ? S.kut.filter(function (x) { return x.id !== excl; }) : S.kut; var k = pool[Math.floor(Math.random() * pool.length)]; kShow = k.id; return k; }
  function show() {
    top.textContent = '';
    if (!S.kut.length) return top.appendChild(el('div', 'empty', 'Belum ada kutipan. Ketuk + untuk menambahkan.'));
    var k = S.kut.filter(function (x) { return x.id === kShow; })[0] || pick('');
    top.appendChild(quoteBlock(k));
    var b = el('button', 'sm', 'Kutipan lain'); b.onclick = function () { pick(kShow); show(); }; top.appendChild(b);
  }
  function paint() {
    list.textContent = ''; var qq = q.value.toLowerCase().trim();
    var items = S.kut.filter(function (k) { return !qq || [k.kutipan, k.tokoh, k.sumber, k.tag].join(' ').toLowerCase().indexOf(qq) >= 0; });
    if (S.kut.length && !items.length) list.appendChild(el('div', 'empty', 'Tidak ada kutipan yang cocok.'));
    items.forEach(function (k) {
      var c = el('article', 'card'); c.appendChild(el('p', 'body', k.kutipan));
      var who = [k.tokoh, k.sumber].filter(Boolean).join(', '); if (who) c.appendChild(el('cite', '', who));
      if (k.tag) c.appendChild(el('div', 'tags', k.tag));
      c.appendChild(actions(function () { editKut(k); }, function () {
        confirmDel('kutipan', function () { return call('deleteKutipan', k.id).then(function () { toast('Kutipan dihapus.'); return reload(['kut']); }); });
      }));
      list.appendChild(c);
    });
  }
  q.oninput = paint; v.appendChild(top); v.appendChild(q); v.appendChild(list); show(); paint();
}

var BUILD = { home: pHome, jurnal: pJurnal, perjalanan: pPerjalanan, refleksi: pRefleksi, lainnya: pLainnya, memoar: pMemoar, growth: pGrowth, kutipan: pKutipan };

/* ---------- Navigasi ---------- */
function fabAct() {
  switch (page) {
    case 'home': case 'jurnal': return function () { editNote(null, ''); };
    case 'refleksi': return function () { editNote(null, 'Refleksi'); };
    case 'memoar': return function () { editNote(null, 'Memoar'); };
    case 'perjalanan': return seg === 'linimasa' ? function () { editRiw(null); } : function () { editTuj(null); };
    case 'kutipan': return function () { editKut(null); };
  }
  return null;
}
function head() {
  var sub = SUB.indexOf(page) >= 0, key = sub ? 'lainnya' : page;
  $('ttl').textContent = TITLE[page]; $('back').classList.toggle('hidden', !sub);
  document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.go === key); });
  $('fab').classList.toggle('hidden', !fabAct());
}
function draw() {
  head(); var v = $('view'); v.textContent = ''; BUILD[page](v);
}
function go(p) {
  page = p; if (p === 'kutipan') kShow = null; head(); window.scrollTo(0, 0);
  var miss = (DATA[p] || []).filter(function (k) { return S[k] === null; });
  if (!miss.length) return draw();
  var v = $('view'); v.textContent = ''; v.appendChild(el('div', 'empty', 'Memuat...'));
  Promise.all(miss.map(load)).then(function () { if (page === p) draw(); }).catch(fail);
}

/* ---------- PIN: buat, buka, kunci ---------- */
function showLock(m) {
  mode = m; $('app').classList.add('hidden'); $('lock').classList.remove('hidden');
  $('pin').value = ''; $('pin2').value = ''; $('pin2').classList.toggle('hidden', m !== 'buat');
  $('lockInfo').textContent = m === 'buat' ? 'Buat PIN (4 sampai 12 angka) untuk mengunci jurnal ini.' : 'Masukkan PIN untuk membuka jurnal.';
  $('btnOpen').textContent = m === 'buat' ? 'Simpan PIN' : 'Buka jurnal';
  var lm = $('lockMsg'); lm.textContent = ''; lm.className = 'msg'; $('pin').focus();
}
function showApp() {
  $('lock').classList.add('hidden'); $('app').classList.remove('hidden');
  S = { notes: null, kut: null, tuj: null, riw: null }; F = { q: '', kat: '', tag: '' }; R = { mode: 'minggu', off: 0 }; seg = 'linimasa'; homeK = null; kShow = null;
  resetIdle(); go('home');
}
function unlock() {
  var pin = $('pin').value, b = $('btnOpen'), lm = $('lockMsg');
  function err(m) { lm.textContent = m; lm.className = 'msg err'; }
  if (mode === 'buat') {
    if (!/^\d{4,12}$/.test(pin)) return err('PIN harus 4 sampai 12 angka.');
    if (pin !== $('pin2').value) return err('Ulangi PIN tidak sama.');
  }
  b.disabled = true; lm.textContent = 'Memeriksa...'; lm.className = 'msg';
  call(mode === 'buat' ? 'buatPin' : 'login', pin)
    .then(function () { authed = true; showApp(); })
    .catch(function (e) { err(e.message); $('pin').value = ''; $('pin2').value = ''; })
    .then(function () { b.disabled = false; });
}
function lockApp() {
  if (authed) call('logout').catch(function () {});
  authed = false; clearTimeout(idleT); S = { notes: null, kut: null, tuj: null, riw: null }; homeK = null; kShow = null;
  closeSheet(); $('view').textContent = ''; showLock('buka');
}
function resetIdle() { clearTimeout(idleT); if (authed) idleT = setTimeout(lockApp, IDLE_MS); }

/* ---------- Pasang ---------- */
NAV.forEach(function (n) {
  var b = el('button'); b.dataset.go = n[0]; b.innerHTML = ico(IC[n[0]]); b.appendChild(el('span', '', n[1]));
  b.onclick = function () { go(n[0]); }; $('nav').appendChild(b);
});
$('back').innerHTML = ico(IC.back); $('back').onclick = function () { go('lainnya'); };
$('btnLock').innerHTML = ico(IC.lock); $('btnLock').onclick = lockApp;
$('fab').onclick = function () { var f = fabAct(); if (f) f(); };
$('btnOpen').onclick = unlock;
$('pin').onkeydown = $('pin2').onkeydown = function (e) { if (e.key === 'Enter') unlock(); };
$('sheetWrap').onclick = function (e) { if (e.target === this) closeSheet(); };
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
['click', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) { document.addEventListener(ev, resetIdle, { passive: true }); });

call('getStatus').then(function (s) {
  REF.moods = s.moods || []; REF.jenjang = s.jenjang || []; REF.status = s.status || []; REF.kategori = s.kategori || [];
  showLock(s.needPin ? 'buka' : 'buat');
}).catch(function (e) { document.body.textContent = 'Gagal memuat: ' + e.message; });
