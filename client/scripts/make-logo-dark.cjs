// To'q fon uchun logo nusxasini yasaydi: public/logo-light.svg -> public/logo-dark.svg
//  - katta kulrang to'lqinlar to'q fonda xira ko'rinadi (yorqin emas)
//  - O'zbekiston xaritasi (yashil to'lqindagi teshik) ostiga oq tag qo'yiladi — xarita oq ko'rinadi
// Ishga tushirish: node scripts/make-logo-dark.cjs
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
let s = fs.readFileSync(path.join(pub, 'logo-light.svg'), 'utf8');

const tag = (id) => {
  const m = s.match(new RegExp(`<path id="${id}"[^>]*/>`));
  if (!m) throw new Error(`${id} topilmadi — logo fayli o‘zgargan`);
  return m[0];
};
const setFill = (id, color) => {
  const t = tag(id);
  s = s.replace(t, t.replace(/fill="var\(--fill-0, [^)]*\)"/, `fill="var(--fill-0, ${color})"`));
};

// Katta kulrang to'lqinlar (chap va o'ng) — to'q fonga mos xira rang
for (const id of ['Vector_2', 'Vector_3', 'Vector_18', 'Vector_19']) setFill(id, '#334159');
for (const id of ['Vector_4', 'Vector_20']) setFill(id, '#3F5070');

// Yuqori yashil to'lqin: Vector_30 ning 1-qismi — tashqi chegara, oxirgisi — xarita (evenodd teshik).
// Tashqi chegarani oq rangda Vector_30 dan oldin chizamiz: teshik joyida oq xarita ko'rinadi.
const v30 = tag('Vector_30');
const d = v30.match(/ d="([^"]*)"/)[1];
const outer = d.split(/(?=M)/)[0];
s = s.replace(v30, `<path id="map_backing" d="${outer}" fill="#FFFFFF"/>\n${v30}`);

fs.writeFileSync(path.join(pub, 'logo-dark.svg'), s);
console.log('logo-dark.svg yozildi');
