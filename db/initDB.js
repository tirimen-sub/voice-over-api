// initDB.js
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

// DB ファイルのパス
const DB_PATH = path.resolve(__dirname, 'db.sqlite');

// データベース接続
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

db.serialize(() => {
  // 質問テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      text      TEXT    NOT NULL,
      answered  INTEGER NOT NULL DEFAULT 0
    );
  `, err => {
    if (err) console.error('Create questions table error:', err.message);
    else        console.log('questions table ready');
  });

  // 応答テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS responses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id  INTEGER NOT NULL,
      audio_path   TEXT    NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
  `, err => {
    if (err) console.error('Create responses table error:', err.message);
    else        console.log('responses table ready');
  });
});

// DB クローズ
db.close(err => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed.');
  }
});