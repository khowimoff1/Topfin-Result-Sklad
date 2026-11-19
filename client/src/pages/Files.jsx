import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fmtDateTime, fmtInt } from '../lib/format.js';
import { Card, Updated } from '../components/ui.jsx';
import { AdminError, adminApi, api, getAdmin, PasswordError, setAdmin } from '../lib/api.js';
import { MAX_UPLOAD_BYTES } from '../../../shared/validate.mjs';

// Yuklash / o'chirish oldidan so'raladigan admin paroli oynasi
function AdminPrompt({ onSubmit, onCancel, error, busy }) {
  const [pw, setPw] = useState('');
  return (
    <div className="modal-wrap" onClick={onCancel}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(pw);
        }}
      >
        <h3>🔒 Admin paroli</h3>
        <p className="muted small">Fayl yuklash va o‘chirish uchun parol kerak. Ko‘rish uchun parol shart emas.</p>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Parol" autoFocus aria-label="Admin paroli" />
        {error && <div className="alert alert-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Bekor qilish
          </button>
          <button className="btn btn-primary" disabled={!pw || busy}>
            {busy ? 'Tekshirilmoqda…' : 'Davom etish'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Telegram bot holati va sozlash yo'riqnomasi
function TelegramCard({ ensureAdmin }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api('/api/telegram/status');
      setSt(res.ok ? await res.json() : { available: false });
    } catch {
      setSt({ available: false });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!st || !st.available) return null; // kompyuterdagi versiyada bot yo'q

  const connect = async () => {
    setMsg('');
    const pw = await ensureAdmin();
    if (pw === null) return;
    setBusy(true);
    try {
      const res = await adminApi('/api/telegram/setup', { method: 'POST' }, pw);
      const j = await res.json().catch(() => ({}));
      setSt(j);
      setMsg(j.error ? `⚠ ${j.error}` : j.webhook ? '✓ Bot ulandi. Endi unga Excel yuborsangiz, saytga joylanadi.' : '⚠ Ulab bo‘lmadi');
    } catch (e) {
      setMsg(`⚠ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const ok = st.configured && st.webhook && st.chats > 0 && !st.error;
  return (
    <Card
      title="Telegram'dan avtomatik yuklash"
      sub={
        ok ? (
          <>
            ✅ Bot ishlayapti: <b>@{st.username}</b> · {st.chats} ta chatdan fayl qabul qilinadi
          </>
        ) : (
          'Telegram botga Excel yuborilsa, u o‘zi saytga joylanadi'
        )
      }
      actions={
        st.configured && (
          <button className="btn" onClick={connect} disabled={busy}>
            {busy ? 'Ulanmoqda…' : st.webhook ? '↻ Qayta ulash' : 'Botni ulash'}
          </button>
        )
      }
    >
      {msg && <div className={`alert ${msg.startsWith('✓') ? 'alert-ok' : 'alert-error'}`}>{msg}</div>}
      {st.error && <div className="alert alert-error">⚠ Telegram: {st.error}</div>}
      {st.lastError && (
        <div className="alert alert-error">
          ⚠ Oxirgi xato ({fmtDateTime(st.lastErrorDate * 1000)}): {st.lastError}
        </div>
      )}
      <ol className="tg-steps">
        <li className={st.configured ? 'done' : ''}>
          Telegram'da <b>@BotFather</b> → <code>/newbot</code> → bot yarating va bergan <b>token</b>ni Netlify → Site configuration → Environment
          variables ga <code>TELEGRAM_BOT_TOKEN</code> nomi bilan qo‘shing.
        </li>
        <li className={st.adminSet ? 'done' : ''}>
          Shu yerga <code>ADMIN_PASSWORD</code> ham qo‘shing — saytdan yuklash, o‘chirish va botni ulash uchun parol.
        </li>
        <li className={st.configured ? 'done' : ''}>
          Netlify → Deploys → <b>Trigger deploy</b> (o‘zgaruvchilar shundan keyin ishlaydi), so‘ng shu sahifada <b>«Botni ulash»</b>ni bosing.
        </li>
        <li className={st.chats > 0 ? 'done' : ''}>
          Botga (yoki bot qo‘shilgan guruhga) <code>/id</code> yozing — u chat ID ni aytadi. Shu ID larni vergul bilan <code>TELEGRAM_CHATS</code> ga
          qo‘shing va yana Trigger deploy qiling. Boshqa chatlardan fayl qabul qilinmaydi.
        </li>
        <li>
          Guruhda ishlatsangiz: @BotFather → <code>/setprivacy</code> → botingiz → <b>Disable</b> (aks holda bot guruhdagi fayllarni ko‘rmaydi) yoki botni
          guruhga admin qiling.
        </li>
      </ol>
      <p className="muted small">
        Bot faylni olgach, o‘sha sklad kodidagi eski ma’lumotni almashtiradi va chatga “✅ R104 Saribuloq saytga joylandi” deb javob yozadi. Fayl 20 MB dan
        oshmasin.
      </p>
    </Card>
  );
}

export default function Files({ db, reload }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [results, setResults] = useState([]);
  const [prompt, setPrompt] = useState(null); // { resolve, error, busy }

  // Admin parolini ta'minlaydi: saqlangani to'g'ri bo'lsa — so'ramaydi, aks holda oyna ochadi.
  // Natija: parol (string) yoki null (bekor qilindi)
  const ensureAdmin = useCallback(async () => {
    try {
      const res = await adminApi('/api/admin/check', {}, getAdmin());
      if (res.ok) return getAdmin();
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `Xato (${res.status})`);
    } catch (e) {
      if (!(e instanceof AdminError)) {
        window.alert(e instanceof PasswordError ? 'Sayt paroli noto‘g‘ri — sahifani yangilang' : e.message);
        return null;
      }
    }
    return new Promise((resolve) => setPrompt({ resolve, error: '', busy: false }));
  }, []);

  const submitPrompt = async (pw) => {
    setPrompt((p) => ({ ...p, busy: true, error: '' }));
    try {
      const res = await adminApi('/api/admin/check', {}, pw);
      if (!res.ok) throw new Error('Tekshirib bo‘lmadi');
      setAdmin(pw);
      prompt.resolve(pw);
      setPrompt(null);
    } catch (e) {
      setPrompt((p) => ({ ...p, busy: false, error: e instanceof AdminError ? 'Parol noto‘g‘ri' : e.message }));
    }
  };
  const cancelPrompt = () => {
    prompt.resolve(null);
    setPrompt(null);
  };

  // Excel shu brauzerning o'zida o'qiladi, serverga faqat natija (ixcham JSON) yuboriladi.
  // Shunday qilib katta fayllar ham (5–10 MB) internetdagi saytga sig'adi.
  const upload = async (fileList) => {
    const files = [...fileList].filter((x) => /\.(xlsx|xlsm)$/i.test(x.name));
    if (input.current) input.current.value = '';
    if (!files.length) {
      setResults([{ file: '', ok: false, error: 'Faqat .xlsx yoki .xlsm fayl tanlang' }]);
      return;
    }
    const pw = await ensureAdmin();
    if (pw === null) return;
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
          const body = JSON.stringify({ warehouse, size: file.size, uploader: 'Sayt' });
          if (body.length > MAX_UPLOAD_BYTES) throw new Error(`Ma’lumot juda katta (${(body.length / 1048576).toFixed(1)} MB)`);
          const res = await adminApi('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, pw);
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `Xato (${res.status})`);
          out.push({ file: file.name, ok: true, code: json.code, name: json.name, counts: [warehouse.out.length, warehouse.in.length] });
        } catch (e) {
          out.push({
            file: file.name,
            ok: false,
            error: e instanceof AdminError ? 'Admin paroli noto‘g‘ri — qayta urinib ko‘ring' : e instanceof PasswordError ? 'Sayt paroli noto‘g‘ri — sahifani yangilang' : e.message,
          });
          if (e instanceof AdminError) break;
        }
        show();
      }
      await reload();
    } catch (e) {
      out.push({ file: '', ok: false, error: e.message });
      show();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (w) => {
    if (!window.confirm(`${w.code} ${w.name} — sklad ma’lumoti saytdan olib tashlansinmi?\n(Kompyuteringizdagi asl Excel faylga tegilmaydi.)`)) return;
    const pw = await ensureAdmin();
    if (pw === null) return;
    try {
      const res = await adminApi(`/api/warehouses/${encodeURIComponent(w.code)}`, { method: 'DELETE' }, pw);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        window.alert(json.error || 'O‘chirib bo‘lmadi');
      }
    } catch (e) {
      window.alert(e.message);
    }
    await reload();
  };

  const source = (w) =>
    w.source === 'telegram' ? (
      <span className="src src-tg" title="Telegram bot orqali">
        ✈ Telegram{w.uploader && w.uploader !== 'Telegram' ? ` · ${w.uploader}` : ''}
      </span>
    ) : w.source === 'site' ? (
      <span className="src">🖥 Sayt</span>
    ) : (
      <span className="src">📁 Papka</span>
    );

  return (
    <div className="stack">
      <Card title="Excel fayl yuklash" sub="Sklad faylining yangi versiyasini yuklasangiz, o‘sha sklad kodidagi (masalan R104) eski fayl avtomatik almashtiriladi. Yuklash va o‘chirish parol bilan.">
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
            {busy ? 'Yuklanmoqda…' : '🔒 Fayl tanlash'}
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

      <TelegramCard ensureAdmin={ensureAdmin} />

      <Card title="Yuklangan skladlar" sub={`${db.warehouses.length} ta fayl`} pad={false}>
        <div className="dt-scroll">
          <table>
            <thead>
              <tr>
                <th>Sklad</th>
                <th>Fayl</th>
                <th title="Приход va Списание listlaridagi oxirgi sana">Yangilangan</th>
                <th>Qayerdan</th>
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
                  <td>{source(w)}</td>
                  <td className="muted">{fmtDateTime(w.updatedAt)}</td>
                  <td className="num">{fmtInt(w.counts.items)}</td>
                  <td className="num">{fmtInt(w.counts.out)}</td>
                  <td className="num">{fmtInt(w.counts.in)}</td>
                  <td className="num">{fmtInt(w.counts.ret)}</td>
                  <td className="num">
                    <button className="btn btn-ghost btn-danger" onClick={() => remove(w)}>
                      🔒 O‘chirish
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

      {prompt && <AdminPrompt onSubmit={submitPrompt} onCancel={cancelPrompt} error={prompt.error} busy={prompt.busy} />}
    </div>
  );
}
