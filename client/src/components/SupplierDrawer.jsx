import React, { useEffect, useMemo, useState } from 'react';
import { groupQty, periodRange, timeSeries } from '../lib/data.js';
import { fmtDate, fmtInt, fromIso, toIso } from '../lib/format.js';
import { Kpi, Qty, Search, Segmented } from './ui.jsx';
import DataTable from './DataTable.jsx';
import TimeChart from './TimeChart.jsx';

// Bitta yetkazuvchi bo'yicha: nima, qachon, qaysi obektga kelgan (o'ng tomondan ochiladigan panel)
export default function SupplierDrawer({ db, f, supplier, onClose, openItem }) {
  // Panel ichidagi sana oralig'i: boshida yuqoridagi filtr davri, keyin o'zgartirsa bo'ladi
  const [range, setRange] = useState({ from: f.from, to: f.to });
  const [wh, setWh] = useState(-1); // panel ichida obekt bo'yicha filtr
  const [q, setQ] = useState('');
  const [view, setView] = useState('items');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fx = useMemo(() => ({ ...f, from: range.from, to: range.to }), [range, f]);
  const scope = range.from === f.from && range.to === f.to ? 'period' : range.from <= db.minDate && range.to >= db.maxDate ? 'all' : 'custom';
  const setScope = (s) => setRange(s === 'all' ? { from: db.minDate, to: db.maxDate } : { from: f.from, to: f.to });
  const setDate = (key, iso) => {
    const d = fromIso(iso);
    if (!d) return;
    setRange((r) => {
      const next = { ...r, [key]: d };
      if (next.from > next.to) {
        if (key === 'from') next.to = d;
        else next.from = d;
      }
      return next;
    });
  };
  const all = useMemo(
    () => db.in.filter((r) => r.supplier === supplier && (f.wh === -1 || r.w === f.wh) && r.d >= fx.from && r.d <= fx.to),
    [db, supplier, f.wh, fx]
  );
  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((r) => {
      if (wh !== -1 && r.w !== wh) return false;
      if (!words.length) return true;
      const hay = `${db.items[r.i].search} ${r.invoice} ${r.courier} ${r.note}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [all, wh, q, db]);

  // Qaysi obektlarga kelgan
  const byWh = useMemo(() => {
    const m = new Map();
    for (const r of all) {
      const g = m.get(r.w) || { w: db.warehouses[r.w], count: 0, last: 0, items: new Set() };
      g.count++;
      g.items.add(r.i);
      if (r.d > g.last) g.last = r.d;
      m.set(r.w, g);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [all, db]);

  const items = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const g = m.get(r.i) || { item: db.items[r.i], qty: 0, count: 0, last: 0, whs: new Set() };
      g.qty += r.q;
      g.count++;
      g.whs.add(r.w);
      if (r.d > g.last) g.last = r.d;
      m.set(r.i, g);
    }
    return [...m.values()];
  }, [rows, db]);

  const units = useMemo(() => groupQty(db, rows, (r) => db.items[r.i].unit).slice(0, 5), [db, rows]);
  const days = useMemo(() => new Set(all.map((r) => r.d)), [all]);
  const first = all.reduce((m, r) => (!m || r.d < m ? r.d : m), 0);
  const last = all.reduce((m, r) => Math.max(m, r.d), 0);

  const gran = periodRange(db, fx).days <= 62 ? 'day' : 'month';
  const series = useMemo(
    () => timeSeries(db, fx, gran, 'count', null, (r) => r.t === 'in' && r.supplier === supplier && (wh === -1 || r.w === wh)).map((x) => ({ ...x, out: 0, ret: 0 })),
    [db, fx, gran, supplier, wh]
  );

  const multi = db.warehouses.length > 1 && f.wh === -1;

  const itemCols = useMemo(
    () => [
      { key: 'name', title: 'Material', value: (g) => g.item.name, render: (g) => <span className="item-name">{g.item.name}</span> },
      { key: 'code', title: 'Kod', value: (g) => g.item.code, render: (g) => <span className="code">{g.item.code}</span> },
      { key: 'qty', title: 'Jami keldi', align: 'right', value: (g) => g.qty, render: (g) => <Qty v={g.qty} unit={g.item.unit} strong /> },
      { key: 'unit', title: 'Birlik', value: (g) => g.item.unit, exportOnly: true },
      { key: 'count', title: 'Necha marta', align: 'right', value: (g) => g.count },
      ...(multi
        ? [
            {
              key: 'whs',
              title: 'Obekt',
              value: (g) => [...g.whs].map((w) => db.warehouses[w].code).join(', '),
              render: (g) =>
                [...g.whs].map((w) => (
                  <span key={w} className="wh-chip" style={{ marginRight: 4 }}>
                    {db.warehouses[w].code}
                  </span>
                )),
            },
          ]
        : []),
      { key: 'last', title: 'Oxirgi marta', value: (g) => g.last, render: (g) => fmtDate(g.last) },
    ],
    [db, multi]
  );

  const rowCols = useMemo(
    () => [
      { key: 'd', title: 'Sana', value: (r) => r.d, render: (r) => fmtDate(r.d) },
      ...(multi
        ? [
            {
              key: 'w',
              title: 'Obekt',
              value: (r) => `${db.warehouses[r.w].code} ${db.warehouses[r.w].name}`,
              render: (r) => (
                <>
                  <span className="wh-chip">{db.warehouses[r.w].code}</span> {db.warehouses[r.w].name}
                </>
              ),
            },
          ]
        : []),
      { key: 'name', title: 'Material', value: (r) => db.items[r.i].name, render: (r) => <span className="item-name">{db.items[r.i].name}</span> },
      { key: 'q', title: 'Miqdor', align: 'right', value: (r) => r.q, render: (r) => <Qty v={r.q} unit={db.items[r.i].unit} strong /> },
      { key: 'unit', title: 'Birlik', value: (r) => db.items[r.i].unit, exportOnly: true },
      { key: 'courier', title: 'Kuryer / mashina', value: (r) => r.courier },
      { key: 'invoice', title: 'Nakladnoy', value: (r) => r.invoice },
      { key: 'pay', title: 'To‘lov', value: (r) => r.pay },
      { key: 'note', title: 'Izoh', value: (r) => r.note, render: (r) => <span className="muted">{r.note}</span> },
    ],
    [db, multi]
  );

  const safe = supplier.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);

  // Sana oralig'i: 01.10.2026 — 11.11.2026 (butun panelga ta'sir qiladi)
  const dateBar = (
    <div className="sup-dates">
      <span className="filters-label">Sana</span>
      <input type="date" className="date" value={toIso(range.from)} min={toIso(db.minDate)} max={toIso(db.maxDate)} onChange={(e) => setDate('from', e.target.value)} aria-label="Boshlanish sanasi" />
      <span className="muted">—</span>
      <input type="date" className="date" value={toIso(range.to)} min={toIso(db.minDate)} max={toIso(db.maxDate)} onChange={(e) => setDate('to', e.target.value)} aria-label="Tugash sanasi" />
    </div>
  );

  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer drawer-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={supplier}>
        <header className="drawer-head">
          <div>
            <h2>{supplier}</h2>
            <p>
              Yetkazuvchi · {scope === 'all' ? 'butun davr' : `${fmtDate(range.from)} — ${fmtDate(range.to)}`}
              {f.wh !== -1 && ` · ${db.warehouses[f.wh].code} ${db.warehouses[f.wh].name}`}
            </p>
          </div>
          <div className="drawer-head-actions">
            <Segmented
              small
              value={scope}
              onChange={setScope}
              options={[
                { value: 'period', label: 'Tanlangan davr' },
                { value: 'all', label: 'Butun davr' },
              ]}
            />
            <button className="btn btn-ghost drawer-close" onClick={onClose} aria-label="Yopish">
              ✕
            </button>
          </div>
        </header>

        <div className="drawer-body">
          {!all.length ? (
            <section>
              {dateBar}
              <div className="empty">
                {fmtDate(range.from)} — {fmtDate(range.to)} oralig‘ida shu yetkazuvchidan kirim yo‘q.
                {scope !== 'all' && (
                  <>
                    {' '}
                    <button className="btn btn-ghost" onClick={() => setScope('all')}>
                      Butun davrni ko‘rish
                    </button>
                  </>
                )}
              </div>
            </section>
          ) : (
            <>
              <div className="kpis kpis-4">
                <Kpi label="Kirimlar" value={fmtInt(all.length)} sub={`${fmtInt(days.size)} kun davomida`} />
                <Kpi label="Xil material" value={fmtInt(new Set(all.map((r) => r.i)).size)} sub={units.map((u) => `${fmtInt(u.qty)} ${u.key}`).join(' · ')} />
                <Kpi label="Birinchi kelgan" value={fmtDate(first)} />
                <Kpi label="Oxirgi kelgan" value={fmtDate(last)} />
              </div>

              <section>
                <div className="section-head">
                  <h4>Qaysi obektga keldi</h4>
                  {wh !== -1 && (
                    <button className="btn btn-ghost" onClick={() => setWh(-1)}>
                      ✕ Barcha obektlar
                    </button>
                  )}
                </div>
                <div className="sup-whs">
                  {byWh.map((g) => (
                    <button key={g.w.code} className={`sup-wh ${wh === g.w.idx ? 'on' : ''}`} onClick={() => setWh(wh === g.w.idx ? -1 : g.w.idx)}>
                      <span>
                        <span className="wh-chip">{g.w.code}</span> <b>{g.w.name}</b>
                      </span>
                      <span className="sup-wh-num">
                        {fmtInt(g.count)} <small>kirim · {fmtInt(g.items.size)} xil</small>
                      </span>
                      <span className="muted small">Oxirgi: {fmtDate(g.last)}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="section-head">
                  <h4>
                    Kirimlar soni <span className="muted">— {gran === 'day' ? 'kunlar' : 'oylar'} bo‘yicha</span>
                  </h4>
                </div>
                <TimeChart data={series} series={['in']} unit="yozuv" gran={gran} height={180} />
              </section>

              <section className="sec-flush">
                <div className="section-head sec-pad">
                  <Segmented
                    small
                    value={view}
                    onChange={setView}
                    options={[
                      { value: 'items', label: `Materiallar bo‘yicha jami (${fmtInt(items.length)})`, title: 'Har bir material bir qatorda: jami qancha keldi, necha marta, qaysi obektlarga' },
                      { value: 'rows', label: `Har bir kirim alohida (${fmtInt(rows.length)})`, title: 'Har bir kelgan yuk alohida qatorda: sana, obekt, miqdor, mashina, nakladnoy, to‘lov' },
                    ]}
                  />
                  {dateBar}
                  <Search value={q} onChange={setQ} placeholder="Material, nakladnoy, kuryer…" />
                </div>
                <p className="sup-hint muted small">
                  {view === 'items'
                    ? `${fmtDate(range.from)} — ${fmtDate(range.to)}: har bir material bir marta — jami qancha keldi, necha marta va qaysi obektlarga.`
                    : `${fmtDate(range.from)} — ${fmtDate(range.to)}: har bir kirim alohida qator — qaysi kuni, qaysi obektga, qancha, qaysi mashinada, nakladnoy va to‘lov.`}
                </p>
                {view === 'items' ? (
                  <DataTable
                    key="items"
                    columns={itemCols}
                    rows={items}
                    pageSize={25}
                    initialSort={{ key: 'count', dir: 'desc' }}
                    onRowClick={(g) => openItem(g.item.idx)}
                    exportName={`yetkazuvchi_${safe}_materiallar`}
                  />
                ) : (
                  <DataTable
                    key="rows"
                    columns={rowCols}
                    rows={rows}
                    pageSize={25}
                    initialSort={{ key: 'd', dir: 'desc' }}
                    onRowClick={(r) => openItem(r.i)}
                    exportName={`yetkazuvchi_${safe}_kirimlar`}
                  />
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
