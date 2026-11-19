// Telegram bot: u qo'shilgan guruhga (yoki shaxsiy chatda unga) yuborilgan sklad Excel fayli avtomatik saytga joylanadi.
//
// Qoidalar:
//   - Guruh/kanal: bot qo'shilgan har bir guruhdan fayl AVTOMATIK qabul qilinadi (saytda ruxsat berish shart emas).
//     Bot guruhga HECH NARSA yozmaydi — jimgina saytni yangilaydi.
//     Saytda "Bloklash" bosilgan guruh qabul qilinmaydi va avtomatik qayta qo'shilmaydi.
//   - Shaxsiy chat: faqat ruxsat etilganlar (TELEGRAM_CHATS yoki saytda "Ruxsat berish"); bot javob yozadi.
//
// Netlify → Environment variables:
//   TELEGRAM_BOT_TOKEN — @BotFather bergan token
//   TELEGRAM_CHATS     — ixtiyoriy: doim ruxsat etilgan chat ID'lar (vergul bilan)
// Ro'yxatlar Netlify Blobs'da: tg/allowed, tg/blocked, tg/seen/<id>
import { createHash } from 'node:crypto';
import { cleanLabel, dataLastDate, validateWarehouse } from '../../shared/validate.mjs';
import { readWorkbook } from '../../shared/parser.mjs';

const MAX_TG_FILE = 20 * 1024 * 1024; // Telegram botlar 20 MB gacha yuklab oladi
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
// Toshkent vaqti bilan: 16.11.2026 09:42
const fmtTime = (ms) => {
  const d = new Date(ms + 5 * 3600 * 1000);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
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
const listKey = (kind) => (kind === 'blocked' ? 'tg/blocked' : 'tg/allowed');
export const getList = (store, kind) => readJson(store, listKey(kind), []);
export const getAllowed = (store) => getList(store, 'allowed');

async function putInList(store, kind, chat, on, extra = {}) {
  const list = await getList(store, kind);
  const id = String(chat.id);
  const rest = list.filter((c) => c.id !== id);
  if (on) rest.push({ id, title: cleanLabel(chat.title || id), type: chat.type || '', addedAt: Date.now(), ...extra });
  await store.setJSON(listKey(kind), rest);
  return rest;
}

// Ruxsat berish (blokdan ham chiqaradi) yoki bloklash
export async function setAllowed(store, chat, allow, extra) {
  if (allow) {
    await putInList(store, 'blocked', chat, false);
    return putInList(store, 'allowed', chat, true, extra);
  }
  await putInList(store, 'allowed', chat, false);
  return putInList(store, 'blocked', chat, true);
}

export async function recordSeen(store, chat, extra = {}) {
  const key = `tg/seen/${chat.id}`;
  const prev = await readJson(store, key, {});
  const next = { ...prev, id: String(chat.id), title: chatTitle(chat), type: chat.type || '', lastAt: Date.now(), ...extra };
  await store.setJSON(key, next);
  return next;
}

export async function listChats(store, envChats) {
  const [allowed, blocked] = await Promise.all([getList(store, 'allowed'), getList(store, 'blocked')]);
  const { blobs } = await store.list({ prefix: 'tg/seen/' });
  const seen = [];
  for (const b of blobs) {
    const s = await readJson(store, b.key, null);
    if (s) seen.push(s);
  }
  const seenOf = (id) => seen.find((s) => s.id === id);
  const decorate = (c, fixed) => {
    const s = seenOf(c.id) || {};
    return { id: c.id, title: s.title || c.title || '', type: s.type || c.type || '', fixed, auto: !!c.auto, left: !!s.left, lastAt: s.lastAt || 0, lastFile: s.lastFile || '' };
  };
  const known = new Set([...envChats, ...allowed.map((c) => c.id), ...blocked.map((c) => c.id)]);
  return {
    allowed: [...envChats.map((id) => decorate({ id, title: id.startsWith('-') ? '' : 'Shaxsiy chat', type: id.startsWith('-') ? '' : 'private' }, true)), ...allowed.filter((c) => !envChats.includes(c.id)).map((c) => decorate(c, false))],
    blocked: blocked.map((c) => decorate(c, false)),
    // Ruxsat kutayotganlar — faqat notanish shaxsiy chatlar (guruhlar avtomatik qabul qilinadi)
    pending: seen.filter((s) => !known.has(s.id) && !s.left && s.type === 'private').sort((a, b) => b.lastAt - a.lastAt).slice(0, 20),
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

// Telegram'dan kelgan bitta yangilanish (update) ni qayta ishlaydi
export async function handleUpdate(update, { token, chats: envChats, fetchImpl, store, XLSX, parseWorkbook }) {
  if (!update) return;
  const tg = telegramApi(token, fetchImpl);

  // Guruh avtomatik ruxsat oladi (agar bloklanmagan bo'lsa). Natija: qabul qilinadimi
  const groupAllowed = async (chat, by) => {
    const id = String(chat.id);
    if (envChats.includes(id)) return true;
    const [allowed, blocked] = await Promise.all([getList(store, 'allowed'), getList(store, 'blocked')]);
    if (blocked.some((c) => c.id === id)) return false;
    if (!allowed.some((c) => c.id === id)) await putInList(store, 'allowed', { id, title: chatTitle(chat), type: chat.type }, true, { auto: true, addedBy: by || '' });
    return true;
  };

  // --- Bot guruhga qo'shildi / chiqarildi (guruhga hech narsa yozilmaydi)
  const mcm = update.my_chat_member;
  if (mcm && mcm.chat) {
    const status = mcm.new_chat_member?.status;
    const by = cleanLabel([mcm.from?.first_name, mcm.from?.last_name].filter(Boolean).join(' '));
    if (status === 'member' || status === 'administrator') {
      await recordSeen(store, mcm.chat, { left: false, addedBy: by });
      if (isGroup(mcm.chat)) await groupAllowed(mcm.chat, by);
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

  // Oddiy guruh superguruhga aylansa — ID o'zgaradi, ruxsat/blok yangi ID ga o'tkaziladi
  if (msg.migrate_to_chat_id) {
    const newChat = { id: msg.migrate_to_chat_id, title: msg.chat.title, type: 'supergroup' };
    const blocked = await getList(store, 'blocked');
    if (blocked.some((c) => c.id === chatId)) await setAllowed(store, newChat, false);
    else if ((await getAllowed(store)).some((c) => c.id === chatId)) await putInList(store, 'allowed', newChat, true, { auto: true });
    await putInList(store, 'allowed', { id: chatId }, false);
    await putInList(store, 'blocked', { id: chatId }, false);
    return;
  }

  // Guruhda bot hech qachon yozmaydi; shaxsiy chatda javob beradi
  const reply = group ? async () => {} : (text) => tg.call('sendMessage', { chat_id: msg.chat.id, text, reply_to_message_id: msg.message_id, allow_sending_without_reply: true }).catch(() => {});

  let allowed;
  if (group) {
    allowed = await groupAllowed(msg.chat, cleanLabel(msg.from?.first_name || ''));
  } else {
    const ids = new Set([...envChats, ...(await getAllowed(store)).map((c) => c.id)]);
    allowed = ids.has(chatId) || (fromId && ids.has(fromId));
  }

  const doc = msg.document;
  const text = String(msg.text || msg.caption || '').trim();

  if (!doc) {
    if (!group && /^\/(start|id|help|yordam)(@\w+)?\b/i.test(text)) {
      if (!allowed) await recordSeen(store, msg.chat);
      await reply(
        [
          'Topfin Result — sklad boti.',
          'Sklad Excel faylini (.xlsx) shu yerga yuboring — u avtomatik saytga joylanadi.',
          'Meni guruhga qo‘shsangiz, guruhga tashlangan sklad fayllarini ham jimgina saytga joylayman.',
          '',
          `Sizning ID: ${chatId}`,
          allowed ? '✅ Sizdan fayl qabul qilinadi.' : '⛔ Siz hali ruxsat etilmagansiz — saytda “Fayllar” → “Telegram” bo‘limida ruxsat bering.',
        ].join('\n')
      );
    }
    return;
  }

  const name = cleanLabel(doc.file_name || 'fayl.xlsx', 200);
  if (!/\.(xlsx|xlsm)$/i.test(name)) {
    if (allowed) await reply('Faqat Excel (.xlsx) fayl qabul qilinadi.');
    return;
  }
  if (!allowed) {
    await recordSeen(store, msg.chat, { lastFile: name });
    await reply('⛔ Sizdan fayl hali qabul qilinmaydi. Saytda “Fayllar” → “Telegram” bo‘limida ruxsat bering.');
    return;
  }
  await recordSeen(store, msg.chat, { lastFile: name, left: false });
  if (doc.file_size && doc.file_size > MAX_TG_FILE) {
    await reply('⚠ Fayl 20 MB dan katta — Telegram bot uni yuklab ololmaydi. Saytdagi “Fayllar” sahifasidan yuklang.');
    return;
  }

  let w;
  let bytes;
  try {
    bytes = await tg.download(doc.file_id);
    const wb = readWorkbook(XLSX, bytes); // faqat kerakli listlar — tez va kam xotira
    w = validateWarehouse(parseWorkbook(XLSX, wb, name));
  } catch (e) {
    await reply(`⚠ “${name}” faylini o‘qib bo‘lmadi: ${e.message}`);
    return;
  }

  try {
    const last = dataLastDate(w);
    const prev = await readJson(store, `wh/${w.code}`, null);
    const prevLast = prev ? dataLastDate(prev) : 0;

    // Fayl asl qachon tashlangan: forward qilingan bo'lsa — guruhdagi asl vaqti, aks holda xabar vaqti.
    // Har bir sklad uchun eng OXIRGI tashlangan versiya qoladi — eskirog'i yangisining ustiga yozilmaydi
    // (eski fayllarni istalgan tartibda forward qilsa ham to'g'ri ishlaydi).
    const origin = msg.forward_origin;
    const postedAt = (origin?.date || msg.forward_date || msg.date || Math.floor(Date.now() / 1000)) * 1000;
    const prevPosted = prev ? prev.postedAt || prev.updatedAt || 0 : 0;
    if (prev && postedAt < prevPosted) {
      await reply(`⏭ ${w.code} ${w.name}: saytda yangiroq versiya bor (${fmtTime(prevPosted)} da tashlangan). Bu fayl (${fmtTime(postedAt)}) o‘tkazib yuborildi.`);
      return;
    }

    const originName =
      origin?.type === 'user'
        ? [origin.sender_user?.first_name, origin.sender_user?.last_name].filter(Boolean).join(' ')
        : origin?.type === 'hidden_user'
          ? origin.sender_user_name
          : origin?.type === 'chat'
            ? origin.sender_chat?.title
            : origin?.type === 'channel'
              ? origin.chat?.title
              : '';
    const who = cleanLabel(originName || [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.chat.title || 'Telegram');
    await store.setJSON(`wh/${w.code}`, {
      ...w,
      size: doc.file_size || bytes.length,
      updatedAt: Date.now(),
      postedAt,
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
