import React, { useRef, useState } from 'react';
import { fmtDateTime, fmtInt } from '../lib/format.js';
import { Card, Updated } from '../components/ui.jsx';

export default function Files({ db, reload }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [results, setResults] = useState([]);

  const upload = async (fileList) => {
    const files = [...fileList].filter((x) => /\.(xlsx|xlsm)$/i.test(x.name));
    if (!files.length) {
      setResults([{ file: '', ok: false, error: 'Faqat .xlsx yoki .xlsm fayl tanlang' }]);
      return;
    }
    setBusy(true);
    setResults([]);
    try {
      const body = new FormData();
      files.forEach((x) => body.append('files', x));
      const res = await fetch('/api/upload', { method: 'POST', body });
      const json = await res.json();
      setResults(json.results || [{ file: '', ok: false, error: json.error || 'Yuklashda xato' }]);
      await reload();
    } catch (e) {
      setResults([{ file: '', ok: false, error: e.message }]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (w) => {
    if (!window.confirm(`${w.code} ${w.name} — “${w.file}” fayli saytdan olib tashlansinmi?\n(Kompyuteringizdagi asl Excel faylga tegilmaydi.)`)) return;
    await fetch(`/api/files/${encodeURIComponent(w.file)}`, { method: 'DELETE' });
    await reload();
  };

  return (
    <div className="stack">
      <Card title="Excel fayl yuklash" sub="Sklad faylining yangi versiyasini yuklasangiz, o‘sha sklad kodidagi (masalan R104) eski fayl avtomatik almashtiriladi.">
        <div
          className={`drop ${drag ? 'drop-on' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload(e.dataTransfer.files);
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
          </svg>
          <div>
            <b>Fayllarni shu yerga tashlang</b> yoki
          </div>
          <button className="btn btn-primary" onClick={() => input.current.click()} disabled={busy}>
            {busy ? 'Yuklanmoqda…' : 'Fayl tanlash'}
          </button>
          <input ref={input} type="file" accept=".xlsx,.xlsm" multiple hidden onChange={(e) => upload(e.target.files)} />
          <small className="muted">Fayl nomi sklad kodi bilan boshlanishi kerak: “R104 Saribuloq sklad 2026.xlsx”</small>
        </div>
        {results.map((r, i) => (
          <div key={i} className={`alert ${r.ok ? 'alert-ok' : 'alert-error'}`}>
            {r.ok ? (
              <>
                ✓ <b>{r.file}</b> yuklandi — {r.code} {r.name}
              </>
            ) : (
              <>
                ⚠ {r.file && <b>{r.file}: </b>}
                {r.error}
              </>
            )}
          </div>
        ))}
      </Card>

      <Card title="Yuklangan skladlar" sub={`${db.warehouses.length} ta fayl`} pad={false}>
        <div className="dt-scroll">
          <table>
            <thead>
              <tr>
                <th>Sklad</th>
                <th>Fayl</th>
                <th title="Приход va Списание listlaridagi oxirgi sana">Yangilangan</th>
                <th>Fayl yuklangan</th>
                <th className="num">Materiallar</th>
                <th className="num">Chiqim</th>
                <th className="num">Kirim</th>
                <th className="num">Qaytarish</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {db.warehouses.map((w) => (
                <tr key={w.code}>
                  <td>
                    <span className="wh-chip">{w.code}</span> <b>{w.name}</b>
                  </td>
                  <td>
                    {w.file}
                    {w.warnings.map((x, i) => (
                      <div key={i} className="warn small">
                        ⚠ {x}
                      </div>
                    ))}
                  </td>
                  <td>
                    <Updated w={w} long />
                  </td>
                  <td className="muted">{fmtDateTime(w.updatedAt)}</td>
                  <td className="num">{fmtInt(w.counts.items)}</td>
                  <td className="num">{fmtInt(w.counts.out)}</td>
                  <td className="num">{fmtInt(w.counts.in)}</td>
                  <td className="num">{fmtInt(w.counts.ret)}</td>
                  <td className="num">
                    <button className="btn btn-ghost btn-danger" onClick={() => remove(w)}>
                      O‘chirish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!db.warehouses.length && <div className="empty">Hali fayl yuklanmagan</div>}
        </div>
      </Card>

      {db.errors.length > 0 && (
        <Card title="O‘qib bo‘lmagan fayllar">
          {db.errors.map((e, i) => (
            <div key={i} className="alert alert-error">
              <b>{e.file}</b>: {e.error}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
