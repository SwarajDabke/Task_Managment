const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '143198', // replace
  database: 'swaraj1'         // your DB name
});

db.connect(err => {
  if (err) throw err;
  console.log('✅ Connected to MySQL');
});

module.exports = db;

