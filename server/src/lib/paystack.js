import crypto from 'node:crypto';
import { env } from '../config.js';
import { HttpError, safeEqual } from './util.js';

const BASE = 'https://api.paystack.co';

async function call(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { Authorization: `Bearer ${env.paystackSecret}`, 'Content-Type': 'application/json' }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) {
    console.error('Paystack error', path, r.status, j.message);
    throw new HttpError(502, 'The payment provider could not process this request. Please try again.');
  }
  return j.data;
}

export const initialize = (body) => call('/transaction/initialize', { method: 'POST', body: JSON.stringify(body) });
export const verify = (reference) => call(`/transaction/verify/${encodeURIComponent(reference)}`);
export const refund = (reference) => call('/refund', { method: 'POST', body: JSON.stringify({ transaction: reference }) });

export function validSignature(rawBody, signature) {
  if (!signature) return false;
  const hash = crypto.createHmac('sha512', env.paystackSecret).update(rawBody).digest('hex');
  return safeEqual(hash, signature);
}
