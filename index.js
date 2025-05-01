require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const sqlite3   = require('sqlite3').verbose();
const multer    = require('multer');
const AWS       = require('aws-sdk');
const fs        = require('fs');
const path      = require('path');

const app = express();

// CORS 設定
app.use(cors({
  origin: process.env.CORS_ORIGIN 
          || 'https://voice-over-h-58fb93f16e6b.herokuapp.com'
}));

// JSON ボディパーサー
app.use(express.json());

// SQLite DB 接続＆初期化
const DB_PATH = path.resolve(__dirname, 'db', 'db.sqlite');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) {
    console.error('DB open error:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite:', DB_PATH);
});

// テーブル作成
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
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
  `);

  console.log('Tables ensured: questions, responses');
});

// AWS S3 設定
AWS.config.update({
  accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region:          process.env.AWS_REGION || 'us-east-1'
});
const s3 = new AWS.S3();

// multer セットアップ（一時保存先 uploads/）
const upload = multer({ dest: path.resolve(__dirname, 'uploads') });

/**
 * 質問一覧取得
 */
app.get('/questions', (req, res) => {
  db.all('SELECT * FROM questions', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success', data: rows });
  });
});

/**
 * 新規質問追加
 */
app.post('/questions', (req, res) => {
  const { text } = req.body;
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
 * 音声回答を受け取り → S3 → DB 登録
 * フロントからは FormData に
 *  - audio: Blob
 *  - questionId: 質問のID
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

    // S3 アップロード準備
    const fileStream = fs.createReadStream(req.file.path);
    const key = `responses/${questionId}/${Date.now()}-${req.file.originalname}`;
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: fileStream,
      ContentType: req.file.mimetype
    };

    // S3 へアップロード
    const uploadResult = await s3.upload(params).promise();

    // 一時ファイル削除
    fs.unlink(req.file.path, unlinkErr => {
      if (unlinkErr) console.warn('tmp file delete failed:', unlinkErr);
    });

    // DB に記録
    const audioUrl = uploadResult.Location;
    db.run(
      `INSERT INTO responses (question_id, audio_url) VALUES (?, ?)`,
      [questionId, audioUrl],
      function(err) {
        if (err) {
          console.error('DB insert responses error:', err);
          return res.status(500).json({ error: err.message });
        }

        // 質問テーブルを answered=1 に更新
        db.run(
          `UPDATE questions SET answered = 1 WHERE id = ?`,
          [questionId],
          updateErr => {
            if (updateErr) console.warn('Update question answered error:', updateErr);
            // レスポンス返却
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
    console.error('POST /responses error:', err);
    res.status(500).json({ error: err.message });
  }
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});