import { db, env } from '../config.js';

export async function sendMail({ to, subject, html, kind, bookingId = null }) {
  let status = 'sent';
  let error = null;
  try {
    if (!env.resendKey) {
      status = 'skipped';
      error = 'RESEND_API_KEY is not set';
    } else {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.mailFrom, to: [to], subject, html })
      });
      if (!r.ok) {
        status = 'failed';
        error = (await r.text()).slice(0, 500);
      }
    }
  } catch (e) {
    status = 'failed';
    error = String(e.message || e);
  }
  await db.from('notifications').insert({ booking_id: bookingId, to_email: to, kind, subject, status, error });
  return status === 'sent';
}
