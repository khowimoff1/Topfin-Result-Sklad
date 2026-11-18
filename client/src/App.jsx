import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDb } from './lib/data.js';
import { fmtDate, monthEnd, monthKey, monthStart } from './lib/format.js';
import FilterBar from './components/FilterBar.jsx';
import Logo from './components/Logo.jsx';
import ItemDrawer from './components/ItemDrawer.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Stock from './pages/Stock.jsx';
import Usage from './pages/Usage.jsx';
import Machines from './pages/Machines.jsx';
import Moves from './pages/Moves.jsx';
import Files from './pages/Files.jsx';
import Realization from './pages/Realization.jsx';

const I = (d) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const NAV = [
  { id: 'home', label: 'Umumiy ko‘rinish', icon: I('M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z') },
  { id: 'stock', label: 'Qoldiq', ru: 'Остатка', icon: I('M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8') },
  { id: 'usage', label: 'Sarf tahlili', ru: 'kun / oy', icon: I('M4 20V10M10 20V4M16 20v-7M22 20H2') },
  { id: 'real', label: 'Realizatsiya', ru: 'nazorat', icon: I('M12 3l9 16H3zM12 10v4M12 17h.01') },
  { id: 'machines', label: 'Makinalar', ru: 'sarfi', icon: I('M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 00-2.3-1.3L14 3h-4l-.3 2.4a7 7 0 00-2.3 1.3l-2.3-.9-2 3.4 2 1.5a7 7 0 000 2.6l-2 1.5 2 3.4 2.3-.9a7 7 0 002.3 1.3L10 21h4l.3-2.4a7 7 0 002.3-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z') },
  { id: 'out', label: 'Chiqim', ru: 'Списание', icon: I('M12 19V5M5 12l7-7 7 7') },
  { id: 'in', label: 'Kirim', ru: 'Приход', icon: I('M12 5v14M5 12l7 7 7-7') },
  { id: 'ret', label: 'Qaytarish', ru: 'Возврат', icon: I('M9 14l-5-5 5-5M4 9h11a5 5 0 010 10h-3') },
  { id: 'files', label: 'Fayllar', ru: 'Excel', icon: I('M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6') },
];

const TITLES = {
  home: ['Umumiy ko‘rinish', 'Barcha skladlar bo‘yicha asosiy ko‘rsatkichlar'],
  stock: ['Qoldiq', 'Hozir qaysi materialdan nechta bor va qaysi skladda turibdi'],
  real: ['Realizatsiya', 'Almaz, polimer va dizel: oyiga o‘rtacha qancha ketadi va qayerda odatdagidan ko‘p rasxod bor'],
  machines: ['Makinalar', 'Har bir makina (burg‘ulash stanogi) qancha material va yoqilg‘i sarflagani'],
  usage: ['Sarf tahlili', 'Qaysi materialdan kuniga va oyiga qancha ishlatilyapti'],
  out: ['Chiqim', 'Списание — skladdan berilgan materiallar'],
  in: ['Kirim', 'Приход — skladga kelgan materiallar'],
  ret: ['Qaytarish', 'Возврат — skladga qaytarilgan materiallar'],
  files: ['Fayllar', 'Excel fayllarni yuklash va yangilash'],
};

const pageFromHash = () => {
  const h = window.location.hash.replace('#', '');
  return NAV.some((n) => n.id === h) ? h : 'home';
};

// Ochilish ekrani: "TOPFIN RESULT", pastda chiziq to'ladi — ma'lumot yuklangach sayt ochiladi
function Splash({ ready, error, onRetry, onDone }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (error) return undefined;
    const t = setInterval(() => {
      setP((x) => {
        if (ready) return Math.min(100, x + 6);
        return Math.min(90, x + Math.max(0.6, (90 - x) / 14)); // ma'lumot kelguncha 90% gacha sekinlashib to'ladi
      });
    }, 60);
    return () => clearInterval(t);
  }, [ready, error]);
  useEffect(() => {
    if (p >= 100) {
      const t = setTimeout(onDone, 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [p, onDone]);

  return (
    <div className={`splash ${p >= 100 ? 'splash-out' : ''}`}>
      <div className="splash-hero">
        <Logo className="splash-logo" />
        <p>Skladlar nazorati: qoldiq, kirim-chiqim, makinalar sarfi va realizatsiya</p>
      </div>
      <div className="splash-bottom">
        {error ? (
          <div className="alert alert-error">
            <b>Server bilan aloqa yo‘q.</b> {error}. start.bat ishlab turganini tekshiring.{' '}
            <button className="btn" onClick={onRetry}>
              Qayta urinish
            </button>
          </div>
        ) : (
          <>
            <div className="splash-bar" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
              <div className="splash-fill" style={{ width: `${p}%` }} />
            </div>
            <div className="splash-text">{ready ? 'Tayyor' : 'Excel fayllar o‘qilmoqda…'} {Math.round(p)}%</div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [splash, setSplash] = useState(true);
  const [db, setDb] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(pageFromHash);
  const [f, setF] = useState(null);
  const [itemOpen, setItemOpen] = useState(null);
  const [stockStatus, setStockStatus] = useState('pos');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchDb();
      setDb(next);
      setError('');
      setF((prev) => {
        if (prev && prev.wh < next.warehouses.length) return prev;
        const mk = monthKey(next.maxDate || 20260101);
        return { wh: -1, from: monthStart(mk), to: monthEnd(mk), noTransfer: false };
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((id) => {
    window.location.hash = id;
    setPage(id);
    window.scrollTo(0, 0);
  }, []);

  const ctx = useMemo(
    () => ({ db, f, setF, go, openItem: setItemOpen, stockStatus, setStockStatus, reload: load }),
    [db, f, go, stockStatus, load]
  );

  const [title, subtitle] = TITLES[page];
  const empty = db && !db.warehouses.length;

  if (splash) return <Splash ready={!!db} error={db ? '' : error} onRetry={load} onDone={() => setSplash(false)} />;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="brand-logo">
            <Logo variant="dark" />
          </div>
          <small>{db ? `Sklad nazorati · ${db.warehouses.length} ta sklad` : 'Sklad nazorati'}</small>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={page === n.id ? 'on' : ''} onClick={() => go(n.id)}>
              {n.icon}
              <span>{n.label}</span>
              {n.ru && <small>{n.ru}</small>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {db && db.maxDate > 0 && (
            <div>
              Oxirgi yozuv sanasi
              <b>{fmtDate(db.maxDate)}</b>
            </div>
          )}
          <button className="btn btn-side" onClick={load} disabled={loading}>
            {loading ? 'Yangilanmoqda…' : '↻ Ma’lumotni yangilash'}
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="page-head">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>

        {error && (
          <div className="alert alert-error">
            <b>Server bilan aloqa yo‘q.</b> {error}. Backend ishlab turganini tekshiring (server papkasida <code>npm start</code>).
          </div>
        )}
        {!db && !error && <div className="loading">Excel fayllar o‘qilmoqda…</div>}

        {db && f && (
          <>
            {page !== 'files' && !empty && <FilterBar db={db} f={f} setF={setF} showPeriod={page !== 'real'} showTransfer={page === 'home' || page === 'usage' || page === 'out'} />}
            {empty && page !== 'files' ? (
              <div className="card">
                <div className="empty">
                  Hali birorta Excel fayl yuklanmagan.
                  <br />
                  <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => go('files')}>
                    Fayl yuklash
                  </button>
                </div>
              </div>
            ) : (
              <>
                {page === 'home' && <Dashboard {...ctx} />}
                {page === 'stock' && <Stock {...ctx} />}
                {page === 'usage' && <Usage {...ctx} />}
                {page === 'real' && <Realization {...ctx} />}
                {page === 'machines' && <Machines {...ctx} />}
                {(page === 'out' || page === 'in' || page === 'ret') && <Moves key={page} type={page} {...ctx} />}
                {page === 'files' && <Files {...ctx} />}
              </>
            )}
          </>
        )}
      </main>

      {db && f && itemOpen !== null && <ItemDrawer db={db} f={f} itemIdx={itemOpen} onClose={() => setItemOpen(null)} />}
    </div>
  );
}
