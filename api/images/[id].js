const db = require('../../lib/db');
const { withErrorHandling, participantBySessionToken } = require('../../lib/helpers');

module.exports = withErrorHandling(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) return res.status(404).end();

  const { rows } = await db.query("SELECT * FROM messages WHERE id = $1 AND type = 'image'", [id]);
  const m = rows[0];
  if (!m) return res.status(404).end();

  const p = await participantBySessionToken(req.query.user);
  if (!p || String(p.room_id) !== String(m.room_id)) return res.status(401).end();

  res.setHeader('Content-Type', m.image_mime);
  res.setHeader('Cache-Control', 'private, max-age=31536000');
  res.status(200).end(m.image_data);
});
