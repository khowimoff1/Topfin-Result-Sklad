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
function TelegramCard({ ensureAdmin, onChanged }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState('');
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

  // Admin amali: parol so'raladi, so'ng so'rov yuboriladi va holat yangilanadi
  const adminAction = async (key, path, body, okText) => {
    setMsg('');
    const pw = await ensureAdmin();
    if (pw === null) return;
    setBusy(key);
    try {
      const res = await adminApi(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }, pw);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Xato (${res.status})`);
      setSt(j);
      setMsg(j.error ? `⚠ ${j.error}` : `✓ ${okText}`);
      onChanged?.();
    } catch (e) {
      setMsg(`⚠ ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  const connect = () => adminAction('connect', '/api/telegram/setup', {}, 'Bot ulandi.');
  const allow = (c, on) =>
    adminAction(`chat${c.id}`, '/api/telegram/chats', { id: c.id, title: c.title, type: c.type, allow: on }, on ? `“${c.title || c.id}” ga ruxsat berildi — bot u yerga xabar yozdi.` : `“${c.title || c.id}” olib tashlandi.`);

  const allowed = st.allowed || [];
  const pending = st.pending || [];
  const ok = st.configured && st.webhook && allowed.length > 0 && !st.error;
  const typeLabel = (t) => (t === 'private' ? 'shaxsiy' : t === 'channel' ? 'kanal' : t ? 'guruh' : '');

  return (
    <Card
      title="Telegram'dan avtomatik yuklash"
      sub={
        ok ? (
          <>
            ✅ Bot ishlayapti: <b>@{st.username}</b> · {allowed.length} ta chatdan fayl qabul qilinadi
          </>
        ) : (
          'Telegram botga yoki bot qo‘shilgan guruhga Excel tashlansa, u o‘zi saytga joylanadi'
        )
      }
      actions={
        st.configured && (
          <button className="btn" onClick={connect} disabled={!!busy}>
            {busy === 'connect' ? 'Ulanmoqda…' : st.webhook ? '↻ Qayta ulash' : 'Botni ulash'}
          </button>
        )
      }
    >
      {msg && <div className={`alert ${msg.startsWith('✓') ? 'alert-ok' : 'alert-error'}`}>{msg}</div>}
      {st.error && <div className="alert alert-error">⚠ Telegram: {st.error}</div>}
      {st.needsReconnect && (
        <div className="alert alert-info">
          ℹ Yangi imkoniyat (bot guruhga qo‘shilganini sezishi) uchun bir marta <b>«↻ Qayta ulash»</b> ni bosing.
        </div>
      )}
      {st.lastError && (
        <div className="alert alert-error">
          ⚠ Oxirgi xato ({fmtDateTime(st.lastErrorDate * 1000)}): {st.lastError}
        </div>
      )}
      {st.configured && st.username && !st.canReadGroups && (
        <div className="alert alert-info">
          ℹ <b>Guruhda ishlashi uchun:</b> hozir bot guruhdagi fayllarni ko‘rmaydi (Telegram maxfiylik rejimi). Telegram'da <b>@BotFather</b> →{' '}
          <code>/setprivacy</code> → <b>@{st.username}</b> → <b>Disable</b>. So‘ng botni guruhdan chiqarib, <b>qayta qo‘shing</b>. Yoki botni guruhga{' '}
          <b>admin</b> qiling — shunda ham ko‘radi.
        </div>
      )}

      {st.configured && (
        <div className="tg-chats">
          <div>
            <h4>Fayl qabul qilinadigan chatlar</h4>
            {allowed.length ? (
              <ul>
                {allowed.map((c) => (
                  <li key={c.id}>
                    <span>
                      <b>{c.title || 'Nomsiz chat'}</b> <span className="muted small">{c.id}</span>
                    </span>
                    {c.fixed ? (
                      <span className="muted small" title="Netlify sozlamalarida (TELEGRAM_CHATS)">
                        Netlify’da
                      </span>
                    ) : (
                      <button className="btn btn-ghost btn-danger" onClick={() => allow(c, false)} disabled={!!busy}>
                        🔒 Olib tashlash
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Hali yo‘q.</p>
            )}
          </div>
          <div>
            <h4>Ruxsat kutayotgan chatlar</h4>
            {pending.length ? (
              <ul>
                {pending.map((c) => (
                  <li key={c.id}>
                    <span>
                      <b>{c.title || 'Nomsiz chat'}</b> <span className="muted small">{typeLabel(c.type)} · {fmtDateTime(c.lastAt)}</span>
                      {c.lastFile && <span className="muted small"> · {c.lastFile}</span>}
                    </span>
                    <button className="btn btn-primary btn-sm" onClick={() => allow(c, true)} disabled={!!busy}>
                      {busy === `chat${c.id}` ? '…' : '🔒 ✓ Ruxsat berish'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">
                Botni guruhga qo‘shing (yoki guruhda <code>/id</code> yozing) — guruh shu yerda paydo bo‘ladi. Ro‘yxatni yangilash uchun{' '}
                <button className="link" onClick={load}>
                  bu yerni bosing
                </button>
                .
              </p>
            )}
          </div>
        </div>
      )}

      {!ok && (
        <ol className="tg-steps">
          <li className={st.configured ? 'done' : ''}>
            Telegram'da <b>@BotFather</b> → <code>/newbot</code> → bot yarating va <b>token</b>ni Netlify → Environment variables ga{' '}
            <code>TELEGRAM_BOT_TOKEN</code> nomi bilan qo‘shing.
          </li>
          <li className={st.adminSet ? 'done' : ''}>
            U yerga <code>ADMIN_PASSWORD</code> ham qo‘shing va <b>Trigger deploy</b> qiling.
          </li>
          <li className={st.webhook ? 'done' : ''}>
            Shu yerda <b>«Botni ulash»</b> ni bosing.
          </li>
          <li className={allowed.length ? 'done' : ''}>Botni guruhga qo‘shing va yuqorida guruh uchun «Ruxsat berish» ni bosing.</li>
        </ol>
      )}
      <p className="muted small">
        Guruhga tashlangan har bir sklad Excel fayli o‘sha skladni saytda yangilaydi va bot “✅ R104 Saribuloq saytda yangilandi” deb javob yozadi. Sklad fayli
        bo‘lmagan boshqa Excel'larga bot guruhda javob bermaydi. Fayl 20 MB dan oshmasin.
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
        ✈ Telegram{w.uploader && w.uploader !== 'Telegram' ? ` · ${w.uploader}` : ''}{w.chat ? ` · ${w.chat}` : ''}
      </span>
    ) : w.source === 'folder' ? (
      <span className="src" title="Kompyuterdagi data/ papkasidan">📁 Papka</span>
    ) : (
      <span className="src">🖥 Sayt</span>
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

      <TelegramCard ensureAdmin={ensureAdmin} onChanged={reload} />

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
