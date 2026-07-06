# Among Us Clone

Web-based Among Us clone for playing with friends. Built with Node.js, Socket.io, Phaser, and PostgreSQL.

## Quick Start (Docker Compose)

```bash
cp .env.example .env
# JWT_SECRET ve DATABASE_URL değerlerini düzenleyin
docker compose up -d
```

Tarayıcıdan: http://localhost:3000

## Development

Gereksinimler: Node.js 24+, npm 11+

```bash
npm install
npm run dev
```

## Documentation

- [Tasarım Dokümanı](docs/superpowers/specs/2026-07-05-amongus-clone-design.md)
- [Sub-project 1 Planı](docs/superpowers/plans/2026-07-05-sub1-setup-auth.md)

## Linux Sunucuda Çalıştırma

Sub-project 1, Docker Compose ile tek komutta ayağa kalkar. İlk açılışta Prisma
migrasyonları Dockerfile `CMD`'si tarafından otomatik olarak uygulanır, bu yüzden
ek bir `db:migrate` komutu çalıştırmanıza gerek yoktur.

### 1. Hızlı başlangıç

```bash
git clone <repo-url> amongus && cd amongus
cp .env.example .env
# .env içindeki JWT_SECRET ve POSTGRES_PASSWORD değerlerini düzenleyin
# production'da COOKIE_SECURE=true bırakın
docker compose up -d
```

Servislerin durumunu kontrol edin:

```bash
docker compose ps
docker compose logs -f app
```

### 2. Smoke test (curl ile auth akışı)

Container ayağa kalktıktan sonra (≈10–15 sn) auth akışını doğrulayın:

> **Önemli:** Smoke test'i HTTP üzerinden yaparken `.env` dosyasında `COOKIE_SECURE=false` olarak ayarlayın. `Secure` flag'i olan bir cookie HTTP üzerinden gönderilmez ve `/api/auth/me` 401 döner. Production'da mutlaka `true` ve HTTPS kullanın.

```bash
# Health check
curl -s http://localhost:3000/api/health
# Beklenen: {"status":"ok",...}

# Kayıt
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"smoketest","password":"Password123!"}'
# Beklenen: 201 + {user:{...}}

# Login
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"smoketest","password":"Password123!"}'
# Beklenen: 200 + {user:{...}}

# Mevcut kullanıcı
curl -s -b cookies.txt http://localhost:3000/api/auth/me
# Beklenen: 200 + {user:{...}}

# Logout (204 No Content - cookie silinir)
curl -s -X POST http://localhost:3000/api/auth/logout -b cookies.txt -o /dev/null -w "%%{http_code}\n"
# Beklenen: 204

# Durdur / temizle
docker compose down          # veriyi korur
docker compose down -v       # veritabanı datasını da siler
```

> **Not:** Windows makinede PostgreSQL olmadığı için Task 12 migration/smoke
> testleri yerel olarak çalıştırılamadı; yukarıdaki adımlar Linux sunucuda
> doğrulanmalıdır.

## Status

✅ **Sub-project 1 tamamlandı:** Temel Kurulum + Auth
- Monorepo yapısı (npm workspaces)
- Docker Compose ile tek komut deploy
- Kullanıcı kayıt/giriş (JWT + bcrypt + HttpOnly cookie)
- PostgreSQL + Prisma ORM
- Tam test coverage (password, JWT, route integration)

🚧 Sonraki: Sub-project 2 — Lobi Sistemi (Socket.io ile oda yönetimi)
