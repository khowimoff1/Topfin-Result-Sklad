import React, { useMemo, useState } from 'react';
import { groupSum, inRange, periodRange, timeSeries, usageRows } from '../lib/data.js';
import { fmtDate, fmtNum } from '../lib/format.js';
import { BarList, Card, Qty, Search, Select, Segmented } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import TimeChart from '../components/TimeChart.jsx';

const COLOR = { out: 'var(--series-out)', in: 'var(--series-in)', ret: 'var(--series-ret)' };

// Chiqim / Kirim / Qaytarish yozuvlari ro'yxati
export default function Moves({ type, db, f, openItem, openSupplier }) {
  const [allParties, setAllParties] = useState(false);
  const [q, setQ] = useState('');
  const [party, setParty] = useState('');
  const [day, setDay] = useState(0); // 0 — barcha sanalar
  const [cat, setCat] = useState('');
  const [granSel, setGran] = useState('auto');

  const partyKey = type === 'out' ? 'dept' : type === 'in' ? 'supplier' : null;
  const partyTitle = type === 'out' ? 'Bo‘lim (Отдел)' : 'Yetkazuvchi (Поставщик)';

  const base = useMemo(() => (type === 'out' ? usageRows(db, f) : db[type].filter((r) => inRange(r, f))), [db, f, type]);
  const parties = useMemo(() => (partyKey ? groupSum(base, (r) => r[partyKey], () => 1) : []), [base, partyKey]);
  const dayOptions = useMemo(() => groupSum(base, (r) => r.d, () => 1).sort((a, b) => b.key - a.key), [base]);
  const categories = useMemo(() => [...new Set(base.map((r) => db.items[r.i].category))].sort((a, b) => a.localeCompare(b, 'ru')), [base, db]);

  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return base.filter((r) => {
      if (party && r[partyKey] !== party) return false;
      if (day && r.d !== day) return false;
      const item = db.items[r.i];
      if (cat && item.category !== cat) return false;
      if (words.length) {
        const hay = `${item.search} ${r.dept || ''} ${r.supplier || ''} ${r.note || ''} ${r.invoice || ''} ${r.courier || ''}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [base, db, q, party, cat, partyKey, day]);

  const { days } = periodRange(db, f);
  const gran = granSel === 'auto' ? (days <= 62 ? 'day' : 'month') : granSel;
  const series = useMemo(() => timeSeries(db, f, gran, 'count'), [db, f, gran]);

  const columns = useMemo(() => {
    const partyFilter = {
      value: party,
      onChange: setParty,
      options: [{ value: '', label: 'Hammasi' }, ...parties.map((p) => ({ value: p.key, label: `${p.key} (${p.count})` }))],
    };
    const cols = [
      {
        key: 'd',
        title: 'Sana',
        value: (r) => r.d,
        render: (r) => fmtDate(r.d),
        width: 150,
        filter: {
          value: String(day),
          onChange: (v) => setDay(+v),
          options: [{ value: '0', label: 'Hammasi' }, ...dayOptions.map((x) => ({ value: String(x.key), label: `${fmtDate(x.key)} (${x.count})` }))],
        },
      },
    ];
    if (f.wh === -1 && db.warehouses.length > 1) {
      cols.push({ key: 'w', title: 'Sklad', value: (r) => db.warehouses[r.w].code, render: (r) => <span className="wh-chip">{db.warehouses[r.w].code}</span> });
    }
    cols.push(
      { key: 'code', title: 'Kod', value: (r) => db.items[r.i].code, render: (r) => <span className="code">{db.items[r.i].code}</span>, width: 108 },
      { key: 'name', title: 'Nomi', value: (r) => db.items[r.i].name, render: (r) => <span className="item-name">{db.items[r.i].name}</span> },
      { key: 'q', title: 'Miqdor', align: 'right', value: (r) => r.q, render: (r) => <Qty v={r.q} unit={db.items[r.i].unit} strong /> },
      { key: 'unit', title: 'Birlik', value: (r) => db.items[r.i].unit, exportOnly: true }
    );
    if (type === 'out') {
      cols.push({
        key: 'dept',
        title: 'Bo‘lim (Отдел)',
        value: (r) => r.dept,
        filter: partyFilter,
        render: (r) => (
          <>
            {r.dept} {r.tr && <span className="badge badge-gray">ko‘chirish</span>}
          </>
        ),
      });
    }
    if (type === 'in') {
      cols.push(
        {
          key: 'supplier',
          title: 'Yetkazuvchi',
          value: (r) => r.supplier,
          filter: partyFilter,
          // Bosilsa — shu yetkazuvchidan kelgan hamma narsa (qachon, qaysi obektga)
          render: (r) => (
            <button
              className="link"
              title="Shu yetkazuvchidan kelgan barcha tovarlar"
              onClick={(e) => {
                e.stopPropagation();
                openSupplier(r.supplier);
              }}
            >
              {r.supplier}
            </button>
          ),
        },
        { key: 'courier', title: 'Kuryer', value: (r) => r.courier },
        { key: 'invoice', title: 'Nakladnoy', value: (r) => r.invoice },
        { key: 'pay', title: 'To‘lov', value: (r) => r.pay }
      );
    }
    if (type === 'ret') cols.push({ key: 'invoice', title: 'Nakladnoy', value: (r) => r.invoice });
    cols.push({ key: 'note', title: 'Izoh', value: (r) => r.note, render: (r) => <span className="muted">{r.note}</span> });
    return cols;
  }, [db, f, type, day, dayOptions, party, parties]);

  return (
    <div className="stack">
      <div className={partyKey ? 'grid-2-1' : ''}>
        <Card
          title={`${type === 'out' ? 'Chiqim' : type === 'in' ? 'Kirim' : 'Qaytarish'} yozuvlari soni`}
          sub={gran === 'day' ? 'Kunlar bo‘yicha' : 'Oylar bo‘yicha'}
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
          <TimeChart data={series} series={[type]} unit="yozuv" gran={gran} height={210} />
        </Card>
        {partyKey && (
          <Card
            title={type === 'out' ? 'Eng ko‘p olganlar' : `Yetkazuvchilar (${parties.length})`}
            sub={type === 'out' ? 'Yozuvlar soni bo‘yicha — bosing, jadval shu bo‘yicha filtrlanadi' : 'Bosing — shu yetkazuvchidan nima, qachon, qaysi obektga kelgani'}
            actions={
              parties.length > 6 && (
                <button className="btn btn-ghost" onClick={() => setAllParties(!allParties)}>
                  {allParties ? 'Kamroq' : `Hammasi (${parties.length})`}
                </button>
              )
            }
          >
            <div className={allParties ? 'barlist-scroll' : ''}>
              <BarList
                rows={parties.map((p) => ({ ...p, label: p.key }))}
                unit="yozuv"
                color={COLOR[type]}
                limit={allParties ? parties.length : 6}
                onSelect={(r) => (type === 'in' ? openSupplier(r.key) : setParty(party === r.key ? '' : r.key))}
              />
            </div>
          </Card>
        )}
      </div>

      <Card pad={false}>
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(r) => openItem(r.i)}
          initialSort={{ key: 'd', dir: 'desc' }}
          exportName={`${type === 'out' ? 'chiqim' : type === 'in' ? 'kirim' : 'qaytarish'}_${f.from}-${f.to}`}
          toolbar={
            <>
              <Search value={q} onChange={setQ} placeholder="Material, izoh, nakladnoy…" />
              <Select
                value={cat}
                onChange={setCat}
                options={[{ value: '', label: 'Barcha kategoriyalar' }, ...categories.map((c) => ({ value: c, label: c }))]}
              />
              {(day || party || cat || q) && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setDay(0);
                    setParty('');
                    setCat('');
                    setQ('');
                  }}
                >
                  ✕ Filtrlarni tozalash
                </button>
              )}
              {(day || party) && (
                <span className="muted small">
                  {day ? `Sana: ${fmtDate(day)}` : ''}
                  {day && party ? ' · ' : ''}
                  {party ? `${partyTitle}: ${party}` : ''}
                </span>
              )}
            </>
          }
        />
      </Card>
    </div>
  );
}
