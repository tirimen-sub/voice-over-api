// db.js
const { Pool } = require('pg');

// DATABASE_URLはHerokuが自動で注入してくれます
// ローカル開発時は .env に以下のように書いておく
// DATABASE_URL=postgres://ユーザ:パスワード@ホスト:ポート/データベース名
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Heroku Postgres を使う場合にはrejectUnauthorized: falseが必要
    rejectUnauthorized: false
  }
});

async function init() {
  // 起動時にテーブルを作成
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      answered BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS responses (
      id SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      audio_url TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('[DB] Tables ensured');
}

module.exports = { pool, init };