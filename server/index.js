// Sklad nazorati — backend.
// data/ papkasidagi barcha Excel fayllarni o'qiydi va saytga bitta JSON qilib beradi.
// Fayl o'zgarsa (yoki yangisi yuklansa) keyingi so'rovda avtomatik qayta o'qiladi.
const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const multer = require('multer');
const { parseWorkbook, warehouseFromFileName } = require('./parser');

const PORT = process.env.PORT || 4100;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

fs.mkdirSync(DATA_DIR, { recursive: true });

const isExcel = (f) => /\.(xlsx|xlsm)$/i.test(f) && !f.startsWith('~$') && !f.startsWith('.');
const cache = new Map(); // fayl nomi -> { mtimeMs, size, parsed | error }

function loadAll() {
  const files = fs.readdirSync(DATA_DIR).filter(isExcel);
  for (const key of [...cache.keys()]) if (!files.includes(key)) cache.delete(key);

  const warehouses = [];
  const errors = [];
  for (const f of files) {
    const full = path.join(DATA_DIR, f);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    let entry = cache.get(f);
    if (!entry || entry.mtimeMs !== st.mtimeMs || entry.size !== st.size) {
      entry = { mtimeMs: st.mtimeMs, size: st.size };
      try {
        const t = Date.now();
        entry.parsed = parseWorkbook(full, f);
        console.log(`  o'qildi: ${f} (${Date.now() - t} ms)`);
      } catch (e) {
        entry.error = e.message;
        console.warn(`  XATO: ${f}: ${e.message}`);
      }
      cache.set(f, entry);
    }
    if (entry.error) errors.push({ file: f, error: entry.error });
    else warehouses.push({ ...entry.parsed, updatedAt: st.mtimeMs, size: st.size });
  }

  // Bitta sklad kodi ikki faylda bo'lsa — eng yangisi olinadi
  const byCode = new Map();
  for (const w of warehouses) {
    const prev = byCode.get(w.code);
    if (!prev || prev.updatedAt < w.updatedAt) {
      if (prev) errors.push({ file: prev.file, error: `${w.code} uchun yangiroq fayl bor (${w.file}) — bu fayl hisobga olinmadi` });
      byCode.set(w.code, w);
    } else {
      errors.push({ file: w.file, error: `${w.code} uchun yangiroq fayl bor (${prev.file}) — bu fayl hisobga olinmadi` });
    }
  }
  return {
    warehouses: [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code)),
    errors,
  };
}

const app = express();
app.use(compression());

app.get('/api/data', (req, res) => {
  try {
    res.json(loadAll());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Fayl yuklash
const upload = multer({
  storage: multer.diskStorage({
    destination: DATA_DIR,
    filename: (req, file, cb) => cb(null, `.upload-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`),
  }),
  limits: { fileSize: 60 * 1024 * 1024, files: 20 },
});

const safeName = (name) =>
  path
    .basename(Buffer.from(name, 'latin1').toString('utf8'))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim();

app.post('/api/upload', upload.array('files'), (req, res) => {
  const results = [];
  for (const file of req.files || []) {
    const name = safeName(file.originalname);
    try {
      if (!isExcel(name)) throw new Error('Faqat .xlsx yoki .xlsm fayl yuklash mumkin');
      const parsed = parseWorkbook(file.path, name); // tuzilishini tekshirish
      // Shu sklad kodining eski fayl(lar)ini almashtiramiz
      for (const old of fs.readdirSync(DATA_DIR).filter(isExcel)) {
        if (old !== name && warehouseFromFileName(old).code === parsed.code) {
          fs.unlinkSync(path.join(DATA_DIR, old));
        }
      }
      fs.renameSync(file.path, path.join(DATA_DIR, name));
      results.push({ file: name, ok: true, code: parsed.code, name: parsed.name });
    } catch (e) {
      fs.rmSync(file.path, { force: true });
      results.push({ file: name, ok: false, error: e.message });
    }
  }
  res.json({ results });
});

app.delete('/api/files/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const full = path.join(DATA_DIR, name);
  if (!isExcel(name) || !fs.existsSync(full)) return res.status(404).json({ error: 'Fayl topilmadi' });
  fs.unlinkSync(full);
  res.json({ ok: true });
});

// --- Tayyor (build qilingan) saytni berish
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Xato' });
});

app.listen(PORT, HOST, () => {
  console.log(`Sklad nazorati: http://localhost:${PORT}`);
  console.log(`Excel fayllar papkasi: ${DATA_DIR}`);
  loadAll();
});
