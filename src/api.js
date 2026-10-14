const BASE = import.meta.env.VITE_API_URL || '/api';
export const CURRENCY = import.meta.env.VITE_CURRENCY || 'KSh';
export const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Supermarket';
export const STORE_ADDRESS = import.meta.env.VITE_STORE_ADDRESS || '';
export const STORE_PHONE = import.meta.env.VITE_STORE_PHONE || '';
export const STORE_TAX_ID = import.meta.env.VITE_STORE_TAX_ID || '';

export const money = (n) =>
  `${CURRENCY} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const qtyFmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(3).replace(/0+$/, ''));

export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('pos_token');
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check that the API is running.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
      window.dispatchEvent(new Event('pos-signout'));
    }
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export async function download(path, filename) {
  const token = localStorage.getItem('pos_token');
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Download failed (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
