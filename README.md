# Topfin Result — sklad nazorati

Sklad Excel fayllarini (R104, R107, …) bitta saytda ko'rsatadi: qoldiq, kirim, chiqim, qaytarish va kunlik/oylik sarf.

## Ishga tushirish

Eng oson yo'l — `start.bat` faylini ikki marta bosing. Brauzerda http://localhost:4100 ochiladi.

Yoki terminalda:

```bash
npm run setup
npm start
```

## Internetdagi versiya (Netlify)

Sayt https://topfinresultsklad.netlify.app da ishlaydi. GitHub'ga yuklangan har bir o'zgarishni Netlify o'zi joylaydi.

**Har kuni ertalab:** saytdagi **Fayllar** sahifasini oching va skladlarning Excel fayllarini tashlang. Fayl shu kompyuterning brauzerida o'qiladi, serverga faqat kerakli ma'lumot yuboriladi va Netlify xotirasida (Netlify Blobs) doimiy saqlanadi. Shundan keyin saytni ochgan har kim (telefon yoki kompyuterdan) shu ma'lumotni ko'radi. O'sha sklad faylini keyinroq qayta yuklasangiz, eskisi almashtiriladi.

**Parollar:** saytni ko'rish uchun parol shart emas. Fayl yuklash, o'chirish va Telegram botni ulash uchun **admin paroli** kerak: Netlify → Site configuration → Environment variables → `ADMIN_PASSWORD` qo'shing va Deploys → Trigger deploy qiling. Parol o'rnatilmaguncha internetdagi saytdan yuklab bo'lmaydi. Kompyuterdagi versiyada `ADMIN_PASSWORD` qo'yilmasa, parolsiz ishlaydi. Ixtiyoriy `SITE_PASSWORD` qo'yilsa, saytni ko'rish uchun ham parol so'raladi.

## Telegram bot

Botga yoki bot qo'shilgan guruhga Excel fayl yuborilsa, u avtomatik saytga joylanadi va bot «✅ R104 Saribuloq saytga joylandi» deb javob yozadi.

1. Telegram'da @BotFather → `/newbot` → tokenni Netlify'ga `TELEGRAM_BOT_TOKEN` nomi bilan qo'shing.
2. Trigger deploy qiling, saytdagi **Fayllar** sahifasida **«Botni ulash»** ni bosing.
3. Botga yoki guruhga `/id` yozing va chiqqan chat ID'ni `TELEGRAM_CHATS` ga qo'shing (bir nechta bo'lsa vergul bilan), yana Trigger deploy qiling. Boshqa chatlardan fayl qabul qilinmaydi.
4. Guruhda ishlatsangiz: @BotFather → `/setprivacy` → Disable yoki botni guruhga admin qiling.

Fayl 20 MB dan oshmasligi kerak (Telegram cheklovi). Bot faqat internetdagi (Netlify) versiyada ishlaydi.

Tuzilishi: `netlify.toml` — Netlify sozlamalari, `netlify/functions/api.mjs` — internetdagi API, `shared/` — brauzer va server uchun umumiy kod (Excel o'qish, tekshirish).

## Ochilish

Sayt ochilganda "TOPFIN RESULT" ekrani chiqadi, pastdagi chiziq to'lgach (Excel fayllar o'qilgach) sayt o'zi ochiladi. Login va parol yo'q.

## Realizatsiya (almaz, polimer, dizel)

- O'rtacha oylik sarf = so'nggi 3 to'liq oyning o'rtachasi (saytda 6 oy yoki barcha oylarga almashtirsa bo'ladi).
- Joriy oy uchun prognoz = hozirgacha sarf ÷ o'tgan kunlar × oydagi kunlar.
- Fakt yoki prognoz o'rtachadan oshsa — qizil, "odatdagidan ko'p rasxod".
- Boshqa skladga jo'natilganlar (311 …, Permesheniya …) sarf hisoblanmaydi.

## Excel fayllarni yangilash

> `data/` papkasi GitHub'da bo'sh: Excel fayllar kompaniyaning ichki ma'lumoti bo'lgani uchun repozitoriyga yuklanmaydi (.gitignore). Yangi kompyuterda ularni saytdagi «Fayllar» sahifasidan yuklang yoki `data/` ga qo'ying.


- Saytdagi **Fayllar** sahifasidan yangi faylni yuklang — o'sha sklad kodidagi eski fayl almashtiriladi.
- Yoki faylni `data/` papkasiga qo'ying va saytda «Ma'lumotni yangilash» ni bosing.

Fayl nomida sklad kodi bo'lishi kerak: `R104 Saribuloq sklad 2026.xlsx` yoki `TOPFIN Karasay TETRA sklad R200 2026.xlsx`.
Faylda `Остатка`, `Списание`, `Приход` (va bo'lsa `Возврат`) listlari bo'lishi shart.

## Hisoblash qoidasi

Excel bilan bir xil, kod bo'yicha:

- Davr boshi = oldingi kirim − oldingi chiqim + oldingi qaytarish
- Davr oxiri = davr boshi + kirim − chiqim + qaytarish

Sanasi yo'q yoki miqdori son bo'lmagan qatorlar hisobga olinmaydi (Excel'da ham shunday).

## Tuzilishi

- `server/` — kompyuterdagi Node.js (Express) server (`index.js`)
- `shared/` — Excel o'qish (`parser.mjs`), sklad nomlari (`places.mjs`), yuklashni tekshirish (`validate.mjs`)
- `netlify/functions/` — internetdagi API
- `client/` — React (Vite) sayt
- `data/` — Excel fayllar

Dasturlash rejimi: bir terminalda `npm run server`, ikkinchisida `npm run client` (http://localhost:5173).
Port band bo'lsa: `set PORT=4200` qilib ishga tushiring.
