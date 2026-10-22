import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const respond = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};
const sign = (value) => createHmac('sha256', required('ADMIN_SESSION_SECRET')).update(value).digest('hex');

function issueToken() {
  const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${expiry}.${sign(expiry)}`;
}

function authorized(event) {
  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [expiry, signature, extra] = token.split('.');
  if (!expiry || !signature || extra || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now()) return false;
  const expected = Buffer.from(sign(expiry), 'hex');
  let actual;
  try { actual = Buffer.from(signature, 'hex'); } catch { return false; }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const handler = async (event) => {
  const password = required('CHRONO_ADMIN_PASSWORD');
  if (event.httpMethod === 'POST') {
    let input;
    try { input = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'Invalid JSON' }); }
    const supplied = Buffer.from(typeof input.password === 'string' ? input.password : '');
    const expected = Buffer.from(password);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return respond(401, { error: 'Incorrect password' });
    return respond(200, { token: issueToken(), expiresIn: 28800 });
  }
  if (event.httpMethod !== 'GET') return respond(405, { error: 'Method not allowed' });
  if (!authorized(event)) return respond(401, { error: 'Sign in again to view submissions.' });
  try {
    const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.from('chrono_submissions').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    return respond(200, { submissions: data });
  } catch (error) {
    console.error('Chrono admin retrieval failed:', error.message);
    return respond(500, { error: 'Could not load submissions.' });
  }
};
