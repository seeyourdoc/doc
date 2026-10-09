import { Router } from 'express';
import { roomByToken } from '../lib/rooms.js';
import { roomEndpoints } from '../lib/consultRoutes.js';

const r = Router();

// Patient access: the unguessable link token is the credential, and it only opens that one booking.
roomEndpoints(r, '/:token', async (req) => {
  const room = await roomByToken(req.params.token);
  return { room, role: 'patient', identity: `patient-${room.bookings.booking_code}`, name: room.bookings.users.full_name };
});

export default r;
