const { Pool } = require('pg');

let pool;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL が設定されていません（Vercel Postgres / Neon 等の接続文字列を設定してください）');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // ローカルPostgres(localhost)以外はホスティングDB(SSL必須)を想定
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
      max: 1,
    });
  }
  return pool;
}

let schemaReady;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id BIGSERIAL PRIMARY KEY,
        invite_token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS participants (
        id BIGSERIAL PRIMARY KEY,
        room_id BIGINT NOT NULL REFERENCES rooms(id),
        user_token TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('host','guest')),
        last_seen TIMESTAMPTZ,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        room_id BIGINT NOT NULL REFERENCES rooms(id),
        participant_id BIGINT NOT NULL REFERENCES participants(id),
        type TEXT NOT NULL CHECK (type IN ('text','image')),
        body TEXT,
        image_data BYTEA,
        image_mime TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, id);
      CREATE INDEX IF NOT EXISTS idx_participants_room ON participants(room_id);
    `).catch((err) => {
      schemaReady = undefined; // 次回呼び出しで再試行できるようにする
      throw err;
    });
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

module.exports = { query };
