// Menjalankan lokal: npm run dev
require('dotenv').config();
const app = require('./src/app');
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Jurnal berjalan di http://localhost:' + port));
