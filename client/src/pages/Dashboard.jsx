import React, { useMemo, useState } from 'react';
import { computeStock, groupQty, groupSum, inRange, periodRange, timeSeries, usageRows } from '../lib/data.js';
import { fmtInt, fmtNum, monthKey, monthLabel } from '../lib/format.js';
import { analyzeBy, analyzeTotals, pctText, realUsage } from '../lib/control.js';
import { BarList, Card, Kpi, Segmented, Updated } from '../components/ui.jsx';
import TimeChart from '../components/TimeChart.jsx';

export default function Dashboard({ db, f, setF, go, openItem, setStockStatus }) {
  const [measure, setMeasure] = useState('qty'); // 'qty' — miqdor, 'count' — yozuvlar soni
  const [granSel, setGran] = useState('auto');

  const use = useMemo(() => usageRows(db, f), [db, f]);
  const inRows = useMemo(() => db.in.filter((r) => inRange(r, f)), [db, f]);
  const retRows = useMemo(() => db.ret.filter((r) => inRange(r, f)), [db, f]);
  const stock = useMemo(() => computeStock(db, f), [db, f]);
  const { days } = periodRange(db, f);

  const unitLabel = measure === 'count' ? 'yozuv' : '';
  const gran = granSel === 'auto' ? (days <= 62 ? 'day' : 'month') : granSel;

  const series = useMemo(() => timeSeries(db, f, gran, measure), [db, f, gran, measure]);
  const topItems = useMemo(() => groupQty(db, use, (r) => r.i, measure).map((g) => ({ ...g, label: db.items[g.key].name })), [use, db, measure]);
  const depts = useMemo(() => groupQty(db, use, (r) => r.dept, measure).map((g) => ({ ...g, label: g.key })), [use, db, measure]);
  // Realizatsiya: almaz, polimer, dizel — joriy oy o'rtachadan oshyaptimi
  const rz = useMemo(() => {
    const mk = monthKey(db.maxDate);
    const opts = { months: 3, tol: 0 };
    const totals = analyzeTotals(db, f.wh, mk, opts);
    const machinesOver = analyzeBy(db, realUsage(db, f.wh), mk, opts, (r) => r.m).filter((p) => p.a.status === 'over');
    return { mk, totals, machinesOver: new Set(machinesOver.map((p) => p.key)).size };
  }, [db, f.wh]);
  const rzOver = rz.totals.filter((t) => t.a?.status === 'over');
  const unitTotals = useMemo(() => groupSum(use, (r) => db.items[r.i].unit, (r) => r.q).slice(0, 6), [use, db]);

  const distinct = (rows) => new Set(rows.map((r) => r.i)).size;
  const positive = stock.filter((s) => s.end > 1e-9).length;
  const negative = stock.filter((s) => s.end < -1e-9).length;

  const whRows = useMemo(() => {
    if (db.warehouses.length < 2) return [];
    return db.warehouses.map((w) => {
      const cnt = (rows) => rows.reduce((n, r) => n + (r.w === w.idx ? 1 : 0), 0);
      let pos = 0;
      let neg = 0;
      for (const s of stock) {
        const e = s.byWh[w.idx];
        if (e > 1e-9) pos++;
        else if (e < -1e-9) neg++;
      }
      return { w, out: cnt(use), in: cnt(inRows), ret: cnt(retRows), pos, neg };
    });
  }, [db, stock, use, inRows, retRows]);

  const goNegative = () => {
    setStockStatus('neg');
    go('stock');
  };

  return (
    <div className="stack">
      <button className={`rz-banner ${rzOver.length || rz.machinesOver ? 'rz-banner-over' : 'rz-banner-ok'}`} onClick={() => go('real')}>
        <span className="rz-banner-icon" aria-hidden="true">
          {rzOver.length || rz.machinesOver ? '⚠' : '✓'}
        </span>
        <span className="rz-banner-text">
          <b>Realizatsiya, {monthLabel(rz.mk, true)}:</b>{' '}
          {rz.totals
            .filter((t) => t.a && t.a.avg !== null)
            .map((t, i) => (
              <span key={t.id} className={t.a.status === 'over' ? 'neg' : ''}>
                {i > 0 && ' · '}
                {t.label} {pctText(t.a)}
                {t.a.status === 'over' && ' — odatdagidan ko‘p rasxod'}
              </span>
            ))}
          {rz.machinesOver > 0 && <span className="neg"> · {rz.machinesOver} ta makinada ko‘p rasxod</span>}
        </span>
        <span className="rz-banner-go">Batafsil →</span>
      </button>
      <div className="kpis">
        <Kpi
          label="Chiqim (Списание)"
          value={fmtInt(use.length)}
          sub={`${fmtInt(distinct(use))} xil material · kuniga ≈ ${fmtNum(days ? Math.round((use.length / days) * 10) / 10 : 0)} yozuv`}
          onClick={() => go('out')}
        />
        <Kpi label="Kirim (Приход)" value={fmtInt(inRows.length)} sub={`${fmtInt(distinct(inRows))} xil material keldi`} onClick={() => go('in')} />
        <Kpi label="Qaytarish (Возврат)" value={fmtInt(retRows.length)} sub={`${fmtInt(distinct(retRows))} xil material qaytdi`} onClick={() => go('ret')} />
        <Kpi
          label="Qoldiqda bor"
          value={fmtInt(positive)}
          sub={`${fmtInt(stock.length)} ta pozitsiyadan · davr oxiriga`}
          onClick={() => {
            setStockStatus('pos');
            go('stock');
          }}
        />
        <Kpi
          label="Manfiy qoldiq"
          tone={negative ? 'critical' : 'good'}
          icon={negative ? '⚠' : '✓'}
          value={fmtInt(negative)}
          sub={negative ? 'Kirim yozilmagan yoki xato bor — tekshiring' : 'Hammasi joyida'}
          onClick={goNegative}
        />
      </div>

      <Card
        title="Kirim va chiqim dinamikasi"
        sub={
          unitTotals.length ? (
            <>
              Davrda jami sarf:{' '}
              {unitTotals.map((u, i) => (
                <span key={u.key}>
                  {i > 0 && ' · '}
                  <b>{fmtNum(u.value)}</b> {u.key}
                </span>
              ))}
            </>
          ) : null
        }
        actions={
          <>
            <Segmented
              small
              value={measure}
              onChange={setMeasure}
              options={[
                { value: 'qty', label: 'Miqdor' },
                { value: 'count', label: 'Yozuvlar soni' },
              ]}
            />
            <Segmented
              small
              value={gran}
              onChange={setGran}
              options={[
                { value: 'day', label: 'Kun' },
                { value: 'month', label: 'Oy' },
              ]}
            />
          </>
        }
      >
        <TimeChart data={series} series={['out', 'in']} unit={unitLabel} gran={gran} />
      </Card>

      {whRows.length > 0 && f.wh === -1 && (
        <Card title="Skladlar bo‘yicha" sub="Tanlangan davrdagi yozuvlar soni va davr oxiridagi holat. Sklad ustiga bosing — faqat shu sklad ko‘rsatiladi." pad={false}>
          <div className="dt-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sklad</th>
                  <th className="num">Chiqim</th>
                  <th className="num">Kirim</th>
                  <th className="num">Qaytarish</th>
                  <th className="num">Qoldiqda bor</th>
                  <th className="num">Manfiy qoldiq</th>
                  <th title="Приход va Списание listlaridagi oxirgi sana">Yangilangan</th>
                </tr>
              </thead>
              <tbody>
                {whRows.map((r) => (
                  <tr key={r.w.code} className="clickable" onClick={() => setF({ ...f, wh: r.w.idx })}>
                    <td>
                      <span className="wh-chip">{r.w.code}</span> <b>{r.w.name}</b>
                    </td>
                    <td className="num">{fmtInt(r.out)}</td>
                    <td className="num">{fmtInt(r.in)}</td>
                    <td className="num">{fmtInt(r.ret)}</td>
                    <td className="num">{fmtInt(r.pos)}</td>
                    <td className="num">{r.neg ? <span className="neg">⚠ {fmtInt(r.neg)}</span> : '0'}</td>
                    <td>
                      <Updated w={r.w} long />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid-2">
        <Card title="Eng ko‘p sarflangan materiallar" sub={measure === 'count' ? 'Yozuvlar soni bo‘yicha' : 'Miqdor bo‘yicha — birligi yonida yozilgan'}>
          <BarList rows={topItems} onSelect={(r) => openItem(r.key)} />
        </Card>
        <Card title="Kimga / qayerga berildi" sub="Отдел bo‘yicha chiqim">
          <BarList rows={depts} />
        </Card>
      </div>
    </div>
  );
}
