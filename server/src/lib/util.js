import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const validate = (schema, where = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[where]);
  if (!r.success) {
    return res.status(400).json({
      error: 'Please check the details and try again.',
      details: r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    });
  }
  req[where] = r.data;
  next();
};

export const urlToken = () => crypto.randomBytes(32).toString('base64url');
export const refId = (prefix) => `${prefix}-${crypto.randomBytes(16).toString('hex')}`;

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function bookingCode() {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length];
  return `SYD-${s}`;
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function durationLabel(min) {
  const f = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  if (min % 10080 === 0) return f(min / 10080, 'Week', 'Weeks');
  if (min % 1440 === 0) return f(min / 1440, 'Day', 'Days');
  if (min % 60 === 0) return f(min / 60, 'Hour', 'Hours');
  return f(min, 'Minute', 'Minutes');
}

export const money = (cents, cur) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(cents / 100);

export const one = (x) => (Array.isArray(x) ? x[0] ?? null : x ?? null);
