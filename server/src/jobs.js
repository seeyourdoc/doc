import { db } from './config.js';
import { getSettings } from './lib/settings.js';
import { sendMail } from './lib/mailer.js';
import * as mail from './lib/emails.js';
import { toConsultStatus } from './lib/rooms.js';
import { planRoomNotices } from './lib/plan.js';
import { finalizeBooking, markFailed } from './lib/payments.js';

// Runs every minute: expiry emails, reminders, status sync, and recovery of missed payment callbacks.
async function tick() {
  const s = await getSettings();
  const now = new Date();

  const { data: rooms } = await db
    .from('consultation_rooms')
    .select('*, bookings(*, users(*))')
    .or('expiry_notified.eq.false,reminder_sent.eq.false,open_notified.eq.false,ending_notified.eq.false')
    .limit(200);

  for (const room of rooms || []) {
    const b = room.bookings;
    const plan = planRoomNotices(room, now.getTime());
    // Mark as sent first, so a slow or failing email can never be sent twice.
    if (Object.keys(plan.set).length) await db.from('consultation_rooms').update(plan.set).eq('id', room.id);
    for (const kind of plan.send) {
      const m = { reminder: () => mail.reminder(s, b, room), open: () => mail.consultationOpen(s, b, room), ending: () => mail.endingSoon(s, b, room), expired: () => mail.expired(s, b) }[kind]();
      await sendMail({ to: b.users.email, ...m, kind: kind === 'ending' ? 'ending_soon' : kind, bookingId: b.id });
    }
    const next = toConsultStatus(plan.st);
    if (b.consultation_status !== next && b.payment_status === 'success') {
      await db.from('bookings').update({ consultation_status: next }).eq('id', b.id);
    }
  }

  // Pending payments: re-check with Paystack in case the webhook and callback were both missed.
  const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
  const { data: pending } = await db.from('payments').select('*').eq('status', 'pending').lt('created_at', tenMinAgo).limit(50);
  for (const p of pending || []) {
    try {
      await finalizeBooking(p.paystack_reference);
    } catch (e) {
      console.error('Pending payment check failed', p.paystack_reference, e.message);
    }
    if (Date.now() - new Date(p.created_at).getTime() > 24 * 3600000) {
      await markFailed(p, 'Payment was not completed within 24 hours');
    }
  }
}

export function startJobs() {
  const run = () => tick().catch((e) => console.error('Job error', e));
  setTimeout(run, 5000);
  setInterval(run, 60 * 1000);
}
