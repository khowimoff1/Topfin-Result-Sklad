// Telegram bot: unga yuborilgan Excel fayl avtomatik saytga joylanadi.
// Sozlash (Netlify → Environment variables):
//   TELEGRAM_BOT_TOKEN — @BotFather bergan token
//   TELEGRAM_CHATS     — fayl qabul qilinadigan chat ID'lar, vergul bilan (botga /id yozsa ko'rsatadi)
// Keyin saytdagi "Fayllar" sahifasida "Botni ulash" tugmasi bosiladi (webhook o'rnatiladi).
import { createHash } from 'node:crypto';
import { cleanLabel, dataLastDate, validateWarehouse } from '../../shared/validate.mjs';

const MAX_TG_FILE = 20 * 1024 * 1024; // Telegram botlar 20 MB gacha yuklab oladi

// Webhook maxfiy kaliti tokendan hosil qilinadi (faqat A-Z a-z 0-9 _ - ruxsat)
export const webhookSecret = (token) => createHash('sha256').update(`topfin-result:${token}`).digest('hex').slice(0, 48);

export const parseChats = (s) =>
  String(s || '')
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter((x) => /^-?\d+$/.test(x));

const fmt = (d) => (d ? `${String(d % 100).padStart(2, '0')}.${String(Math.floor(d / 100) % 100).padStart(2, '0')}.${Math.floor(d / 10000)}` : '—');
const n = (x) => new Intl.NumberFormat('ru-RU').format(x);

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
export async function handleUpdate(update, { token, chats, fetchImpl, store, XLSX, parseWorkbook }) {
  const msg = update && (update.message || update.channel_post);
  if (!msg || !msg.chat) return;
  const tg = telegramApi(token, fetchImpl);
  const chatId = String(msg.chat.id);
  const fromId = msg.from ? String(msg.from.id) : '';
  const allowed = chats.includes(chatId) || (fromId && chats.includes(fromId));
  const reply = (text) => tg.call('sendMessage', { chat_id: msg.chat.id, text, reply_to_message_id: msg.message_id, allow_sending_without_reply: true }).catch(() => {});

  const doc = msg.document;
  const text = String(msg.text || msg.caption || '').trim();

  if (!doc) {
    if (/^\/(start|id|help|yordam)(@\w+)?\b/i.test(text)) {
      await reply(
        [
          'Topfin Result — sklad boti.',
          'Sklad Excel faylini (.xlsx) shu yerga yuboring — u avtomatik saytga joylanadi.',
          '',
          `Bu chat ID: ${chatId}${fromId && fromId !== chatId ? `\nSizning ID: ${fromId}` : ''}`,
          allowed ? '✅ Bu chatdan fayl qabul qilinadi.' : '⛔ Bu chat hali ruxsat etilmagan. Yuqoridagi ID ni Netlify’da TELEGRAM_CHATS ga qo‘shing.',
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
    await reply(`⛔ Bu chatdan fayl qabul qilinmaydi.\nChat ID: ${chatId}\nUni Netlify’da TELEGRAM_CHATS ga qo‘shing.`);
    return;
  }
  if (doc.file_size && doc.file_size > MAX_TG_FILE) {
    await reply('⚠ Fayl 20 MB dan katta — Telegram bot uni yuklab ololmaydi. Saytdagi “Fayllar” sahifasidan yuklang.');
    return;
  }

  try {
    const bytes = await tg.download(doc.file_id);
    const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
    const w = validateWarehouse(parseWorkbook(XLSX, wb, name));
    const last = dataLastDate(w);

    const prevText = await store.get(`wh/${w.code}`, { consistency: 'strong' });
    let prevLast = 0;
    if (prevText) {
      try {
        prevLast = dataLastDate(JSON.parse(prevText));
      } catch {
        prevLast = 0;
      }
    }

    const who = cleanLabel([msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.chat.title || 'Telegram');
    await store.setJSON(`wh/${w.code}`, {
      ...w,
      size: doc.file_size || bytes.length,
      updatedAt: Date.now(),
      source: 'telegram',
      uploader: who,
    });

    const lines = [
      `✅ ${w.code} ${w.name} saytga joylandi.`,
      `Chiqim: ${n(w.out.length)} · Kirim: ${n(w.in.length)} · Qaytarish: ${n(w.ret.length)}`,
      `Oxirgi sana: ${fmt(last)}`,
    ];
    if (prevLast && last < prevLast) lines.push(`⚠ Diqqat: saytdagi avvalgi faylda oxirgi sana ${fmt(prevLast)} edi — bu fayl eskiroq.`);
    if (w.warnings.length) lines.push(`ℹ ${w.warnings.join('; ')}`);
    await reply(lines.join('\n'));
  } catch (e) {
    await reply(`⚠ “${name}” faylini o‘qib bo‘lmadi: ${e.message}`);
  }
}
