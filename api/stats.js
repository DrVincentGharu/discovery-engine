const { CLUSTERS, sbGet } = require('../lib/common');

module.exports = async (req, res) => {
  try {
    const all = await sbGet('select=cluster&limit=100000');
    const counts = {};
    CLUSTERS.forEach(c => (counts[c] = 0));
    all.forEach(r => { if (counts[r.cluster] !== undefined) counts[r.cluster]++; });
    const recent = await sbGet('select=created_at,cluster,went_wrong&order=created_at.desc&limit=6');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ counts, recent });
  } catch (e) {
    res.status(500).json({ error: 'Could not load stats.' });
  }
};
