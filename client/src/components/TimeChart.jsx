import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtCompact, fmtDate, fmtNum, monthLabel } from '../lib/format.js';
import { Empty } from './ui.jsx';

export const SERIES = {
  out: { label: 'Chiqim', color: 'var(--series-out)' },
  in: { label: 'Kirim', color: 'var(--series-in)' },
  ret: { label: 'Qaytarish', color: 'var(--series-ret)' },
};

function Tip({ active, payload, unit, gran }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="tip">
      <div className="tip-title">{gran === 'day' ? fmtDate(row.key) : monthLabel(row.key, true)}</div>
      {payload.map((p) => (
        <div className="tip-row" key={p.dataKey}>
          <span className="swatch" style={{ background: SERIES[p.dataKey].color }} />
          <span>{SERIES[p.dataKey].label}</span>
          <b>
            {fmtNum(p.value)} {unit}
          </b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ series }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s} className="legend-item">
          <span className="swatch" style={{ background: SERIES[s].color }} />
          {SERIES[s].label}
        </span>
      ))}
    </div>
  );
}

// Kun yoki oy bo'yicha ustunli grafik. series: ['out','in'] kabi.
export default function TimeChart({ data, series = ['out', 'in'], unit = '', gran = 'day', height = 280 }) {
  const has = data.some((d) => series.some((s) => d[s] > 0));
  if (!has) return <Empty />;
  const many = data.length > 45;
  return (
    <div className="chart">
      {series.length > 1 && <Legend series={series} />}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap={many ? '12%' : '22%'}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            minTickGap={18}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            tickFormatter={fmtCompact}
            allowDecimals={false}
          />
          <Tooltip content={<Tip unit={unit} gran={gran} />} cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }} isAnimationActive={false} />
          {series.map((s) => (
            <Bar key={s} dataKey={s} fill={SERIES[s].color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
