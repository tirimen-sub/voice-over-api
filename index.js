// index.js
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const sqlite3   = require('sqlite3').verbose();
const multer    = require('multer');
const AWS       = require('aws-sdk');
const fs        = require('fs');
const path      = require('path');

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://voice-over-h-58fb93f16e6b.herokuapp.com");
  next();
});

// JSON ボディパーサー
app.use(express.json());

// SQLite DB 接続 & テーブル初期化
const DB_DIR  = path.resolve(__dirname, 'db');
const DB_PATH = path.join(DB_DIR, 'db.sqlite');

// DB ディレクトリがなければ作成
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) {
    console.error('[DB ERROR]', err.message);
    process.exit(1);
  }
  console.log('[DB] Connected:', DB_PATH);

  // テーブルを作成（起動時に必ず実行）
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS questions (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        text      TEXT    NOT NULL,
        answered  INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS responses (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id  INTEGER NOT NULL,
        audio_url    TEXT    NOT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
      );
    `);
    console.log('[DB] Tables ensured: questions, responses');
  });
});

// AWS S3 設定（Signature V4 を明示）
AWS.config.update({
  accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region:          process.env.AWS_REGION || 'us-east-1'
});
const s3 = new AWS.S3({ signatureVersion: 'v4' });

// multer セットアップ（uploads/ フォルダに一時保存）
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const upload = multer({ dest: UPLOAD_DIR });

/**
 * 質問一覧取得
 * GET /questions
 */
app.get('/questions', (req, res) => {
  db.all('SELECT * FROM questions', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success', data: rows });
  });
});

/**
 * 新規質問追加
 * POST /questions
 * { text: string }
 */
app.post('/questions', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  db.run(
    `INSERT INTO questions (text, answered) VALUES (?, 0)`,
    [text],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        message: 'success',
        data: { id: this.lastID, text, answered: 0 }
      });
    }
  );
});

/**
 * 音声回答受け取り → S3 アップロード → DB 登録
 * POST /responses
 * FormData:
 *   - questionId: number
 *   - audio     : Blob (field name 'audio')
 */
app.post('/responses', upload.single('audio'), async (req, res) => {
  try {
    const questionId = req.body.questionId;
    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'audio file is required' });
    }

    // S3 へアップロード
    const key = `responses/${questionId}/${Date.now()}-${req.file.originalname}`;
    const fileStream = fs.createReadStream(req.file.path);
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key:    key,
      Body:   fileStream,
      ContentType: req.file.mimetype
    };
    const uploadResult = await s3.upload(params).promise();

    // 一時ファイルを削除
    fs.unlink(req.file.path, unlinkErr => {
      if (unlinkErr) console.warn('[Upload] tmp file delete failed:', unlinkErr);
    });

    // DB に記録
    const audioUrl = uploadResult.Location;
    db.run(
      `INSERT INTO responses (question_id, audio_url) VALUES (?, ?)`,
      [questionId, audioUrl],
      function(err) {
        if (err) {
          console.error('[DB] insert responses error:', err.message);
          return res.status(500).json({ error: err.message });
        }

        // 質問を回答済みに更新
        db.run(
          `UPDATE questions SET answered = 1 WHERE id = ?`,
          [questionId],
          updateErr => {
            if (updateErr) {
              console.warn('[DB] update question answered failed:', updateErr.message);
            }
            // 完了レスポンス
            res.json({
              message: 'success',
              data: {
                responseId: this.lastID,
                questionId,
                audioUrl
              }
            });
          }
        );
      }
    );
  } catch (err) {
    console.error('[POST /responses]', err);
    res.status(500).json({ error: err.message });
  }
});

// サーバ起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});