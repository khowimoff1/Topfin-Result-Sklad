import { dD, monthEnd, monthKey, monthLabel, monthList, monthStart } from './format.js';

// Realizatsiya nazoratidagi 3 tur. Tur Excel'dagi "Основной счет" (kategoriya) bo'yicha aniqlanadi.
export const CONTROL = [
  { id: 'almaz', label: 'Almaz', ru: 'Алмаз', test: (it) => /алмаз/i.test(it.category) },
  { id: 'polimer', label: 'Polimer', ru: 'Полимер', test: (it) => /полимер/i.test(it.category) },
  { id: 'dizel', label: 'Dizel', ru: 'Дизельное топливо', test: (it) => /дизел/i.test(it.category) },
];

const cache = new WeakMap();
// Har bir material uchun: 'almaz' | 'polimer' | 'dizel' | null
export function controlIndex(db) {
  let idx = cache.get(db);
  if (!idx) {
    idx = db.items.map((it) => CONTROL.find((c) => c.test(it))?.id || null);
    cache.set(db, idx);
  }
  return idx;
}

// Haqiqiy sarf: boshqa skladga ko'chirishlar hisobga olinmaydi
export const realUsage = (db, wh) => db.out.filter((r) => !r.tr && (wh === -1 || r.w === wh));

const sumUnit = (a, b) => (a === null ? b : a === b ? a : '');

// Bitta guruh (tur × sklad / makina / material) uchun tahlil.
//   mk     — tekshirilayotgan oy (202611)
//   months — o'rtacha uchun nechta oldingi to'liq oy (0 — hammasi)
//   tol    — ruxsat etilgan oshish (0.1 = 10%)
//
// O'rtacha = oldingi oylardagi sarfning o'rtachasi. Hisobga kirmaydi:
//   - sarf bo'lmagan oylar (ishlamagan),
//   - birinchi sarf oyning 5-sanasidan keyin bo'lgan to'liqsiz oy.
// Prognoz = joriy oydagi fakt ÷ o'tgan kunlar × oydagi kunlar.
// Qizil: fakt o'rtachadan oshdi, yoki (oyning 5 kuni o'tgach) prognoz o'rtachadan oshadi.
export function analyze(db, rows, mk, { months = 3, tol = 0, lastDate } = {}) {
  // Prognoz shu guruh skladlarining oxirgi yozuv sanasidan hisoblanadi
  let last = lastDate || 0;
  if (!last) for (const r of rows) last = Math.max(last, db.warehouses[r.w]?.lastDate || 0);
  if (!last) last = db.maxDate;
  const byMonth = new Map();
  let unit = null;
  let first = 0;
  for (const r of rows) {
    const m = monthKey(r.d);
    if (m > mk) continue;
    byMonth.set(m, (byMonth.get(m) || 0) + r.q);
    unit = sumUnit(unit, db.items[r.i].unit);
    if (!first || r.d < first) first = r.d;
  }
  const firstMk = first ? monthKey(first) : mk;
  const partialFirst = first ? dD(first) > 5 : false;
  let base = [...byMonth.entries()].filter(([m, v]) => m < mk && v > 0 && !(partialFirst && m === firstMk)).sort((a, b) => a[0] - b[0]);
  if (months > 0) base = base.slice(-months);
  const avg = base.length ? base.reduce((s, b) => s + b[1], 0) / base.length : null;

  const fact = byMonth.get(mk) || 0;
  const dim = dD(monthEnd(mk));
  const elapsed = mk === monthKey(last) ? Math.min(dim, dD(last)) : mk > monthKey(last) ? 0 : dim;
  const proj = elapsed ? (fact / elapsed) * dim : fact;

  const baseSet = new Set(base.map((b) => b[0]));
  const history = monthList(monthStart(Math.min(firstMk, mk)), monthStart(mk)).map((m) => ({
    key: m,
    label: monthLabel(m),
    fact: byMonth.get(m) || 0,
    inBase: baseSet.has(m),
  }));
  return finish({ fact, proj, avg, elapsed, dim, unit: unit || '', baseMonths: [...baseSet], history, tol });
}

function finish(a) {
  const lim = a.avg === null ? null : a.avg * (1 + a.tol);
  const factOver = lim !== null && a.fact > lim + 1e-9;
  const projOver = lim !== null && a.elapsed >= 5 && a.proj > lim + 1e-9;
  const partial = a.elapsed < a.dim;
  return {
    ...a,
    partial,
    ratio: a.avg ? (partial ? a.proj : a.fact) / a.avg : null,
    factOver,
    status: a.avg === null ? (a.fact > 0 ? 'new' : 'none') : factOver || projOver ? 'over' : 'ok',
  };
}

// Bir nechta guruhni qo'shish (masalan barcha skladlar). O'rtachasi yo'q (yangi) guruh
// solishtirishga ta'sir qilmasligi uchun uning prognozi o'rtachaga ham qo'shiladi.
export function combine(list, tol = 0) {
  if (!list.length) return null;
  const hist = new Map();
  let fact = 0, proj = 0, avg = 0, hasAvg = false, unit = null;
  for (const a of list) {
    fact += a.fact;
    proj += a.proj;
    if (a.avg !== null) {
      avg += a.avg;
      hasAvg = true;
    } else avg += a.proj;
    unit = sumUnit(unit, a.unit);
    for (const h of a.history) {
      const x = hist.get(h.key) || { ...h, fact: 0, inBase: false };
      x.fact += h.fact;
      x.inBase = x.inBase || h.inBase;
      hist.set(h.key, x);
    }
  }
  const base = list.flatMap((a) => a.baseMonths);
  return finish({
    fact,
    proj,
    avg: hasAvg ? avg : null,
    elapsed: Math.max(...list.map((a) => a.elapsed)),
    dim: list[0].dim,
    unit: unit || '',
    baseMonths: [...new Set(base)].sort(),
    history: [...hist.values()].sort((a, b) => a.key - b.key),
    tol,
  });
}

// rows ni (kalit × tur) bo'yicha guruhlab tahlil qiladi: [{ key, cat, a }]
export function analyzeBy(db, rows, mk, opts, keyFn) {
  const idx = controlIndex(db);
  const groups = new Map();
  for (const r of rows) {
    const c = idx[r.i];
    if (!c) continue;
    const k = keyFn(r);
    if (k === null || k === undefined || k === '' || k === 0) continue;
    const gk = `${k}\u0000${c}`;
    let g = groups.get(gk);
    if (!g) groups.set(gk, (g = { key: k, cat: c, rows: [] }));
    g.rows.push(r);
  }
  const out = [];
  for (const g of groups.values()) {
    const a = analyze(db, g.rows, mk, opts);
    if (a.fact > 0 || a.avg !== null) out.push({ key: g.key, cat: g.cat, a });
  }
  return out;
}

// Har bir tur bo'yicha jami (skladlar alohida hisoblanib, keyin qo'shiladi)
export function analyzeTotals(db, wh, mk, opts) {
  const parts = analyzeBy(db, realUsage(db, wh), mk, opts, (r) => r.w + 1);
  return CONTROL.map((c) => ({ ...c, a: combine(parts.filter((p) => p.cat === c.id).map((p) => p.a), opts.tol) }));
}

export const pctText = (a) => {
  if (!a || a.ratio === null) return '';
  const p = Math.round((a.ratio - 1) * 100);
  return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)}%`;
};
