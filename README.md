# Jurnal Perjalanan Diri (Express + SQLite/Turso)

Aplikasi jurnal pribadi: catatan, riwayat (linimasa), tujuan, refleksi suasana, memoar, dan kutipan.
Server Node.js (Express), database SQLite. Lokal memakai file `data/jurnal.db`; produksi memakai Turso (SQLite di cloud) agar bisa dipasang di Vercel.

## 1. Jalankan di komputer sendiri (VS Code)

Syarat: Node.js 20 atau lebih baru.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run dev
```

Buka http://localhost:3000. Saat pertama dibuka, aplikasi meminta Anda membuat PIN (4 sampai 12 angka; disarankan 6 angka atau lebih).
Kosongkan `TURSO_DATABASE_URL` di `.env` agar data disimpan di `data/jurnal.db`.

Uji otomatis: `npm test` (server, PIN, sesi, impor) dan `npm run test:ui` (tampilan ujung-ke-ujung).

## 2. Impor data dari spreadsheet lama
Di Google Sheets, buka tiap sheet (Catatan, Riwayat, Tujuan, Kutipan), pilih **File > Download > Comma-separated values (.csv)**, lalu:

```bash
npm run import -- --catatan Catatan.csv --riwayat Riwayat.csv --tujuan Tujuan.csv --kutipan Kutipan.csv --dry-run
npm run import -- --catatan Catatan.csv --riwayat Riwayat.csv --tujuan Tujuan.csv --kutipan Kutipan.csv
```

- Jalankan dengan `--dry-run` dulu untuk memeriksa. Setelah itu jalankan tanpa `--dry-run`.
- Boleh mengimpor sebagian saja (misalnya hanya `--catatan`).
- Aman diulang: baris ber-ID diperbarui, baris tanpa ID tidak digandakan.
- Tanggal dibaca dalam format `dd/mm/yyyy hh:mm` (format yang dipakai versi Apps Script) sebagai WIB.
- Impor memakai database yang diatur di `.env`, jadi untuk mengimpor ke Turso isi dulu `TURSO_*` di `.env`.

## 3. Siapkan Turso (database produksi)

Ikuti panduan terbaru di docs.turso.tech (layanan dan batas paket gratisnya bisa berubah). Garis besarnya:

```bash
turso auth login
turso db create jurnal
turso db show jurnal --url          # -> TURSO_DATABASE_URL
turso db tokens create jurnal       # -> TURSO_AUTH_TOKEN
```

Database dan tabel dibuat otomatis oleh aplikasi saat pertama dijalankan.

## 4. Deploy ke Vercel

1. Simpan proyek ke repository Git (file `.env` dan `data/*.db` sudah dikecualikan lewat `.gitignore`).
2. Impor repository di vercel.com, atau pakai `npm i -g vercel` lalu `vercel`.
3. Isi **Environment Variables** di Vercel:
   - `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` (dari langkah 3)
   - `SESSION_SECRET`: acak, minimal 16 karakter. Buat dengan
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `APP_TZ` (opsional, bawaan `Asia/Jakarta`)
4. Deploy. `vercel.json` sudah mengarahkan `/api/*` ke Express (`api/index.js`) dan menyertakan folder `public/`.

Catatan: file SQLite biasa tidak bisa dipakai di Vercel karena penyimpanan fungsi serverless bersifat sementara. Itu sebabnya produksi memakai Turso.

## Keamanan

- PIN disimpan sebagai hash scrypt, bukan teks asli. Salah PIN 5 kali mengunci 5 menit (disimpan di database, berlaku lintas instance).
- Sesi memakai cookie `HttpOnly`, `SameSite=Strict`, dan `Secure` di produksi; berlaku 30 menit dan diperpanjang saat ada aktivitas. Ganti PIN mencabut semua sesi lama.
- Tampilan terkunci otomatis setelah 5 menit tanpa aktivitas.
- Header CSP ketat (tanpa skrip atau gaya inline), pemeriksaan `Origin`, dan hanya menerima JSON.
- PIN angka pendek tetap lemah bila server terbuka ke internet. Pakai PIN yang lebih panjang.
- Cadangkan data secara berkala, misalnya `turso db shell jurnal .dump > cadangan.sql`.

## Struktur

```
public/            index.html, style.css, app.js (tampilan)
src/app.js         server Express dan pintu /api/rpc/:fn
src/handlers.js    logika data (catatan, riwayat, tujuan, kutipan)
src/auth.js        PIN, sesi, pembatasan percobaan
src/db.js          koneksi libSQL, skema, data awal
scripts/import-csv.js
api/index.js, vercel.json   pintu masuk Vercel
test/              uji otomatis
```

Mengganti font dan warna: ubah `--fh`, `--fb`, dan variabel warna di bagian atas `public/style.css`, serta tag `<link>` Google Fonts di `public/index.html`.

npm run import -- --catatan Catatan.csv --riwayat Riwayat.csv --referensi Referensi.csv --dry-run