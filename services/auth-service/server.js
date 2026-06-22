const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'kidneyhub_secret_2024';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: 5432,
  database: process.env.DB_NAME || 'kidneyhub',
  user: process.env.DB_USER || 'kidneyhub',
  password: process.env.DB_PASSWORD || 'kidneyhub_pass',
});

app.use(express.json());

async function waitForDB(retries = 15, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try { await pool.query('SELECT 1'); console.log('[auth] DB connected'); return; }
    catch { console.log(`[auth] Waiting for DB... ${i + 1}/${retries}`); await new Promise(r => setTimeout(r, delay)); }
  }
  throw new Error('Cannot connect to database');
}

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username dan password diperlukan' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, created_at',
      [username.trim(), hashed]
    );
    res.status(201).json({ message: 'Registrasi berhasil', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username sudah digunakan' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username dan password diperlukan' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (!result.rows.length) return res.status(401).json({ error: 'Kredensial tidak valid' });
    const valid = await bcrypt.compare(password, result.rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Kredensial tidak valid' });
    const token = jwt.sign(
      { id: result.rows[0].id, username: result.rows[0].username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ message: 'Login berhasil', token, username: result.rows[0].username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/verify  — digunakan Traefik ForwardAuth middleware
app.get('/api/auth/verify', (req, res) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token diperlukan' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    res.set('X-Auth-User', payload.username);
    res.set('X-Auth-Id', String(payload.id));
    res.status(200).json({ valid: true, user: { id: payload.id, username: payload.username } });
  } catch {
    res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa' });
  }
});

// GET /api/auth/health
app.get('/api/auth/health', (req, res) =>
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date() })
);

waitForDB().then(() => {
  app.listen(PORT, () => console.log(`[auth-service] Running on port ${PORT}`));
}).catch(err => { console.error(err.message); process.exit(1); });
