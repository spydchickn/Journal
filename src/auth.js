// PIN (di-hash dengan scrypt) dan sesi berbasis cookie bertanda tangan (stateless, cocok untuk serverless)
const crypto = require('crypto');
const { promisify } = require('util');
const { run, all } = require('./db');
const { UserError } = require('./errors');

const scrypt = promisify(crypto.scrypt);
const SESSION_MENIT = 30;   // sesi diperpanjang setiap ada aktivitas
const MAX_FAIL = 5;
const LOCK_MS = 5 * 60 * 1000;
const COOKIE = 'sid';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('SESSION_SECRET belum diatur (minimal 16 karakter).');
  }
  return 'kunci-sesi-hanya-untuk-lokal';
}

async function getSetting(k) {
  const rows = await all('SELECT nilai FROM pengaturan WHERE kunci = ?', [k]);
  return rows.length ? String(rows[0].nilai) : null;
}
async function setSetting(k, v) {
  await run('INSERT INTO pengaturan (kunci, nilai) VALUES (?, ?) ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai', [k, String(v)]);
}

function validPin(pin) {
  if (!/^\d{4,12}$/.test(String(pin || ''))) throw new UserError('PIN harus 4 sampai 12 angka.');
}

async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pin, salt, 32);
  return 's1$' + salt.toString('hex') + '$' + h.toString('hex');
}
async function checkHash(pin, stored) {
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const expected = Buffer.from(parts[2], 'hex');
  const got = await scrypt(pin, Buffer.from(parts[1], 'hex'), expected.length);
  return crypto.timingSafeEqual(got, expected);
}

async function hasPin() { return !!(await getSetting('pin_hash')); }

// Membuat PIN pertama kali. Gagal jika PIN sudah ada.
async function createPin(pin) {
  validPin(pin);
  const r = await run("INSERT OR IGNORE INTO pengaturan (kunci, nilai) VALUES ('pin_hash', ?)", [await hashPin(String(pin))]);
  if (!r.rowsAffected) throw new UserError('PIN sudah dibuat.');
  await setSetting('pin_ver', '1');
  await setSetting('fails', '0');
  await setSetting('lock_until', '0');
}

async function changePin(pin) {
  validPin(pin);
  await setSetting('pin_hash', await hashPin(String(pin)));
  await setSetting('pin_ver', Number((await getSetting('pin_ver')) || 0) + 1); // mencabut semua sesi lama
  await setSetting('fails', '0');
  await setSetting('lock_until', '0');
}

// Memeriksa PIN dengan pembatasan percobaan (disimpan di database, berlaku lintas instance)
async function verifyPin(pin) {
  const stored = await getSetting('pin_hash');
  if (!stored) throw new UserError('PIN belum dibuat.');
  if (Date.now() < Number((await getSetting('lock_until')) || 0)) {
    throw new UserError('Terlalu banyak percobaan. Coba lagi dalam beberapa menit.');
  }
  if (!(await checkHash(String(pin || ''), stored))) {
    const f = Number((await getSetting('fails')) || 0) + 1;
    if (f >= MAX_FAIL) { await setSetting('lock_until', Date.now() + LOCK_MS); await setSetting('fails', 0); }
    else await setSetting('fails', f);
    throw new UserError('PIN salah.');
  }
  await setSetting('fails', 0);
}

/* ----- Sesi ----- */
function sign(payload) { return crypto.createHmac('sha256', secret()).update(payload).digest('base64url'); }
function isSecure() { return !!(process.env.VERCEL || process.env.NODE_ENV === 'production'); }
function cookieStr(value, maxAge) {
  return COOKIE + '=' + value + '; Path=/; HttpOnly; SameSite=Strict' + (isSecure() ? '; Secure' : '') + (maxAge != null ? '; Max-Age=' + maxAge : '');
}

async function issueSession(res) {
  const ver = (await getSetting('pin_ver')) || '0';
  const payload = (Date.now() + SESSION_MENIT * 60000) + '.' + ver;
  res.setHeader('Set-Cookie', cookieStr(payload + '.' + sign(payload)));
}
function clearSession(res) { res.setHeader('Set-Cookie', cookieStr('', 0)); }

function readCookie(req) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)').exec(req.headers.cookie || '');
  return m ? m[1] : '';
}

async function verifySession(req) {
  const parts = readCookie(req).split('.');
  if (parts.length !== 3) return false;
  const payload = parts[0] + '.' + parts[1];
  const a = Buffer.from(parts[2]), b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  if (Number(parts[0]) < Date.now()) return false;
  return parts[1] === ((await getSetting('pin_ver')) || '0');
}

module.exports = { hasPin, createPin, changePin, verifyPin, issueSession, clearSession, verifySession, validPin };
