const express = require('express');
const { Pool } = require('pg');
const mqtt = require('mqtt');

const app = express();
const PORT = process.env.PORT || 4001;
const MQTT_HOST = process.env.MQTT_HOST || 'mosquitto';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: 5432,
  database: process.env.DB_NAME || 'kidneyhub',
  user: process.env.DB_USER || 'kidneyhub',
  password: process.env.DB_PASSWORD || 'kidneyhub_pass',
});

app.use(express.json());

// MQTT client (publisher)
let mqttClient = null;
function connectMQTT(retries = 10, delay = 3000) {
  mqttClient = mqtt.connect(`mqtt://${MQTT_HOST}:1883`);
  mqttClient.on('connect', () => console.log('[donor] Connected to MQTT broker'));
  mqttClient.on('error', (err) => {
    console.error('[donor] MQTT error:', err.message);
    if (retries > 0) setTimeout(() => connectMQTT(retries - 1, delay), delay);
  });
}
connectMQTT();

function publishMQTT(topic, payload) {
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(topic, JSON.stringify(payload));
    console.log(`[donor] MQTT publish → ${topic}`);
  }
}

async function waitForDB(retries = 15, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try { await pool.query('SELECT 1'); console.log('[donor] DB connected'); return; }
    catch { console.log(`[donor] Waiting for DB... ${i + 1}/${retries}`); await new Promise(r => setTimeout(r, delay)); }
  }
  throw new Error('Cannot connect to database');
}

// GET /api/donors — list all donors
app.get('/api/donors', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM donors ORDER BY created_at DESC');
    res.json({ donors: result.rows, total: result.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/donors/health
app.get('/api/donors/health', (req, res) =>
  res.json({ status: 'ok', service: 'donor-service', timestamp: new Date() })
);

// GET /api/donors/:id
app.get('/api/donors/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM donors WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Donor tidak ditemukan' });
    res.json({ donor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/donors — create donor (requires auth via Traefik ForwardAuth)
app.post('/api/donors', async (req, res) => {
  const { name, age, blood_type, city, phone } = req.body;
  const registeredBy = req.headers['x-auth-user'] || 'unknown';
  if (!name || !age || !blood_type)
    return res.status(400).json({ error: 'name, age, dan blood_type wajib diisi' });
  try {
    const result = await pool.query(
      'INSERT INTO donors (name, age, blood_type, city, phone, registered_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, parseInt(age), blood_type, city || null, phone || null, registeredBy]
    );
    const donor = result.rows[0];
    // Publish ke MQTT — notification-service akan menerima ini
    publishMQTT('kidneyhub/donors/new', { donor, registeredBy, timestamp: new Date() });
    res.status(201).json({ message: 'Donor berhasil didaftarkan', donor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/donors/:id
app.delete('/api/donors/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM donors WHERE id = $1 RETURNING name', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Donor tidak ditemukan' });
    publishMQTT('kidneyhub/donors/deleted', { id: req.params.id, name: result.rows[0].name });
    res.json({ message: `Donor "${result.rows[0].name}" berhasil dihapus` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

waitForDB().then(() => {
  app.listen(PORT, () => console.log(`[donor-service] Running on port ${PORT}`));
}).catch(err => { console.error(err.message); process.exit(1); });
