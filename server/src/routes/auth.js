import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authClient } from '../config.js';
import { wrap, validate, HttpError } from '../lib/util.js';
import { roleFor } from '../middleware.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const session = (s, role) => ({
  access_token: s.access_token,
  refresh_token: s.refresh_token,
  expires_at: s.expires_at,
  role
});

r.post('/login', limiter, validate(z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })), wrap(async (req, res) => {
  const { data, error } = await authClient.auth.signInWithPassword(req.body);
  if (error || !data.session) throw new HttpError(401, 'Incorrect email or password.');
  const { role } = await roleFor(data.user.id);
  if (!role) throw new HttpError(403, 'This account does not have staff access.');
  res.json(session(data.session, role));
}));

r.post('/refresh', limiter, validate(z.object({ refresh_token: z.string().min(10).max(500) })), wrap(async (req, res) => {
  const { data, error } = await authClient.auth.refreshSession({ refresh_token: req.body.refresh_token });
  if (error || !data.session) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  const { role } = await roleFor(data.user.id);
  if (!role) throw new HttpError(403, 'This account does not have staff access.');
  res.json(session(data.session, role));
}));

export default r;
