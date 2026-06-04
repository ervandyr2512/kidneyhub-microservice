# KidneyHub Microservice

Aplikasi web login/register berbasis microservice untuk AFL-2 - Docker Desktop.

## Arsitektur

```
[Browser] → [Nginx:80 - Load Balancer] → [web1:3000]
                                        → [web2:3000]
                                               ↓
                                        [PostgreSQL:5432]
```

## Stack
- **Web**: Node.js + Express + JWT
- **Database**: PostgreSQL 15
- **Load Balancer**: Nginx (ip_hash)

## Menjalankan

```bash
docker compose up --build
```

Akses: http://localhost

## Fitur
- `/register` — Form registrasi (username, password, konfirmasi password)
- `/login`    — Form login (username, password)
- `/dashboard`— Halaman setelah login, menampilkan username dan instance server
