// Brauzerdan kelgan (Excel'dan o'qilgan) sklad ma'lumotini tekshiradi.
// Kompyuterdagi server (server/index.js) va Netlify funksiyasi (netlify/functions/api.mjs) ikkalasi ishlatadi.

export const MAX_UPLOAD_BYTES = 5.5 * 1024 * 1024; // Netlify funksiyasiga so'rov chegarasi 6 MB

const isStr = (v, max = 300) => typeof v === 'string' && v.length <= max;
const isArr = (v, max) => Array.isArray(v) && v.length <= max;
const row = (r, n) => Array.isArray(r) && r.length === n && Number.isInteger(r[0]) && r[0] > 19000101 && r[0] < 21000101 && Number.isInteger(r[1]) && typeof r[2] === 'number' && Number.isFinite(r[2]);

export function validateWarehouse(w) {
  if (!w || typeof w !== 'object') throw new Error('Ma’lumot noto‘g‘ri');
  const code = String(w.code || '').trim().toUpperCase();
  if (!/^[A-Z]{1,3}\d{2,4}$/.test(code)) throw new Error(`Sklad kodi noto‘g‘ri: “${w.code}”. Fayl nomida R104 kabi kod bo‘lsin.`);
  if (!isStr(w.name, 80) || !isStr(w.file, 260)) throw new Error('Sklad nomi yoki fayl nomi noto‘g‘ri');
  if (!isArr(w.items, 50000) || !w.items.every((it) => Array.isArray(it) && it.length === 5 && it.every((x) => isStr(x, 400))))
    throw new Error('Materiallar ro‘yxati noto‘g‘ri');
  for (const k of ['depts', 'suppliers', 'machines', 'warnings']) {
    if (!isArr(w[k] || [], 20000) || !(w[k] || []).every((x) => isStr(x, 400))) throw new Error(`${k} noto‘g‘ri`);
  }
  const n = w.items.length;
  const checkRows = (rows, len, label) => {
    if (!isArr(rows, 400000)) throw new Error(`${label} noto‘g‘ri`);
    for (const r of rows) if (!row(r, len) || r[1] < 0 || r[1] >= n) throw new Error(`${label} qatorlari noto‘g‘ri`);
  };
  checkRows(w.out, 5, 'Списание');
  checkRows(w.in, 8, 'Приход');
  checkRows(w.ret || [], 5, 'Возврат');
  return {
    code,
    name: w.name.trim() || code,
    file: w.file,
    items: w.items,
    depts: w.depts || [],
    suppliers: w.suppliers || [],
    machines: w.machines || [],
    out: w.out,
    in: w.in,
    ret: w.ret || [],
    warnings: w.warnings || [],
  };
}

// Fayldagi eng oxirgi sana (Приход va Списание) — eski fayl yangisining ustiga yozilmasligini tekshirish uchun
export function dataLastDate(w) {
  let m = 0;
  for (const r of w.out || []) if (r[0] > m) m = r[0];
  for (const r of w.in || []) if (r[0] > m) m = r[0];
  return m;
}

// Kim/qayerdan yuklagani (saytda ko'rsatiladi)
export const cleanLabel = (s, max = 80) => String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Yuklash va o'chirish uchun admin paroli (ADMIN_PASSWORD). Ko'rish uchun kerak emas.
//   required — parol o'rnatilmagan bo'lsa ham yozishni taqiqlash (internetdagi versiyada shunday)
export function adminCheck(expected, given, { required }) {
  if (!expected) return required ? 'missing' : 'ok';
  return passwordOk(expected, given) ? 'ok' : 'wrong';
}

// Ixtiyoriy umumiy parol: SITE_PASSWORD o'rnatilgan bo'lsa, har so'rovda "x-site-password" sarlavhasi tekshiriladi
export function passwordOk(expected, given) {
  if (!expected) return true;
  const a = String(given || '');
  const b = String(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
