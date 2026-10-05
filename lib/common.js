const crypto = require('crypto');

const CLUSTERS = [
  'AI search overrides exact matching',
  "Known text or details aren't indexed",
  'Media format bypasses indexing',
  'Backend sync or index failures'
];

const SB_URL = () => (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') + '/rest/v1/submissions';
const SB_HEAD = () => {
  const key = (process.env.SUPABASE_SECRET_KEY || '').trim();
  const h = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy keys are JWTs (start with "eyJ") and go in Authorization too.
  // New sb_secret_ keys must go in the apikey header only.
  if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;
  return h;
};

async function sbGet(query) {
  const r = await fetch(SB_URL() + '?' + query, { headers: SB_HEAD() });
  if (!r.ok) { let m = ''; try { m = (await r.text()).slice(0, 160); } catch (e) {} throw new Error('db_read_failed ' + r.status + ' ' + m); }
  return r.json();
}

async function sbInsert(row) {
  const r = await fetch(SB_URL(), {
    method: 'POST',
    headers: { ...SB_HEAD(), Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  });
  if (!r.ok) { let m = ''; try { m = (await r.text()).slice(0, 160); } catch (e) {} throw new Error('db_write_failed ' + r.status + ' ' + m); }
}

function hashIp(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'salt')).digest('hex').slice(0, 32);
}

module.exports = { CLUSTERS, sbGet, sbInsert, hashIp };
