const db = require('../../../lib/db');
const {
  json,
  authParticipant,
  messageToJson,
  validateText,
  withErrorHandling,
  ONLINE_WINDOW_MS,
} = require('../../../lib/helpers');

module.exports = withErrorHandling(async (req, res) => {
  const inviteToken = req.query.token;
  const userToken = req.method === 'GET' ? req.query.user : req.headers['x-user-token'];
  const auth = await authParticipant(inviteToken, userToken);
  if (!auth) return json(res, 401, { error: '認証エラー' });

  // ポーリング/送信自体を自分のオンライン表明として扱う
  await db.query('UPDATE participants SET last_seen = now() WHERE id = $1', [auth.participant.id]);

  if (req.method === 'GET') {
    const since = Number(req.query.since || 0) || 0;
    const { rows } = await db.query(
      'SELECT id, participant_id, type, body, image_mime, created_at FROM messages WHERE room_id = $1 AND id > $2 ORDER BY id',
      [auth.room.id, since]
    );
    const { rows: others } = await db.query(
      'SELECT last_seen FROM participants WHERE room_id = $1 AND id != $2',
      [auth.room.id, auth.participant.id]
    );
    const partnerOnline = others.some(
      (o) => o.last_seen && Date.now() - new Date(o.last_seen).getTime() < ONLINE_WINDOW_MS
    );
    return json(res, 200, {
      participantId: Number(auth.participant.id),
      messages: rows.map(messageToJson),
      partnerJoined: others.length > 0,
      partnerOnline,
    });
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body.body : undefined;
    const err = validateText(body);
    if (err) return json(res, 400, { error: err });
    const { rows } = await db.query(
      "INSERT INTO messages (room_id, participant_id, type, body) VALUES ($1, $2, 'text', $3) RETURNING id, participant_id, type, body, image_mime, created_at",
      [auth.room.id, auth.participant.id, body]
    );
    return json(res, 200, { message: messageToJson(rows[0]) });
  }

  json(res, 405, { error: 'Method Not Allowed' });
});
