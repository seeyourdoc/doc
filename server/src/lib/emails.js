import { env } from '../config.js';
import { esc, durationLabel, money } from './util.js';

const utc = (iso) => new Date(iso).toUTCString().replace('GMT', 'UTC');

const layout = (s, title, body) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#12263F;line-height:1.55">
  <h2 style="color:#0A57B0;margin-bottom:8px">${esc(title)}</h2>
  ${body}
  <hr style="border:none;border-top:1px solid #DCE5EE;margin:28px 0 12px">
  <p style="font-size:12px;color:#5B6B7F">${esc(s.emergency_disclaimer)}</p>
</div>`;

const rows = (pairs) =>
  `<table style="border-collapse:collapse;width:100%;margin:12px 0">${pairs
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#5B6B7F;width:42%">${esc(k)}</td><td style="padding:6px 0"><strong>${esc(v)}</strong></td></tr>`)
    .join('')}</table>`;

const button = (href, label) =>
  `<p><a href="${esc(href)}" style="background:#0A57B0;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(label)}</a></p>`;

export const consultUrl = (token) => `${env.frontendUrl}/consult.html?t=${token}`;

export function bookingConfirmed(s, b, room) {
  const type = b.consultation_type === 'chat' ? 'Chat with doctor' : 'Live video consultation';
  return {
    subject: `Booking confirmed — ${b.booking_code}`,
    html: layout(s, 'Booking confirmed', `
      <p>Hello ${esc(b.users.full_name)}, your payment was received and your consultation is booked.</p>
      ${rows([
        ['Booking ID', b.booking_code],
        ['Package', `${b.package_name} (${durationLabel(b.duration_minutes)})`],
        ['Consultation type', type],
        ['Starts (UTC)', utc(room.starts_at)],
        ['Access ends (UTC)', utc(room.expires_at)],
        ['Amount paid', money(b.amount_cents, b.currency)],
        ['Payment status', 'Success']
      ])}
      ${button(consultUrl(room.access_token), b.consultation_type === 'chat' ? 'Start chat with doctor' : 'Join video consultation')}
      <p style="font-size:13px;color:#5B6B7F">This link is private to you. Please don't share it. Your access ends automatically when your package period is over.</p>`)
  };
}

export function reminder(s, b, room) {
  return {
    subject: `Your consultation starts soon — ${b.booking_code}`,
    html: layout(s, 'Your consultation starts soon', `
      <p>Hello ${esc(b.users.full_name)}, your consultation begins at <strong>${esc(utc(room.starts_at))}</strong>.</p>
      ${button(consultUrl(room.access_token), 'Open your consultation')}`)
  };
}

export function expired(s, b) {
  return {
    subject: `Your consultation period has ended — ${b.booking_code}`,
    html: layout(s, 'Your consultation period has ended', `
      <p>Hello ${esc(b.users.full_name)}, access for booking <strong>${esc(b.booking_code)}</strong> has ended. Thank you for using ${esc(s.site_name)}.</p>
      <p>You can book another consultation any time while bookings are open.</p>`)
  };
}

export function paymentFailed(s, b) {
  return {
    subject: `Payment not completed — ${b.booking_code}`,
    html: layout(s, 'Payment not completed', `
      <p>Hello ${esc(b.users.full_name)}, we could not confirm your payment for booking <strong>${esc(b.booking_code)}</strong>, so no consultation has been created and you have not been booked.</p>
      <p>If money left your account, contact ${esc(s.contact_email || 'us')} with your booking ID and we will help.</p>
      ${button(`${env.frontendUrl}/book.html`, 'Try again')}`)
  };
}

export function adminNewBooking(s, b, room) {
  return {
    subject: `New booking ${b.booking_code} — ${money(b.amount_cents, b.currency)}`,
    html: layout(s, 'New booking completed', rows([
      ['Booking ID', b.booking_code],
      ['Patient', b.users.full_name],
      ['Email', b.users.email],
      ['Phone', b.users.phone || '—'],
      ['Package', `${b.package_name} (${durationLabel(b.duration_minutes)})`],
      ['Type', b.consultation_type],
      ['Starts (UTC)', utc(room.starts_at)],
      ['Amount', money(b.amount_cents, b.currency)]
    ]))
  };
}

export function contributionThanks(s, c) {
  return {
    subject: 'Thank you for supporting the doctor',
    html: layout(s, 'Thank you for supporting the doctor', `
      <p>${c.name ? `Hello ${esc(c.name)}, we` : 'We'} received your contribution of <strong>${esc(money(c.amount_cents, c.currency))}</strong>. It helps keep the service available to people who need online consultations.</p>`)
  };
}
