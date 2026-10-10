// Failed-attempt lockout, keyed by email. Kept in memory (single server instance).
// 5 wrong codes lock that email for 30 minutes, so the short access code cannot be brute-forced.
const MAX_FAILS = 5;
const LOCK_MS = 30 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const store = new Map();

export function lockedFor(key, now = Date.now()) {
  const e = store.get(key);
  if (!e || !e.until) return 0;
  if (e.until > now) return e.until - now;
  store.delete(key);
  return 0;
}

export function recordFail(key, now = Date.now()) {
  const e = store.get(key) || { fails: 0, until: 0, last: now };
  e.fails += 1;
  e.last = now;
  if (e.fails >= MAX_FAILS) { e.until = now + LOCK_MS; e.fails = 0; }
  store.set(key, e);
  if (store.size > 5000) {
    for (const [k, v] of store) if (v.until <= now && now - v.last > STALE_MS) store.delete(k);
  }
}

export const clearFails = (key) => store.delete(key);
