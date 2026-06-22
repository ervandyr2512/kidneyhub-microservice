# KidneyHub Microservice Platform — AFL-3

Platform registri donor ginjal nasional Indonesia dengan arsitektur **microservice penuh** menggunakan Docker, Traefik, Node.js, PostgreSQL, MongoDB, Redis, Mosquitto MQTT, Prometheus, dan Grafana.

## Arsitektur (13 Container)

```
                        ┌─────────────────────────────────────────────┐
  Browser/Client ──────▶│  TRAEFIK (API Gateway)  :80  dashboard:8080 │
                        └──────────────────────────────────────────────┘
                          │             │              │            │
                          ▼             ▼              ▼            ▼
                   /api/auth/*   /api/donors/*   /api/notif/*  everything
                          │      + ForwardAuth         │         else
                          ▼             ▼              ▼            ▼
                    auth-service  donor-service   notif-service    web
                       :4000          :4001           :4002        :3000
                          │             │              │
                          ▼             │              ▼
                      PostgreSQL        │           MongoDB
                                        ▼
                                   Mosquitto (MQTT)
                                        │
                                        ▼ (MQTT Subscribe)
                                   notif-service
                                        │
                                        ▼ (WebSocket Broadcast)
                                    Browser/Client

  Monitoring Stack:
  Prometheus :9090 ←── Node Exporter (host metrics)
                   ←── cAdvisor (container metrics)
  Grafana :3001 ←── Prometheus
```

## Stack Teknologi

| Kategori | Teknologi |
|---|---|
| API Gateway | Traefik v3.0 |
| Backend Services | Node.js 20 + Express |
| Databases | PostgreSQL 15, MongoDB 7, Redis 7 |
| Message Broker | Eclipse Mosquitto (MQTT) |
| Real-time | Socket.io (WebSocket) |
| Auth | JWT (jsonwebtoken) |
| Monitoring | Prometheus + Grafana + Node Exporter + cAdvisor |
| Orchestration | Docker Compose |

## Skema Komunikasi

**1. REST API (HTTP)** — Semua service berkomunikasi via HTTP melalui Traefik API Gateway

**2. MQTT + WebSocket** — donor-service → MQTT publish → Mosquitto → notification-service subscribe → WebSocket broadcast ke browser

## Auth Middleware

Traefik menggunakan **ForwardAuth** middleware: setiap request ke `/api/donors/*` divalidasi ke `auth-service/api/auth/verify` sebelum diteruskan.

## Cara Menjalankan

```bash
# Clone repository
git clone https://github.com/ervandyr2512/kidneyhub-microservice.git
cd kidneyhub-microservice

# Deploy semua 13 container
chmod +x deploy.sh
./deploy.sh
```

## Akses

| Layanan | URL |
|---|---|
| Website KidneyHub | http://localhost |
| Traefik Dashboard | http://localhost:8080/dashboard/ |
| Prometheus | http://localhost:9090 |
| Grafana (admin/admin123) | http://localhost:3001 |
| MQTT Broker | localhost:1883 |
| cAdvisor | http://localhost:8081 |

## REST API Endpoints

```bash
# Register
POST http://localhost/api/auth/register
{"username": "ervandy", "password": "password123"}

# Login → dapat token JWT
POST http://localhost/api/auth/login
{"username": "ervandy", "password": "password123"}

# Daftar donor (butuh token)
GET  http://localhost/api/donors
Authorization: Bearer <token>

# Tambah donor baru (butuh token — trigger MQTT event)
POST http://localhost/api/donors
Authorization: Bearer <token>
{"name": "Budi", "age": 30, "blood_type": "A+", "city": "Jakarta"}

# Riwayat notifikasi
GET  http://localhost/api/notifications
```
