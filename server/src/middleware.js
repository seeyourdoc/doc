import { db } from './config.js';
import { HttpError, wrap } from './lib/util.js';

export async function roleFor(authUserId) {
  const [{ data: admin }, { data: doctor }] = await Promise.all([
    db.from('admins').select('id,email').eq('auth_user_id', authUserId).maybeSingle(),
    db.from('doctors').select('id,full_name,email').eq('auth_user_id', authUserId).eq('active', true).maybeSingle()
  ]);
  return { admin, doctor, role: admin ? 'admin' : doctor ? 'doctor' : null };
}

// Verifies the Supabase access token, then loads the staff role from our own tables.
export const auth = wrap(async (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'Please sign in.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  const r = await roleFor(data.user.id);
  req.user = { id: data.user.id, email: data.user.email, ...r };
  next();
});

export const requireAdmin = (req, res, next) =>
  req.user?.admin ? next() : next(new HttpError(403, 'Administrator access required.'));

export const requireStaff = (req, res, next) =>
  req.user?.admin || req.user?.doctor ? next() : next(new HttpError(403, 'Staff access required.'));
