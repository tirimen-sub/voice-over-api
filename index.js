require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const AWS     = require('aws-sdk');
const fs      = require('fs');
const path    = require('path');

const { pool, init } = require('./initDB');

const app = express();

// CORS設定（必要に応じてオリジンを調整）
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json());

// S3設定
AWS.config.update({
  accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region:          process.env.AWS_REGION || 'us-east-1'
});
const s3 = new AWS.S3({ signatureVersion: 'v4' });

// multer（一時ディレクトリ）
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const upload = multer({ dest: UPLOAD_DIR });

// サーバ起動前にDB初期化
init().catch(err => {
  console.error('[DB] init failed', err);
  process.exit(1);
});

/**
 * GET /questions
 */
app.get('/questions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM questions ORDER BY id');
    res.json({ message: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /questions
 */
app.post('/questions', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO questions(text) VALUES($1) RETURNING *',
      [text]
    );
    res.json({ message: 'success', data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /responses
 */
app.post('/responses', upload.single('audio'), async (req, res) => {
  try {
    const { questionId } = req.body;
    if (!questionId)  return res.status(400).json({ error: 'questionId is required' });
    if (!req.file)    return res.status(400).json({ error: 'audio file is required' });

    // S3アップロード
    const key = `responses/${questionId}/${Date.now()}-${req.file.originalname}`;
    const fileStream = fs.createReadStream(req.file.path);
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key:    key,
      Body:   fileStream,
      ContentType: req.file.mimetype
    };
    const uploadResult = await s3.upload(params).promise();

    // 一時ファイル削除
    fs.unlink(req.file.path, _=>{});

    // DB登録 & 質問をansweredに更新
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const resp = await client.query(
        'INSERT INTO responses(question_id, audio_url) VALUES($1,$2) RETURNING *',
        [questionId, uploadResult.Location]
      );
      await client.query(
        'UPDATE questions SET answered = TRUE WHERE id = $1',
        [questionId]
      );
      await client.query('COMMIT');
      res.json({ message: 'success', data: resp.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /responses/:questionId
 */
app.get('/responses/:questionId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT audio_url, created_at FROM responses WHERE question_id = $1 ORDER BY created_at',
      [req.params.questionId]
    );
    res.json({ message: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// サーバ起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, _=>{
  console.log(`[Server] listening on ${PORT}`);
});