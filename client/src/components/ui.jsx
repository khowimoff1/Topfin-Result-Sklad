import React from 'react';
import { fmtNum } from '../lib/format.js';

export function Card({ title, sub, actions, children, className = '', pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone, icon, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`kpi ${tone ? 'kpi-' + tone : ''} ${onClick ? 'kpi-click' : ''}`} onClick={onClick}>
      <div className="kpi-label">
        {icon && <span className="kpi-icon" aria-hidden="true">{icon}</span>}
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </Tag>
  );
}

export function Segmented({ value, onChange, options, small }) {
  return (
    <div className={`seg ${small ? 'seg-sm' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, label }) {
  return (
    <label className="select">
      {label && <span>{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Search({ value, onChange, placeholder = 'Qidirish…' }) {
  return (
    <div className="search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} aria-label="Tozalash">
          ×
        </button>
      )}
    </div>
  );
}

export function Empty({ children = 'Bu davrda ma’lumot yo‘q' }) {
  return <div className="empty">{children}</div>;
}

// Gorizontal reyting ro'yxati: nom + chiziq + qiymat
export function BarList({ rows, color = 'var(--series-out)', unit, onSelect, limit = 10, renderLabel }) {
  const shown = rows.slice(0, limit);
  if (!shown.length) return <Empty />;
  const max = Math.max(...shown.map((r) => r.value)) || 1;
  return (
    <ul className="barlist">
      {shown.map((r) => {
        const Tag = onSelect ? 'button' : 'div';
        return (
          <li key={r.key}>
            <Tag className="barlist-row" onClick={onSelect ? () => onSelect(r) : undefined} title={r.label}>
              <span className="barlist-name">{renderLabel ? renderLabel(r) : r.label}</span>
              <span className="barlist-val">
                {fmtNum(r.value)} <small>{r.unit ?? unit}</small>
              </span>
              <span className="barlist-track">
                <span className="barlist-fill" style={{ width: `${r.value > 0 ? Math.max(1.5, (r.value / max) * 100) : 0}%`, background: color }} />
              </span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const TYPE_META = {
  out: { label: 'Chiqim', ru: 'Списание', tone: 'blue' },
  in: { label: 'Kirim', ru: 'Приход', tone: 'orange' },
  ret: { label: 'Qaytarish', ru: 'Возврат', tone: 'aqua' },
};

// Son va yonida birligi: "1 340 шт"
export function Qty({ v, unit, strong }) {
  const zero = Math.abs(v) < 1e-9;
  const num = fmtNum(v);
  return (
    <span className={zero ? 'zero' : v < 0 ? 'neg' : ''}>
      {strong ? <b>{num}</b> : num}
      {unit && !zero && <small className="unit"> {unit}</small>}
    </span>
  );
}

// Sklad qachon yangilangan: Приход va Списание listlaridagi oxirgi sana.
// Rang: bugun/kecha — yashil, 2–3 kun — sariq, undan eski — qizil.
export function freshness(lastDate) {
  if (!lastDate) return { ago: null, tone: 'old' };
  const t = new Date();
  const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const d = Date.UTC(Math.floor(lastDate / 10000), (Math.floor(lastDate / 100) % 100) - 1, lastDate % 100);
  const ago = Math.max(0, Math.round((today - d) / 86400000));
  return { ago, tone: ago <= 1 ? 'fresh' : ago <= 3 ? 'stale' : 'old' };
}

export const agoText = (ago) => (ago === null ? 'ma’lumot yo‘q' : ago === 0 ? 'bugun' : ago === 1 ? 'kecha' : `${ago} kun oldin`);

export function Updated({ w, long }) {
  const { ago, tone } = freshness(w.lastDate);
  const title = `Списание: ${fmtDateShort(w.lastOut)} · Приход: ${fmtDateShort(w.lastIn)}`;
  return (
    <span className={`upd upd-${tone}`} title={title}>
      <span className="upd-dot" aria-hidden="true" />
      {fmtDateShort(w.lastDate)}
      {long && <span className="upd-ago"> ({agoText(ago)})</span>}
    </span>
  );
}

const fmtDateShort = (d) => (d ? `${String(d % 100).padStart(2, '0')}.${String(Math.floor(d / 100) % 100).padStart(2, '0')}.${Math.floor(d / 10000)}` : '—');
