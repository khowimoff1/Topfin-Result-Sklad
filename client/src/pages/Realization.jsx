import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyze, analyzeBy, analyzeTotals, CONTROL, combine, controlIndex, pctText, realUsage } from '../lib/control.js';
import { fmtCompact, fmtDate, fmtNum, monthKey, monthLabel, monthList } from '../lib/format.js';
import { Card, Empty, Segmented, Select } from '../components/ui.jsx';

const round = (v) => (v === null || v === undefined ? null : Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
const n = (v, unit) => (
  <>
    {fmtNum(round(v))}
    {unit && <small className="unit"> {unit}</small>}
  </>
);

export function StatusPill({ a }) {
  if (!a) return null;
  if (a.status === 'over')
    return (
      <span className="pill pill-over">
        ⚠ Odatdagidan ko‘p rasxod <b>{pctText(a)}</b>
      </span>
    );
  if (a.status === 'ok')
    return (
      <span className="pill pill-ok">
        ✓ Me’yorida <b>{pctText(a)}</b>
      </span>
    );
  if (a.status === 'new') return <span className="pill">Yangi — o‘rtacha hali yo‘q</span>;
  return <span className="pill">Sarf yo‘q</span>;
}

// Fakt va prognozning o'rtachaga nisbati (o'rtacha = shkaladagi chiziq)
function Meter({ a }) {
  if (!a || a.avg === null || a.avg <= 0) return null;
  const max = Math.max(a.avg * 1.5, a.proj, a.fact);
  const w = (v) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className={`meter ${a.status === 'over' ? 'meter-over' : ''}`} aria-hidden="true">
      <div className="meter-proj" style={{ width: w(a.proj) }} />
      <div className="meter-fact" style={{ width: w(a.fact) }} />
      <div className="meter-avg" style={{ left: w(a.avg) }} />
    </div>
  );
}

function Cell2({ a }) {
  if (!a) return <span className="zero">—</span>;
  const over = a.status === 'over';
  return (
    <div className={`rcell ${over ? 'rcell-over' : ''}`}>
      <b>{n(a.fact, a.unit)}</b>
      <small>
        {a.avg === null ? 'o‘rtacha yo‘q' : <>o‘rt. {fmtNum(round(a.avg))}</>}
        {a.ratio !== null && <span className={over ? 'neg' : 'muted'}> · {pctText(a)}</span>}
      </small>
    </div>
  );
}

function HistoryTip({ active, payload, unit }) {
  if (!active || !payload || !payload.length) return null;
  const r = payload[0].payload;
  return (
    <div className="tip">
      <div className="tip-title">{monthLabel(r.key, true)}</div>
      <div className="tip-row">
        <span className="swatch" style={{ background: 'var(--series-out)' }} />
        <span>{r.current && r.partial ? 'Hozircha' : 'Sarf'}</span>
        <b>
          {fmtNum(round(r.fact))} {unit}
        </b>
      </div>
      {r.current && r.partial && (
        <div className="tip-row">
          <span className="swatch" style={{ background: 'var(--proj)' }} />
          <span>Oy oxiriga prognoz</span>
          <b>
            {fmtNum(round(r.fact + r.extra))} {unit}
          </b>
        </div>
      )}
      {r.inBase && <div className="tip-note">O‘rtacha hisobiga kirgan oy</div>}
    </div>
  );
}

function HistoryChart({ a }) {
  if (!a || !a.history.some((h) => h.fact > 0)) return <Empty />;
  const data = a.history.map((h, i) => {
    const current = i === a.history.length - 1;
    return { ...h, current, partial: a.partial, extra: current && a.partial ? Math.max(0, a.proj - a.fact) : 0 };
  });
  return (
    <div className="chart">
      <div className="legend">
        <span className="legend-item">
          <span className="swatch" style={{ background: 'var(--series-out)' }} />
          Oylik sarf
        </span>
        {a.partial && (
          <span className="legend-item">
            <span className="swatch" style={{ background: 'var(--proj)' }} />
            Oy oxirigacha prognoz
          </span>
        )}
        {a.avg !== null && (
          <span className="legend-item">
            <span className="legend-line" />
            O‘rtacha: {fmtNum(round(a.avg))} {a.unit}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={54} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickFormatter={fmtCompact} />
          <Tooltip content={<HistoryTip unit={a.unit} />} cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }} isAnimationActive={false} />
          <Bar dataKey="fact" stackId="s" fill="var(--series-out)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          <Bar dataKey="extra" stackId="s" fill="var(--proj)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          {a.avg !== null && <ReferenceLine y={a.avg} stroke="var(--text)" strokeWidth={1.5} ifOverflow="extendDomain" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Realization({ db, f, openItem }) {
  const months = useMemo(() => monthList(db.minDate, db.maxDate).reverse(), [db]);
  const [mkSel, setMk] = useState(0);
  const [base, setBase] = useState(3);
  const [cat, setCat] = useState('dizel');
  const [byMode, setByMode] = useState('machines');

  const mk = mkSel || monthKey(db.maxDate);
  const opts = useMemo(() => ({ months: base, tol: 0 }), [base]);
  const totals = useMemo(() => analyzeTotals(db, f.wh, mk, opts), [db, f.wh, mk, opts]);
  const sel = totals.find((t) => t.id === cat) || totals[0];

  const usage = useMemo(() => realUsage(db, f.wh), [db, f.wh]);

  // Skladlar bo'yicha (faqat "Hammasi" tanlanganda)
  const byWh = useMemo(() => {
    if (f.wh !== -1 || db.warehouses.length < 2) return [];
    const parts = analyzeBy(db, usage, mk, opts, (r) => r.w + 1);
    return db.warehouses.map((w) => ({ key: w.idx, label: `${w.code} ${w.name}`, cells: Object.fromEntries(parts.filter((p) => p.key === w.idx + 1).map((p) => [p.cat, p.a])) }));
  }, [db, usage, mk, opts, f.wh]);

  // Makinalar yoki barcha bo'limlar bo'yicha
  const byDept = useMemo(() => {
    const keyFn = byMode === 'machines' ? (r) => r.m : (r) => r.dept;
    const parts = analyzeBy(db, usage, mk, opts, keyFn);
    const map = new Map();
    for (const p of parts) {
      if (!map.has(p.key)) map.set(p.key, { key: p.key, cells: {} });
      map.get(p.key).cells[p.cat] = p.a;
    }
    const rows = [...map.values()].map((r) => ({
      ...r,
      label: byMode === 'machines' ? db.machines.find((m) => m.no === r.key)?.name || `${r.key}-Makina` : r.key,
      over: CONTROL.filter((c) => r.cells[c.id]?.status === 'over').length,
      size: CONTROL.reduce((s, c) => s + (r.cells[c.id]?.fact || 0), 0),
    }));
    return rows
      .filter((r) => CONTROL.some((c) => (r.cells[c.id]?.fact || 0) > 0))
      .sort((a, b) => (byMode === 'machines' ? a.key - b.key : b.over - a.over || b.size - a.size));
  }, [db, usage, mk, opts, byMode]);

  // Tanlangan tur ichida materiallar bo'yicha
  const byItem = useMemo(() => {
    const idx = controlIndex(db);
    const groups = new Map();
    for (const r of usage) {
      if (idx[r.i] !== cat) continue;
      if (!groups.has(r.i)) groups.set(r.i, []);
      groups.get(r.i).push(r);
    }
    const out = [];
    for (const [i, rows] of groups) {
      // har bir sklad alohida, keyin qo'shiladi
      const perWh = new Map();
      for (const r of rows) {
        if (!perWh.has(r.w)) perWh.set(r.w, []);
        perWh.get(r.w).push(r);
      }
      const a = combine([...perWh.values()].map((x) => analyze(db, x, mk, opts)), opts.tol);
      if (a && (a.fact > 0 || a.avg)) out.push({ item: db.items[i], a });
    }
    return out.sort((x, y) => (y.a.status === 'over') - (x.a.status === 'over') || y.a.proj - x.a.proj);
  }, [db, usage, cat, mk, opts]);

  const overCount = byDept.reduce((s, r) => s + r.over, 0);
  const whLabel = f.wh === -1 ? 'barcha skladlar' : `${db.warehouses[f.wh].code} ${db.warehouses[f.wh].name}`;
  const a0 = totals.find((t) => t.a)?.a;

  return (
    <div className="stack">
      <div className="scope-bar">
        <Select label="Oy" value={String(mk)} onChange={(v) => setMk(+v)} options={months.map((m) => ({ value: String(m), label: monthLabel(m, true) }))} />
        <Select
          label="O‘rtacha"
          value={String(base)}
          onChange={(v) => setBase(+v)}
          options={[
            { value: '3', label: 'so‘nggi 3 oy' },
            { value: '6', label: 'so‘nggi 6 oy' },
            { value: '0', label: 'barcha oylar' },
          ]}
        />
        <span className="muted">
          {whLabel}
          {a0 && a0.partial && (
            <>
              {' '}
              · oyning <b>{a0.elapsed}</b> kuni o‘tdi (jami {a0.dim}) — oy oxiriga prognoz qilinadi
            </>
          )}
        </span>
      </div>

      <div className="rz-cards">
        {totals.map((t) => (
          <button key={t.id} className={`rz-card ${t.a?.status === 'over' ? 'rz-over' : ''} ${cat === t.id ? 'on' : ''}`} onClick={() => setCat(t.id)}>
            <div className="rz-head">
              <span className="rz-title">
                {t.label} <small>{t.ru}</small>
              </span>
              <StatusPill a={t.a} />
            </div>
            {t.a ? (
              <>
                <div className="rz-value">{n(t.a.fact, t.a.unit)}</div>
                <div className="rz-sub">{t.a.partial ? `${monthLabel(mk, true)} — ${t.a.elapsed} kunda` : monthLabel(mk, true)}</div>
                <Meter a={t.a} />
                <dl className="rz-dl">
                  <div>
                    <dt>O‘rtacha oyiga</dt>
                    <dd>{t.a.avg === null ? '—' : n(t.a.avg, t.a.unit)}</dd>
                  </div>
                  {t.a.partial && (
                    <div>
                      <dt>Oy oxiriga prognoz</dt>
                      <dd className={t.a.status === 'over' ? 'neg' : ''}>{n(t.a.proj, t.a.unit)}</dd>
                    </div>
                  )}
                  {t.a.avg !== null && (
                    <div>
                      <dt>{t.a.partial ? 'Qolgan limit' : 'Farq'}</dt>
                      <dd className={t.a.avg - t.a.fact < 0 ? 'neg' : ''}>{n(t.a.avg - t.a.fact, t.a.unit)}</dd>
                    </div>
                  )}
                </dl>
              </>
            ) : (
              <div className="rz-sub" style={{ marginTop: 14 }}>
                Bu skladda {t.label.toLowerCase()} sarfi yo‘q
              </div>
            )}
          </button>
        ))}
      </div>

      <Card
        title={`${sel.label} — oylar bo‘yicha sarf`}
        sub={sel.a && sel.a.baseMonths.length ? `O‘rtacha: ${sel.a.baseMonths.map((m) => monthLabel(m)).join(', ')} oylaridan` : whLabel}
        actions={<Segmented small value={cat} onChange={setCat} options={CONTROL.map((c) => ({ value: c.id, label: c.label }))} />}
      >
        <HistoryChart a={sel.a} />
      </Card>

      {byWh.length > 0 && (
        <Card title="Skladlar bo‘yicha" sub={`${monthLabel(mk, true)}: fakt, o‘rtacha va farq`} pad={false}>
          <RTable rows={byWh} first="Sklad" />
        </Card>
      )}

      <Card
        title={byMode === 'machines' ? 'Makinalar bo‘yicha' : 'Bo‘limlar bo‘yicha'}
        sub={overCount ? `⚠ ${overCount} ta holatda odatdagidan ko‘p rasxod` : 'Har bir makina o‘zining o‘rtachasi bilan solishtiriladi'}
        actions={
          <Segmented
            small
            value={byMode}
            onChange={setByMode}
            options={[
              { value: 'machines', label: 'Makinalar' },
              { value: 'depts', label: 'Barcha bo‘limlar' },
            ]}
          />
        }
        pad={false}
      >
        {byDept.length ? <RTable rows={byDept} first={byMode === 'machines' ? 'Makina' : 'Bo‘lim (Отдел)'} /> : <Empty />}
      </Card>

      <Card title={`${sel.label}: materiallar bo‘yicha`} sub="Qaysi material o‘rtachadan ko‘p ketyapti" pad={false}>
        {byItem.length ? (
          <div className="dt-scroll">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="num">{monthLabel(mk)} — fakt</th>
                  <th className="num">O‘rtacha oyiga</th>
                  {sel.a?.partial && <th className="num">Prognoz</th>}
                  <th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {byItem.map(({ item, a }) => (
                  <tr key={item.idx} className={`clickable ${a.status === 'over' ? 'row-over' : ''}`} onClick={() => openItem(item.idx)}>
                    <td>
                      <span className="item-name">{item.name}</span> <span className="code">{item.code}</span>
                    </td>
                    <td className="num">
                      <b>{n(a.fact, a.unit)}</b>
                    </td>
                    <td className="num">{a.avg === null ? <span className="zero">—</span> : n(a.avg, a.unit)}</td>
                    {sel.a?.partial && <td className={`num ${a.status === 'over' ? 'neg' : ''}`}>{n(a.proj, a.unit)}</td>}
                    <td>
                      <StatusPill a={a} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Card>

      <p className="muted small">
        Qanday hisoblanadi: o‘rtacha — tanlangan oydan oldingi to‘liq oylardagi sarfning o‘rtachasi (ishlamagan oylar va boshlanish oyi hisobga olinmaydi).
        Joriy oy uchun prognoz = hozirgacha sarf ÷ o‘tgan kunlar × oydagi kunlar. Fakt yoki prognoz o‘rtachadan oshsa — qizil. Boshqa skladga jo‘natilganlar
        sarf hisoblanmaydi. Oxirgi ma’lumot: {fmtDate(db.maxDate)}.
      </p>
    </div>
  );
}

function RTable({ rows, first }) {
  return (
    <div className="dt-scroll">
      <table className="rtable">
        <thead>
          <tr>
            <th>{first}</th>
            {CONTROL.map((c) => (
              <th key={c.id} className="num">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.over ? 'row-over' : ''}>
              <td>
                <b>{r.label}</b>
                {r.over > 0 && <span className="pill pill-over pill-sm">⚠ ko‘p rasxod</span>}
              </td>
              {CONTROL.map((c) => (
                <td key={c.id} className="num">
                  <Cell2 a={r.cells[c.id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
