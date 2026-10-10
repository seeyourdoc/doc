import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const need = (k) => {
  if (!process.env[k]) throw new Error(`Missing environment variable: ${k}`);
  return process.env[k];
};

const frontendUrl = need('FRONTEND_URL').replace(/\/$/, '');

// Email: Gmail (GMAIL_USER + GMAIL_APP_PASSWORD) or any SMTP server (SMTP_*), else Resend, else emails are skipped.
const gmailUser = (process.env.GMAIL_USER || '').trim();
const gmailPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''); // Google shows app passwords in groups of 4
const gmailMode = !!(gmailUser && gmailPass && !process.env.SMTP_HOST);
const smtpHost = process.env.SMTP_HOST || (gmailMode ? 'smtp.gmail.com' : '');
const smtpPort = Number(process.env.SMTP_PORT || 465);

export const env = {
  port: Number(process.env.PORT || 3000),
  frontendUrl,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || frontendUrl).split(',').map((s) => s.trim().replace(/\/$/, '')),
  paystackSecret: need('PAYSTACK_SECRET_KEY'),
  livekitUrl: need('LIVEKIT_URL'),
  livekitKey: need('LIVEKIT_API_KEY'),
  livekitSecret: need('LIVEKIT_API_SECRET'),
  resendKey: process.env.RESEND_API_KEY || '',
  brevoKey: (process.env.BREVO_API_KEY || '').trim(),
  brevoSender: (process.env.BREVO_SENDER_EMAIL || gmailUser || '').trim(),
  brevoName: (process.env.BREVO_SENDER_NAME || 'SeeYourDoctor').trim(),
  smtp: smtpHost
    ? { host: smtpHost, port: smtpPort, secure: smtpPort === 465, user: process.env.SMTP_USER || gmailUser, pass: process.env.SMTP_PASS || gmailPass }
    : null,
  mailFrom: gmailMode
    ? `SeeYourDoctor <${gmailUser}>` // Gmail always sends as the signed-in account
    : process.env.MAIL_FROM || 'SeeYourDoctor <onboarding@resend.dev>',
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL || ''
};

// Service-role client: full database access, server only. Never sent to the browser.
export const db = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Anon client: used only to check staff passwords.
export const authClient = createClient(need('SUPABASE_URL'), need('SUPABASE_ANON_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }
});
