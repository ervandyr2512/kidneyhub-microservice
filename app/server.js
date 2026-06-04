const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kidneyhub_jwt_secret_change_in_prod';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'kidneyhub',
  user: process.env.DB_USER || 'kidneyhub',
  password: process.env.DB_PASSWORD || 'kidneyhub_pass',
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

async function waitForDB(retries = 15, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Database connected successfully');
      return;
    } catch (err) {
      console.log(`Waiting for database... attempt ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Could not connect to database after multiple retries');
}

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie('token');
    res.redirect('/login');
  }
}

function readView(name) {
  return fs.readFileSync(path.join(__dirname, 'views', name), 'utf8');
}

app.get('/', (req, res) => res.redirect('/login'));

app.get('/register', (req, res) => {
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  let html = readView('register.html');
  html = html.replace('{{error}}', error ? `<div class="alert alert-error">${error}</div>` : '');
  res.send(html);
});

app.post('/register', async (req, res) => {
  const { username, password, confirm_password } = req.body;

  if (!username || !password || !confirm_password) {
    return res.redirect('/register?error=' + encodeURIComponent('Semua field harus diisi.'));
  }
  if (username.length < 3 || username.length > 50) {
    return res.redirect('/register?error=' + encodeURIComponent('Username harus 3-50 karakter.'));
  }
  if (password.length < 6) {
    return res.redirect('/register?error=' + encodeURIComponent('Password minimal 6 karakter.'));
  }
  if (password !== confirm_password) {
    return res.redirect('/register?error=' + encodeURIComponent('Password dan konfirmasi password tidak cocok.'));
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2)',
      [username.trim(), hashed]
    );
    res.redirect('/login?registered=1');
  } catch (err) {
    if (err.code === '23505') {
      return res.redirect('/register?error=' + encodeURIComponent('Username sudah digunakan, pilih username lain.'));
    }
    console.error('Register error:', err);
    res.redirect('/register?error=' + encodeURIComponent('Terjadi kesalahan server, coba lagi.'));
  }
});

app.get('/login', (req, res) => {
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  const registered = req.query.registered === '1';
  let html = readView('login.html');
  html = html.replace('{{error}}', error ? `<div class="alert alert-error">${error}</div>` : '');
  html = html.replace('{{success}}', registered ? '<div class="alert alert-success">Registrasi berhasil! Silakan login.</div>' : '');
  res.send(html);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect('/login?error=' + encodeURIComponent('Username dan password harus diisi.'));
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);

    if (result.rows.length === 0) {
      return res.redirect('/login?error=' + encodeURIComponent('Username atau password salah.'));
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.redirect('/login?error=' + encodeURIComponent('Username atau password salah.'));
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.redirect('/login?error=' + encodeURIComponent('Terjadi kesalahan server, coba lagi.'));
  }
});

app.get('/dashboard', requireAuth, (req, res) => {
  let html = readView('dashboard.html');
  html = html
    .replace(/{{username}}/g, req.user.username)
    .replace('{{hostname}}', os.hostname());
  res.send(html);
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

waitForDB().then(() => {
  app.listen(PORT, () => {
    console.log(`KidneyHub running on port ${PORT} | host: ${os.hostname()}`);
  });
}).catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
