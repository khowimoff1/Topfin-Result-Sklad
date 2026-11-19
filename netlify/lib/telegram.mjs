// Telegram bot: unga (yoki u qo'shilgan guruhga) yuborilgan sklad Excel fayli avtomatik saytga joylanadi.
// Sozlash (Netlify → Environment variables):
//   TELEGRAM_BOT_TOKEN — @BotFather bergan token
//   TELEGRAM_CHATS     — ixtiyoriy: doim ruxsat etilgan chat ID'lar (vergul bilan)
// Qolgan chatlarga (masalan yangi guruh) saytdagi "Fayllar → Telegram" bo'limida "Ruxsat berish" bosiladi —
// ro'yxat Netlify Blobs'da saqlanadi (tg/allowed), qayta deploy shart emas.
import { createHash } from 'node:crypto';
import { cleanLabel, dataLastDate, validateWarehouse } from '../../shared/validate.mjs';

const MAX_TG_FILE = 20 * 1024 * 1024; // Telegram botlar 20 MB gacha yuklab oladi
const WARN_EVERY_MS = 6 * 3600 * 1000; // ruxsatsiz guruhga ogohlantirish — 6 soatda bir martadan ko'p emas
export const ALLOWED_UPDATES = ['message', 'channel_post', 'my_chat_member'];

// Webhook maxfiy kaliti tokendan hosil qilinadi (faqat A-Z a-z 0-9 _ - ruxsat)
export const webhookSecret = (token) => createHash('sha256').update(`topfin-result:${token}`).digest('hex').slice(0, 48);

export const parseChats = (s) =>
  String(s || '')
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter((x) => /^-?\d+$/.test(x));

const fmt = (d) => (d ? `${String(d % 100).padStart(2, '0')}.${String(Math.floor(d / 100) % 100).padStart(2, '0')}.${Math.floor(d / 10000)}` : '—');
const n = (x) => new Intl.NumberFormat('ru-RU').format(x);
const isGroup = (chat) => chat && chat.type !== 'private';
const chatTitle = (chat) => cleanLabel(chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id));

// ---------- Chatlar ro'yxati (Netlify Blobs)
const readJson = async (store, key, def) => {
  const t = await store.get(key, { consistency: 'strong' });
  if (!t) return def;
  try {
    return JSON.parse(t);
  } catch {
    return def;
  }
};
export const getAllowed = (store) => readJson(store, 'tg/allowed', []);
export async function setAllowed(store, chat, allow) {
  const list = await getAllowed(store);
  const id = String(chat.id);
  const rest = list.filter((c) => c.id !== id);
  if (allow) rest.push({ id, title: cleanLabel(chat.title || id), type: chat.type || '', addedAt: Date.now() });
  await store.setJSON('tg/allowed', rest);
  return rest;
}
export async function recordSeen(store, chat, extra = {}) {
  const key = `tg/seen/${chat.id}`;
  const prev = await readJson(store, key, {});
  const next = { ...prev, id: String(chat.id), title: chatTitle(chat), type: chat.type || '', lastAt: Date.now(), ...extra };
  await store.setJSON(key, next);
  return next;
}
export async function listChats(store, envChats) {
  const allowed = await getAllowed(store);
  const { blobs } = await store.list({ prefix: 'tg/seen/' });
  const seen = [];
  for (const b of blobs) {
    const s = await readJson(store, b.key, null);
    if (s) seen.push(s);
  }
  const allowedIds = new Set([...envChats, ...allowed.map((c) => c.id)]);
  const titleOf = (id) => seen.find((s) => s.id === id)?.title || allowed.find((c) => c.id === id)?.title || '';
  return {
    allowed: [
      ...envChats.map((id) => ({ id, title: titleOf(id), fixed: true })),
      ...allowed.filter((c) => !envChats.includes(c.id)).map((c) => ({ id: c.id, title: c.title || titleOf(c.id), fixed: false })),
    ],
    pending: seen.filter((s) => !allowedIds.has(s.id) && !s.left).sort((a, b) => b.lastAt - a.lastAt).slice(0, 20),
  };
}

export function telegramApi(token, fetchImpl) {
  const call = async (method, body) => {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.description || `Telegram: ${method} xato (${res.status})`);
    return j.result;
  };
  const download = async (fileId) => {
    const f = await call('getFile', { file_id: fileId });
    const res = await fetchImpl(`https://api.telegram.org/file/bot${token}/${f.file_path}`);
    if (!res.ok) throw new Error(`Faylni Telegram'dan olib bo‘lmadi (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  };
  return { call, download };
}

const HOW_TO_ALLOW = 'Saytda “Fayllar” → “Telegram” bo‘limida shu chat uchun “Ruxsat berish” ni bosing (admin paroli kerak).';

// Telegram'dan kelgan bitta yangilanish (update) ni qayta ishlaydi
export async function handleUpdate(update, { token, chats: envChats, fetchImpl, store, XLSX, parseWorkbook }) {
  if (!update) return;
  const tg = telegramApi(token, fetchImpl);
  const send = (chatId, text, replyTo) =>
    tg.call('sendMessage', { chat_id: chatId, text, ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}) }).catch(() => {});

  const allowedNow = async () => new Set([...envChats, ...(await getAllowed(store)).map((c) => c.id)]);

  // --- Bot guruhga qo'shildi / chiqarildi
  const mcm = update.my_chat_member;
  if (mcm && mcm.chat) {
    const status = mcm.new_chat_member?.status;
    if (status === 'member' || status === 'administrator') {
      await recordSeen(store, mcm.chat, { left: false, addedBy: cleanLabel([mcm.from?.first_name, mcm.from?.last_name].filter(Boolean).join(' ')) });
      if (isGroup(mcm.chat) && mcm.old_chat_member?.status !== 'member' && mcm.old_chat_member?.status !== 'administrator') {
        const ok = (await allowedNow()).has(String(mcm.chat.id));
        await send(
          mcm.chat.id,
          ok
            ? '👋 Salom! Shu guruhga tashlangan sklad Excel fayllari avtomatik saytga joylanadi.'
            : `👋 Salom! Men shu guruhga tashlangan sklad Excel fayllarini saytga joylayman.\n⛔ Avval ruxsat kerak: ${HOW_TO_ALLOW}`
        );
      }
    } else if (status === 'left' || status === 'kicked') {
      await recordSeen(store, mcm.chat, { left: true });
    }
    return;
  }

  const msg = update.message || update.channel_post;
  if (!msg || !msg.chat) return;
  const chatId = String(msg.chat.id);
  const fromId = msg.from ? String(msg.from.id) : '';
  const group = isGroup(msg.chat);

  // Oddiy guruh superguruhga aylansa — ID o'zgaradi, ruxsat yangi ID ga o'tkaziladi
  if (msg.migrate_to_chat_id) {
    const allowed = await getAllowed(store);
    if (allowed.some((c) => c.id === chatId)) {
      await setAllowed(store, { id: msg.migrate_to_chat_id, title: msg.chat.title, type: 'supergroup' }, true);
      await setAllowed(store, { id: chatId }, false);
    }
    return;
  }

  const allowedSet = await allowedNow();
  const allowed = allowedSet.has(chatId) || (!group && fromId && allowedSet.has(fromId));
  const reply = (text) => send(msg.chat.id, text, msg.message_id);

  const doc = msg.document;
  const text = String(msg.text || msg.caption || '').trim();

  if (!doc) {
    if (/^\/(start|id|help|yordam)(@\w+)?\b/i.test(text)) {
      if (!allowed) await recordSeen(store, msg.chat);
      await reply(
        [
          'Topfin Result — sklad boti.',
          group ? 'Shu guruhga tashlangan sklad Excel fayllari (.xlsx) avtomatik saytga joylanadi.' : 'Sklad Excel faylini (.xlsx) shu yerga yuboring — u avtomatik saytga joylanadi.',
          '',
          `Bu chat ID: ${chatId}${!group && fromId && fromId !== chatId ? `\nSizning ID: ${fromId}` : ''}`,
          allowed ? '✅ Bu chatdan fayl qabul qilinadi.' : `⛔ Bu chat hali ruxsat etilmagan. ${HOW_TO_ALLOW}`,
        ].join('\n')
      );
    }
    return;
  }

  const name = cleanLabel(doc.file_name || 'fayl.xlsx', 200);
  if (!/\.(xlsx|xlsm)$/i.test(name)) {
    if (allowed && !group) await reply('Faqat Excel (.xlsx) fayl qabul qilinadi.');
    return; // guruhda boshqa fayllarga javob bermaymiz
  }
  if (!allowed) {
    const seen = await recordSeen(store, msg.chat, { lastFile: name });
    if (!group || !seen.warnedAt || Date.now() - seen.warnedAt > WARN_EVERY_MS) {
      await recordSeen(store, msg.chat, { warnedAt: Date.now() });
      await reply(`⛔ Bu chatdan fayl hali qabul qilinmaydi.\n${HOW_TO_ALLOW}`);
    }
    return;
  }
  if (doc.file_size && doc.file_size > MAX_TG_FILE) {
    await reply('⚠ Fayl 20 MB dan katta — Telegram bot uni yuklab ololmaydi. Saytdagi “Fayllar” sahifasidan yuklang.');
    return;
  }

  let w;
  let bytes;
  try {
    bytes = await tg.download(doc.file_id);
    const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
    w = validateWarehouse(parseWorkbook(XLSX, wb, name));
  } catch (e) {
    // Guruhda sklad fayli bo'lmagan Excel'lar ham tashlanishi mumkin — ularga jim turamiz
    if (group && /kerakli listlar topilmadi/i.test(e.message)) return;
    await reply(`⚠ “${name}” faylini o‘qib bo‘lmadi: ${e.message}`);
    return;
  }

  try {
    const last = dataLastDate(w);
    const prev = await readJson(store, `wh/${w.code}`, null);
    const prevLast = prev ? dataLastDate(prev) : 0;
    const who = cleanLabel([msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.chat.title || 'Telegram');
    await store.setJSON(`wh/${w.code}`, {
      ...w,
      size: doc.file_size || bytes.length,
      updatedAt: Date.now(),
      source: 'telegram',
      uploader: who,
      chat: group ? chatTitle(msg.chat) : '',
    });

    const lines = [
      `✅ ${w.code} ${w.name} saytda yangilandi.`,
      `Chiqim: ${n(w.out.length)} · Kirim: ${n(w.in.length)} · Qaytarish: ${n(w.ret.length)}`,
      `Oxirgi sana: ${fmt(last)}`,
    ];
    if (prevLast && last < prevLast) lines.push(`⚠ Diqqat: saytdagi avvalgi faylda oxirgi sana ${fmt(prevLast)} edi — bu fayl eskiroq.`);
    if (w.warnings.length) lines.push(`ℹ ${w.warnings.join('; ')}`);
    await reply(lines.join('\n'));
  } catch (e) {
    await reply(`⚠ “${name}” saytga saqlanmadi: ${e.message}`);
  }
}
