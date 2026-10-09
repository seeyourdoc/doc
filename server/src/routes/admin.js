import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config.js';
import { wrap, validate, HttpError, durationLabel, one } from '../lib/util.js';
import { auth, requireAdmin } from '../middleware.js';
import { getSettings, saveSettings } from '../lib/settings.js';
import { roomStatus, toConsultStatus, EARLY_MS } from '../lib/rooms.js';
import * as paystack from '../lib/paystack.js';

const r = Router();
r.use(auth, requireAdmin);
const noStore = (res) => res.set('Cache-Control', 'no-store');
const uuid = z.string().uuid();
const idParam = (req) => uuid.parse(req.params.id);

// ---------- Overview ----------
r.get('/stats', wrap(async (req, res) => {
  const s = await getSettings();
  const now = new Date().toISOString();
  const head = { count: 'exact', head: true };
  const count = async (q) => {
    const { count: c, error } = await q;
    if (error) throw error;
    return c || 0;
  };
  const [total, paid, pending, active, completed] = await Promise.all([
    count(db.from('bookings').select('id', head)),
    count(db.from('bookings').select('id', head).eq('payment_status', 'success')),
    count(db.from('payments').select('id', head).eq('status', 'pending')),
    count(db.from('consultation_rooms').select('id', head).eq('terminated', false)
      .lte('starts_at', new Date(Date.now() + EARLY_MS).toISOString()).gt('expires_at', now)),
    count(db.from('consultation_rooms').select('id', head).or(`terminated.eq.true,expires_at.lte.${now}`))
  ]);
  const sum = async (table) => {
    const { data } = await db.from(table).select('amount_cents').eq('status', 'success');
    return (data || []).reduce((a, x) => a + x.amount_cents, 0);
  };
  noStore(res).json({
    total_bookings: total,
    paid_bookings: paid,
    pending_payments: pending,
    active_consultations: active,
    completed_consultations: completed,
    total_revenue_cents: await sum('payments'),
    total_contributions_cents: await sum('contributions'),
    currency: s.currency
  });
}));

// ---------- Bookings ----------
const consultStatus = (room) => (room ? toConsultStatus(roomStatus(room)) : 'pending');

r.get('/bookings', wrap(async (req, res) => {
  const { data, error } = await db
    .from('bookings')
    .select('*, users(full_name,email,phone,country), consultation_rooms(id,starts_at,expires_at,terminated,doctor_id), payments(status,paystack_reference,paid_at)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  noStore(res).json({
    bookings: data.map((b) => {
      const room = one(b.consultation_rooms);
      return {
        id: b.id, booking_code: b.booking_code, patient_name: b.users.full_name, email: b.users.email, phone: b.users.phone,
        package_name: b.package_name, duration_label: durationLabel(b.duration_minutes), amount_cents: b.amount_cents,
        currency: b.currency, consultation_type: b.consultation_type, preferred_at: b.preferred_at,
        payment_status: b.payment_status, consultation_status: consultStatus(room), created_at: b.created_at,
        room_id: room?.id || null
      };
    })
  });
}));

r.get('/bookings/:id', wrap(async (req, res) => {
  const { data: b, error } = await db
    .from('bookings')
    .select('*, users(*), consultation_rooms(*, doctors(full_name)), payments(*)')
    .eq('id', idParam(req))
    .maybeSingle();
  if (error) throw error;
  if (!b) throw new HttpError(404, 'Booking not found.');
  const room = one(b.consultation_rooms);
  noStore(res).json({
    booking: { ...b, duration_label: durationLabel(b.duration_minutes), consultation_rooms: undefined },
    room: room && {
      id: room.id, starts_at: room.starts_at, expires_at: room.expires_at, terminated: room.terminated,
      doctor_id: room.doctor_id, doctor_name: room.doctors?.full_name || null, status: toConsultStatus(roomStatus(room)),
      access_token: room.access_token
    }
  });
}));

// ---------- Consultation access control ----------
r.post('/rooms/:id/extend', validate(z.object({ minutes: z.number().int().min(1).max(60 * 24 * 90) })), wrap(async (req, res) => {
  const id = idParam(req);
  const { data: room } = await db.from('consultation_rooms').select('expires_at').eq('id', id).maybeSingle();
  if (!room) throw new HttpError(404, 'Consultation not found.');
  const base = Math.max(new Date(room.expires_at).getTime(), Date.now());
  const { error } = await db.from('consultation_rooms')
    .update({ expires_at: new Date(base + req.body.minutes * 60000).toISOString(), expiry_notified: false })
    .eq('id', id);
  if (error) throw error;
  res.json({ ok: true });
}));

r.post('/rooms/:id/terminate', validate(z.object({ terminated: z.boolean() })), wrap(async (req, res) => {
  const { error } = await db.from('consultation_rooms').update({ terminated: req.body.terminated }).eq('id', idParam(req));
  if (error) throw error;
  res.json({ ok: true });
}));

r.post('/rooms/:id/doctor', validate(z.object({ doctor_id: uuid.nullable() })), wrap(async (req, res) => {
  const { error } = await db.from('consultation_rooms').update({ doctor_id: req.body.doctor_id }).eq('id', idParam(req));
  if (error) throw error;
  res.json({ ok: true });
}));

// ---------- Packages ----------
const pkgSchema = z.object({
  name: z.string().trim().min(1).max(80),
  duration_minutes: z.number().int().min(1).max(60 * 24 * 365),
  price_cents: z.number().int().min(1).max(100000000),
  description: z.string().trim().max(500).default(''),
  active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(1000).default(0)
});

r.get('/packages', wrap(async (req, res) => {
  const { data, error } = await db.from('consultation_packages').select('*').order('sort_order').order('price_cents');
  if (error) throw error;
  noStore(res).json({ packages: data });
}));
r.post('/packages', validate(pkgSchema), wrap(async (req, res) => {
  const { data, error } = await db.from('consultation_packages').insert(req.body).select().single();
  if (error) throw error;
  res.status(201).json({ package: data });
}));
r.patch('/packages/:id', validate(pkgSchema.partial()), wrap(async (req, res) => {
  const { data, error } = await db.from('consultation_packages').update(req.body).eq('id', idParam(req)).select().single();
  if (error) throw error;
  res.json({ package: data });
}));
r.delete('/packages/:id', wrap(async (req, res) => {
  const { error } = await db.from('consultation_packages').delete().eq('id', idParam(req)); // bookings keep their own snapshot
  if (error) throw error;
  res.json({ ok: true });
}));

// ---------- Payments ----------
r.get('/payments', wrap(async (req, res) => {
  const { data, error } = await db
    .from('payments')
    .select('*, bookings(booking_code, users(full_name,email))')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  noStore(res).json({
    payments: data.map((p) => ({
      id: p.id, booking_id: p.booking_id, booking_code: p.bookings.booking_code, customer: one(p.bookings.users).full_name,
      email: one(p.bookings.users).email, amount_cents: p.amount_cents, currency: p.currency, channel: p.channel,
      status: p.status, reference: p.paystack_reference, transaction_id: p.paystack_transaction_id,
      paid_at: p.paid_at, created_at: p.created_at
    }))
  });
}));

r.post('/payments/:id/refund', wrap(async (req, res) => {
  const { data: p } = await db.from('payments').select('*').eq('id', idParam(req)).maybeSingle();
  if (!p) throw new HttpError(404, 'Payment not found.');
  if (p.status !== 'success') throw new HttpError(400, 'Only successful payments can be refunded.');
  await paystack.refund(p.paystack_reference);
  await db.from('payments').update({ status: 'refunded' }).eq('id', p.id);
  await db.from('bookings').update({ payment_status: 'refunded' }).eq('id', p.booking_id);
  await db.from('consultation_rooms').update({ terminated: true }).eq('booking_id', p.booking_id);
  res.json({ ok: true });
}));

// ---------- Contributions ----------
r.get('/contributions', wrap(async (req, res) => {
  const { data, error } = await db.from('contributions').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  const total = data.filter((c) => c.status === 'success').reduce((a, c) => a + c.amount_cents, 0);
  noStore(res).json({ contributions: data, total_cents: total, currency: (await getSettings()).currency });
}));

// ---------- Doctors ----------
r.get('/doctors', wrap(async (req, res) => {
  const { data, error } = await db.from('doctors').select('id,full_name,email,active,created_at').order('created_at');
  if (error) throw error;
  noStore(res).json({ doctors: data });
}));

r.post('/doctors', validate(z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(200)
})), wrap(async (req, res) => {
  const { data: u, error: ue } = await db.auth.admin.createUser({ email: req.body.email, password: req.body.password, email_confirm: true });
  if (ue) throw new HttpError(400, ue.message);
  const { data, error } = await db.from('doctors').insert({ auth_user_id: u.user.id, full_name: req.body.full_name, email: req.body.email }).select('id,full_name,email,active').single();
  if (error) {
    await db.auth.admin.deleteUser(u.user.id);
    throw error;
  }
  res.status(201).json({ doctor: data });
}));

r.patch('/doctors/:id', validate(z.object({ active: z.boolean() })), wrap(async (req, res) => {
  const { error } = await db.from('doctors').update({ active: req.body.active }).eq('id', idParam(req));
  if (error) throw error;
  res.json({ ok: true });
}));

// ---------- Website settings ----------
const httpUrl = z.string().trim().max(500).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Must start with http:// or https://');
const dt = z.string().datetime().nullable();
const settingsSchema = z.object({
  site_name: z.string().trim().min(1).max(80),
  doctor_name: z.string().trim().min(1).max(120),
  doctor_photo_url: httpUrl,
  doctor_description: z.string().trim().max(1000),
  contact_email: z.union([z.literal(''), z.string().trim().email().max(200)]),
  emergency_disclaimer: z.string().trim().min(1).max(800),
  terms_url: httpUrl,
  privacy_url: httpUrl,
  booking_open: z.boolean(),
  booking_start: dt,
  booking_end: dt,
  countdown_enabled: z.boolean(),
  countdown_target: dt,
  currency: z.enum(['USD', 'KES']),
  payment_channels: z.array(z.enum(['card', 'apple_pay', 'mobile_money', 'bank_transfer'])).min(1),
  contributions_enabled: z.boolean(),
  contribution_min_cents: z.number().int().min(100).max(100000000),
  support_heading: z.string().trim().min(1).max(120),
  support_text: z.string().trim().max(600),
  default_doctor_id: uuid.nullable()
}).partial().strict();

r.get('/settings', wrap(async (req, res) => {
  noStore(res).json({ settings: await getSettings(true) });
}));
r.put('/settings', validate(settingsSchema), wrap(async (req, res) => {
  await saveSettings(req.body);
  res.json({ settings: await getSettings(true) });
}));

export default r;
