const crypto = require('crypto');

const CLUSTERS = [
  'AI search overrides exact matching',
  "Known text or details aren't indexed",
  'Media format bypasses indexing',
  'Backend sync or index failures'
];

const SB_URL = () => process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/submissions';
const SB_HEAD = () => ({
  apikey: process.env.SUPABASE_SECRET_KEY,
  Authorization: 'Bearer ' + process.env.SUPABASE_SECRET_KEY,
  'Content-Type': 'application/json'
});

async function sbGet(query) {
  const r = await fetch(SB_URL() + '?' + query, { headers: SB_HEAD() });
  if (!r.ok) throw new Error('db_read_failed');
  return r.json();
}

async function sbInsert(row) {
  const r = await fetch(SB_URL(), {
    method: 'POST',
    headers: { ...SB_HEAD(), Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  });
  if (!r.ok) throw new Error('db_write_failed');
}

function hashIp(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'salt')).digest('hex').slice(0, 32);
}

module.exports = { CLUSTERS, sbGet, sbInsert, hashIp };
