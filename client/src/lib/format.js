export const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
export const MONTHS_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

// 12 340 yoki 12 340,5 — butun bo'lmasa 2 xonagacha
export const fmtNum = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const v = Math.abs(n) < 1e-9 ? 0 : n;
  return (Number.isInteger(v) ? nf0 : nf2).format(v).replace('-', '−');
};
export const fmtInt = (n) => nf0.format(Math.round(n || 0)).replace('-', '−');
export const fmtCompact = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return nf2.format(Math.round(n / 1e4) / 100) + ' mln';
  if (a >= 1e4) return nf2.format(Math.round(n / 100) / 10) + ' ming';
  return fmtNum(n);
};

// Sana butun son ko'rinishida saqlanadi: 20260325
export const dY = (d) => Math.floor(d / 10000);
export const dM = (d) => Math.floor(d / 100) % 100;
export const dD = (d) => d % 100;
export const toInt = (date) => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
export const fromInt = (d) => new Date(dY(d), dM(d) - 1, dD(d));
export const addDays = (d, n) => {
  const x = fromInt(d);
  x.setDate(x.getDate() + n);
  return toInt(x);
};
export const daysBetween = (a, b) => Math.round((Date.UTC(dY(b), dM(b) - 1, dD(b)) - Date.UTC(dY(a), dM(a) - 1, dD(a))) / 86400000) + 1;
const p2 = (n) => String(n).padStart(2, '0');
export const fmtDate = (d) => (d ? `${p2(dD(d))}.${p2(dM(d))}.${dY(d)}` : '—');
export const fmtDayShort = (d) => `${dD(d)}-${MONTHS_SHORT[dM(d) - 1].toLowerCase()}`;
export const toIso = (d) => (d ? `${dY(d)}-${p2(dM(d))}-${p2(dD(d))}` : '');
export const fromIso = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
};
export const monthKey = (d) => Math.floor(d / 100); // 202603
export const monthLabel = (mk, long) => `${(long ? MONTHS : MONTHS_SHORT)[(mk % 100) - 1]}${long ? ' ' + Math.floor(mk / 100) : ''}`;
export const monthStart = (mk) => mk * 100 + 1;
export const monthEnd = (mk) => toInt(new Date(Math.floor(mk / 100), mk % 100, 0));

export const dayList = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
export const monthList = (from, to) => {
  const out = [];
  let y = dY(from);
  let m = dM(from);
  const end = monthKey(to);
  while (y * 100 + m <= end) {
    out.push(y * 100 + m);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};

export const fmtDateTime = (ms) => {
  const x = new Date(ms);
  return `${p2(x.getDate())}.${p2(x.getMonth() + 1)}.${x.getFullYear()} ${p2(x.getHours())}:${p2(x.getMinutes())}`;
};

// Jadvalni CSV qilib yuklab olish (Excel ochadi)
export function downloadCsv(name, columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : v);
  const lines = [columns.map((c) => esc(c.csvTitle || c.title)).join(';')];
  for (const r of rows) lines.push(columns.map((c) => esc(num(c.value ? c.value(r) : r[c.key]))).join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
