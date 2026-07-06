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

## Status

🚧 Geliştirme aşamasında — Sub-project 1: Temel Kurulum + Auth
