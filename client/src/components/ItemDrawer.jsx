import React, { useEffect, useMemo, useState } from 'react';
import { computeStock, groupSum, inRange, periodRange, timeSeries } from '../lib/data.js';
import { fmtDate, fmtInt, fmtNum } from '../lib/format.js';
import { Badge, BarList, Kpi, Segmented, TYPE_META } from './ui.jsx';
import TimeChart from './TimeChart.jsx';

// Bitta material bo'yicha to'liq ma'lumot (o'ng tomondan ochiladigan panel)
export default function ItemDrawer({ db, f, itemIdx, onClose }) {
  const item = db.items[itemIdx];
  const [scope, setScope] = useState('period');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const row = useMemo(() => computeStock(db, f).find((s) => s.item.idx === itemIdx), [db, f, itemIdx]);
  const { days } = periodRange(db, f);

  const fx = useMemo(() => (scope === 'all' ? { ...f, from: db.minDate, to: db.maxDate } : f), [scope, f, db]);
  const gran = periodRange(db, fx).days <= 62 ? 'day' : 'month';
  const series = useMemo(() => timeSeries(db, fx, gran, 'qty', itemIdx), [db, fx, gran, itemIdx]);

  const outRows = useMemo(() => db.out.filter((r) => r.i === itemIdx && inRange(r, f) && !(f.noTransfer && r.tr)), [db, f, itemIdx]);
  const depts = useMemo(() => groupSum(outRows, (r) => r.dept, (r) => r.q).map((g) => ({ ...g, label: g.key })), [outRows]);

  const history = useMemo(() => {
    const all = [];
    for (const t of ['out', 'in', 'ret']) {
      for (const r of db[t]) if (r.i === itemIdx && (f.wh === -1 || r.w === f.wh) && r.d <= f.to) all.push(r);
    }
    return all.sort((a, b) => b.d - a.d).slice(0, 60);
  }, [db, f, itemIdx]);

  if (!item || !row) return null;

  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={item.name}>
        <header className="drawer-head">
          <div>
            <h2>{item.name}</h2>
            <p>
              <span className="code">{item.code}</span> · {item.category} · birligi: <b>{item.unit}</b>
            </p>
          </div>
          <button className="btn btn-ghost drawer-close" onClick={onClose} aria-label="Yopish">
            ✕
          </button>
        </header>

        <div className="drawer-body">
          <div className="kpis kpis-4">
            <Kpi
              label={`Qoldiq (${fmtDate(Math.min(f.to, db.maxDate))})`}
              value={fmtNum(row.end)}
              tone={row.end < 0 ? 'critical' : undefined}
              icon={row.end < 0 ? '⚠' : undefined}
              sub={item.unit}
            />
            <Kpi label="Davrda sarflandi" value={fmtNum(row.use)} sub={`${fmtInt(outRows.length)} marta berildi`} />
            <Kpi label="Kuniga o‘rtacha" value={fmtNum(Math.round(row.avg * 100) / 100)} sub={`oyiga ≈ ${fmtNum(Math.round(row.avg * 30 * 10) / 10)} ${item.unit}`} />
            <Kpi
              label="Qoldiq yetadi"
              value={row.cover === null ? '—' : `${fmtInt(row.cover)} kun`}
              tone={row.cover !== null && row.cover < 7 ? 'warning' : undefined}
              icon={row.cover !== null && row.cover < 7 ? '⚠' : undefined}
              sub={`${days} kunlik sarf asosida`}
            />
          </div>

          {db.warehouses.length > 1 && (
            <div className="wh-balances">
              {db.warehouses.map((w) =>
                item.whs.has(w.idx) ? (
                  <div key={w.code} className={f.wh === w.idx ? 'on' : ''}>
                    <span className="wh-chip">{w.code}</span> {w.name}
                    <b className={row.byWh[w.idx] < 0 ? 'neg' : ''}>
                      {fmtNum(row.byWh[w.idx])} <small>{item.unit}</small>
                    </b>
                  </div>
                ) : null
              )}
            </div>
          )}

          <section>
            <div className="section-head">
              <h4>
                Kirim va chiqim, {item.unit} <span className="muted">— {gran === 'day' ? 'kunlar' : 'oylar'} bo‘yicha</span>
              </h4>
              <Segmented
                small
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'period', label: 'Tanlangan davr' },
                  { value: 'all', label: 'Butun davr' },
                ]}
              />
            </div>
            <TimeChart data={series} series={['out', 'in']} unit={item.unit} gran={gran} height={220} />
          </section>

          {depts.length > 0 && (
            <section>
              <div className="section-head">
                <h4>Kimga berildi (tanlangan davr)</h4>
              </div>
              <BarList rows={depts} unit={item.unit} limit={8} />
            </section>
          )}

          <section>
            <div className="section-head">
              <h4>So‘nggi harakatlar</h4>
            </div>
            <div className="dt-scroll">
              <table className="compact">
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th>Turi</th>
                    {db.warehouses.length > 1 && <th>Sklad</th>}
                    <th className="num">Miqdor</th>
                    <th>Kimga / kimdan</th>
                    <th>Izoh</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r, i) => (
                    <tr key={i}>
                      <td>{fmtDate(r.d)}</td>
                      <td>
                        <Badge tone={TYPE_META[r.t].tone}>{TYPE_META[r.t].label}</Badge>
                      </td>
                      {db.warehouses.length > 1 && <td>{db.warehouses[r.w].code}</td>}
                      <td className="num">
                        <b>
                          {r.t === 'out' ? '−' : '+'}
                          {fmtNum(r.q)}
                        </b>
                      </td>
                      <td>{r.dept || r.supplier || ''}</td>
                      <td className="muted">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!history.length && <div className="empty">Harakat yo‘q</div>}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
