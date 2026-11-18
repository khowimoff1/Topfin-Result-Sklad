import React, { useMemo, useState } from 'react';
import { groupQty, inRange, periodRange, timeSeries } from '../lib/data.js';
import { fmtDate, fmtInt, fmtNum } from '../lib/format.js';
import { BarList, Card, Qty, Search, Select, Segmented } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import TimeChart from '../components/TimeChart.jsx';

const isFuel = (item) => /дизел/i.test(item.category) || /дизел/i.test(item.name);

// Makinalar (burg'ulash stanoklari) bo'yicha sarf: Списание dagi "Отдел" = "7-Makina TETRA 2500"
export default function Machines({ db, f, openItem }) {
  const [sel, setSel] = useState(0); // tanlangan makina raqami, 0 — hammasi
  const [metric, setMetric] = useState(null); // kategoriya nomi yoki '' (yozuvlar soni)
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [granSel, setGran] = useState('auto');

  const rows = useMemo(() => db.out.filter((r) => r.m && inRange(r, f)), [db, f]);
  const { days } = periodRange(db, f);

  // Har bir makina bo'yicha qisqa ko'rsatkichlar
  const stats = useMemo(() => {
    const map = new Map(db.machines.map((m) => [m.no, { ...m, count: 0, items: new Set(), whs: new Set(), fuel: 0, last: 0 }]));
    for (const r of rows) {
      const s = map.get(r.m);
      if (!s) continue;
      s.count++;
      s.items.add(r.i);
      s.whs.add(r.w);
      if (isFuel(db.items[r.i])) s.fuel += r.q;
      if (r.d > s.last) s.last = r.d;
    }
    return [...map.values()].sort((a, b) => a.no - b.no);
  }, [db, rows]);
  const active = stats.filter((s) => s.count > 0);
  const selected = stats.find((s) => s.no === sel) || null;

  const categories = useMemo(() => groupQty(db, rows, (r) => db.items[r.i].category, 'count').map((g) => g.key), [db, rows]);
  const fuelCat = categories.find((c) => /дизел/i.test(c));
  const metricCat = metric === null ? fuelCat || '' : categories.includes(metric) ? metric : '';

  // Taqqoslash: tanlangan ko'rsatkich bo'yicha har bir makina
  const metricRows = useMemo(() => (metricCat ? rows.filter((r) => db.items[r.i].category === metricCat) : rows), [db, rows, metricCat]);
  const compare = useMemo(() => {
    const g = new Map(groupQty(db, metricRows, (r) => r.m, metricCat ? 'qty' : 'count').map((x) => [x.key, x]));
    return active.map((s) => ({ key: s.no, label: s.name, value: g.get(s.no)?.value || 0, unit: g.get(s.no)?.unit ?? '' }));
  }, [db, metricRows, metricCat, active]);
  const metricUnit = compare.find((c) => c.unit)?.unit || (metricCat ? '' : 'yozuv');

  const gran = granSel === 'auto' ? (days <= 62 ? 'day' : 'month') : granSel;
  const series = useMemo(
    () => timeSeries(db, f, gran, metricCat ? 'qty' : 'count', null, (r) => r.m && (!sel || r.m === sel) && (!metricCat || db.items[r.i].category === metricCat)),
    [db, f, gran, metricCat, sel]
  );

  const scopeRows = useMemo(() => (sel ? rows.filter((r) => r.m === sel) : rows), [rows, sel]);
  const byCat = useMemo(() => groupQty(db, scopeRows, (r) => db.items[r.i].category).map((g) => ({ ...g, label: g.key })), [db, scopeRows]);

  // Jadval: material × makina
  const tableRows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const map = new Map();
    for (const r of scopeRows) {
      const item = db.items[r.i];
      if (cat && item.category !== cat) continue;
      if (words.length && !words.every((w) => item.search.includes(w))) continue;
      let g = map.get(r.i);
      if (!g) {
        g = { item, total: 0, count: 0, last: 0, by: {} };
        map.set(r.i, g);
      }
      g.total += r.q;
      g.count++;
      g.by[r.m] = (g.by[r.m] || 0) + r.q;
      if (r.d > g.last) g.last = r.d;
    }
    return [...map.values()];
  }, [db, scopeRows, q, cat]);

  const columns = useMemo(() => {
    const cols = [
      { key: 'code', title: 'Kod', value: (r) => r.item.code, render: (r) => <span className="code">{r.item.code}</span>, width: 108 },
      { key: 'name', title: 'Nomi', value: (r) => r.item.name, render: (r) => <span className="item-name">{r.item.name}</span>, sticky: true },
      { key: 'cat', title: 'Kategoriya', value: (r) => r.item.category, render: (r) => <span className="muted">{r.item.category}</span> },
      { key: 'unit', title: 'Birlik', value: (r) => r.item.unit, exportOnly: true },
    ];
    if (!sel) {
      for (const s of active) {
        cols.push({
          key: `m${s.no}`,
          title: `№${s.no}`,
          csvTitle: s.name,
          hint: s.name,
          align: 'right',
          value: (r) => r.by[s.no] || 0,
          render: (r) => (r.by[s.no] ? fmtNum(r.by[s.no]) : <span className="zero">·</span>),
        });
      }
    }
    cols.push(
      { key: 'total', title: 'Jami', align: 'right', value: (r) => r.total, render: (r) => <Qty v={r.total} unit={r.item.unit} strong />, cellClass: () => 'col-strong' },
      {
        key: 'avg',
        title: 'Kuniga',
        align: 'right',
        hint: 'O‘rtacha kunlik sarf (jami ÷ davrdagi kunlar soni)',
        value: (r) => (days ? r.total / days : 0),
        render: (r) => fmtNum(Math.round((r.total / (days || 1)) * 100) / 100),
      },
      { key: 'count', title: 'Yozuv', align: 'right', value: (r) => r.count, hint: 'Necha marta berilgan' },
      { key: 'last', title: 'Oxirgi marta', value: (r) => r.last, render: (r) => fmtDate(r.last) }
    );
    return cols;
  }, [sel, active, days]);

  if (!db.machines.length) {
    return (
      <Card>
        <div className="empty">Excel fayllarda makinalar topilmadi (Отдел: “1-Makina …” ko‘rinishida bo‘lishi kerak)</div>
      </Card>
    );
  }

  return (
    <div className="stack">
      <div className="machines">
        {stats.map((s) => (
          <button key={s.no} className={`machine ${sel === s.no ? 'on' : ''} ${s.count ? '' : 'idle'}`} onClick={() => setSel(sel === s.no ? 0 : s.no)} disabled={!s.count}>
            <div className="machine-head">
              <span className="machine-no">{s.no}</span>
              <span className="machine-name">{s.name.replace(/^\s*\d+\s*-\s*makina\s*/i, '')}</span>
              <span className="machine-whs">
                {[...s.whs].map((w) => (
                  <span key={w} className="wh-chip">
                    {db.warehouses[w].code}
                  </span>
                ))}
              </span>
            </div>
            {s.count ? (
              <>
                <div className="machine-fuel">
                  {fmtNum(s.fuel)} <small>litr dizel</small>
                </div>
                <div className="machine-sub">
                  {fmtInt(s.count)} yozuv · {fmtInt(s.items.size)} xil material
                </div>
                <div className="machine-sub">Oxirgi: {fmtDate(s.last)}</div>
              </>
            ) : (
              <div className="machine-sub machine-none">Bu davrda chiqim yo‘q</div>
            )}
          </button>
        ))}
      </div>

      <div className="scope-bar">
        <span>
          Ko‘rsatilmoqda: <b>{selected ? selected.name : `barcha makinalar (${active.length} ta ishlagan)`}</b>
        </span>
        {selected && (
          <button className="btn btn-ghost" onClick={() => setSel(0)}>
            ✕ Barcha makinalarga qaytish
          </button>
        )}
        <span className="spacer" />
        <Select
          label="Ko‘rsatkich"
          value={metricCat}
          onChange={setMetric}
          options={[...categories.map((c) => ({ value: c, label: c })), { value: '', label: 'Yozuvlar soni (hammasi)' }]}
        />
      </div>

      <div className="grid-2-1">
        <Card
          title={`${metricCat || 'Chiqim yozuvlari'} — ${gran === 'day' ? 'kunlar' : 'oylar'} bo‘yicha`}
          sub={selected ? selected.name : 'Barcha makinalar birga'}
          actions={
            <Segmented
              small
              value={gran}
              onChange={setGran}
              options={[
                { value: 'day', label: 'Kun' },
                { value: 'month', label: 'Oy' },
              ]}
            />
          }
        >
          <TimeChart data={series} series={['out']} unit={metricUnit} gran={gran} height={250} />
        </Card>
        <Card title="Makinalar taqqoslanishi" sub={`${metricCat || 'Yozuvlar soni'} — makina ustiga bosing`}>
          <BarList rows={compare} limit={20} onSelect={(r) => setSel(sel === r.key ? 0 : r.key)} />
        </Card>
      </div>

      <Card title="Nimaga sarflandi" sub={`Kategoriyalar bo‘yicha — ${selected ? selected.name : 'barcha makinalar'}`}>
        <BarList rows={byCat} limit={12} />
      </Card>

      <Card pad={false}>
        <DataTable
          columns={columns}
          rows={tableRows}
          onRowClick={(r) => openItem(r.item.idx)}
          initialSort={{ key: 'count', dir: 'desc' }}
          exportName={`makinalar_${sel ? `№${sel}_` : ''}${f.from}-${f.to}`}
          toolbar={
            <>
              <Search value={q} onChange={setQ} placeholder="Material nomi yoki kodi…" />
              <Select value={cat} onChange={setCat} options={[{ value: '', label: 'Barcha kategoriyalar' }, ...categories.map((c) => ({ value: c, label: c }))]} />
            </>
          }
        />
      </Card>
    </div>
  );
}
