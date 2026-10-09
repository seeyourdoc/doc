import { db, env } from '../config.js';
import { HttpError, durationLabel, one } from './util.js';
import { joinToken } from './livekit.js';

export const EARLY_MS = 10 * 60 * 1000; // rooms open 10 minutes before the start time

export function roomStatus(room, now = Date.now()) {
  if (room.terminated) return 'terminated';
  if (now > new Date(room.expires_at).getTime()) return 'expired';
  if (now >= new Date(room.starts_at).getTime() - EARLY_MS) return 'active';
  return 'scheduled';
}

export const toConsultStatus = (st) => ({ scheduled: 'scheduled', active: 'active', expired: 'completed', terminated: 'terminated' }[st]);

const UUID = /^[0-9a-f-]{36}$/i;
const TOKEN = /^[A-Za-z0-9_-]{40,50}$/;
const SELECT = '*, bookings(*, users(*)), doctors(full_name)';
const NOT_FOUND = 'This consultation link is not valid.';

async function load(col, val) {
  const { data, error } = await db.from('consultation_rooms').select(SELECT).eq(col, val).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, NOT_FOUND);
  return data;
}

export async function roomByToken(t) {
  if (!TOKEN.test(String(t))) throw new HttpError(404, NOT_FOUND);
  return load('access_token', t);
}

export async function roomById(id) {
  if (!UUID.test(String(id))) throw new HttpError(404, NOT_FOUND);
  return load('id', id);
}

export function assertAccessible(room) {
  const st = roomStatus(room);
  if (st === 'active') return;
  const msg = {
    scheduled: 'Your consultation has not started yet.',
    expired: 'Your consultation period has ended.',
    terminated: 'This consultation has been closed.'
  }[st];
  throw new HttpError(403, msg, st);
}

export function roomInfo(room, role) {
  const b = room.bookings;
  const st = roomStatus(room);
  const info = {
    booking_code: b.booking_code,
    package_name: b.package_name,
    duration_label: durationLabel(b.duration_minutes),
    consultation_type: room.consultation_type,
    starts_at: room.starts_at,
    expires_at: room.expires_at,
    status: st,
    doctor_name: room.doctors?.full_name || 'Your doctor',
    patient_name: b.users.full_name,
    viewer: role,
    server_time: new Date().toISOString()
  };
  if (role === 'doctor') info.notes = b.notes;
  return info;
}

export async function listMessages(room, viewerRole) {
  const chat = await getChatRoom(room.id);
  await db
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('chat_room_id', chat.id)
    .neq('sender_role', viewerRole)
    .is('read_at', null);
  const { data, error } = await db
    .from('chat_messages')
    .select('id,sender_role,body,created_at,read_at')
    .eq('chat_room_id', chat.id)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return data;
}

export async function postMessage(room, role, body) {
  const chat = await getChatRoom(room.id);
  const { data, error } = await db
    .from('chat_messages')
    .insert({ chat_room_id: chat.id, sender_role: role, body })
    .select('id,sender_role,body,created_at,read_at')
    .single();
  if (error) throw error;
  return data;
}

async function getChatRoom(roomId) {
  const { data, error } = await db.from('chat_rooms').select('id').eq('room_id', roomId).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const ins = await db.from('chat_rooms').insert({ room_id: roomId }).select('id').single();
  if (ins.error) throw ins.error;
  return ins.data;
}

export async function videoToken(room, { role, identity, name }) {
  const remaining = Math.floor((new Date(room.expires_at).getTime() - Date.now()) / 1000);
  const ttl = Math.min(Math.max(remaining, 60), 12 * 3600);
  const token = await joinToken({ room: room.livekit_room, identity, name, ttl });
  await db.from('video_sessions').insert({ room_id: room.id, participant_role: role });
  return { url: env.livekitUrl, token };
}

export { one };
