import nodemailer from 'nodemailer';
import { db, env } from '../config.js';

let transport = null;
function smtp() {
  if (!env.smtp) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
  }
  return transport;
}

// Plain-text copy of the email (links kept). Having one improves deliverability.
const toText = (html) =>
  String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, u, t) => `${t.replace(/<[^>]+>/g, '').trim()}: ${u}`)
    .replace(/<br\s*\/?>|<\/p>|<\/tr>|<\/h2>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

export async function sendMail({ to, subject, html, kind, bookingId = null }) {
  let status = 'sent';
  let error = null;
  try {
    const t = smtp();
    if (t) {
      await t.sendMail({ from: env.mailFrom, to, subject, html, text: toText(html) });
    } else if (env.resendKey) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.mailFrom, to: [to], subject, html })
      });
      if (!r.ok) {
        status = 'failed';
        error = (await r.text()).slice(0, 500);
      }
    } else {
      status = 'skipped';
      error = 'No email provider is set. Add GMAIL_USER and GMAIL_APP_PASSWORD (or RESEND_API_KEY).';
    }
  } catch (e) {
    status = 'failed';
    error = String(e.message || e).slice(0, 500);
  }
  await db.from('notifications').insert({ booking_id: bookingId, to_email: to, kind, subject, status, error });
  return { ok: status === 'sent', status, error };
}
