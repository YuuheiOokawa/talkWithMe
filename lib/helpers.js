const crypto = require('crypto');
const db = require('./db');

const MAX_CHARS = 10000;
const MAX_BYTES = 20000;
// Vercel Serverless Functionsのリクエストボディ上限(4.5MB)に収める
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
// ポーリング間隔(クライアント側2秒)の4倍を目安にオンライン判定
const ONLINE_WINDOW_MS = 8000;

function token(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// セッショントークン(端末ごと)から参加者を引く。同じ参加者に複数端末のトークンが紐づき得る
async function participantBySessionToken(userToken) {
  if (!userToken) return null;
  const { rows } = await db.query(
    `SELECT participants.*, rooms.invite_token AS room_invite_token
     FROM sessions
     JOIN participants ON participants.id = sessions.participant_id
     JOIN rooms ON rooms.id = participants.room_id
     WHERE sessions.token = $1`,
    [userToken]
  );
  return rows[0] || null;
}

async function authParticipant(inviteToken, userToken) {
  if (!inviteToken || !userToken) return null;
  const p = await participantBySessionToken(userToken);
  if (!p || p.room_invite_token !== inviteToken) return null;
  return { room: { id: p.room_id }, participant: p };
}

function normalizeName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  if ([...trimmed].length > 40) return null;
  return trimmed;
}

function messageToJson(m) {
  return {
    id: Number(m.id),
    participantId: Number(m.participant_id),
    type: m.type,
    body: m.type === 'text' ? m.body : null,
    imageUrl: m.type === 'image' ? `/api/images/${m.id}` : null,
    createdAt: m.created_at,
  };
}

function validateText(body) {
  if (typeof body !== 'string') return 'テキストが不正です';
  const trimmed = body.replace(/\s/g, '');
  if (trimmed.length === 0) return 'メッセージが空です';
  const chars = [...body].length;
  if (chars > MAX_CHARS) return `最大${MAX_CHARS}文字までです（現在${chars}文字）`;
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > MAX_BYTES) return `最大${MAX_BYTES}バイトまでです（現在${bytes}バイト）`;
  return null;
}

function readStreamBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { code: 'LIMIT' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Vercelは content-type によって req.body を自動パースすることがあるため、
// 既にBuffer/文字列化されていればそれを使い、無ければストリームから読む
async function getRawBody(req, limit) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > limit) throw Object.assign(new Error('payload too large'), { code: 'LIMIT' });
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.length > 0) {
    const buf = Buffer.from(req.body, 'binary');
    if (buf.length > limit) throw Object.assign(new Error('payload too large'), { code: 'LIMIT' });
    return buf;
  }
  return readStreamBody(req, limit);
}

function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: 'サーバーエラー' });
    }
  };
}

module.exports = {
  token,
  json,
  authParticipant,
  participantBySessionToken,
  normalizeName,
  messageToJson,
  validateText,
  getRawBody,
  withErrorHandling,
  MAX_CHARS,
  MAX_BYTES,
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_MIMES,
  ONLINE_WINDOW_MS,
};
