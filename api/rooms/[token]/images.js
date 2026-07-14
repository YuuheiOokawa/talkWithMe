const db = require('../../../lib/db');
const {
  json,
  authParticipant,
  messageToJson,
  getRawBody,
  withErrorHandling,
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_MIMES,
} = require('../../../lib/helpers');

module.exports = withErrorHandling(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const inviteToken = req.query.token;
  const auth = await authParticipant(inviteToken, req.headers['x-user-token']);
  if (!auth) return json(res, 401, { error: '認証エラー' });

  const mime = (req.headers['content-type'] || '').split(';')[0].trim();
  if (!ALLOWED_IMAGE_MIMES.includes(mime)) {
    return json(res, 415, { error: '対応形式: PNG / JPEG / GIF / WebP' });
  }

  let buf;
  try {
    buf = await getRawBody(req, MAX_IMAGE_BYTES);
  } catch (e) {
    if (e.code === 'LIMIT') {
      return json(res, 413, { error: `画像は${MAX_IMAGE_BYTES / 1024 / 1024}MBまでです` });
    }
    throw e;
  }
  if (!buf || buf.length === 0) return json(res, 400, { error: '画像データが空です' });

  const { rows } = await db.query(
    "INSERT INTO messages (room_id, participant_id, type, image_data, image_mime) VALUES ($1, $2, 'image', $3, $4) RETURNING id, participant_id, type, body, image_mime, created_at",
    [auth.room.id, auth.participant.id, buf, mime]
  );
  await db.query('UPDATE participants SET last_seen = now() WHERE id = $1', [auth.participant.id]);
  json(res, 200, { message: messageToJson(rows[0]) });
});
