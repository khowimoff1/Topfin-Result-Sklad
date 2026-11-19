// Topfin Result — sklad nazorati, kompyuterdagi server (start.bat).
// Internetdagi versiya (Netlify) xuddi shu API'ni netlify/functions/api.mjs orqali beradi.
//
// Ma'lumot data/ papkasida turadi:
//   - *.xlsx  — qo'lda qo'yilgan Excel fayllar (server o'zi o'qiydi)
//   - *.json  — saytdagi "Fayllar" sahifasidan yuklanganlar (Excel brauzerda o'qilib, natijasi saqlanadi)
// Bitta sklad kodi ikki joyda bo'lsa — eng yangisi olinadi.
const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const XLSX = require('xlsx');
const { parseWorkbook } = require('../shared/parser.mjs');
const { validateWarehouse, passwordOk, adminCheck, cleanLabel, MAX_UPLOAD_BYTES } = require('../shared/validate.mjs');

const PORT = process.env.PORT || 4100;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const SITE_PASSWORD = process.env.SITE_PASSWORD || '';
// Yuklash/o'chirish paroli. Kompyuterda o'rnatilmagan bo'lsa — parolsiz (sayt faqat shu kompyuterda ochiladi).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function requireAdmin(req, res, next) {
  const r = adminCheck(ADMIN_PASSWORD, req.get('x-admin-password'), { required: false });
  if (r === 'ok') return next();
  res.status(401).json({ error: 'Admin paroli noto‘g‘ri', admin: true });
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const isExcel = (f) => /\.(xlsx|xlsm)$/i.test(f) && !f.startsWith('~$') && !f.startsWith('.');
const isJson = (f) => /^[A-Z]{1,3}\d{2,4}\.json$/i.test(f);
const cache = new Map(); // fayl nomi -> { mtimeMs, size, parsed | error }

function readEntry(f) {
  const full = path.join(DATA_DIR, f);
  const st = fs.statSync(full);
  let entry = cache.get(f);
  if (!entry || entry.mtimeMs !== st.mtimeMs || entry.size !== st.size) {
    entry = { mtimeMs: st.mtimeMs, size: st.size };
    try {
      const t = Date.now();
      if (isJson(f)) {
        const saved = JSON.parse(fs.readFileSync(full, 'utf8'));
        entry.parsed = saved;
        entry.fileSize = saved.size;
        entry.uploadedAt = saved.updatedAt;
      } else {
        entry.parsed = parseWorkbook(XLSX, XLSX.readFile(full, { cellDates: false }), f);
      }
      console.log(`  o'qildi: ${f} (${Date.now() - t} ms)`);
    } catch (e) {
      entry.error = e.message;
      console.warn(`  XATO: ${f}: ${e.message}`);
    }
    cache.set(f, entry);
  }
  return entry;
}

function loadAll() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => isExcel(f) || isJson(f));
  for (const key of [...cache.keys()]) if (!files.includes(key)) cache.delete(key);

  const warehouses = [];
  const errors = [];
  for (const f of files) {
    let entry;
    try {
      entry = readEntry(f);
    } catch {
      continue;
    }
    if (entry.error) errors.push({ file: f, error: entry.error });
    else warehouses.push({ ...entry.parsed, updatedAt: entry.uploadedAt || entry.mtimeMs, size: entry.fileSize || entry.size });
  }

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
  return { warehouses: [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code)), errors };
}

// Shu sklad kodiga tegishli boshqa fayllarni o'chiradi (yangisi yuklanganda)
function removeCode(code, keep) {
  let n = 0;
  for (const f of fs.readdirSync(DATA_DIR).filter((x) => isExcel(x) || isJson(x))) {
    if (f === keep) continue;
    const e = cache.get(f);
    const c = isJson(f) ? f.replace(/\.json$/i, '').toUpperCase() : e?.parsed?.code || readEntry(f).parsed?.code;
    if (c === code) {
      fs.unlinkSync(path.join(DATA_DIR, f));
      cache.delete(f);
      n++;
    }
  }
  return n;
}

const app = express();
app.use(compression());

// Ixtiyoriy umumiy parol (SITE_PASSWORD muhit o'zgaruvchisi)
app.use('/api', (req, res, next) => {
  if (passwordOk(SITE_PASSWORD, req.get('x-site-password'))) return next();
  res.status(401).json({ error: 'Parol noto‘g‘ri', password: true });
});

app.get('/api/data', (req, res) => {
  try {
    res.json(loadAll());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Saytdan yuklash: Excel brauzerda o'qiladi, bu yerga natija (JSON) keladi
app.get('/api/admin/check', requireAdmin, (req, res) => res.json({ ok: true, required: !!ADMIN_PASSWORD }));

// Telegram bot faqat internetdagi (Netlify) versiyada ishlaydi
app.get('/api/telegram/status', (req, res) => res.json({ available: false }));

app.post('/api/upload', requireAdmin, express.json({ limit: MAX_UPLOAD_BYTES }), (req, res) => {
  try {
    const w = validateWarehouse(req.body && req.body.warehouse);
    const saved = { ...w, size: Number(req.body.size) || 0, updatedAt: Date.now(), source: 'site', uploader: cleanLabel(req.body.uploader || 'Sayt') };
    const name = `${w.code}.json`;
    fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(saved));
    removeCode(w.code, name);
    res.json({ ok: true, code: w.code, name: w.name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/warehouses/:code', requireAdmin, (req, res) => {
  const code = String(req.params.code).toUpperCase();
  if (!/^[A-Z]{1,3}\d{2,4}$/.test(code)) return res.status(400).json({ error: 'Sklad kodi noto‘g‘ri' });
  const n = removeCode(code, null);
  if (!n) return res.status(404).json({ error: 'Sklad topilmadi' });
  res.json({ ok: true });
});

// --- Tayyor (build qilingan) saytni berish
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use((err, req, res, next) => {
  res.status(err.status || 400).json({ error: err.type === 'entity.too.large' ? 'Fayl juda katta' : err.message || 'Xato' });
});

app.listen(PORT, HOST, () => {
  console.log(`Topfin Result: http://localhost:${PORT}`);
  console.log(`Ma'lumot papkasi: ${DATA_DIR}`);
  if (SITE_PASSWORD) console.log('Parol yoqilgan (SITE_PASSWORD)');
  loadAll();
});
