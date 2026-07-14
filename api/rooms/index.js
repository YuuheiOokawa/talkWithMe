const db = require('../../lib/db');
const { token, json, withErrorHandling } = require('../../lib/helpers');

module.exports = withErrorHandling(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const inviteToken = token();
  const userToken = token();

  const { rows: roomRows } = await db.query(
    'INSERT INTO rooms (invite_token) VALUES ($1) RETURNING id',
    [inviteToken]
  );
  const roomId = roomRows[0].id;
  const { rows: partRows } = await db.query(
    "INSERT INTO participants (room_id, user_token, role, last_seen) VALUES ($1, $2, 'host', now()) RETURNING id",
    [roomId, userToken]
  );

  json(res, 200, {
    inviteToken,
    userToken,
    participantId: Number(partRows[0].id),
    role: 'host',
    roomUrl: `/room/${inviteToken}`,
  });
});
