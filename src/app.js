const path = require('path');
const express = require('express');
const { handlers, PUBLIC } = require('./handlers');
const auth = require('./auth');
const { UserError } = require('./errors');

const app = express();
app.disable('x-powered-by');

// Header keamanan dasar
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.post('/api/rpc/:fn', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const fn = req.params.fn;
  try {
    // Hanya terima JSON dari halaman sendiri
    if (!req.is('application/json')) return res.status(415).json({ error: 'Jenis konten tidak didukung.' });
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Asal permintaan ditolak.' });
    if (!Object.prototype.hasOwnProperty.call(handlers, fn)) return res.status(404).json({ error: 'Fungsi tidak ditemukan.' });
    const ctx = { res, noRenew: false };
    if (!PUBLIC.has(fn)) {
      if (!(await auth.verifySession(req))) return res.status(401).json({ error: 'Sesi berakhir. Masukkan PIN lagi.', code: 'AUTH' });
    }
    const args = Array.isArray(req.body && req.body.args) ? req.body.args : [];
    const data = await handlers[fn](args, ctx);
    if (!PUBLIC.has(fn) && !ctx.noRenew) await auth.issueSession(res); // perpanjang sesi
    res.json({ data: data === undefined ? null : data });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(fn, e);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Tidak ditemukan.' }));

module.exports = app;
