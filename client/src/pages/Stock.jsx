import React, { useMemo, useState } from 'react';
import { computeStock } from '../lib/data.js';
import { fmtDate, fmtInt, fmtNum } from '../lib/format.js';
import { Card, Qty, Search, Select, Segmented } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';

const EPS = 1e-9;

// Birinchi navbatda: Almaz, kerno yashik, polimer (shu tartibda). "Necha kunga yetadi" ham faqat shularda.
const PRIORITY = [/алмаз/i, /ящик/i, /полимер/i];
const prio = (item) => {
  const i = PRIORITY.findIndex((re) => re.test(item.category));
  return i < 0 ? PRIORITY.length : i;
};
const watched = (item) => prio(item) < PRIORITY.length;
const numCell = (v) => (Math.abs(v) < EPS ? <span className="zero">0</span> : v < 0 ? <span className="neg">{fmtNum(v)}</span> : fmtNum(v));

// Ikki ko'rinish:
//  - "Hozirgi qoldiq": bugungi kunga nechta bor va qaysi skladda turibdi
//  - "Davr harakati": tanlangan davr boshi → kirim/chiqim/qaytarish → davr oxiri (Excel'dagi Остатка kabi)
export default function Stock({ db, f, openItem, stockStatus, setStockStatus }) {
  const [view, setView] = useState('now');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  const period = useMemo(() => computeStock(db, f), [db, f]);
  const stock = useMemo(() => {
    const coverOf = (s, avg) => (watched(s.item) && avg > 0 && s.end > EPS ? s.end / avg : null);
    if (view === 'period') return period.map((s) => ({ ...s, cover: coverOf(s, s.avg) }));
    // hozirgi qoldiq — butun davr bo'yicha; kunlik sarf — tanlangan davrdan
    const now = computeStock(db, { ...f, from: db.minDate, to: db.maxDate });
    return now.map((s, i) => {
      const avg = period[i].avg;
      return { ...s, avg, cover: coverOf(s, avg) };
    });
  }, [db, f, view, period]);

  const multi = f.wh === -1 && db.warehouses.length > 1;
  const status = view === 'now' && stockStatus === 'active' ? 'pos' : stockStatus;
  const categories = useMemo(() => [...new Set(stock.map((s) => s.item.category))].sort((a, b) => a.localeCompare(b, 'ru')), [stock]);

  const counts = useMemo(() => {
    const c = { active: 0, pos: 0, neg: 0, zero: 0, low: 0, all: stock.length };
    for (const s of stock) {
      if (s.in || s.out || s.ret || Math.abs(s.end) > EPS) c.active++;
      if (s.end > EPS) c.pos++;
      else if (s.end < -EPS) c.neg++;
      else c.zero++;
      if (s.cover !== null && s.cover < 7) c.low++;
    }
    return c;
  }, [stock]);

  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    // Tartib: Almaz → kerno yashik → polimer → qolganlari; har guruh ichida eng ko'pidan kamayib
    const ordered = [...stock].sort((a, b) => prio(a.item) - prio(b.item) || b.end - a.end || a.item.name.localeCompare(b.item.name, 'ru'));
    return ordered.filter((s) => {
      if (cat && s.item.category !== cat) return false;
      if (words.length && !words.every((w) => s.item.search.includes(w))) return false;
      switch (status) {
        case 'active':
          return s.in || s.out || s.ret || Math.abs(s.end) > EPS;
        case 'pos':
          return s.end > EPS;
        case 'neg':
          return s.end < -EPS;
        case 'zero':
          return Math.abs(s.end) <= EPS;
        case 'low':
          return s.cover !== null && s.cover < 7;
        default:
          return true;
      }
    });
  }, [stock, q, cat, status]);

  const columns = useMemo(() => {
    const cols = [
      { key: 'code', hideMobile: true, title: 'Kod', value: (r) => r.item.code, render: (r) => <span className="code">{r.item.code}</span>, width: 108 },
      { key: 'name', title: 'Nomi', value: (r) => r.item.name, render: (r) => <span className="item-name">{r.item.name}</span>, sticky: true },
      { key: 'cat', hideMobile: true, title: 'Kategoriya', value: (r) => r.item.category, render: (r) => <span className="muted">{r.item.category}</span> },
      { key: 'unit', title: 'Birlik', value: (r) => r.item.unit, exportOnly: true },
    ];
    if (view === 'period') {
      cols.push(
        { key: 'open', title: 'Davr boshi', csvTitle: `Davr boshi (${fmtDate(f.from)})`, align: 'right', value: (r) => r.open, render: (r) => numCell(r.open), hint: 'Остатка на начало' },
        { key: 'in', title: 'Kirim', align: 'right', value: (r) => r.in, render: (r) => numCell(r.in), hint: 'Приход' },
        { key: 'out', title: 'Chiqim', align: 'right', value: (r) => r.out, render: (r) => numCell(r.out), hint: 'Списание' },
        { key: 'ret', title: 'Qaytarish', align: 'right', value: (r) => r.ret, render: (r) => numCell(r.ret), hint: 'Возврат' }
      );
    }
    cols.push({
      key: 'end',
      title: view === 'now' ? (multi ? 'Jami qoldiq' : 'Hozirgi qoldiq') : 'Davr oxiri',
      csvTitle: view === 'now' ? `Qoldiq (${fmtDate(db.maxDate)})` : `Davr oxiri (${fmtDate(f.to)})`,
      align: 'right',
      value: (r) => r.end,
      render: (r) => <Qty v={r.end} unit={r.item.unit} strong />,
      hint: view === 'now' ? 'Hozir skladda nechta bor' : 'Остатка на конец',
      cellClass: () => 'col-strong',
    });
    if (multi) {
      for (const w of db.warehouses) {
        cols.push({
          key: `wh${w.idx}`,
          title: (
            <>
              <span className="wh-chip">{w.code}</span> {w.name}
            </>
          ),
          csvTitle: `${w.code} ${w.name}`,
          align: 'right',
          value: (r) => r.byWh[w.idx],
          render: (r) => (r.item.whs.has(w.idx) ? <Qty v={r.byWh[w.idx]} unit={r.item.unit} /> : <span className="zero">—</span>),
          hint: `${w.name} skladida turgan miqdor`,
        });
      }
    }
    cols.push(
      {
        key: 'avg',
        title: 'Kunlik sarf',
        align: 'right',
        value: (r) => r.avg,
        render: (r) => (r.avg > 0 ? fmtNum(Math.round(r.avg * 100) / 100) : <span className="zero">—</span>),
        hint: 'Tanlangan davrdagi o‘rtacha kunlik sarf',
      },
      {
        key: 'cover',
        title: 'Yetadi',
        align: 'right',
        value: (r) => r.cover,
        render: (r) =>
          !watched(r.item) ? null : r.cover === null ? <span className="zero">—</span> : r.cover < 7 ? <span className="warn">⚠ {fmtInt(r.cover)} kun</span> : `${fmtInt(r.cover)} kun`,
        hint: 'Almaz, kerno yashik, polimer: hozirgi sarf sur’ati bilan qoldiq necha kunga yetadi',
      }
    );
    return cols;
  }, [db, f, view, multi]);

  const statusOptions = [
    ...(view === 'period' ? [{ value: 'active', label: `Faol ${fmtInt(counts.active)}`, title: 'Davrda harakat bo‘lgan yoki qoldig‘i bor' }] : []),
    { value: 'pos', label: `Qoldiq bor ${fmtInt(counts.pos)}` },
    { value: 'low', label: `Kam qoldi ${fmtInt(counts.low)}`, title: 'Almaz, kerno yashik, polimer: hozirgi sarf bilan 7 kundan kamga yetadi' },
    { value: 'neg', label: `Manfiy ${fmtInt(counts.neg)}` },
    { value: 'zero', label: `Tugagan ${fmtInt(counts.zero)}` },
    { value: 'all', label: `Hammasi ${fmtInt(counts.all)}` },
  ];

  return (
    <div className="stack">
      <div className="scope-bar">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'now', label: 'Hozirgi qoldiq' },
            { value: 'period', label: 'Davr harakati (Excel’dagidek)' },
          ]}
        />
        <span className="muted">
          {view === 'now' ? (
            <>
              <b>{fmtDate(db.maxDate)}</b> holatiga — {multi ? 'har bir skladda nechta turgani alohida ustunda' : `${db.warehouses[f.wh]?.name || ''} skladi`}
            </>
          ) : (
            <>
              {fmtDate(f.from)} — {fmtDate(f.to)} davri uchun
            </>
          )}
        </span>
      </div>

      <Card pad={false}>
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(r) => openItem(r.item.idx)}
          initialSort={null}
          key={view}
          exportName={`qoldiq_${f.wh === -1 ? 'hammasi' : db.warehouses[f.wh].code}_${view === 'now' ? db.maxDate : `${f.from}-${f.to}`}`}
          toolbar={
            <>
              <Search value={q} onChange={setQ} placeholder="Nomi yoki kodi bo‘yicha qidirish…" />
              <Select value={cat} onChange={setCat} options={[{ value: '', label: 'Barcha kategoriyalar' }, ...categories.map((c) => ({ value: c, label: c }))]} />
              <Segmented small value={status} onChange={setStockStatus} options={statusOptions} />
            </>
          }
        />
      </Card>
    </div>
  );
}
