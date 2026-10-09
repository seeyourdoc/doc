import { Router } from 'express';
import { db } from '../config.js';
import { wrap } from '../lib/util.js';
import { getSettings, publicSettings } from '../lib/settings.js';

const r = Router();

r.get('/settings', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store').json(publicSettings(await getSettings()));
}));

r.get('/packages', wrap(async (req, res) => {
  const { data, error } = await db
    .from('consultation_packages')
    .select('id,name,duration_minutes,price_cents,description')
    .eq('active', true)
    .order('sort_order')
    .order('price_cents');
  if (error) throw error;
  res.set('Cache-Control', 'no-store').json({ packages: data });
}));

export default r;
