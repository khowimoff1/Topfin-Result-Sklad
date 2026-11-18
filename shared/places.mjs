// Sklad (obyekt) nomlari: "311 Navoiy Yambisqoq sklad", "Permesheniya Kinir sklad",
// "TOPFIN Karasay TETRA sklad R200 2026" kabi yozuvlarni "R106 Yambisqoq" ko'rinishiga keltiradi.
// Brauzer (client) va server ikkalasi shu faylni ishlatadi.
export const PLACES = [
  ['R100', 'Kinr', ['kinr', 'kinir', 'кинр', 'кинир']],
  ['R101', 'Konimex', ['konimeh', 'konimex', 'konimekh', 'конимех']],
  ['R102', 'Tashkazgan', ['tashkazgan', 'toshkazgan', 'ташказган']],
  ['R103', 'Sautbay', ['sautbay', 'sautboy', 'саутбай']],
  ['R104', 'Saribuloq', ['saribuloq', 'saribulok', 'сарибулок', 'сарибулоқ']],
  ['R105', 'Bashtavak', ['bashtavak', 'boshtovoq', 'boshtavak', 'баштавак']],
  ['R106', 'Yambisqoq', ['yambisqoq', 'yanbisqoq', 'ямбискок']],
  ['R107', 'Sarijoy', ['sarijoy', 'сарижой']],
  ['R200', 'Karasay', ['karasay', 'qorasoy', 'карасай']],
  ['R201', 'RC', ['rc']],
  ['R300', 'Tranzit', ['tranzit', 'транзит']],
  ['S100', 'Truba', ['turba', 'truba', 'труба']],
];

const ALIAS = new Map();
for (const [code, name, aliases] of PLACES) for (const a of aliases) ALIAS.set(a, { code, name });

// Sklad nomidan tashqari so'zlar (viloyat, "sklad", "311", "TOPFIN" va h.k.)
const NOISE = /^(311|navoiy|toshkent|buxoro|olmalik|olmaliq|uchquduq|sklad|skladi|skladga|skladidan|склад|permesheniya|peremeshenie|перемещение|tmc|тмц|topfin|tetra|epirok|[rs]\d{3}|\d+)$/i;
const MARKER = /(^|\s)311(\s|$)|sklad|склад|permesh|перемещ|\b[RS]\d{3}\b/i;

const tokens = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-zа-яёўқғҳ0-9']+/i).filter(Boolean);

// "311 Navoiy Kinr sklad" -> { code: 'R100', name: 'Kinr' }; sklad bo'lmasa null
export function matchPlace(text, { requireMarker = true } = {}) {
  const s = String(text || '');
  if (requireMarker && !MARKER.test(s)) return null;
  const rest = tokens(s).filter((t) => !NOISE.test(t));
  if (rest.length !== 1) return null;
  return ALIAS.get(rest[0]) || null;
}

// Fayl nomidan sklad kodi va obyekt nomi: "TOPFIN Karasay TETRA sklad R200 2026_(ac5b6b).xlsx" -> R200, Karasay
export function placeFromFileName(base) {
  const clean = base.replace(/\(.*?\)/g, ' ').replace(/[_]+/g, ' ');
  const m = clean.match(/(?:^|[^A-Za-z0-9])([RS]\d{3})(?![0-9])/i);
  const code = m ? m[1].toUpperCase() : '';
  const known = tokens(clean).map((t) => ALIAS.get(t)).find(Boolean);
  let name = known ? known.name : '';
  if (!name) {
    name = tokens(clean)
      .filter((t) => !NOISE.test(t))
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
      .join(' ');
  }
  return { code, name };
}

