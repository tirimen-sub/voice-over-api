// initDB.js
const sqlite3 = require('sqlite3').verbose();

// データベースへの接続を開く
const db = new sqlite3.Database('./db.sqlite', (err) => {
  if (err) {
    console.error('Error opening database ' + err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// テーブルの作成（存在しない場合に限り作成）
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    answered BOOLEAN NOT NULL DEFAULT 0
  );`, (err) => {
    if (err) {
      console.error('Error creating table: ' + err.message);
    } else {
      console.log('Table created successfully or already exists.');
    }
  });
});

// 接続を閉じる
db.close((err) => {
  if (err) {
    console.error('Error closing database ' + err.message);
  } else {
    console.log('Database connection closed.');
  }
});