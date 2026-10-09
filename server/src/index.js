import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { env } from './config.js';
import webhook from './routes/webhook.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import bookings from './routes/bookings.js';
import contributions from './routes/contributions.js';
import consult from './routes/consult.js';
import doctor from './routes/doctor.js';
import admin from './routes/admin.js';
import { startJobs } from './jobs.js';

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || env.allowedOrigins.includes(origin)),
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/webhooks', webhook); // must come before express.json (needs the raw body)

app.use(express.json({ limit: '50kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookings);
app.use('/api/contributions', contributions);
app.use('/api/consult', consult);
app.use('/api/doctor', doctor);
app.use('/api/admin', admin);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid request.' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err.status === 502) return res.status(502).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

app.listen(env.port, () => {
  console.log(`SeeYourDoctor API listening on ${env.port}`);
  startJobs();
});
