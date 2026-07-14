const db = require('../../../lib/db');
const { token: genToken, json, authParticipant, withErrorHandling } = require('../../../lib/helpers');

module.exports = withErrorHandling(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const inviteToken = req.query.token;
  const { rows: roomRows } = await db.query('SELECT * FROM rooms WHERE invite_token = $1', [inviteToken]);
  const room = roomRows[0];
  if (!room) return json(res, 404, { error: 'ルームが見つかりません' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const existingToken = body.userToken;
  if (existingToken) {
    const auth = await authParticipant(inviteToken, existingToken);
    if (auth) {
      await db.query('UPDATE participants SET last_seen = now() WHERE id = $1', [auth.participant.id]);
      return json(res, 200, {
        userToken: existingToken,
        participantId: Number(auth.participant.id),
        role: auth.participant.role,
        rejoined: true,
      });
    }
  }

  const { rows: members } = await db.query(
    'SELECT id FROM participants WHERE room_id = $1 ORDER BY id',
    [room.id]
  );
  if (members.length >= 2) {
    return json(res, 403, { error: 'このルームは満員です（2人まで）' });
  }
  const userToken = genToken();
  const role = members.length === 0 ? 'host' : 'guest';
  const { rows: inserted } = await db.query(
    "INSERT INTO participants (room_id, user_token, role, last_seen) VALUES ($1, $2, $3, now()) RETURNING id",
    [room.id, userToken, role]
  );
  json(res, 200, { userToken, participantId: Number(inserted[0].id), role, rejoined: false });
});
