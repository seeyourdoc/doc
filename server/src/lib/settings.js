import { db } from '../config.js';

export const DEFAULTS = {
  site_name: 'SeeYourDoctor',
  doctor_name: 'Your Doctor',
  doctor_photo_url: '',
  doctor_description: '',
  waiting_cover_url: '',
  waiting_title: '',
  waiting_details: '',
  waiting_audio_url: '',
  contact_email: '',
  emergency_disclaimer:
    'SeeYourDoctor provides online doctor consultations. This service is not intended for medical emergencies. If you are experiencing an emergency, seek immediate medical attention at the nearest emergency facility or contact your local emergency service.',
  terms_url: '',
  privacy_url: '',
  booking_open: true,
  booking_start: null,
  booking_end: null,
  countdown_enabled: false,
  countdown_target: null,
  currency: 'USD',
  payment_channels: ['card', 'apple_pay'],
  contributions_enabled: true,
  contribution_min_cents: 100,
  support_heading: 'Support the Doctor',
  support_text:
    'Your contribution helps support the doctor and keep the service available to people who need online medical consultations.',
  default_doctor_id: null
};

let cache = null;
let cachedAt = 0;

export async function getSettings(force = false) {
  if (!force && cache && Date.now() - cachedAt < 5000) return cache;
  const { data, error } = await db.from('site_settings').select('key,value');
  if (error) throw error;
  const s = { ...DEFAULTS };
  for (const row of data) s[row.key] = row.value;
  cache = s;
  cachedAt = Date.now();
  return s;
}

export async function saveSettings(patch) {
  // The value column is "jsonb not null", and the database turns a JSON null into a real NULL, which it refuses.
  // So an emptied setting (for example a cleared date) is removed instead; getSettings() then falls back to its default.
  const entries = Object.entries(patch);
  const set = entries.filter(([, v]) => v !== null && v !== undefined);
  const clear = entries.filter(([, v]) => v === null || v === undefined).map(([k]) => k);
  if (set.length) {
    const rows = set.map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    const { error } = await db.from('site_settings').upsert(rows, { onConflict: 'key' });
    if (error) throw error;
  }
  if (clear.length) {
    const { error } = await db.from('site_settings').delete().in('key', clear);
    if (error) throw error;
  }
  cache = null;
}

// Single source of truth for "can people book right now?"
export function bookingState(s, now = new Date()) {
  if (!s.booking_open) return { open: false, reason: 'paused' };
  if (s.booking_start && now < new Date(s.booking_start)) return { open: false, reason: 'not_started' };
  if (s.booking_end && now > new Date(s.booking_end)) return { open: false, reason: 'ended' };
  if (s.countdown_enabled && s.countdown_target && now > new Date(s.countdown_target)) {
    return { open: false, reason: 'countdown_ended' };
  }
  return { open: true, reason: null };
}

export function publicSettings(s) {
  return {
    site_name: s.site_name,
    doctor_name: s.doctor_name,
    doctor_photo_url: s.doctor_photo_url,
    doctor_description: s.doctor_description,
    waiting_cover_url: s.waiting_cover_url,
    waiting_title: s.waiting_title,
    waiting_details: s.waiting_details,
    waiting_audio_url: s.waiting_audio_url,
    contact_email: s.contact_email,
    emergency_disclaimer: s.emergency_disclaimer,
    terms_url: s.terms_url,
    privacy_url: s.privacy_url,
    currency: s.currency,
    contributions_enabled: s.contributions_enabled,
    contribution_min_cents: s.contribution_min_cents,
    support_heading: s.support_heading,
    support_text: s.support_text,
    booking: bookingState(s),
    booking_start: s.booking_start,
    booking_end: s.booking_end,
    countdown: { enabled: !!(s.countdown_enabled && s.countdown_target), target: s.countdown_target },
    server_time: new Date().toISOString()
  };
}
