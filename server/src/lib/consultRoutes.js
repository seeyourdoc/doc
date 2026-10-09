import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { wrap, validate, HttpError } from './util.js';
import { assertAccessible, roomInfo, listMessages, postMessage, videoToken } from './rooms.js';

const msgSchema = z.object({ body: z.string().trim().min(1).max(4000) });
const msgLimiter = rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
const pollLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: true, legacyHeaders: false });

// Shared chat/video endpoints for patients (secret link) and staff (login).
// resolve(req) must return { room, role, identity, name } or throw.
export function roomEndpoints(router, prefix, resolve) {
  router.get(prefix, pollLimiter, wrap(async (req, res) => {
    const { room, role } = await resolve(req);
    res.set('Cache-Control', 'no-store').json(roomInfo(room, role));
  }));

  router.get(`${prefix}/messages`, pollLimiter, wrap(async (req, res) => {
    const { room, role } = await resolve(req);
    assertAccessible(room);
    if (room.consultation_type !== 'chat') throw new HttpError(400, 'This consultation uses video.');
    res.set('Cache-Control', 'no-store').json({ messages: await listMessages(room, role) });
  }));

  router.post(`${prefix}/messages`, msgLimiter, validate(msgSchema), wrap(async (req, res) => {
    const { room, role } = await resolve(req);
    assertAccessible(room);
    if (room.consultation_type !== 'chat') throw new HttpError(400, 'This consultation uses video.');
    res.status(201).json({ message: await postMessage(room, role, req.body.body) });
  }));

  router.post(`${prefix}/video-token`, msgLimiter, wrap(async (req, res) => {
    const ctx = await resolve(req);
    assertAccessible(ctx.room);
    if (ctx.room.consultation_type !== 'video') throw new HttpError(400, 'This consultation uses chat.');
    res.set('Cache-Control', 'no-store').json(await videoToken(ctx.room, ctx));
  }));
}
