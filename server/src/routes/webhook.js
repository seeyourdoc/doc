import { Router, raw } from 'express';
import { db } from '../config.js';
import { validSignature } from '../lib/paystack.js';
import { finalizeBooking, finalizeContribution } from '../lib/payments.js';

const r = Router();

// Raw body is required: the signature is computed over the exact bytes Paystack sent.
r.post('/paystack', raw({ type: '*/*', limit: '200kb' }), async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || !validSignature(body, req.headers['x-paystack-signature'])) {
    return res.status(401).send('invalid signature');
  }
  try {
    const event = JSON.parse(body.toString('utf8'));
    const ref = event?.data?.reference;
    if (event.event === 'charge.success' && ref) {
      if (ref.startsWith('SYDC-')) await finalizeContribution(ref);
      else await finalizeBooking(ref); // re-verifies with Paystack before activating
    }
    if (event.event === 'refund.processed' && event.data?.transaction_reference) {
      const tref = event.data.transaction_reference;
      const { data: p } = await db.from('payments').update({ status: 'refunded' }).eq('paystack_reference', tref).select('booking_id').maybeSingle();
      if (p) await db.from('bookings').update({ payment_status: 'refunded' }).eq('id', p.booking_id);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error', e);
    res.sendStatus(500); // Paystack will retry
  }
});

export default r;
