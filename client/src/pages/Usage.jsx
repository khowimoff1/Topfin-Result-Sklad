import React, { useMemo, useState } from 'react';
import { periodRange, usageRows } from '../lib/data.js';
import { dayList, dD, fmtDate, fmtNum, monthKey, monthLabel, monthList } from '../lib/format.js';
import { Card, Qty, Search, Select, Segmented } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';

// Material × (oy yoki kun) jadvali: har bir materialdan qachon qancha ishlatilgan.
export default function Usage({ db, f, openItem }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [dept, setDept] = useState('');
  const [granSel, setGran] = useState('month');

  const { from, to, days } = periodRange(db, f);
  const canDay = days > 0 && days <= 31;
  const gran = granSel === 'day' && canDay ? 'day' : 'month';

  const base = useMemo(() => usageRows(db, f), [db, f]);
  const depts = useMemo(() => {
    const m = new Map();
    for (const r of base) m.set(r.dept, (m.get(r.dept) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [base]);
  const categories = useMemo(() => [...new Set(base.map((r) => db.items[r.i].category))].sort((a, b) => a.localeCompare(b, 'ru')), [base, db]);

  const keys = useMemo(() => (days ? (gran === 'day' ? dayList(from, to) : monthList(from, to)) : []), [gran, from, to, days]);

  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const keyOf = gran === 'day' ? (d) => d : monthKey;
    const map = new Map();
    for (const r of base) {
      if (dept && r.dept !== dept) continue;
      const item = db.items[r.i];
      if (cat && item.category !== cat) continue;
      if (words.length && !words.every((w) => item.search.includes(w))) continue;
      let g = map.get(r.i);
      if (!g) {
        g = { item, total: 0, count: 0, cols: {} };
        map.set(r.i, g);
      }
      g.total += r.q;
      g.count++;
      const k = keyOf(r.d);
      g.cols[k] = (g.cols[k] || 0) + r.q;
    }
    return [...map.values()];
  }, [base, db, q, cat, dept, gran]);

  const columns = useMemo(() => {
    const cols = [
      { key: 'code', hideMobile: true, title: 'Kod', value: (r) => r.item.code, render: (r) => <span className="code">{r.item.code}</span>, width: 108 },
      { key: 'name', title: 'Nomi', value: (r) => r.item.name, render: (r) => <span className="item-name">{r.item.name}</span>, sticky: true },
      { key: 'unit', title: 'Birlik', value: (r) => r.item.unit, exportOnly: true },
    ];
    for (const k of keys) {
      cols.push({
        key: `k${k}`,
        title: gran === 'day' ? String(dD(k)) : monthLabel(k),
        csvTitle: gran === 'day' ? fmtDate(k) : monthLabel(k, true),
        hint: gran === 'day' ? fmtDate(k) : monthLabel(k, true),
        align: 'right',
        value: (r) => r.cols[k] || 0,
        render: (r) => (r.cols[k] ? fmtNum(r.cols[k]) : <span className="zero">·</span>),
      });
    }
    cols.push(
      { key: 'total', title: 'Jami', align: 'right', value: (r) => r.total, render: (r) => <Qty v={r.total} unit={r.item.unit} strong />, cellClass: () => 'col-strong' },
      {
        key: 'avgDay',
        title: 'Kuniga',
        align: 'right',
        hint: 'O‘rtacha kunlik sarf (jami ÷ davrdagi kunlar soni)',
        value: (r) => (days ? r.total / days : 0),
        render: (r) => fmtNum(Math.round((r.total / (days || 1)) * 100) / 100),
      },
      {
        key: 'avgMonth',
        title: 'Oyiga',
        align: 'right',
        hint: 'O‘rtacha oylik sarf (kunlik × 30)',
        value: (r) => (days ? (r.total / days) * 30 : 0),
        render: (r) => fmtNum(Math.round((r.total / (days || 1)) * 30 * 10) / 10),
      },
      { key: 'count', title: 'Yozuv', align: 'right', value: (r) => r.count, hint: 'Necha marta berilgan' }
    );
    return cols;
  }, [keys, gran, days]);

  return (
    <Card pad={false}>
      <DataTable
        columns={columns}
        rows={rows}
        onRowClick={(r) => openItem(r.item.idx)}
        initialSort={{ key: 'count', dir: 'desc' }}
        exportName={`sarf_${gran === 'day' ? 'kunlik' : 'oylik'}_${f.from}-${f.to}`}
        toolbar={
          <>
            <Search value={q} onChange={setQ} placeholder="Material nomi yoki kodi…" />
            <Select
              value={dept}
              onChange={setDept}
              options={[{ value: '', label: 'Barcha bo‘limlar (Отдел)' }, ...depts.map(([d, n]) => ({ value: d, label: `${d} (${n})` }))]}
            />
            <Select
              value={cat}
              onChange={setCat}
              options={[{ value: '', label: 'Barcha kategoriyalar' }, ...categories.map((c) => ({ value: c, label: c }))]}
            />
            <Segmented
              small
              value={gran}
              onChange={setGran}
              options={[
                { value: 'month', label: 'Oylar bo‘yicha' },
                { value: 'day', label: 'Kunlar bo‘yicha', disabled: !canDay, title: canDay ? '' : 'Kunlar bo‘yicha ko‘rish uchun 31 kungacha davr tanlang' },
              ]}
            />
          </>
        }
      />
    </Card>
  );
}
