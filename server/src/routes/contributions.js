import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db, env } from '../config.js';
import { wrap, validate, HttpError, refId } from '../lib/util.js';
import { getSettings } from '../lib/settings.js';
import * as paystack from '../lib/paystack.js';
import { finalizeContribution } from '../lib/payments.js';

const r = Router();
const createLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const verifyLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const schema = z.object({
  name: z.string().trim().max(120).optional().default(''),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(200)]).optional().default(''),
  amount: z.number().positive().max(100000)
});

r.post('/', createLimiter, validate(schema), wrap(async (req, res) => {
  const s = await getSettings();
  if (!s.contributions_enabled) throw new HttpError(403, 'Contributions are not open right now.');
  const cents = Math.round(req.body.amount * 100);
  if (cents < s.contribution_min_cents) {
    throw new HttpError(400, `The minimum contribution is ${(s.contribution_min_cents / 100).toFixed(2)} ${s.currency}.`);
  }
  const reference = refId('SYDC');
  const { error } = await db.from('contributions').insert({
    name: req.body.name || null,
    email: req.body.email || null,
    amount_cents: cents,
    currency: s.currency,
    paystack_reference: reference
  });
  if (error) throw error;

  // Paystack needs an email for every payment. Anonymous supporters use the site contact email.
  const payer = req.body.email || s.contact_email || env.adminNotifyEmail;
  if (!payer) throw new HttpError(400, 'Please enter an email address.');
  const init = await paystack.initialize({
    email: payer,
    amount: cents,
    currency: s.currency,
    reference,
    callback_url: `${env.frontendUrl}/confirmation.html?kind=contribution`,
    channels: s.payment_channels,
    metadata: { kind: 'contribution' }
  });
  res.status(201).json({ authorization_url: init.authorization_url, reference });
}));

r.get('/verify', verifyLimiter, validate(z.object({ reference: z.string().regex(/^SYDC-[a-f0-9]{32}$/) }), 'query'), wrap(async (req, res) => {
  const c = await finalizeContribution(req.query.reference);
  if (!c) throw new HttpError(404, 'We could not find that contribution.');
  res.set('Cache-Control', 'no-store').json({ status: c.status, amount_cents: c.amount_cents, currency: c.currency });
}));

export default r;
