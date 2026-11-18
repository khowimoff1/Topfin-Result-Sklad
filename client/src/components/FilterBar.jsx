import React, { useMemo } from 'react';
import { addDays, fromIso, monthEnd, monthKey, monthLabel, monthList, monthStart, toIso } from '../lib/format.js';
import { Updated } from './ui.jsx';

export function buildPresets(db) {
  const a = db.maxDate;
  const mk = monthKey(a);
  const prev = mk % 100 === 1 ? mk - 89 : mk - 1;
  const list = [
    { id: 'month', label: 'Bu oy', from: monthStart(mk), to: monthEnd(mk) },
    { id: 'prev', label: 'O‘tgan oy', from: monthStart(prev), to: monthEnd(prev) },
    { id: 'last', label: 'Oxirgi kun', from: a, to: a },
    { id: 'd7', label: 'Oxirgi 7 kun', from: addDays(a, -6), to: a },
    { id: 'd30', label: 'Oxirgi 30 kun', from: addDays(a, -29), to: a },
    { id: 'all', label: 'Butun davr', from: db.minDate, to: db.maxDate },
  ];
  for (const m of monthList(db.minDate, db.maxDate).reverse()) {
    list.push({ id: `m${m}`, label: monthLabel(m, true), from: monthStart(m), to: monthEnd(m), month: true });
  }
  return list;
}

export default function FilterBar({ db, f, setF, showTransfer, showPeriod = true }) {
  const presets = useMemo(() => buildPresets(db), [db]);
  const current = presets.find((p) => p.from === f.from && p.to === f.to);

  const setPreset = (id) => {
    const p = presets.find((x) => x.id === id);
    if (p) setF({ ...f, from: p.from, to: p.to });
  };
  const setDate = (key, iso) => {
    const d = fromIso(iso);
    if (!d) return;
    const next = { ...f, [key]: d };
    if (next.from > next.to) {
      if (key === 'from') next.to = d;
      else next.from = d;
    }
    setF(next);
  };

  return (
    <div className="filters">
      <div className="filters-group">
        <span className="filters-label">Sklad</span>
        <div className="seg seg-wh">
          <button className={f.wh === -1 ? 'on' : ''} onClick={() => setF({ ...f, wh: -1 })}>
            <span className="wh-btn-name">Hammasi</span>
            <span className="wh-btn-sub">{db.warehouses.length} ta sklad</span>
          </button>
          {db.warehouses.map((w) => (
            <button key={w.code} className={f.wh === w.idx ? 'on' : ''} onClick={() => setF({ ...f, wh: w.idx })}>
              <span className="wh-btn-name">
                <b>{w.code}</b> {w.name}
              </span>
              <span className="wh-btn-sub">
                <Updated w={w} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {showPeriod && (
      <div className="filters-group">
        <span className="filters-label">Davr</span>
        <label className="select">
          <select value={current ? current.id : 'custom'} onChange={(e) => setPreset(e.target.value)}>
            {!current && <option value="custom">Tanlangan oraliq</option>}
            <optgroup label="Tezkor">
              {presets.filter((p) => !p.month).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Oylar">
              {presets.filter((p) => p.month).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <input type="date" className="date" value={toIso(f.from)} onChange={(e) => setDate('from', e.target.value)} aria-label="Boshlanish sanasi" />
        <span className="muted">—</span>
        <input type="date" className="date" value={toIso(f.to)} onChange={(e) => setDate('to', e.target.value)} aria-label="Tugash sanasi" />
      </div>
      )}

      {showTransfer && (
        <label className="check" title="Boshqa skladga jo‘natilgan materiallar (Отдел: “311 …” yoki “… sklad”) sarf deb hisoblanmaydi. Qoldiq hisobiga ta’sir qilmaydi.">
          <input type="checkbox" checked={f.noTransfer} onChange={(e) => setF({ ...f, noTransfer: e.target.checked })} />
          Skladlararo ko‘chirishlarsiz
        </label>
      )}
    </div>
  );
}
