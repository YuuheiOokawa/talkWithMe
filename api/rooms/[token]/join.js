const db = require('../../../lib/db');
const {
  token: genToken,
  json,
  authParticipant,
  normalizeName,
  withErrorHandling,
} = require('../../../lib/helpers');

async function createSession(participantId) {
  const sessionToken = genToken();
  await db.query('INSERT INTO sessions (participant_id, token) VALUES ($1, $2)', [participantId, sessionToken]);
  return sessionToken;
}

module.exports = withErrorHandling(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const inviteToken = req.query.token;
  const { rows: roomRows } = await db.query('SELECT * FROM rooms WHERE invite_token = $1', [inviteToken]);
  const room = roomRows[0];
  if (!room) return json(res, 404, { error: 'ルームが見つかりません' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // 1. 既存セッション(同じ端末での再訪問)
  if (body.userToken) {
    const auth = await authParticipant(inviteToken, body.userToken);
    if (auth) {
      await db.query('UPDATE participants SET last_seen = now() WHERE id = $1', [auth.participant.id]);
      return json(res, 200, {
        userToken: body.userToken,
        participantId: Number(auth.participant.id),
        role: auth.participant.role,
        displayName: auth.participant.display_name,
        rejoined: true,
      });
    }
    // トークンが無効(別端末・DBリセット等)な場合は名前ログインにフォールバック
  }

  // 2. 名前による認証(新規参加 or 別端末からの同一人物ログイン)
  const name = normalizeName(body.name);
  if (!name) return json(res, 400, { error: 'お名前を入力してください', requireName: true });

  const { rows: members } = await db.query(
    'SELECT * FROM participants WHERE room_id = $1 ORDER BY id',
    [room.id]
  );
  const existing = members.find(
    (m) => m.display_name && m.display_name.toLowerCase() === name.toLowerCase()
  );

  if (existing) {
    const sessionToken = await createSession(existing.id);
    await db.query('UPDATE participants SET last_seen = now() WHERE id = $1', [existing.id]);
    return json(res, 200, {
      userToken: sessionToken,
      participantId: Number(existing.id),
      role: existing.role,
      displayName: existing.display_name,
      rejoined: true,
    });
  }

  if (members.length >= 2) {
    return json(res, 403, { error: 'このルームは満員で、入力した名前の参加者も見つかりません' });
  }

  const role = members.length === 0 ? 'host' : 'guest';
  const { rows: inserted } = await db.query(
    "INSERT INTO participants (room_id, role, display_name, last_seen) VALUES ($1, $2, $3, now()) RETURNING id",
    [room.id, role, name]
  );
  const sessionToken = await createSession(inserted[0].id);
  json(res, 200, {
    userToken: sessionToken,
    participantId: Number(inserted[0].id),
    role,
    displayName: name,
    rejoined: false,
  });
});
