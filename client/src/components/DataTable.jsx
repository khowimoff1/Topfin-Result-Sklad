import React, { useEffect, useMemo, useState } from 'react';
import { downloadCsv } from '../lib/format.js';
import { Empty } from './ui.jsx';

// Ustun: { key, title, value(row) — saralash/CSV uchun, render(row), align, width, sticky, noSort }
export default function DataTable({ columns: allColumns, rows, pageSize = 50, onRowClick, initialSort, exportName, rowClass, footer, toolbar }) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);
  // exportOnly ustunlar faqat Excelga yuklashda chiqadi
  const columns = useMemo(() => allColumns.filter((c) => !c.exportOnly), [allColumns]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = columns.find((x) => x.key === sort.key);
    if (!c) return rows;
    const get = c.value || ((r) => r[c.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y), 'ru') * dir;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => setPage(0), [rows, sort]);
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * pageSize, cur * pageSize + pageSize);

  const toggle = (c) => {
    if (c.noSort) return;
    setSort((s) => (s && s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.align === 'right' ? 'desc' : 'asc' }));
  };

  return (
    <div className="dt">
      {(toolbar || exportName) && (
        <div className="dt-toolbar">
          <div className="dt-toolbar-left">{toolbar}</div>
          <div className="dt-toolbar-right">
            <span className="muted">{sorted.length.toLocaleString('ru-RU')} ta qator</span>
            {exportName && (
              <button className="btn btn-ghost" onClick={() => downloadCsv(exportName, allColumns.filter((c) => !c.noExport), sorted)} disabled={!sorted.length}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
                </svg>
                Excelga
              </button>
            )}
          </div>
        </div>
      )}
      <div className="dt-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${c.align === 'right' ? 'num' : ''} ${c.sticky ? 'sticky-col' : ''} ${c.noSort ? '' : 'sortable'}`}
                  style={c.width ? { width: c.width, minWidth: c.width } : undefined}
                  onClick={() => toggle(c)}
                  title={c.hint}
                >
                  {c.title}
                  {sort && sort.key === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
            {columns.some((c) => c.filter) && (
              <tr className="filter-row">
                {columns.map((c) => (
                  <th key={c.key} className={c.sticky ? 'sticky-col' : ''}>
                    {c.filter && (
                      <select
                        className={`col-filter ${c.filter.value && c.filter.value !== '0' ? 'active' : ''}`}
                        value={c.filter.value}
                        onChange={(e) => c.filter.onChange(e.target.value)}
                        aria-label={`${typeof c.title === 'string' ? c.title : c.key} bo‘yicha filtr`}
                      >
                        {c.filter.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={r._key ?? cur * pageSize + i} className={`${onRowClick ? 'clickable' : ''} ${rowClass ? rowClass(r) : ''}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.align === 'right' ? 'num' : ''} ${c.sticky ? 'sticky-col' : ''} ${c.cellClass ? c.cellClass(r) : ''}`}>
                    {c.render ? c.render(r) : c.value ? c.value(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && slice.length > 0 && <tfoot>{footer}</tfoot>}
        </table>
        {!slice.length && <Empty>Mos keladigan qator topilmadi</Empty>}
      </div>
      {pages > 1 && (
        <div className="dt-pager">
          <button className="btn btn-ghost" disabled={cur === 0} onClick={() => setPage(0)}>«</button>
          <button className="btn btn-ghost" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Oldingi</button>
          <span className="muted">
            {cur + 1} / {pages}
          </span>
          <button className="btn btn-ghost" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Keyingi ›</button>
          <button className="btn btn-ghost" disabled={cur >= pages - 1} onClick={() => setPage(pages - 1)}>»</button>
        </div>
      )}
    </div>
  );
}
