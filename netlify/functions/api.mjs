// Topfin Result — Netlify'dagi API (kompyuterdagi server/index.js bilan bir xil manzillar).
//   GET    /api/data              — barcha skladlar
//   POST   /api/upload            — brauzerda o'qilgan Excel natijasi { warehouse, size }
//   DELETE /api/warehouses/:code  — skladni o'chirish
// Ma'lumot Netlify Blobs'da ("sklad" xotirasi, kalit: wh/R104) doimiy saqlanadi —
// ertalab yuklangan fayl kun bo'yi hammaga ko'rinadi, keyingi yuklash eskisini almashtiradi.
// Netlify sozlamalarida SITE_PASSWORD berilsa, sayt parol so'raydi.
import { getStore } from '@netlify/blobs';
import { MAX_UPLOAD_BYTES, passwordOk, validateWarehouse } from '../../shared/validate.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const env = (name) => (globalThis.Netlify?.env?.get?.(name) ?? process.env[name]) || '';

// Asosiy mantiq — sinash uchun store va parol tashqaridan beriladi
export async function handle(req, { store, password }) {
  if (!passwordOk(password, req.headers.get('x-site-password'))) return json(401, { error: 'Parol noto‘g‘ri', password: true });

  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '');

  if (req.method === 'GET' && p === '/api/data') {
    const { blobs } = await store.list({ prefix: 'wh/' });
    const keys = blobs.map((b) => b.key).sort();
    // Javob oqim (stream) bilan beriladi: chegarasi 6 MB emas, 20 MB
    const enc = new TextEncoder();
    let i = 0;
    let first = true;
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('{"warehouses":['));
      },
      async pull(c) {
        while (i < keys.length) {
          const text = await store.get(keys[i++], { consistency: 'strong' });
          if (!text) continue;
          c.enqueue(enc.encode((first ? '' : ',') + text));
          first = false;
          return;
        }
        c.enqueue(enc.encode('],"errors":[]}'));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }

  if (req.method === 'POST' && p === '/api/upload') {
    const len = Number(req.headers.get('content-length') || 0);
    if (len > MAX_UPLOAD_BYTES) return json(413, { error: 'Fayl juda katta' });
    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'Ma’lumot noto‘g‘ri (JSON emas)' });
    }
    try {
      const w = validateWarehouse(body && body.warehouse);
      await store.setJSON(`wh/${w.code}`, { ...w, size: Number(body.size) || 0, updatedAt: Date.now() });
      return json(200, { ok: true, code: w.code, name: w.name });
    } catch (e) {
      return json(400, { error: e.message });
    }
  }

  const del = p.match(/^\/api\/warehouses\/([A-Za-z]{1,3}\d{2,4})$/);
  if (req.method === 'DELETE' && del) {
    const key = `wh/${del[1].toUpperCase()}`;
    const exists = await store.get(key, { consistency: 'strong' });
    if (!exists) return json(404, { error: 'Sklad topilmadi' });
    await store.delete(key);
    return json(200, { ok: true });
  }

  return json(404, { error: 'Topilmadi' });
}

export default async (req) =>
  handle(req, {
    store: getStore({ name: 'sklad', consistency: 'strong' }),
    password: env('SITE_PASSWORD'),
  });

export const config = {
  path: '/api/*',
};
