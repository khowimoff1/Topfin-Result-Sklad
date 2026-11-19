// Topfin Result — Netlify'dagi API (kompyuterdagi server/index.js bilan bir xil manzillar).
//   GET    /api/data                — barcha skladlar (ko'rish — parolsiz, SITE_PASSWORD bo'lsa u bilan)
//   GET    /api/admin/check         — admin parolini tekshirish
//   POST   /api/upload              — brauzerda o'qilgan Excel natijasi { warehouse, size }   [admin]
//   DELETE /api/warehouses/:code    — skladni o'chirish                                     [admin]
//   POST   /api/telegram            — Telegram bot webhook (Excel fayl kelganda)
//   GET    /api/telegram/status     — bot ulanganmi
//   POST   /api/telegram/setup      — botni ulash (webhook o'rnatish)                        [admin]
//
// Ma'lumot Netlify Blobs'da ("sklad" xotirasi, kalit: wh/R104) doimiy saqlanadi.
// Netlify → Environment variables:
//   ADMIN_PASSWORD      — yuklash/o'chirish paroli (bo'lmasa saytdan yuklab bo'lmaydi)
//   TELEGRAM_BOT_TOKEN  — @BotFather bergan token
//   TELEGRAM_CHATS      — fayl qabul qilinadigan chat ID'lar (vergul bilan)
//   SITE_PASSWORD       — ixtiyoriy: saytni ko'rish uchun ham parol
import { getStore } from '@netlify/blobs';
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../../shared/parser.mjs';
import { MAX_UPLOAD_BYTES, adminCheck, cleanLabel, passwordOk, validateWarehouse } from '../../shared/validate.mjs';
import { handleUpdate, parseChats, telegramApi, webhookSecret } from '../lib/telegram.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const env = (name) => (globalThis.Netlify?.env?.get?.(name) ?? process.env[name]) || '';

const ADMIN_MISSING = 'Yuklash va o‘chirish uchun parol hali o‘rnatilmagan. Netlify → Site configuration → Environment variables → ADMIN_PASSWORD qo‘shing va saytni qayta joylang.';

// Asosiy mantiq — sinash uchun hamma narsa tashqaridan beriladi
export async function handle(req, deps) {
  const { store, password, adminPassword } = deps;
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '');

  // --- Telegram webhook: Telegram parol yubora olmaydi, o'zining maxfiy kaliti bilan keladi
  if (req.method === 'POST' && p === '/api/telegram') {
    const { token, chats } = deps.telegram;
    if (!token) return json(503, { error: 'TELEGRAM_BOT_TOKEN o‘rnatilmagan' });
    if (req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret(token)) return json(401, { error: 'Ruxsat yo‘q' });
    const update = await req.json().catch(() => null);
    await handleUpdate(update, { token, chats, fetchImpl: deps.fetch, store, XLSX: deps.XLSX, parseWorkbook: deps.parseWorkbook });
    return json(200, { ok: true });
  }

  if (!passwordOk(password, req.headers.get('x-site-password'))) return json(401, { error: 'Parol noto‘g‘ri', password: true });

  // Yozish amallari uchun admin paroli
  const admin = () => {
    const r = adminCheck(adminPassword, req.headers.get('x-admin-password'), { required: true });
    if (r === 'missing') return json(403, { error: ADMIN_MISSING, adminMissing: true });
    if (r === 'wrong') return json(401, { error: 'Admin paroli noto‘g‘ri', admin: true });
    return null;
  };

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

  if (req.method === 'GET' && p === '/api/admin/check') {
    return admin() || json(200, { ok: true });
  }

  if (req.method === 'POST' && p === '/api/upload') {
    const denied = admin();
    if (denied) return denied;
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
      await store.setJSON(`wh/${w.code}`, { ...w, size: Number(body.size) || 0, updatedAt: Date.now(), source: 'site', uploader: cleanLabel(body.uploader || 'Sayt') });
      return json(200, { ok: true, code: w.code, name: w.name });
    } catch (e) {
      return json(400, { error: e.message });
    }
  }

  const del = p.match(/^\/api\/warehouses\/([A-Za-z]{1,3}\d{2,4})$/);
  if (req.method === 'DELETE' && del) {
    const denied = admin();
    if (denied) return denied;
    const key = `wh/${del[1].toUpperCase()}`;
    const exists = await store.get(key, { consistency: 'strong' });
    if (!exists) return json(404, { error: 'Sklad topilmadi' });
    await store.delete(key);
    return json(200, { ok: true });
  }

  // --- Telegram bot holati va ulash
  if (p === '/api/telegram/status' || p === '/api/telegram/setup') {
    const { token, chats } = deps.telegram;
    if (req.method === 'POST' && p === '/api/telegram/setup') {
      const denied = admin();
      if (denied) return denied;
    } else if (req.method !== 'GET' || p !== '/api/telegram/status') {
      return json(404, { error: 'Topilmadi' });
    }
    const base = { available: true, configured: !!token, chats: chats.length, adminSet: !!adminPassword };
    if (!token) return json(200, base);
    const tg = telegramApi(token, deps.fetch);
    try {
      const hook = `${url.origin}/api/telegram`;
      if (req.method === 'POST') {
        await tg.call('setWebhook', { url: hook, secret_token: webhookSecret(token), allowed_updates: ['message', 'channel_post'], max_connections: 5 });
      }
      const [me, info] = await Promise.all([tg.call('getMe'), tg.call('getWebhookInfo')]);
      return json(200, {
        ...base,
        username: me.username,
        webhook: info.url === hook,
        webhookUrl: info.url ? '(boshqa manzil)' : '',
        pending: info.pending_update_count || 0,
        lastError: info.last_error_message || '',
        lastErrorDate: info.last_error_date || 0,
      });
    } catch (e) {
      return json(200, { ...base, error: e.message });
    }
  }

  return json(404, { error: 'Topilmadi' });
}

export default async (req) =>
  handle(req, {
    store: getStore({ name: 'sklad', consistency: 'strong' }),
    password: env('SITE_PASSWORD'),
    adminPassword: env('ADMIN_PASSWORD'),
    telegram: { token: env('TELEGRAM_BOT_TOKEN'), chats: parseChats(env('TELEGRAM_CHATS')) },
    fetch: globalThis.fetch,
    XLSX,
    parseWorkbook,
  });

export const config = {
  path: '/api/*',
};
