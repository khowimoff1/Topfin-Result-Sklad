// Serverga so'rovlar. Saytga parol qo'yilgan bo'lsa (SITE_PASSWORD), u brauzerda saqlanadi
// va har so'rovga "x-site-password" sarlavhasi bilan qo'shiladi.
const KEY = 'topfin-site-password';

export class PasswordError extends Error {}

export const getPassword = () => {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
};
export const setPassword = (p) => {
  try {
    if (p) localStorage.setItem(KEY, p);
    else localStorage.removeItem(KEY);
  } catch {
    /* brauzer saqlashga ruxsat bermasa — har safar so'raladi */
  }
};

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const pw = getPassword();
  if (pw) headers['x-site-password'] = pw;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.password) throw new PasswordError(pw ? 'Parol noto‘g‘ri' : 'Parol kerak');
  }
  return res;
}
