const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 4002;
const MQTT_HOST = process.env.MQTT_HOST || 'mosquitto';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/kidneyhub_notifications';

app.use(express.json());

let db = null;

// Connect MongoDB with retry
async function connectMongo(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await MongoClient.connect(MONGO_URI);
      db = client.db();
      console.log('[notification] MongoDB connected');
      return;
    } catch (err) {
      console.log(`[notification] Waiting for MongoDB... ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  console.error('[notification] Cannot connect to MongoDB');
}

// MQTT subscriber
function connectMQTT(retries = 10, delay = 3000) {
  const client = mqtt.connect(`mqtt://${MQTT_HOST}:1883`);
  client.on('connect', () => {
    console.log('[notification] Connected to MQTT broker');
    client.subscribe('kidneyhub/#', (err) => {
      if (!err) console.log('[notification] Subscribed to kidneyhub/#');
    });
  });
  client.on('message', async (topic, message) => {
    let payload;
    try { payload = JSON.parse(message.toString()); } catch { payload = message.toString(); }
    const notification = { topic, payload, timestamp: new Date(), read: false };
    console.log(`[notification] MQTT received: ${topic}`);
    // Save to MongoDB
    if (db) {
      await db.collection('notifications').insertOne(notification).catch(console.error);
    }
    // Broadcast ke semua WebSocket clients
    io.emit('notification', notification);
  });
  client.on('error', (err) => {
    console.error('[notification] MQTT error:', err.message);
    setTimeout(() => connectMQTT(retries - 1, delay), delay);
  });
}

// WebSocket
io.on('connection', (socket) => {
  console.log(`[notification] WebSocket client connected: ${socket.id}`);
  socket.emit('welcome', { message: 'Terhubung ke KidneyHub Notification Service', timestamp: new Date() });
  socket.on('disconnect', () => console.log(`[notification] Client disconnected: ${socket.id}`));
});

// GET /api/notifications — history notifikasi
app.get('/api/notifications', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database belum siap' });
    const limit = parseInt(req.query.limit) || 50;
    const notifications = await db.collection('notifications')
      .find().sort({ timestamp: -1 }).limit(limit).toArray();
    res.json({ notifications, total: notifications.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/notifications — kirim notifikasi manual (internal use)
app.post('/api/notifications', async (req, res) => {
  const { topic, payload } = req.body;
  const notification = { topic: topic || 'manual', payload, timestamp: new Date(), read: false };
  if (db) await db.collection('notifications').insertOne(notification).catch(console.error);
  io.emit('notification', notification);
  res.status(201).json({ message: 'Notifikasi dikirim', notification });
});

// GET /api/notifications/health
app.get('/api/notifications/health', (req, res) =>
  res.json({ status: 'ok', service: 'notification-service', wsClients: io.engine.clientsCount, timestamp: new Date() })
);

// Start
connectMongo().then(() => connectMQTT());
server.listen(PORT, () => console.log(`[notification-service] Running on port ${PORT} (HTTP + WebSocket)`));
