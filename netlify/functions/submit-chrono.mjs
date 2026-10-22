import { createClient } from '@supabase/supabase-js';

const supabase = () => createClient(
  required('SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function response(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'Invalid JSON' }); }

  const subject_a_name = typeof input.subject_a_name === 'string' ? input.subject_a_name.trim().slice(0, 100) : '';
  const subject_b_name = typeof input.subject_b_name === 'string' ? input.subject_b_name.trim().slice(0, 100) : '';
  const subject_a_birthday = input.subject_a_birthday;
  const subject_b_birthday = input.subject_b_birthday;
  if (!subject_a_name || !subject_b_name || !validDate(subject_a_birthday) || !validDate(subject_b_birthday)) {
    return response(400, { error: 'Enter both names and valid birthdays.' });
  }

  const days_difference = Math.abs(Date.parse(`${subject_a_birthday}T00:00:00Z`) - Date.parse(`${subject_b_birthday}T00:00:00Z`)) / 86400000;
  try {
    const { data, error } = await supabase().from('chrono_submissions').insert({
      subject_a_name, subject_a_birthday, subject_b_name, subject_b_birthday, days_difference,
    }).select('id, days_difference, created_at').single();
    if (error) throw error;
    return response(201, { submission: data });
  } catch (error) {
    console.error('Chrono submission failed:', error.message);
    return response(500, { error: 'Could not save this result. Please try again.' });
  }
};
