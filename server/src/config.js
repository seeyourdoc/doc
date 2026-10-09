import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const need = (k) => {
  if (!process.env[k]) throw new Error(`Missing environment variable: ${k}`);
  return process.env[k];
};

const frontendUrl = need('FRONTEND_URL').replace(/\/$/, '');

export const env = {
  port: Number(process.env.PORT || 3000),
  frontendUrl,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || frontendUrl).split(',').map((s) => s.trim().replace(/\/$/, '')),
  paystackSecret: need('PAYSTACK_SECRET_KEY'),
  livekitUrl: need('LIVEKIT_URL'),
  livekitKey: need('LIVEKIT_API_KEY'),
  livekitSecret: need('LIVEKIT_API_SECRET'),
  resendKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || 'SeeYourDoctor <onboarding@resend.dev>',
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
