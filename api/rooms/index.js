const db = require('../../lib/db');
const { token, json, normalizeName, withErrorHandling } = require('../../lib/helpers');

module.exports = withErrorHandling(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = normalizeName(body.name);
  if (!name) return json(res, 400, { error: 'お名前を入力してください' });

  const inviteToken = token();
  const { rows: roomRows } = await db.query(
    'INSERT INTO rooms (invite_token) VALUES ($1) RETURNING id',
    [inviteToken]
  );
  const roomId = roomRows[0].id;
  const { rows: partRows } = await db.query(
    "INSERT INTO participants (room_id, role, display_name, last_seen) VALUES ($1, 'host', $2, now()) RETURNING id",
    [roomId, name]
  );
  const participantId = partRows[0].id;
  const sessionToken = token();
  await db.query('INSERT INTO sessions (participant_id, token) VALUES ($1, $2)', [participantId, sessionToken]);

  json(res, 200, {
    inviteToken,
    userToken: sessionToken,
    participantId: Number(participantId),
    role: 'host',
    displayName: name,
    roomUrl: `/room/${inviteToken}`,
  });
});
