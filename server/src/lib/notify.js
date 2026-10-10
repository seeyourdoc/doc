import { db } from '../config.js';
import { getSettings } from './settings.js';
import { sendMail } from './mailer.js';
import * as mail from './emails.js';
import { isPatientOnline } from './presence.js';

const THROTTLE_MS = 10 * 60 * 1000;

// Emails the patient when the doctor writes, but only if the patient isn't looking at the chat,
// and at most once every 10 minutes per consultation.
export async function notifyDoctorMessage(room) {
  if (isPatientOnline(room.id)) return;
  const cutoff = new Date(Date.now() - THROTTLE_MS).toISOString();
  const { data: claimed } = await db
    .from('consultation_rooms')
    .update({ last_msg_notice_at: new Date().toISOString() })
    .eq('id', room.id)
    .or(`last_msg_notice_at.is.null,last_msg_notice_at.lt.${cutoff}`)
    .select('id')
    .maybeSingle();
  if (!claimed) return;
  const s = await getSettings();
  const b = room.bookings;
  await sendMail({ to: b.users.email, ...mail.doctorMessage(s, b, room), kind: 'doctor_message', bookingId: b.id });
}
