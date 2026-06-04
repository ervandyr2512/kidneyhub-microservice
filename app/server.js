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
app.use(express.static(path.join(__dirname, 'public')));

async function waitForDB(retries = 15, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Database connected successfully');
      return;
    } catch {
      console.log(`Waiting for database... attempt ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Could not connect to database after multiple retries');
}

function getUser(req) {
  try {
    const token = req.cookies.token;
    if (token) return jwt.verify(token, JWT_SECRET);
  } catch {}
  return null;
}

function readView(name) {
  return fs.readFileSync(path.join(__dirname, 'views', name), 'utf8');
}

function renderLayout(contentFile, data = {}, req) {
  const layout = readView('_layout.html');
  const content = readView(contentFile);
  const user = getUser(req);
  const p = req.path;

  const navAuth = user
    ? `<div class="nav-user-info">
        <div class="nav-avatar">${user.username.charAt(0).toUpperCase()}</div>
        <span>${user.username}</span>
        <a href="/logout" class="btn btn-ghost btn-sm">Keluar</a>
       </div>`
    : `<a href="/login" class="btn btn-ghost btn-sm">Masuk</a>
       <a href="/register" class="btn btn-primary btn-sm">Daftar Donor</a>`;

  const navAuthMobile = user
    ? `<a href="/logout" class="btn btn-ghost btn-sm" style="text-align:center;">Keluar (${user.username})</a>`
    : `<a href="/login" class="btn btn-ghost btn-sm" style="text-align:center;">Masuk</a>
       <a href="/register" class="btn btn-primary btn-sm" style="text-align:center;">Daftar Donor</a>`;

  let html = layout
    .replace('{{content}}', content)
    .replace(/\{\{nav_auth\}\}/g, navAuth)
    .replace('{{nav_auth_mobile}}', navAuthMobile)
    .replace('{{active_home}}', p === '/' ? 'active' : '')
    .replace('{{active_rumah_sakit}}', p === '/rumah-sakit' ? 'active' : '')
    .replace('{{active_dokter}}', p === '/dokter-kami' ? 'active' : '')
    .replace('{{active_informasi}}', p === '/informasi' ? 'active' : '')
    .replace('{{active_tentang}}', p === '/tentang-kami' ? 'active' : '')
    .replace('{{active_kontak}}', p === '/kontak-kami' ? 'active' : '');

  for (const [key, val] of Object.entries(data)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val ?? '');
  }
  html = html.replace(/\{\{[^}]+\}\}/g, '');
  return html;
}

function renderAuth(contentFile, data = {}) {
  const layout = readView('_auth_layout.html');
  const content = readView(contentFile);

  let html = layout.replace('{{content}}', content);
  for (const [key, val] of Object.entries(data)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val ?? '');
  }
  html = html.replace(/\{\{[^}]+\}\}/g, '');
  return html;
}

function requireAuth(req, res, next) {
  const user = getUser(req);
  if (!user) return res.redirect('/login');
  req.user = user;
  next();
}

// ===== PUBLIC ROUTES =====
app.get('/', (req, res) => res.send(renderLayout('home.html', { title: 'Home' }, req)));
app.get('/tentang-kami', (req, res) => res.send(renderLayout('tentang-kami.html', { title: 'Tentang Kami' }, req)));
app.get('/informasi', (req, res) => res.send(renderLayout('informasi.html', { title: 'Informasi' }, req)));
app.get('/rumah-sakit', (req, res) => res.send(renderLayout('rumah-sakit.html', { title: 'Rumah Sakit' }, req)));
app.get('/dokter-kami', (req, res) => res.send(renderLayout('dokter-kami.html', { title: 'Dokter Kami' }, req)));

app.get('/kontak-kami', (req, res) => {
  const sent = req.query.sent === '1';
  res.send(renderLayout('kontak-kami.html', {
    title: 'Kontak Kami',
    success: sent ? '<div class="alert alert-success">Pesan berhasil dikirim! Kami akan merespons dalam 1–2 hari kerja.</div>' : '',
  }, req));
});
app.post('/kontak-kami', (req, res) => res.redirect('/kontak-kami?sent=1'));

// ===== AUTH ROUTES =====
app.get('/register', (req, res) => {
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  res.send(renderAuth('register.html', {
    title: 'Daftar Akun',
    subtitle: 'Buat akun baru',
    footer_link: 'Sudah punya akun? <a href="/login">Login di sini</a>',
    error: error ? `<div class="alert alert-error">${error}</div>` : '',
  }));
});

app.post('/register', async (req, res) => {
  const { username, password, confirm_password } = req.body;
  if (!username || !password || !confirm_password)
    return res.redirect('/register?error=' + encodeURIComponent('Semua field harus diisi.'));
  if (username.length < 3 || username.length > 50)
    return res.redirect('/register?error=' + encodeURIComponent('Username harus 3–50 karakter.'));
  if (password.length < 6)
    return res.redirect('/register?error=' + encodeURIComponent('Password minimal 6 karakter.'));
  if (password !== confirm_password)
    return res.redirect('/register?error=' + encodeURIComponent('Password dan konfirmasi tidak cocok.'));
  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username.trim(), hashed]);
    res.redirect('/login?registered=1');
  } catch (err) {
    if (err.code === '23505')
      return res.redirect('/register?error=' + encodeURIComponent('Username sudah digunakan.'));
    console.error(err);
    res.redirect('/register?error=' + encodeURIComponent('Terjadi kesalahan server.'));
  }
});

app.get('/login', (req, res) => {
  const error = req.query.error ? decodeURIComponent(req.query.error) : '';
  const registered = req.query.registered === '1';
  res.send(renderAuth('login.html', {
    title: 'Login',
    subtitle: 'Masuk ke akun Anda',
    footer_link: 'Belum punya akun? <a href="/register">Daftar di sini</a>',
    error: error ? `<div class="alert alert-error">${error}</div>` : '',
    success: registered ? '<div class="alert alert-success">Registrasi berhasil! Silakan login.</div>' : '',
  }));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.redirect('/login?error=' + encodeURIComponent('Username dan password harus diisi.'));
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (result.rows.length === 0)
      return res.redirect('/login?error=' + encodeURIComponent('Username atau password salah.'));
    const valid = await bcrypt.compare(password, result.rows[0].password);
    if (!valid)
      return res.redirect('/login?error=' + encodeURIComponent('Username atau password salah.'));
    const token = jwt.sign({ id: result.rows[0].id, username: result.rows[0].username }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=' + encodeURIComponent('Terjadi kesalahan server.'));
  }
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.send(renderLayout('dashboard.html', {
    title: 'Dashboard',
    username: req.user.username,
    hostname: os.hostname(),
  }, req));
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

waitForDB().then(() => {
  app.listen(PORT, () => console.log(`KidneyHub running on port ${PORT} | host: ${os.hostname()}`));
}).catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
