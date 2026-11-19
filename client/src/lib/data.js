import { dayList, daysBetween, monthKey, monthList, fmtDayShort, monthLabel } from './format.js';
import { api } from './api.js';
import { matchPlace } from './places.js';

// Boshqa skladga jo'natish (ko'chirish) — haqiqiy sarf emas.
// Belgi: "Отдел" boshqa sklad (311 …, Permesheniya … sklad, Sklad Kinr …). O'z skladi — sarf.
const isTransfer = (dept, place, ownCode) => {
  if (!dept) return false;
  if (place) return place.code !== ownCode;
  return /^311(\s|$)/.test(dept.trim()) || /sklad|склад/i.test(dept);
};


// "7-Makina TETRA 2500" -> 7 (makina bo'lmasa 0)
export const machineNo = (dept) => {
  const m = /^\s*(\d{1,2})\s*-\s*makina/i.exec(dept || '');
  return m ? +m[1] : 0;
};

export async function fetchDb() {
  const res = await api('/api/data');
  if (!res.ok) throw new Error(`Server javob bermadi (${res.status})`);
  return buildDb(await res.json());
}

export function buildDb({ warehouses, errors }) {
  const items = [];
  const itemIdx = new Map();
  const out = [];
  const inn = [];
  const ret = [];
  let minDate = Infinity;
  let maxDate = 0;
  const see = (d) => {
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
  };

  const machineNames = new Map(); // raqam -> nom
  const seeMachine = (name) => {
    const no = machineNo(name);
    if (no && !machineNames.has(no)) machineNames.set(no, name);
    return no;
  };

  // Sklad nomi: yuklangan fayldagi nom ustun ("R104 Saribuloq")
  const whName = new Map(warehouses.map((w) => [w.code, w.name]));
  const placeLabel = (text) => {
    const p = matchPlace(text);
    return p ? { p, label: `${p.code} ${whName.get(p.code) || p.name}` } : { p: null, label: text };
  };

  // Yetkazuvchi nomlari turlicha yozilgan bo'lsa ("MÜHENDİSLİK" / "MUHENDISLIK", qo'shtirnoq, katta-kichik harf)
  // — bitta deb hisoblanadi va eng ko'p uchragan yozuvi ko'rsatiladi.
  const supFold = (s) =>
    s
      .replace(/ı/g, 'i')
      .replace(/ş/gi, 'sh')
      .replace(/ç/gi, 'ch')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[«»"'`’‘“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const supVariants = new Map(); // fold -> Map(variant -> count)
  for (const w of warehouses) {
    const n = new Array(w.suppliers.length).fill(0);
    for (const r of w.in) n[r[3]]++;
    w.suppliers.forEach((raw, i) => {
      const label = placeLabel(raw).label;
      const k = supFold(label);
      if (!supVariants.has(k)) supVariants.set(k, new Map());
      const m = supVariants.get(k);
      m.set(label, (m.get(label) || 0) + n[i]);
    });
  }
  const supName = new Map([...supVariants].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));

  const whs = warehouses.map((w, wi) => {
    (w.machines || []).forEach(seeMachine);
    const map = w.items.map(([code, name, unit, category, sap]) => {
      let gi = itemIdx.get(code);
      if (gi === undefined) {
        gi = items.length;
        items.push({
          idx: gi,
          code,
          name,
          unit: unit || '—',
          category: category || 'Kategoriyasiz',
          sap,
          search: `${code} ${name} ${sap}`.toLowerCase(),
          whs: new Set(),
        });
        itemIdx.set(code, gi);
      } else {
        const it = items[gi];
        if (it.unit === '—' && unit) it.unit = unit;
        if (it.category === 'Kategoriyasiz' && category) it.category = category;
      }
      items[gi].whs.add(wi);
      return gi;
    });
    // Skladning oxirgi yangilangan sanasi — Списание va Приход listlaridagi eng oxirgi sana
    let lastOut = 0;
    let lastIn = 0;
    const deptInfo = w.depts.map(placeLabel);
    const tr = w.depts.map((d, i) => isTransfer(d, deptInfo[i].p, w.code));
    const supLabel = w.suppliers.map((x) => {
      const label = placeLabel(x).label;
      return supName.get(supFold(label)) || label;
    });
    const mno = w.depts.map(seeMachine);
    for (const r of w.out) {
      see(r[0]);
      if (r[0] > lastOut) lastOut = r[0];
      out.push({ t: 'out', w: wi, d: r[0], i: map[r[1]], q: r[2], dept: deptInfo[r[3]]?.label || 'Ko‘rsatilmagan', note: r[4], tr: tr[r[3]], m: mno[r[3]] });
    }
    for (const r of w.in) {
      see(r[0]);
      if (r[0] > lastIn) lastIn = r[0];
      inn.push({ t: 'in', w: wi, d: r[0], i: map[r[1]], q: r[2], supplier: supLabel[r[3]] || 'Ko‘rsatilmagan', courier: r[4], invoice: r[5], pay: r[6], note: r[7] });
    }
    for (const r of w.ret) {
      see(r[0]);
      ret.push({ t: 'ret', w: wi, d: r[0], i: map[r[1]], q: r[2], invoice: r[3], note: r[4] });
    }
    return {
      idx: wi,
      code: w.code,
      name: w.name,
      file: w.file,
      updatedAt: w.updatedAt,
      source: w.source || '',
      uploader: w.uploader || '',
      chat: w.chat || '',
      size: w.size,
      warnings: w.warnings || [],
      lastOut,
      lastIn,
      lastDate: Math.max(lastOut, lastIn),
      counts: { items: w.items.length, out: w.out.length, in: w.in.length, ret: w.ret.length },
    };
  });

  if (!maxDate) {
    minDate = 0;
    maxDate = 0;
  }
  const machines = [...machineNames.entries()].sort((a, b) => a[0] - b[0]).map(([no, name]) => ({ no, name }));
  return { warehouses: whs, items, machines, out, in: inn, ret, minDate, maxDate, errors: errors || [] };
}

export const inRange = (r, f) => (f.wh === -1 || r.w === f.wh) && r.d >= f.from && r.d <= f.to;

// Davrdagi chiqim yozuvlari ("ko'chirishlarsiz" yoqilgan bo'lsa — ularsiz)
export const usageRows = (db, f) => db.out.filter((r) => inRange(r, f) && !(f.noTransfer && r.tr));

// Davr ichida haqiqatda ma'lumot bor kunlar soni
export function periodRange(db, f) {
  const from = Math.max(f.from, db.minDate);
  const to = Math.min(f.to, db.maxDate);
  return { from, to, days: to >= from ? daysBetween(from, to) : 0 };
}

// Qoldiq: boshi = oldingi (kirim − chiqim + qaytarish), oxiri = boshi + kirim − chiqim + qaytarish
export function computeStock(db, f) {
  const n = db.items.length;
  const W = db.warehouses.length;
  const open = new Float64Array(n);
  const tin = new Float64Array(n);
  const tout = new Float64Array(n);
  const tret = new Float64Array(n);
  const use = new Float64Array(n);
  const endWh = Array.from({ length: W }, () => new Float64Array(n));

  const add = (rows, sign, acc) => {
    for (const r of rows) {
      if (r.d > f.to) continue;
      endWh[r.w][r.i] += sign * r.q;
      if (f.wh !== -1 && r.w !== f.wh) continue;
      if (r.d < f.from) open[r.i] += sign * r.q;
      else {
        acc[r.i] += r.q;
        if (acc === tout && !(f.noTransfer && r.tr)) use[r.i] += r.q;
      }
    }
  };
  add(db.in, 1, tin);
  add(db.out, -1, tout);
  add(db.ret, 1, tret);

  const { days } = periodRange(db, f);
  const rows = [];
  for (const item of db.items) {
    if (f.wh !== -1 && !item.whs.has(f.wh)) continue;
    const i = item.idx;
    const end = open[i] + tin[i] - tout[i] + tret[i];
    const avg = days ? use[i] / days : 0;
    rows.push({
      item,
      open: open[i],
      in: tin[i],
      out: tout[i],
      ret: tret[i],
      end,
      use: use[i],
      avg,
      cover: avg > 0 && end > 0 ? end / avg : null,
      byWh: endWh.map((a) => a[i]),
    });
  }
  return rows;
}

// O'lchov: 'count' — yozuvlar soni, 'qty' — miqdor (bitta material uchun), aks holda birlik nomi (шт, литр…)
export const measureValue = (db, measure) => {
  if (measure === 'count') return () => 1;
  if (measure === 'qty') return (r) => r.q;
  return (r) => (db.items[r.i].unit === measure ? r.q : 0);
};

export const measureLabel = (m) => (m === 'count' ? 'yozuv' : m === 'qty' ? '' : m);

// Kun yoki oy bo'yicha kirim/chiqim/qaytarish qatorlari
export function timeSeries(db, f, gran, measure, itemIdx = null, pred = null) {
  const { from, to, days } = periodRange(db, f);
  if (!days) return [];
  const val = measureValue(db, measure);
  const keys = gran === 'day' ? dayList(from, to) : monthList(from, to);
  const keyOf = gran === 'day' ? (d) => d : monthKey;
  // Bir yildan ortiq bo'lsa, oy yonida yil ham yoziladi: "Yan 26"
  const multiYear = gran === 'month' && keys.length && Math.floor(keys[0] / 100) !== Math.floor(keys[keys.length - 1] / 100);
  const mLabel = (k) => (multiYear ? `${monthLabel(k)} ${String(Math.floor(k / 100)).slice(2)}` : monthLabel(k));
  const map = new Map(keys.map((k) => [k, { key: k, label: gran === 'day' ? fmtDayShort(k) : mLabel(k), out: 0, in: 0, ret: 0 }]));
  const add = (rows, field, skipTransfer) => {
    for (const r of rows) {
      if (!inRange(r, f) || (itemIdx !== null && r.i !== itemIdx)) continue;
      if (skipTransfer && f.noTransfer && r.tr) continue;
      if (pred && !pred(r)) continue;
      const b = map.get(keyOf(r.d));
      if (b) b[field] += val(r);
    }
  };
  add(db.out, 'out', true);
  add(db.in, 'in', false);
  add(db.ret, 'ret', false);
  return [...map.values()];
}

// Guruhlab yig'ish: [{ key, value, count }] — kamayish tartibida
export function groupSum(rows, keyFn, valFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    let g = map.get(k);
    if (!g) {
      g = { key: k, value: 0, count: 0 };
      map.set(k, g);
    }
    g.value += valFn(r);
    g.count++;
  }
  return [...map.values()].filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
}

// Davrda eng ko'p uchraydigan o'lchov birliklari
export function topUnits(db, rows, limit = 4) {
  const cnt = new Map();
  for (const r of rows) {
    const u = db.items[r.i].unit;
    cnt.set(u, (cnt.get(u) || 0) + 1);
  }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map((e) => e[0]);
}

// Guruhlab miqdorni yig'ish. Guruh ichida birlik bir xil bo'lsa — unit to'ldiriladi (aralash bo'lsa bo'sh).
// measure: 'qty' — miqdor, 'count' — yozuvlar soni.
export function groupQty(db, rows, keyFn, measure = 'qty') {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    let g = map.get(k);
    if (!g) {
      g = { key: k, value: 0, count: 0, qty: 0, unit: null };
      map.set(k, g);
    }
    g.qty += r.q;
    g.count++;
    const u = db.items[r.i].unit;
    if (g.unit === null) g.unit = u;
    else if (g.unit !== u) g.unit = '';
  }
  const out = [...map.values()];
  for (const g of out) {
    g.value = measure === 'count' ? g.count : g.qty;
    if (measure === 'count') g.unit = 'yozuv';
    else if (g.unit === null) g.unit = '';
  }
  return out.filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
}
