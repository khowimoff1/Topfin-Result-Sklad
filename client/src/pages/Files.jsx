import React, { useRef, useState } from 'react';
import { fmtDateTime, fmtInt } from '../lib/format.js';
import { Card, Updated } from '../components/ui.jsx';
import { api, PasswordError } from '../lib/api.js';
import { MAX_UPLOAD_BYTES } from '../../../shared/validate.mjs';

export default function Files({ db, reload }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [results, setResults] = useState([]);

  // Excel shu brauzerning o'zida o'qiladi, serverga faqat natija (ixcham JSON) yuboriladi.
  // Shunday qilib katta fayllar ham (5–10 MB) internetdagi saytga sig'adi.
  const upload = async (fileList) => {
    const files = [...fileList].filter((x) => /\.(xlsx|xlsm)$/i.test(x.name));
    if (!files.length) {
      setResults([{ file: '', ok: false, error: 'Faqat .xlsx yoki .xlsm fayl tanlang' }]);
      return;
    }
    setBusy(true);
    const out = [];
    const show = (extra) => setResults([...out, ...(extra ? [extra] : [])]);
    try {
      const [XLSX, { parseWorkbook }] = await Promise.all([import('xlsx'), import('../../../shared/parser.mjs')]);
      for (const file of files) {
        try {
          show({ file: file.name, busy: true, text: 'o‘qilmoqda…' });
          await new Promise((r) => setTimeout(r, 30)); // yozuv ekranda ko'rinib olsin
          const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
          const warehouse = parseWorkbook(XLSX, wb, file.name);
          show({ file: file.name, busy: true, text: 'saytga yuklanmoqda…' });
          const body = JSON.stringify({ warehouse, size: file.size });
          if (body.length > MAX_UPLOAD_BYTES) throw new Error(`Ma’lumot juda katta (${(body.length / 1048576).toFixed(1)} MB)`);
          const res = await api('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `Xato (${res.status})`);
          out.push({ file: file.name, ok: true, code: json.code, name: json.name, counts: [warehouse.out.length, warehouse.in.length] });
        } catch (e) {
          out.push({ file: file.name, ok: false, error: e instanceof PasswordError ? 'Parol noto‘g‘ri — sahifani yangilab, parolni qayta kiriting' : e.message });
        }
        show();
      }
      await reload();
    } catch (e) {
      out.push({ file: '', ok: false, error: e.message });
      show();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (w) => {
    if (!window.confirm(`${w.code} ${w.name} — sklad ma’lumoti saytdan olib tashlansinmi?\n(Kompyuteringizdagi asl Excel faylga tegilmaydi.)`)) return;
    const res = await api(`/api/warehouses/${encodeURIComponent(w.code)}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      window.alert(json.error || 'O‘chirib bo‘lmadi');
    }
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
          <small className="muted">Fayl nomida sklad kodi bo‘lsin: “R104 Saribuloq sklad 2026.xlsx”. Fayl shu kompyuterda o‘qiladi, serverga faqat kerakli ma’lumot yuboriladi.</small>
        </div>
        {results.map((r, i) => (
          <div key={i} className={`alert ${r.busy ? 'alert-info' : r.ok ? 'alert-ok' : 'alert-error'}`}>
            {r.busy ? (
              <>
                ⏳ <b>{r.file}</b> — {r.text}
              </>
            ) : r.ok ? (
              <>
                ✓ <b>{r.file}</b> yuklandi — {r.code} {r.name} ({fmtInt(r.counts[0])} chiqim, {fmtInt(r.counts[1])} kirim yozuvi). Endi saytni ochgan hamma shu ma’lumotni ko‘radi.
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
