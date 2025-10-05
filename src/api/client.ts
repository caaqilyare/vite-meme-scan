export type AppState = {
  user: { name: string; balance: number };
  positions: Record<string, { qty: number; avgPrice: number; name?: string; symbol?: string }>;
  history: Array<{ id: string; ts: number; side: 'buy'|'sell'; mint: string; name?: string; symbol?: string; price: number; qty: number; value: number; marketCap?: number }>;
  activity?: { move: number; exercise: number; stand: number; meetings: number; reminders: number; nextFocusMins: number; balanceDelta: number };
  lastScannedMint?: string;
  todos?: Record<string, Array<{ id: string; text: string; done: boolean }>>;
};

const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
const defaultLocal = 'http://localhost:3001';
const sameOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const BASES = [envBase, sameOrigin, defaultLocal].filter(Boolean) as string[];

async function http<T>(path: string, opts?: RequestInit): Promise<T> {
  let lastErr: unknown;
  for (const base of BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        ...opts,
      });
      if (!res.ok) {
        let msg = `${res.status}`;
        try { const j = await res.json(); msg = j?.error || msg; } catch {}
        throw new Error(msg);
      }
      return res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('Request failed');
}

export const api = {
  getState: () => http<AppState>('/api/state'),
  buy: (body: { mint: string; price: number; qty: number; name?: string; symbol?: string; marketCap?: number }) =>
    http<AppState>('/api/buy', { method: 'POST', body: JSON.stringify(body) }),
  sell: (body: { mint: string; price: number; qty?: number; marketCap?: number }) =>
    http<AppState>('/api/sell', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (body: { name: string }) =>
    http<AppState>('/api/user', { method: 'POST', body: JSON.stringify(body) }),
  deposit: (body: { amount: number }) =>
    http<AppState>('/api/deposit', { method: 'POST', body: JSON.stringify(body) }),
  setActivity: (body: Partial<{ move: number; exercise: number; stand: number; meetings: number; reminders: number; nextFocusMins: number; balanceDelta: number }>) =>
    http<AppState>('/api/activity', { method: 'POST', body: JSON.stringify(body) }),
  setLastScanned: (mint: string) =>
    http<AppState>('/api/last-scanned', { method: 'POST', body: JSON.stringify({ mint }) }),
  reset: () => http<AppState>('/api/reset', { method: 'POST' }),
  setTodos: (body: { mint: string; items: Array<{ id: string; text: string; done: boolean }> }) =>
    http<AppState>('/api/todos', { method: 'POST', body: JSON.stringify(body) }),
};
