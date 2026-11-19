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
    const body = await res.clone().json().catch(() => ({}));
    if (body.password) throw new PasswordError(pw ? 'Parol noto‘g‘ri' : 'Parol kerak');
  }
  return res;
}

// --- Admin paroli (yuklash va o'chirish uchun). Faqat shu brauzer oynasi ochiq turguncha eslab qolinadi.
const ADMIN_KEY = 'topfin-admin-password';
export class AdminError extends Error {}
export const getAdmin = () => {
  try {
    return sessionStorage.getItem(ADMIN_KEY) || '';
  } catch {
    return '';
  }
};
export const setAdmin = (p) => {
  try {
    if (p) sessionStorage.setItem(ADMIN_KEY, p);
    else sessionStorage.removeItem(ADMIN_KEY);
  } catch {
    /* saqlab bo'lmasa — har safar so'raladi */
  }
};

// Admin so'rovi: parol sarlavhasi qo'shiladi; noto'g'ri bo'lsa AdminError
export async function adminApi(path, options = {}, pw = getAdmin()) {
  const res = await api(path, { ...options, headers: { ...(options.headers || {}), 'x-admin-password': pw } });
  if (res.status === 401 || res.status === 403) {
    const body = await res.clone().json().catch(() => ({}));
    if (body.admin) {
      setAdmin('');
      throw new AdminError(body.error || 'Admin paroli noto‘g‘ri');
    }
    if (body.adminMissing) throw new Error(body.error);
  }
  return res;
}
