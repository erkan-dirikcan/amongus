# @amongus/server

Among Us klonu backend — Express + Prisma + PostgreSQL.

## Geliştirme

```bash
# .env dosyasını kök dizinde oluştur (bkz. ../../.env.example)
cd packages/server
npm install
npm run db:generate
npm run db:migrate   # ilk kez
npm run dev
```

## Test

```bash
# Test DB gereklidir
createdb amongus_test
DATABASE_URL="postgresql://amongus:amongus_password@localhost:5432/amongus_test?schema=public" npx prisma db push

npm test
```

## API Endpoints

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/health` | ❌ | Health check |
| POST | `/api/auth/register` | ❌ | Yeni kullanıcı kaydı |
| POST | `/api/auth/login` | ❌ | Giriş yap |
| POST | `/api/auth/logout` | ❌ | Çıkış yap (cookie sil) |
| GET | `/api/auth/me` | ✅ | Mevcut kullanıcı bilgisi |

## Prisma Komutları

```bash
npm run db:generate    # Prisma client'ı regenerate et
npm run db:migrate     # Yeni migration uygula
npm run db:push        # Schema'yı direkt push (sadece dev)
```
