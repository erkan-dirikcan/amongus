# Among Us Klonu — Tasarım Dokümanı

**Tarih:** 2026-07-05
**Durum:** Tasarımda (kullanıcı onayı bekleniyor)
**Amaç:** Arkadaşlar arasında oynanmak üzere, Linux sunucuda Docker Compose ile deploy edilebilen, kullanıcı yönetimi bulunan web tabanlı bir Among Us klonu.

---

## 1. Hedefler ve Kapsam

### Hedefler
- Web tarayıcıda oynanabilir (indirme yok)
- Gerçek zamanlı, çok oyunculu (4-10 oyuncu)
- Tam oyun deneyimi: roller, görevler, kill, meeting/voting, sabotaj, vent
- Kullanıcı hesabı sistemi (kayıt/giriş, istatistikler)
- Oda kodu ile gizli lobi sistemi
- Sunucu otoriteri mimari (hileye dayanıklı)
- Docker Compose ile tek komut deploy

### Kapsam Dışı (YAGNI)
- Sesli sohbet (WebRTC)
- Çoklu eşzamanlı haritalar (sadece tek harita)
- Özel rol türleri (Detective, Jester vb.) — ileride eklenebilir
- Mobil native uygulama (responsive web yeterli)

---

## 2. Mimari & Teknoloji Yığını

### Genel Mimari

```
Tarayıcı (İstemci)
  ├── Phaser 3 (oyun render, top-down 2D)
  ├── Socket.io-client (realtime events)
  └── HTML/CSS (login, lobi, meeting ekranları)
        │
        │ WebSocket (WSS)
        ▼
Linux Sunucu (Docker)
  ├── Node.js + Express
  │     ├── Auth API (login/register, JWT)
  │     ├── Lobby Manager (oda yönetimi)
  │     └── Game Engine (otoriter oyun mantığı, 20Hz tick)
  └── PostgreSQL 16 (kalıcı veri)
```

### Teknoloji Seçimi

| Katman | Teknoloji | Gerekçe |
|--------|-----------|---------|
| Frontend render | Phaser 3 | Top-down 2D oyun, animasyon/efekt |
| Realtime | Socket.io | Oda yönetimi, fallback, kalıcı bağlantı |
| Backend | Express.js | Socket.io ile doğal entegrasyon |
| Auth | JWT (tek token, 7 gün) | Stateless, arkadaş-arası oyuna yeterli |
| Şifre hash | bcrypt (10 rounds) | Endüstri standardı |
| DB | PostgreSQL 16 | İlişkisel veri, istatistikler |
| ORM | Prisma | Tip güvenli, migration |
| Validasyon | Zod | API + event payload |
| Container | Docker Compose | Tek komut deploy |

### Gerçek Zamanlı Akış
1. Kullanıcı login → JWT alır (HttpOnly cookie)
2. Socket.io bağlantısı (JWT ile auth middleware)
3. Lobi oluştur/katıl → 6 haneli kod (örn. `A4KQ9Z`)
4. Host "Start" → sunucu rolleri dağıtır
5. Game Engine her tick (50ms) pozisyonları hesaplar, broadcast eder
6. İstemci input gönderir, render eder (interpolaron ile akıcılık)

---

## 3. Oyun Mekanikleri

### Roller ve Dağılım

| Oyuncu sayısı | Impostor | Crewmate |
|---------------|----------|----------|
| 4-5 | 1 | 3-4 |
| 6-7 | 2 | 4-5 |
| 8-10 | 2-3 | 5-8 |

Dağıtım: Oyun başlayınca Fisher-Yates karıştırması ile rastgele atanır. Her oyuncu sadece kendi rolünü öğrenir (gizli).

### Hareket ve Çarpışma
- Tilemap tabanlı harita, serbest 8 yönlü hareket (WASD)
- Sunucu otoriteri: istemci `{dx, dy}` normalize input gönderir
- Sunucu hız × delta-time ile pozisyonu günceller, çarpışma kontrolü yapar
- 20Hz (50ms) tick rate ile pozisyonlar broadcast edilir
- İstemci interpolaron ile akıcı render (gecikme telafisi)
- Çarpışma layer'ları: duvarlar, oda duvarları, masalar

### Görevler (Crewmate kazanma koşulu)

Toplam görev sayısı = `oyuncu_sayısı × 4`. Tüm görevler bitince Crewmate'ler kazanır.

Her görev bir mini-oyundur:

| Görev | Açıklama | Tahmini süre |
|-------|----------|------|
| Wire | Sağ-sol kablolardan eşleştir | ~5sn |
| Card Swipe | Doğru hızda kartı kaydır | ~5sn |
| Download/Upload | Progress bar bekle | ~10sn |
| Engine Align | Motor nozullarını hizala | ~5sn |
| Asteroids | 5 asteroit vur | ~10sn |
| Trash | Çöp boşalt (lever) | ~3sn |

### Kill Mekaniği (Impostor)
- Cooldown: 30 sn (ilk kill 10 sn gecikmeli başlar)
- Mesafe: 1.5 tile
- Aktifken en yakın Crewmate öldürülür
- Ölü oyuncu → hayalet modu (görev yapabilir, görünmez)
- Ceset yerde kalır → yakından geçince "Report" aktif

### Meeting & Voting
- Tetikleyiciler: ceset report, Emergency Button (her oyuncu 1 kez)
- Meeting başlayınca oyun durur, herkes meeting ekranına geçer
- Süre: 90 saniye tartışma + oy
- Chat: sadece hayattakiler yazabilir; ölüler emoji atabilir
- Oylama: Skip + her oyuncu adı. Çoğunluk = atılma; beraberlikte kimse atılmaz
- Atılan oyuncu: rolü açıklanır (Crew/Impostor), hayalet olur

### Sabotaj (Impostor)
- Cooldown: 30 sn
- **Reactor Meltdown**: 30 sn içinde 2 kişi butona basmazsa Impostor kazanır
- **O2 Leak**: 30 sn içinde kod girilmezse Impostor kazanır
- **Lights**: Crewmate görüş alanı yarıya iner
- **Comms**: Görev listesi gizlenir, harita kapanır
- Sabotaj aktifken Emergency Button kullanılamaz

### Vent (Havalandırma) Sistemi
- Sadece Impostor kullanabilir
- Her vent bir ağa bağlı (örn. A↔B↔C)
- Vent'e gir → görünmez ol → ağda gez → başka vent'ten çık
- Vent'teyken kill yapılamaz, görev yapılamaz

### Kazanma Koşulları

| Kazanan | Koşul |
|---------|-------|
| Crewmate | Tüm görevler biter VEYA tüm Impostor'lar atılır/öldürülür |
| Impostor | Crewmate sayısı ≤ Impostor sayısı VEYA kritik sabotaj başarılı |

---

## 4. Harita

İlk versiyon tek harita: **"The Skeld" tarzı** (basitleştirilmiş).

```
┌─────────────────────────────────────────────┐
│  CAFETERIA  │   WEAPONS    │  NAVIGATION    │
│  (merkez,   │              │                │
│   emerg.btn)│              │                │
├─────────────┼──────────────┼────────────────┤
│  STORAGE    │              │   O2           │
│  (download) │  CORRIDORS   │   (vent)       │
│             │  (vent ağı)  │                │
├─────────────┤              ├────────────────┤
│  ELECTRICAL │              │   REACTOR      │
│  (wire)     │              │   (sabotaj)    │
│  (vent)     │              │   (vent)       │
└─────────────┴──────────────┴────────────────┘
              ↑
       Admin (oyuncu sayısı tablosu)
       Security (kamera sistemi)
```

- 8 oda + koridorlar
- Önemli noktalar: Emergency Button (Cafeteria), Security (kamera), Admin (oyuncu sayısı tablosu)
- Vent bağlantıları Impostor'a taktik avantaj sağlar
- Tilemap **Tiled editor** formatında (.tmj) oluşturulup Phaser'a yüklenir

---

## 5. Veri Modeli & Kimlik Doğrulama

### Veritabanı Şeması (Prisma)

```prisma
model User {
  id            String   @id @default(cuid())
  username      String   @unique
  passwordHash  String
  createdAt     DateTime @default(now())
  matches       MatchPlayer[]
  stats         UserStats?
  hostedMatches Match[]   @relation("HostedMatches")
}

model UserStats {
  userId         String   @id
  user           User     @relation(fields: [userId], references: [id])
  gamesPlayed    Int      @default(0)
  wins           Int      @default(0)
  losses         Int      @default(0)
  impostorWins   Int      @default(0)
  crewmateWins   Int      @default(0)
  tasksCompleted Int      @default(0)
}

model Match {
  id        String     @id @default(cuid())
  code      String     @unique
  status    MatchStatus @default(LOBBY)
  hostId    String
  host      User       @relation("HostedMatches", fields: [hostId], references: [id])
  createdAt DateTime   @default(now())
  endedAt   DateTime?
  winner    Team?
  players   MatchPlayer[]
}

model MatchPlayer {
  id       String  @id @default(cuid())
  match    Match  @relation(fields: [matchId], references: [id])
  matchId  String
  user     User   @relation(fields: [userId], references: [id])
  userId   String
  role     Role?
  isAlive  Boolean @default(true)
  color    String

  @@unique([matchId, userId])
}

enum MatchStatus { LOBBY IN_PROGRESS ENDED }
enum Role        { IMPOSTOR CREW }
enum Team        { CREW IMPOSTOR }
```

### Kimlik Doğrulama Akışı

- **Kayıt:** `POST /api/auth/register {username, password}` → bcrypt hash → user oluşturulur → JWT
- **Giriş:** `POST /api/auth/login {username, password}` → bcrypt.compare → JWT
- **Socket bağlantısı:** `socket.handshake.auth = {token}` → Socket.io middleware JWT doğrular → reddedilirse `unauthorized` event
- **JWT:** `{userId, username}`, 7 gün geçerli, HttpOnly + Secure + SameSite=Strict cookie'de saklanır

### Güvenlik
- Şifre: bcrypt (10 rounds)
- JWT: HttpOnly cookie (XSS koruması)
- Rate limit: login/register 5 deney/dk
- Input validasyonu: Zod ile her API/event payload
- Lobby şifresi: opsiyonel (arkadaş dışında girişi engellemek için)

---

## 6. Deployment & Proje Yapısı

### Docker Compose

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: amongus
      POSTGRES_USER: amongus
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U amongus"]
      interval: 5s

  app:
    build: .
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://amongus:${DB_PASSWORD}@db:5432/amongus
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
    restart: unless-stopped

volumes:
  pgdata:
```

### Kurulum Adımları

```bash
git clone <repo>
cd amongus
cp .env.example .env  # JWT_SECRET, DB_PASSWORD belirle
docker compose up -d
# Tarayıcı: http://<sunucu-ip>:3000
```

### Proje Yapısı (Monorepo)

```
amongus/
├── docker-compose.yml
├── .env.example
├── README.md
├── packages/
│   ├── shared/              # Client+server ortak tipler
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   ├── constants.ts
│   │   │   └── validation.ts
│   │   └── package.json
│   ├── server/              # Node.js backend
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── auth/
│   │   │   ├── lobby/
│   │   │   ├── game/
│   │   │   │   ├── engine.ts
│   │   │   │   ├── roles.ts
│   │   │   │   ├── tasks.ts
│   │   │   │   ├── movement.ts
│   │   │   │   ├── meetings.ts
│   │   │   │   └── sabotage.ts
│   │   │   ├── db/
│   │   │   └── sockets/
│   │   ├── prisma/schema.prisma
│   │   └── package.json
│   └── client/              # Phaser + Web UI
│       ├── public/
│       │   ├── index.html
│       │   └── assets/
│       ├── src/
│       │   ├── scenes/
│       │   │   ├── LoginScene.ts
│       │   │   ├── LobbyScene.ts
│       │   │   ├── GameScene.ts
│       │   │   └── MeetingScene.ts
│       │   ├── network/
│       │   ├── ui/
│       │   └── main.ts
│       └── package.json
└── docs/superpowers/specs/
```

### Build Süreci
- **İstemci:** Vite ile build → `client/dist/`
- **Sunucu:** `tsx` (dev), `esbuild` (prod bundle)
- **Tek port:** 3000 (API + statik dosyalar + Socket.io)
- **Reverse proxy (opsiyonel):** Nginx + Let's Encrypt (HTTPS)

---

## 7. Başarı Kriterleri

- [ ] Kullanıcı kayıt/giriş yapabilir
- [ ] Oda oluşturabilir/katılabilir (kod ile)
- [ ] Oyun başlatılınca roller dağıtılır
- [ ] 20Hz tick ile akıcı hareket
- [ ] Görevler tamamlanabilir (en az 3 görev türü)
- [ ] Impostor kill yapabilir, vent kullanabilir
- [ ] Meeting başlatılabilir, oylama yapılabilir
- [ ] En az 2 sabotaj türü çalışır (lights, reactor)
- [ ] Kazanma koşulları doğru çalışır
- [ ] `docker compose up` ile tek komutta ayağa kalkar

---

## 8. Gelecek Çalışmalar (Kapsam Dışı)

- Sesli sohbet (WebRTC)
- Ek haritalar (MIRA HQ, Polus tarzı)
- Ek rol türleri (Detective, Jester, Engineer)
- Kozmetikler (şapka, evcil hayvan, renk)
- Eşzamanlı birden fazla oyun
- Replay sistemi
