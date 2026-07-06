# Sub-project 2: Lobi Sistemi — Tasarım Dokümanı

**Tarih:** 2026-07-06
**Durum:** Tasarımda (kullanıcı onayı bekleniyor)
**Amaç:** Among Us klonu için Socket.io tabanlı oda/lobi sistemi. Kullanıcılar kayıt/giriş yaptıktan sonra oda oluşturabilir, kod ile katılabilir, renk seçip hazırlanabilir ve host oyunu başlatabilir. Sub-project 3'teki oyun motoruna köprü oluşturur.

---

## 1. Hedefler ve Kapsam

### Hedefler
- Socket.io ile realtime lobi senkronizasyonu
- 6 haneli oda kodu ile gizli oda sistemi
- Oda oluşturma, katılma, ayrılma
- Renk seçimi (çakışma kontrolü ile)
- Hazır/Hazır değil durumu
- Host yönetimi (otomatik transfer)
- Bağlantı kopması durumunda oyuncu çıkarma
- Opsiyonel oda şifresi
- HTML/CSS tabanlı login + menu + lobby ekranları

### Kapsam Dışı (YAGNI)
- Oyun başlatma mantığı (Sub-project 3'te — bu sub-project sadece `STARTING` durumuna geçiş)
- Sesli sohbet
- Lobi içi metin chat
- Redis / kalıcı lobi durumu (in-memory yeterli)
- Lobi ayarları (Impostor sayısı, görev sayısı) — Sub-project 3'te

---

## 2. Mimari

### Genel Akış

```
Tarayıcı (Client)
  ├── Login ekranı (HTTP fetch → JWT cookie)
  ├── Menu ekranı (oda oluştur / katıl)
  └── Lobby ekranı (Socket.io realtime)
        │
        │ 1. io({ withCredentials: true })
        │ 2. Server: JWT'yi cookie'den doğrula
        ▼
Sunucu (Node.js)
  ├── Socket.io server (Express HTTP server'a bağlı)
  │     ├── Auth middleware (JWT cookie)
  │     └── Lobby event handler'ları
  └── LobbyManager (in-memory)
        └── Map<code, Lobby>
```

### Teknoloji

| Katman | Teknoloji | Gerekçe |
|--------|-----------|---------|
| Realtime iletişim | Socket.io 4 | Oda yönetimi, otomatik reconnect, fallback |
| Client UI | HTML/CSS + Vanilla TS | Basit, hızlı, framework gerekmez |
| Client build | Vite | Dev proxy, hızlı HMR |
| Lobi durumu | In-memory Map | Arkadaş oyunu — kalıcılık gerekmez |

---

## 3. Veri Modeli (In-Memory)

### Lobby

```typescript
interface Lobby {
  code: string;              // 6 haneli, örn. "A4KQ9Z" (büyük harf + rakam)
  hostId: string;            // auth user.id
  passwordHash?: string;     // opsiyonel (bcrypt)
  players: LobbyPlayer[];
  status: "LOBBY" | "STARTING";
  createdAt: number;         // Date.now()
  maxPlayers: number;        // 10
}
```

### LobbyPlayer

```typescript
interface LobbyPlayer {
  userId: string;            // auth user.id (cuid)
  username: string;
  color: string;             // "red", "blue", ...
  isReady: boolean;
  isHost: boolean;
  socketId: string;          // Socket.io socket.id
  joinedAt: number;          // host transfer için sıralama
}
```

### Renk Sabitleri

```typescript
const LOBBY_COLORS = [
  "red", "blue", "green", "pink", "orange", "yellow",
  "black", "white", "purple", "brown", "cyan", "lime",
] as const;
// 12 renk, her biri tek bir oyuncuya ait
```

---

## 4. Socket.io Events

### Bağlantı & Auth

```
1. İstemci: socket = io({ withCredentials: true })
2. Server middleware (her bağlantıda):
   - cookie'den amongus_token JWT'yi oku
   - verifyToken() ile doğrula
   - Geçersizse: next(new Error("unauthorized")) → connect_error
   - Geçerliyse: socket.data.user = { userId, username }, next()
```

### Client → Server Event'leri

| Event | Payload | Açıklama | Yanıt |
|-------|---------|----------|-------|
| `lobby:create` | `{ password?: string }` | Yeni oda oluştur, host ol | `lobby:state` emit (sadece kendine) |
| `lobby:join` | `{ code: string, password?: string }` | Koda göre katıl | `lobby:state` + broadcast `lobby:updated` |
| `lobby:leave` | `{}` | Ayrıl | broadcast `lobby:updated` |
| `lobby:toggleReady` | `{}` | Hazır durumunu değiştir | broadcast `lobby:updated` |
| `lobby:setColor` | `{ color: string }` | Renk seç | broadcast `lobby:updated` veya `lobby:error` |
| `lobby:start` | `{}` | Sadece host → başlat | `lobby:started` broadcast |

### Server → Client Event'leri

| Event | Payload | Açıklama |
|-------|---------|----------|
| `lobby:state` | `LobbyState` | İlk katılımda tam durum (sadece istek sahibine) |
| `lobby:updated` | `LobbyState` | Her değişiklikte tüm lobby'e broadcast |
| `lobby:error` | `{ code: string, message: string }` | Hata bildirimi |
| `lobby:started` | `{ code: string }` | Oyun başlıyor (Sub-project 3'e köprü — lobi kodu) |

### LobbyState (Client'a giden payload)

```typescript
interface LobbyState {
  code: string;
  hostId: string;
  hasPassword: boolean;      // hash değil, sadece var/yok bilgisi
  players: {
    userId: string;
    username: string;
    color: string;
    isReady: boolean;
    isHost: boolean;
  }[];                        // socketId ve joinedAt client'a gönderilmez
  status: "LOBBY" | "STARTING";
  maxPlayers: number;
}
```

---

## 5. LobbyManager — İş Mantığı

### Oda Kodu Üretimi

```
generateLobbyCode():
  - 6 karakter, [A-Z0-9] kümesinden
  - Benzersiz olana kadar dene (Map'te yoksa)
  - Karıştırılmış görünümlü kodlardan kaçın (örn. "0" ve "O" birlikte)
  - Pratik: A-Z + 2-9 (0, 1, O, I hariç → okunabilirlik)
```

### Oda Oluşturma (`lobby:create`)

```
1. Kullanıcı zaten bir lobide mi? → evetse hata
2. generateLobbyCode() → benzersiz kod
3. Yeni Lobby oluştur:
   - code, hostId = userId
   - players = [kendisi] (isHost: true, color: ilk boş renk, isReady: false)
   - status: "LOBBY"
4. password varsa bcrypt hash'le
5. Map'e kaydet
6. İstek sahibine lobby:state emit
```

### Odaya Katılma (`lobby:join`)

```
1. Kullanıcı zaten bir lobide mi? → evetse hata
2. code ile lobby ara → yoksa lobby:error (not_found)
3. Lobby dolu mu? (players.length >= maxPlayers) → lobby:error (full)
4. passwordHash varsa → verifyPassword, yanlışsa lobby:error (wrong_password)
5. Kullanıcıyı ekle:
   - color: ilk boş renk
   - isReady: false, isHost: false
6. lobby:state (istek sahibine)
7. lobby:updated (tüm lobby'e broadcast)
```

### Ayrılma (`lobby:leave`)

```
1. Kullanıcı bir lobide mi? → değilse yoksay
2. Oyuncuyu lobiden çıkar
3. Host id'siyse → transferLobbyHost()
4. 0 oyuncu kaldıysa → lobby'i Map'ten sil
5. lobby:updated broadcast (hala oyuncu varsa)
```

### Host Transfer

```
transferLobbyHost(lobby):
  1. players'dan isHost: true olanı bul, isHost: false yap
  2. Kalan oyunculardan joinedAt'i en küçük olanı seç
  3. isHost: true yap
  4. lobby.hostId = yeniHost.userId
```

### Renk Değiştirme (`lobby:setColor`)

```
1. Kullanıcı bir lobide mi?
2. color LOBBY_COLORS'ta var mı?
3. Başka bir oyuncu bu rengi kullanıyor mu? → evetse lobby:error (color_taken)
4. Oyuncunun color alanını güncelle
5. lobby:updated broadcast
```

### Hazırlık Değiştirme (`lobby:toggleReady`)

```
1. Oyuncunun isReady alanını toggle (tersine çevir)
2. lobby:updated broadcast
```

### Oyunu Başlatma (`lobby:start`)

```
1. İstek sahibi host mı? → değilse lobby:error (not_host)
2. status "LOBBY" mi? → değilse zaten başladı
3. En az 4 oyuncu var mı? → değilse lobby:error (not_enough_players)
4. status: "STARTING" yap
5. lobby:started broadcast (matchId ile — Sub-project 3 buradan devralır)
```

### Bağlantı Kopması (disconnect)

```
socket.on("disconnect"):
  1. socket.data.user.userId ile lobide ara
  2. Bulunursa: lobby:leave akışını çalıştır (aynı mantık)
  3. Grace period yok — anında çıkar (arkadaş oyunu, basit tut)
```

---

## 6. Lobby UI (HTML/CSS)

### Ekran Yapısı

Tek `index.html`, JS ile ekran değiştirme (SPA-lite):

```
<div id="app">
  <section id="login-screen">...</section>
  <section id="menu-screen" hidden>...</section>
  <section id="lobby-screen" hidden>...</section>
</div>
```

### Login Ekranı

```
┌─────────────────────────────┐
│        AMONG US             │
│   Kullanıcı adı: [_______]  │
│   Şifre:          [_______] │
│   [Giriş] [Kayıt Ol]        │
│   Hata mesajı burada        │
└─────────────────────────────┘
```

### Menu Ekranı

```
┌─────────────────────────────┐
│  Merhaba, Ali!  [Çıkış]     │
│                             │
│  ┌──────────┐ ┌──────────┐ │
│  │ ODA      │ │ KOD İLE  │ │
│  │ OLUŞTUR  │ │ KATIL    │ │
│  └──────────┘ └──────────┘ │
│  Şifre (ops): [________]    │
│  Katılma kodu: [______]     │
└─────────────────────────────┘
```

### Lobby Ekranı

```
┌─────────────────────────────┐
│  Oda Kodu: A4KQ9Z  [Kopyala]│
│  ┌─────────────────────┐    │
│  │ ● Ali  (kırmızı) 👑 │    │  ← host (👑)
│  │   ✓ Hazır            │    │
│  │ ● Ayşe (mavi)        │    │
│  │   ⏳ Bekliyor         │    │
│  └─────────────────────┘    │
│  Renk: [🔴🔵🟢🩷🟠🟡...]    │  ← 12 renk butonu
│  [Hazır Değil] [Çıkış]      │
│  (host görür) [BAŞLAT]      │
└─────────────────────────────┘
```

### Stil (Among Us Tarzı)

- Koyu arka plan (uzay teması)
- Parlak renkli oyuncu kartları
- Büyük, kalın fontlar
- Renk butonları yuvarlak avatar şeklinde

---

## 7. Dosya Yapısı

### Server Yeni Dosyalar

```
packages/server/src/
├── sockets/
│   ├── index.ts          # Socket.io server kurulumu + auth middleware
│   └── lobbyHandlers.ts  # lobby:* event handler'ları
├── lobby/
│   ├── manager.ts        # LobbyManager sınıfı (in-memory)
│   ├── types.ts          # Lobby, LobbyPlayer tipleri
│   └── codes.ts          # generateLobbyCode()
└── config/
    └── env.ts            # (mevcut, güncelleme yok)
```

### Client Yeni Dosyalar

```
packages/client/
├── index.html            # Vite entry HTML
├── vite.config.ts        # Dev proxy config
├── package.json          # vite, socket.io-client, tslib
├── tsconfig.json
├── public/
│   └── styles.css        # Among Us tarzı stiller
└── src/
    ├── main.ts           # Vite entry (app.ts'i başlatır)
    ├── app.ts            # Ekran yöneticisi (show/hide screens)
    ├── screens/
    │   ├── login.ts      # Login/register ekranı logic
    │   ├── menu.ts       # Ana menü logic
    │   └── lobby.ts      # Lobby ekranı logic (Socket event'leri)
    ├── network/
    │   ├── api.ts        # fetch wrapper (auth API çağrıları)
    │   └── socket.ts     # Socket.io client singleton
    └── types.ts          # LobbyState, event tipleri (shared'den import)
```

### Shared Güncellemesi

```
packages/shared/src/
├── types.ts              # LobbyState, LobbyPlayer event tipleri ekle
├── constants.ts          # LOBBY_COLORS, MIN_PLAYERS, MAX_PLAYERS ekle
└── validation.ts         # lobby join/create şemaları ekle
```

---

## 8. Test Stratejisi

### Unit Test'leri (Vitest)

**LobbyManager** (`tests/lobby.manager.test.ts`):
- Oda oluşturma → kod benzersiz, host doğru
- Katılma → oyuncu eklenir, broadcast tetiklenir
- Renk çakışması → hata döner
- Host ayrıl → transfer doğru kişiye
- Son kişi ayrıl → oda silinir
- Dolu oda → hata
- Yanlış şifre → hata
- Start (host değil) → hata
- Start (yetersiz oyuncu) → hata

### Integration Test'leri (Vitest + socket.io-client)

**Socket event akışı** (`tests/lobby.socket.test.ts`):
- 2 istemci bağlanır, biri oda oluşturur, diğeri kodla katılır
- Her ikisi de `lobby:updated` alır
- Renk değişimi → her ikisi görür
- Hazır olma → her ikisi görür
- Bağlantı kopması → diğerleri `lobby:updated` alır

**Auth gate** (`tests/socket.auth.test.ts`):
- Geçersiz JWT → `connect_error`
- Geçersiz JWT → bağlantı başarılı

### Test Veri İhtiyaçları

- Çalışan PostgreSQL (integration test'leri kullanıcı oluşturur)
- socket.io-client paketi

---

## 9. Deployment Değişiklikleri

### Dockerfile Güncellemesi (Multi-stage'e client build eklenir)

```dockerfile
# Yeni stage: client build
FROM node:24-alpine AS client-builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/client/package.json ./packages/client/
COPY packages/shared/package.json ./packages/shared/
RUN npm install
COPY packages/client ./packages/client
COPY packages/shared ./packages/shared
RUN npm run build --workspace @amongus/client

# Runner stage'e ekle:
COPY --from=client-builder /app/packages/client/dist ./packages/client/dist
```

### Express Statik Serve (Production)

```typescript
// packages/server/src/app.ts
import path from "node:path";

if (env.isProd) {
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  // SPA fallback (tüm route'lar index.html'e)
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(clientDist, "index.html"));
    }
  });
}
```

### package.json Script'leri

```json
// packages/client/package.json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

## 10. Sub-project 2 Tamamlama Kriterleri

- [ ] Socket.io server Express'e entegre, JWT auth middleware çalışıyor
- [ ] Geçersiz JWT ile socket bağlantısı reddediliyor
- [ ] `lobby:create` → 6 haneli benzersiz kod üretiliyor
- [ ] `lobby:join` → kod ile katılma çalışıyor
- [ ] `lobby:leave` → ayrılma + host transfer
- [ ] `lobby:setColor` → renk çakışması kontrolü
- [ ] `lobby:toggleReady` → hazır durumu
- [ ] `lobby:start` → sadece host, min 4 oyuncu kontrolü
- [ ] Bağlantı kopması → oyuncu lobiden çıkıyor
- [ ] Login + Menu + Lobby ekranları HTML/CSS ile çalışıyor
- [ ] Realtime güncelleme: bir oyuncu değişiklik yapınca herkes görüyor
- [ ] LobbyManager unit test'leri (9+ senaryo) yeşil
- [ ] Socket integration test'leri (2 istemci) yeşil
- [ ] `docker compose up` ile tam sistem ayağa kalkıyor (client + server + db)

---

## 11. Sub-project 3'e Köprü

Bu sub-project tamamlandığında:
- Lobi `status: "STARTING"`'e geçince `lobby:started` event'i `{ code: string }` ile emit edilir (lobi kodu)
- Sub-project 3 (Oyun Çekirdeği) bu event'i dinler, oyun motorunu başlatır
- Roller dağıtılır, harita yüklenir, hareket başlar
- **Not:** `matchId` / DB'de Match kaydı bu sub-project'te oluşturulmaz — Sub-project 3'te oyun başlarken Prisma Match kaydı oluşturulacak. Bu sub-project sadece lobi `status`'unu `STARTING`'e çevirir ve `lobby:started` emit eder.
