const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./db/db.sqlite', (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});