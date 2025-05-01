const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
require('dotenv').config(); // 環境変数を読み込む

const AWS = require('aws-sdk');

const fs = require('fs');

const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://voice-over-h-58fb93f16e6b.herokuapp.com");
  next();
});

app.use(express.json());

const db = new sqlite3.Database('./db/db.sqlite', (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// AWS設定 (環境変数を使用する方法)
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();

const upload = multer({ dest: 'uploads/' }); // 一時保存用

// 音声データを受け取りS3にアップロード
app.post('/upload-audio', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const fileContent = fs.createReadStream(req.file.path);
  const uploadParams = {
    Bucket: 'voiseb', // バケット名
    Key: req.file.filename, // S3内での保存名
    Body: fileContent,
    ContentType: 'audio/wav', // MIMEタイプを設定
  };

  s3.upload(uploadParams, (err, data) => {
    fs.unlink(req.file.path, (unlinkErr) => {
      if (unlinkErr) console.error('Error deleting temporary file:', unlinkErr);
    });
    
    if (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'S3 upload failed' });
    }

    console.log('Upload successful:', data);
    res.json({ message: 'File uploaded successfully to S3', data });
  });
});


// 問い一覧取得 (GET)
app.get('/questions', (req, res) => {
  const sql = 'SELECT * FROM questions';
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(400).json({"error":err.message});
      return;
    }
    res.json({
      "message": "success",
      "data": rows
    });
  });
});

// 新規問い追加 (POST)
app.post('/questions', (req, res) => {
  const { text } = req.body;
  const sql = 'INSERT INTO questions (text, answered) VALUES (?, ?)';
  db.run(sql, [text, false], function(err) {
    if (err) {
      return res.status(400).json({"error": err.message});
    }
    res.json({
      "message": "success",
      "data": { id: this.lastID, text, answered: false },
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});