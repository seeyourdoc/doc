import { roomStatus } from './rooms.js';

export const REMINDER_MS = 60 * 60 * 1000; // reminder email within an hour of the start
export const ENDING_MS = 30 * 60 * 1000; // "access ends soon" email 30 minutes before the end
const FLAGS = ['reminder_sent', 'open_notified', 'ending_notified', 'expiry_notified'];

// Decides which emails a consultation room is due, and which "already sent" flags to set.
// Pure function: no database, no clock of its own, so it can be tested.
export function planRoomNotices(room, now = Date.now()) {
  const st = roomStatus(room, now);
  const send = [];
  const set = {};
  const starts = new Date(room.starts_at).getTime();
  const expires = new Date(room.expires_at).getTime();

  if (st === 'terminated') {
    for (const k of FLAGS) if (!room[k]) set[k] = true;
  } else if (st === 'scheduled') {
    if (!room.reminder_sent && starts - now < REMINDER_MS) { send.push('reminder'); set.reminder_sent = true; }
  } else if (st === 'active') {
    const endingNow = expires - now <= ENDING_MS;
    if (!room.reminder_sent) set.reminder_sent = true; // too late for a reminder; the "open" email covers it
    if (!room.open_notified) {
      if (!endingNow) send.push('open'); // don't announce "open" for a room that is about to close
      set.open_notified = true;
    }
    if (!room.ending_notified && endingNow) { send.push('ending'); set.ending_notified = true; }
  } else if (st === 'expired') {
    if (!room.expiry_notified) send.push('expired');
    for (const k of FLAGS) if (!room[k]) set[k] = true;
  }
  return { st, send, set };
}
