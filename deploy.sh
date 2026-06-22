#!/bin/bash
# KidneyHub AFL-3 — Automated Deployment Script

set -e

echo "==========================================="
echo "  KidneyHub Microservice — AFL-3 Deploy"
echo "==========================================="

# Pastikan Docker berjalan
if ! docker info > /dev/null 2>&1; then
  echo "[ERROR] Docker tidak berjalan. Buka Docker Desktop terlebih dahulu."
  exit 1
fi

echo "[1/4] Membersihkan container lama (jika ada)..."
docker compose down --remove-orphans 2>/dev/null || true

echo "[2/4] Build image (auth-service, donor-service, notification-service, web)..."
docker compose build --no-cache

echo "[3/4] Menjalankan semua 13 container..."
docker compose up -d

echo "[4/4] Menunggu services siap..."
sleep 10

echo ""
echo "==========================================="
echo "  DEPLOYMENT SELESAI!"
echo "==========================================="
echo ""
echo "  Akses aplikasi:"
echo "  - Web App (KidneyHub)    : http://localhost"
echo "  - Traefik Dashboard      : http://localhost:8080/dashboard/"
echo "  - Prometheus             : http://localhost:9090"
echo "  - Grafana Dashboard      : http://localhost:3001  (admin/admin123)"
echo "  - MQTT Broker            : localhost:1883"
echo "  - cAdvisor               : http://localhost:8081"
echo ""
echo "  REST API Endpoints:"
echo "  - POST /api/auth/register   → Daftar user baru"
echo "  - POST /api/auth/login      → Login, dapat token JWT"
echo "  - GET  /api/auth/verify     → Verifikasi token (internal)"
echo "  - GET  /api/donors          → Daftar donor (butuh token)"
echo "  - POST /api/donors          → Daftar donor baru (butuh token)"
echo "  - GET  /api/notifications   → Riwayat notifikasi"
echo ""
echo "  Status container:"
docker compose ps
