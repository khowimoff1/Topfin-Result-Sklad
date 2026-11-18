// Sklad Excel faylini o'qib, saytga kerakli ixcham ko'rinishga keltiradi.
// Kerakli listlar: Остатка (nomenklatura), Списание (chiqim), Приход (kirim), Возврат (qaytarish).
const path = require('path');
const XLSX = require('xlsx');
const { placeFromFileName } = require('./places');

const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

function findSheet(wb, prefix) {
  const name = wb.SheetNames.find((n) => norm(n).startsWith(prefix));
  return name ? wb.Sheets[name] : null;
}

function sheetRows(ws) {
  if (!ws || !ws['!ref']) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

// Sarlavha qatorini topadi va ustun nomi -> indeks xaritasini qaytaradi.
function findHeader(rows, required) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map(norm);
    if (required.every((r) => cells.some((c) => c === r))) {
      const map = {};
      cells.forEach((c, idx) => {
        if (c && !(c in map)) map[c] = idx;
      });
      return { index: i, map };
    }
  }
  return null;
}

const col = (map, ...names) => {
  for (const n of names) if (n in map) return map[n];
  return -1;
};

// Excel sanasi (serial son, Date yoki matn) -> 20260325 ko'rinishidagi butun son.
function toDateInt(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return 0;
    const p = XLSX.SSF.parse_date_code(v);
    return p ? p.y * 10000 + p.m * 100 + p.d : 0;
  }
  if (v instanceof Date) {
    return v.getFullYear() * 10000 + (v.getMonth() + 1) * 100 + v.getDate();
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return +m[3] * 10000 + +m[2] * 100 + +m[1];
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return +m[1] * 10000 + +m[2] * 100 + +m[3];
  return 0;
}

const unitFix = (u) => {
  const s = clean(u);
  if (!s || s === '-') return '';
  const l = s.toLowerCase();
  if (l === 'ad/шт' || l === 'шт') return 'шт';
  return l;
};

function warehouseFromFileName(fileName) {
  const base = path.basename(fileName).replace(/.[^.]+$/, '');
  const { code, name } = placeFromFileName(base);
  return { code, name: name || code || base };
}

function parseWorkbook(filePath, displayName) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const fileName = displayName || path.basename(filePath);
  const warnings = [];

  const wsStock = findSheet(wb, 'остат');
  const wsOut = findSheet(wb, 'спис');
  const wsIn = findSheet(wb, 'приход');
  const wsRet = findSheet(wb, 'возврат');
  const missing = [
    ['Остатка', wsStock],
    ['Списание', wsOut],
    ['Приход', wsIn],
  ].filter((x) => !x[1]).map((x) => x[0]);
  if (missing.length) {
    throw new Error(`Faylda kerakli listlar topilmadi: ${missing.join(', ')}`);
  }

  // --- Kategoriyalar (Baza: счёт kodi -> nomi)
  const categories = {};
  const machines = []; // "7-Makina TETRA 2500" kabi nomlar (Baza listidan)
  const wsBaza = findSheet(wb, 'baza');
  if (wsBaza) {
    for (const r of sheetRows(wsBaza).slice(1)) {
      if (!r) continue;
      for (const cell of r) {
        if (typeof cell === 'string' && /^\s*\d{1,2}\s*-\s*makina/i.test(cell)) {
          const nm = clean(cell);
          if (!machines.includes(nm)) machines.push(nm);
        }
      }
      for (const [a, b] of [[0, 1], [23, 24]]) {
        if (r[a] !== null && r[a] !== undefined && r[b]) categories[String(r[a]).trim()] = clean(r[b]);
      }
    }
  }

  // --- Nomenklatura (Остатка)
  const items = [];
  const itemIndex = new Map();
  const addItem = (code, name, unit, account, sapCode) => {
    const key = clean(code);
    if (!key || key === '-' || key === '0') return -1;
    let idx = itemIndex.get(key);
    if (idx === undefined) {
      idx = items.length;
      const acc = clean(account);
      items.push({
        code: key,
        name: clean(name) || key,
        unit: unitFix(unit),
        category: acc ? categories[acc] || acc : '',
        sap: clean(sapCode),
      });
      itemIndex.set(key, idx);
    } else {
      const it = items[idx];
      if (!it.unit && unit) it.unit = unitFix(unit);
      if (!it.category && account) {
        const acc = clean(account);
        it.category = categories[acc] || acc;
      }
    }
    return idx;
  };

  const stockRows = sheetRows(wsStock);
  const sh = findHeader(stockRows, ['код']);
  if (!sh) throw new Error('Остатка listida "Код" ustuni topilmadi');
  {
    const m = sh.map;
    const cCode = col(m, 'код');
    const cName = col(m, 'sap наименование', 'наименование');
    const cExcel = col(m, 'excel наименование');
    const cUnit = col(m, 'ед-из', 'ед.изм', 'ед-изм');
    const cSap = col(m, 'sap код', 'sap kod');
    // "Основной счет" va "Партия" nomlari bir qator yuqorida turadi
    const up = (stockRows[sh.index - 1] || []).map(norm);
    const cAcc = up.indexOf('основной счет');
    for (let i = sh.index + 1; i < stockRows.length; i++) {
      const r = stockRows[i];
      if (!r) continue;
      const code = clean(r[cCode]);
      const name = clean(r[cName]) || (cExcel >= 0 ? clean(r[cExcel]) : '');
      if (!code || !name) continue;
      if (/^\d{1,2}$/.test(code) && /^\d{1,2}$/.test(name)) continue; // ustun raqamlari qatori (1,2,3…)
      addItem(code, name, r[cUnit], cAcc >= 0 ? r[cAcc] : '', cSap >= 0 ? r[cSap] : '');
    }
  }

  // --- Harakatlar uchun umumiy o'quvchi
  let skippedNoDate = 0;
  const readMoves = (ws, label, build) => {
    const rows = sheetRows(ws);
    const h = findHeader(rows, ['дата', 'код']);
    if (!h) {
      warnings.push(`${label}: sarlavha qatori topilmadi`);
      return [];
    }
    const m = h.map;
    const cDate = col(m, 'дата');
    const cCode = col(m, 'код');
    const cName = col(m, 'наименование');
    const cUnit = col(m, 'ед-из', 'ед.изм', 'ед-изм');
    const cQty = col(m, 'количество', 'кол-во');
    const cSap = col(m, 'sap kod', 'sap код');
    const out = [];
    for (let i = h.index + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const code = clean(r[cCode]);
      const qty = r[cQty];
      if (!code || code === '-' || typeof qty !== 'number' || !qty) continue;
      const d = toDateInt(r[cDate]);
      if (!d) {
        skippedNoDate++;
        continue;
      }
      const idx = addItem(code, r[cName], r[cUnit], '', cSap >= 0 ? r[cSap] : '');
      if (idx < 0) continue;
      out.push(build(r, m, d, idx, Math.round(qty * 1000) / 1000));
    }
    return out;
  };

  const dict = (arr) => {
    const map = new Map();
    return {
      arr,
      id(v) {
        const s = clean(v);
        const key = s === '-' ? '' : s;
        let i = map.get(key);
        if (i === undefined) {
          i = arr.length;
          arr.push(key);
          map.set(key, i);
        }
        return i;
      },
    };
  };
  const note = (...vals) => vals.map(clean).filter((s) => s && s !== '-' && s !== '0').join(' · ');

  // --- Списание: [sana, tovar, miqdor, bo'lim, izoh]
  const depts = dict([]);
  const out = readMoves(wsOut, 'Списание', (r, m, d, idx, qty) => {
    const cDept = col(m, 'отдел');
    const cN1 = col(m, 'примечание');
    return [d, idx, qty, depts.id(cDept >= 0 ? r[cDept] : ''), note(cN1 >= 0 ? r[cN1] : '')];
  });

  // --- Приход: [sana, tovar, miqdor, yetkazuvchi, kuryer, nakladnoy, to'lov turi, izoh]
  const suppliers = dict([]);
  const inn = readMoves(wsIn, 'Приход', (r, m, d, idx, qty) => {
    const g = (...n) => {
      const c = col(m, ...n);
      return c >= 0 ? r[c] : '';
    };
    return [
      d, idx, qty,
      suppliers.id(g('поставщик')),
      clean(g('курьер')),
      note(g('№ накладной', 'накладной')),
      clean(g('тип оплаты')),
      note(g('примечание')),
    ];
  });

  // --- Возврат: [sana, tovar, miqdor, nakladnoy, izoh]
  const ret = wsRet
    ? readMoves(wsRet, 'Возврат', (r, m, d, idx, qty) => {
        const g = (...n) => {
          const c = col(m, ...n);
          return c >= 0 ? r[c] : '';
        };
        return [d, idx, qty, note(g('№ накладной', 'накладной')), note(g('примечание'))];
      })
    : [];

  if (skippedNoDate) warnings.push(`${skippedNoDate} ta qatorda sana yo'q — hisobga olinmadi`);

  // --- Sklad kodi va nomi: fayl nomidan, bo'lmasa Списание dagi "Код склад" dan
  let { code, name } = warehouseFromFileName(fileName);
  if (!code) {
    const rows = sheetRows(wsOut);
    const h = findHeader(rows, ['дата', 'код']);
    const c = h ? col(h.map, 'код склад') : -1;
    if (c >= 0) {
      const cnt = {};
      for (const r of rows.slice(h.index + 1, h.index + 500)) {
        const v = clean(r && r[c]);
        if (/^[A-Za-z]\d{2,4}$/.test(v)) cnt[v] = (cnt[v] || 0) + 1;
      }
      code = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '';
    }
    if (!code) code = name.slice(0, 12);
  }

  return {
    code,
    name,
    file: fileName,
    items: items.map((it) => [it.code, it.name, it.unit, it.category, it.sap]),
    depts: depts.arr,
    suppliers: suppliers.arr,
    machines,
    out,
    in: inn,
    ret,
    warnings,
  };
}

module.exports = { parseWorkbook, warehouseFromFileName };
