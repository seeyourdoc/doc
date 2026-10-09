import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db, env } from '../config.js';
import { wrap, validate, HttpError, bookingCode, refId, durationLabel, one } from '../lib/util.js';
import { getSettings, bookingState } from '../lib/settings.js';
import * as paystack from '../lib/paystack.js';
import { finalizeBooking } from '../lib/payments.js';
import { consultUrl } from '../lib/emails.js';

const r = Router();
const createLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const verifyLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const schema = z.object({
  package_id: z.string().uuid(),
  consultation_type: z.enum(['chat', 'video']),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().min(6).max(30).regex(/^[0-9+()\-\s]+$/, 'Enter a valid phone number'),
  country: z.string().trim().min(2).max(80),
  preferred_at: z.string().datetime(),
  notes: z.string().trim().max(1000).optional().default(''),
  accept_disclaimer: z.literal(true, { errorMap: () => ({ message: 'You must accept the notice to continue' }) })
});

r.post('/', createLimiter, validate(schema), wrap(async (req, res) => {
  const b = req.body;
  const s = await getSettings();
  if (!bookingState(s).open) throw new HttpError(403, 'Booking is currently closed.');

  const when = new Date(b.preferred_at).getTime();
  if (when < Date.now() - 5 * 60000) throw new HttpError(400, 'Choose a consultation time that is not in the past.');
  if (when > Date.now() + 90 * 86400000) throw new HttpError(400, 'Choose a date within the next 90 days.');

  const { data: pkg } = await db.from('consultation_packages').select('*').eq('id', b.package_id).eq('active', true).maybeSingle();
  if (!pkg) throw new HttpError(400, 'That package is no longer available.');

  const { data: user, error: ue } = await db
    .from('users')
    .upsert({ email: b.email, full_name: b.full_name, phone: b.phone, country: b.country }, { onConflict: 'email' })
    .select()
    .single();
  if (ue) throw ue;

  const { data: booking, error: be } = await db
    .from('bookings')
    .insert({
      booking_code: bookingCode(),
      user_id: user.id,
      package_id: pkg.id,
      package_name: pkg.name,
      duration_minutes: pkg.duration_minutes,
      amount_cents: pkg.price_cents,
      currency: s.currency,
      consultation_type: b.consultation_type,
      preferred_at: new Date(b.preferred_at).toISOString(),
      notes: b.notes
    })
    .select()
    .single();
  if (be) throw be;

  const reference = refId('SYD');
  const { error: pe } = await db.from('payments').insert({
    booking_id: booking.id,
    paystack_reference: reference,
    amount_cents: pkg.price_cents,
    currency: s.currency
  });
  if (pe) throw pe;

  const init = await paystack.initialize({
    email: b.email,
    amount: pkg.price_cents,
    currency: s.currency,
    reference,
    callback_url: `${env.frontendUrl}/confirmation.html?kind=booking`,
    channels: s.payment_channels,
    metadata: { kind: 'booking', booking_id: booking.id, booking_code: booking.booking_code }
  });
  res.status(201).json({ authorization_url: init.authorization_url, reference });
}));

// Called by the confirmation page. The server asks Paystack directly; the browser
// returning from checkout is never treated as proof of payment.
r.get('/verify', verifyLimiter, validate(z.object({ reference: z.string().regex(/^SYD-[a-f0-9]{32}$/) }), 'query'), wrap(async (req, res) => {
  const pay = await finalizeBooking(req.query.reference);
  if (!pay) throw new HttpError(404, 'We could not find that payment.');
  const b = pay.bookings;
  const room = one(b.consultation_rooms);
  const out = {
    status: pay.status,
    booking: {
      booking_code: b.booking_code,
      patient_name: undefined,
      package_name: b.package_name,
      duration_label: durationLabel(b.duration_minutes),
      amount_cents: pay.amount_cents,
      currency: pay.currency,
      consultation_type: b.consultation_type,
      preferred_at: b.preferred_at,
      payment_status: pay.status
    }
  };
  const { data: u } = await db.from('users').select('full_name').eq('id', b.user_id).single();
  out.booking.patient_name = u?.full_name;
  if (pay.status === 'success' && room) {
    out.booking.expires_at = room.expires_at;
    out.consult_url = consultUrl(room.access_token);
  }
  res.set('Cache-Control', 'no-store').json(out);
}));

export default r;
