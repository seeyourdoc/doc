import { Router } from 'express';
import { db } from '../config.js';
import { wrap, HttpError, durationLabel, one } from '../lib/util.js';
import { auth, requireStaff } from '../middleware.js';
import { roomById, roomStatus } from '../lib/rooms.js';
import { roomEndpoints } from '../lib/consultRoutes.js';

const r = Router();
r.use(auth, requireStaff);

r.get('/consultations', wrap(async (req, res) => {
  let q = db
    .from('consultation_rooms')
    .select('id,consultation_type,starts_at,expires_at,terminated,bookings(booking_code,package_name,duration_minutes,users(full_name))')
    .order('starts_at', { ascending: false })
    .limit(300);
  if (!req.user.admin) q = q.eq('doctor_id', req.user.doctor.id);
  const { data, error } = await q;
  if (error) throw error;
  res.set('Cache-Control', 'no-store').json({
    server_time: new Date().toISOString(),
    consultations: data.map((x) => {
      const b = one(x.bookings);
      return {
        id: x.id,
        booking_code: b.booking_code,
        patient_name: one(b.users).full_name,
        package_name: b.package_name,
        duration_label: durationLabel(b.duration_minutes),
        consultation_type: x.consultation_type,
        starts_at: x.starts_at,
        expires_at: x.expires_at,
        status: roomStatus(x)
      };
    })
  });
}));

// Doctors only reach rooms assigned to them. Anything else looks like "not found".
roomEndpoints(r, '/rooms/:id', async (req) => {
  const room = await roomById(req.params.id);
  if (!req.user.admin && room.doctor_id !== req.user.doctor?.id) throw new HttpError(404, 'This consultation link is not valid.');
  return {
    room,
    role: 'doctor',
    identity: `staff-${req.user.id.slice(0, 8)}`,
    name: req.user.doctor?.full_name || 'Doctor'
  };
});

export default r;
