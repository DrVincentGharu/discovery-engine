const { CLUSTERS, sbGet, sbInsert, hashIp } = require('../lib/common');

const PER_IP_PER_HOUR = 5;
const GLOBAL_PER_DAY = 300;

function clean(v) {
  const s = String(v == null ? '' : v).trim();
  return s ? s.slice(0, 600) : 'not stated';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  try {
    const text = String((req.body && req.body.text) || '').trim();
    if (text.length < 20) return res.status(400).json({ error: 'Please paste a longer conversation (at least 20 characters).' });
    if (text.length > 6000) return res.status(400).json({ error: 'Too long. Please keep it under 6000 characters.' });

    const ipHash = hashIp(req);
    const hourAgo = new Date(Date.now() - 3600e3).toISOString();
    const dayAgo = new Date(Date.now() - 86400e3).toISOString();
    const mine = await sbGet(`select=id&ip_hash=eq.${ipHash}&created_at=gte.${hourAgo}&limit=${PER_IP_PER_HOUR}`);
    if (mine.length >= PER_IP_PER_HOUR) return res.status(429).json({ error: 'Limit reached: 5 analyses per hour. Please try later.' });
    const today = await sbGet(`select=id&created_at=gte.${dayAgo}&limit=${GLOBAL_PER_DAY}`);
    if (today.length >= GLOBAL_PER_DAY) return res.status(429).json({ error: 'Daily limit reached. Please come back tomorrow.' });

    const prompt =
`You analyze public posts from people struggling to find a photo in Google Photos.
Extract ONLY what the text states. Never invent anything. Use "not stated" for anything not mentioned.
Then classify the post into exactly ONE of these clusters, copied word for word:
${CLUSTERS.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Return ONLY a JSON object with these keys:
"remembered" (what they remembered about the photo),
"tried" (what they searched or tried),
"wentWrong" (what went wrong),
"workaround" (their workaround, if any),
"cluster" (one of the four cluster names above).

POST TEXT:
"""
${text}
"""`;

    const models = [process.env.GEMINI_MODEL, 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest']
      .filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);
    let g = null, lastStatus = 0, lastMsg = '';
    for (const model of models) {
      g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': (process.env.GEMINI_API_KEY || '').trim() },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 }
        })
      });
      if (g.ok) break;
      lastStatus = g.status;
      try { const ej = await g.json(); lastMsg = String((ej.error && ej.error.message) || '').slice(0, 200); } catch (e) {}
      console.log('Gemini failed', model, lastStatus, lastMsg);
      if ([404, 400, 500, 503].indexOf(g.status) < 0) break;
    }
    if (!g.ok && lastStatus === 429) return res.status(429).json({ error: 'The AI is busy right now. Please try again in a minute.' });
    if (!g.ok) return res.status(502).json({ error: `The AI call failed (Google error ${lastStatus}: ${lastMsg || 'no details'}).` });
    const gj = await g.json();
    const parts = (((gj.candidates || [])[0] || {}).content || {}).parts || [];
    const txt = parts.map(p => p.text || '').join('').replace(/```json|```/g, '').trim();
    let out = {};
    try { out = JSON.parse(txt); } catch (e) { return res.status(502).json({ error: 'The AI returned an unreadable answer. Please try again.' }); }

    let cluster = CLUSTERS.find(c => c === out.cluster);
    if (!cluster) cluster = CLUSTERS.find(c => String(out.cluster || '').toLowerCase().includes(c.toLowerCase().slice(0, 18)));
    if (!cluster) return res.status(502).json({ error: 'Could not classify that post. Please try again.' });

    const result = {
      remembered: clean(out.remembered), tried: clean(out.tried),
      wentWrong: clean(out.wentWrong), workaround: clean(out.workaround), cluster
    };
    await sbInsert({
      cluster, remembered: result.remembered, tried: result.tried,
      went_wrong: result.wentWrong, workaround: result.workaround, ip_hash: ipHash
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
