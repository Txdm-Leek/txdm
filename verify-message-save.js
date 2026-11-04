const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./backend/database');

(async () => {
  let user = db.prepare('SELECT * FROM users LIMIT 1').get();

  if (!user) {
    const hash = await bcrypt.hash('Password123!', 12);
    const result = db.prepare(
      'INSERT INTO users (name, email, phonenumber, password) VALUES (?, ?, ?, ?)'
    ).run('Test User', 'test@example.com', '1234567890', hash);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, phonenumber: user.phonenumber },
    'development_secret_key_for_local_only_123456',
    { expiresIn: '1h' }
  );

  const res = await fetch('http://localhost:5000/api/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ message: 'Validation message' }),
  });

  const text = await res.text();
  console.log('STATUS', res.status);
  console.log('BODY', text);
  process.exit(res.ok ? 0 : 1);
})().catch((err) => {
  console.error('ERR', err);
  process.exit(1);
});
