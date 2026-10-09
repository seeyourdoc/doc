import { db, env } from '../config.js';
import * as paystack from './paystack.js';
import { getSettings } from './settings.js';
import { sendMail } from './mailer.js';
import * as mail from './emails.js';
import { urlToken, one } from './util.js';
import { randomUUID } from 'node:crypto';

const SAFE_KEYS = ['id', 'status', 'amount', 'currency', 'channel', 'paid_at', 'reference', 'gateway_response'];
const pick = (tx) => Object.fromEntries(SAFE_KEYS.map((k) => [k, tx[k] ?? null])); // never store card details

export async function loadPayment(reference) {
  const { data, error } = await db
    .from('payments')
    .select('*, bookings(*, users(*), consultation_rooms(*))')
    .eq('paystack_reference', reference)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Safe to call many times (callback page, webhook, background job): only the first
// successful verification activates the booking.
export async function finalizeBooking(reference) {
  const pay = await loadPayment(reference);
  if (!pay) return null;
  if (pay.status === 'success' || pay.status === 'refunded') return pay;

  const tx = await paystack.verify(reference);

  if (tx.status === 'success') {
    if (tx.amount !== pay.amount_cents || String(tx.currency).toUpperCase() !== pay.currency) {
      console.error('Amount mismatch for', reference, tx.amount, tx.currency);
      await markFailed(pay, 'Amount or currency did not match the booking');
    } else {
      const { data: claimed } = await db
        .from('payments')
        .update({
          status: 'success',
          paid_at: tx.paid_at || new Date().toISOString(),
          paystack_transaction_id: String(tx.id),
          channel: tx.channel || null,
          gateway_response: pick(tx)
        })
        .eq('id', pay.id)
        .in('status', ['pending', 'failed'])
        .select('id')
        .maybeSingle();
      if (claimed) await activateBooking(pay.booking_id);
    }
  } else if (['failed', 'abandoned', 'reversed'].includes(tx.status)) {
    await markFailed(pay, tx.gateway_response || tx.status);
  }
  return loadPayment(reference);
}

export async function markFailed(pay, reason) {
  const { data: changed } = await db
    .from('payments')
    .update({ status: 'failed', gateway_response: { reason } })
    .eq('id', pay.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (!changed) return;
  await db.from('bookings').update({ payment_status: 'failed' }).eq('id', pay.booking_id);
  const { data: b } = await db.from('bookings').select('*, users(*)').eq('id', pay.booking_id).single();
  const s = await getSettings();
  const m = mail.paymentFailed(s, b);
  await sendMail({ to: b.users.email, ...m, kind: 'payment_failed', bookingId: b.id });
}

async function activateBooking(bookingId) {
  const { data: b } = await db.from('bookings').select('*, users(*)').eq('id', bookingId).single();
  await db.from('bookings').update({ payment_status: 'success', consultation_status: 'scheduled' }).eq('id', b.id);

  const s = await getSettings();
  let doctorId = s.default_doctor_id || null;
  if (!doctorId) {
    const { data: d } = await db.from('doctors').select('id').eq('active', true).order('created_at').limit(1).maybeSingle();
    doctorId = d?.id || null;
  }

  const starts = new Date(b.preferred_at);
  const expires = new Date(starts.getTime() + b.duration_minutes * 60000);
  const { data: room, error } = await db
    .from('consultation_rooms')
    .insert({
      booking_id: b.id,
      doctor_id: doctorId,
      consultation_type: b.consultation_type,
      access_token: urlToken(),
      livekit_room: `syd-${randomUUID()}`,
      starts_at: starts.toISOString(),
      expires_at: expires.toISOString()
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return; // already created by a parallel call
    throw error;
  }
  if (b.consultation_type === 'chat') await db.from('chat_rooms').insert({ room_id: room.id });

  const m = mail.bookingConfirmed(s, b, room);
  await sendMail({ to: b.users.email, ...m, kind: 'booking_confirmed', bookingId: b.id });
  const adminTo = env.adminNotifyEmail || s.contact_email;
  if (adminTo) {
    const a = mail.adminNewBooking(s, b, room);
    await sendMail({ to: adminTo, ...a, kind: 'admin_new_booking', bookingId: b.id });
  }
}

export async function finalizeContribution(reference) {
  const { data: c } = await db.from('contributions').select('*').eq('paystack_reference', reference).maybeSingle();
  if (!c) return null;
  if (c.status === 'success' || c.status === 'refunded') return c;

  const tx = await paystack.verify(reference);
  if (tx.status === 'success' && tx.amount === c.amount_cents && String(tx.currency).toUpperCase() === c.currency) {
    const { data: claimed } = await db
      .from('contributions')
      .update({ status: 'success', paid_at: tx.paid_at || new Date().toISOString(), channel: tx.channel || null })
      .eq('id', c.id)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (claimed && c.email) {
      const s = await getSettings();
      await sendMail({ to: c.email, ...mail.contributionThanks(s, c), kind: 'contribution_thanks' });
    }
  } else if (['failed', 'abandoned', 'reversed'].includes(tx.status) || tx.status === 'success') {
    await db.from('contributions').update({ status: 'failed' }).eq('id', c.id).eq('status', 'pending');
  }
  const { data } = await db.from('contributions').select('*').eq('id', c.id).single();
  return data;
}

export const roomOf = (pay) => one(pay.bookings?.consultation_rooms);
