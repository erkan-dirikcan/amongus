# Sub-project 3: Oyun Çekirdeği — Tasarım Dokümanı

**Tarih:** 2026-07-06
**Durum:** Tasarımda (kullanıcı onayı bekleniyor)
**Amaç:** Lobiden "BAŞLAT" ile çıkıp haritada yürünen, rollerin dağıtıldığı, sunucu otoriteri realtime hareket içeren oyun çekirdeği. Görev/kill/meeting Sub-project 4'te gelecek.

---

## 1. Hedefler ve Kapsam

### Hedefler
- Lobi "BAŞLAT" → Match DB kaydı + rol dağıtımı + oyun başlangıcı
- Tiled tilemap formatında harita (8 oda + koridorlar)
- Sunucu otoriteri hareket (20Hz tick, çarpışma kontrolü)
- WASD input → server → otoriter pozisyon → client interpolasyon
- Phaser GameScene (karakter sprite'ları, kamera takip, zoom)
- Her oyuncu sadece kendi rolünü bilir (Impostor/Crew gizli)

### Kapsam Dışı (YAGNI — Sub-project 4+)
- Görevler (wire, card swipe vb.)
- Kill mekanikleri
- Meeting & voting
- Sabotaj
- Vent sistemi
- Kazanma koşulları (oyun başlar ama bitmez — Sub-project 4'te)
- Impostor'un diğer rolleri görmesi (bu sub-project'te herkes herkesi görür, rol gizli)

---

## 2. Oyun Akışı & Rol Dağılımı

### Başlangıç Akışı

```
Host "BAŞLAT" basar
  → server: lobby:start
  → LobbyManager.startLobby() (status: STARTING)
  → Yeni GameEngine.Match oluştur:
      - matchId = cuid()
      - DB'ye Match kaydı (status: IN_PROGRESS)
      - Tüm oyuncular için spawn pozisyonu (cafeteria merkez)
      - Rolleri dağıt (Fisher-Yates)
  → Her socket'e game:started emit (kendi rolü ile)
  → Client: Phaser GameScene başlat
  → 20Hz tick döngüsü başla
```

### Rol Dağılımı

| Oyuncu sayısı | Impostor | Crewmate |
|---------------|----------|----------|
| 4-5 | 1 | 3-4 |
| 6-7 | 2 | 4-5 |
| 8-10 | 2-3 | 5-8 |

Dağıtım algoritması:
1. Tüm oyuncuları array'e al
2. Fisher-Yates shuffle
3. İlk N tanesi Impostor (N = tabloya göre), kalanı Crew
4. Her oyuncuya SADECE kendi rolü gönderilir

### Spawn Pozisyonu

Tüm oyuncular Cafeteria merkezinde spawn olur, küçük bir daire içinde dağıtılır:

```typescript
const SPAWN_CENTER = { x: 25, y: 25 }; // tile koordinatları
function getSpawnPosition(index: number, total: number) {
  const angle = (index / total) * Math.PI * 2;
  const radius = 2;
  return {
    x: SPAWN_CENTER.x + Math.cos(angle) * radius,
    y: SPAWN_CENTER.y + Math.sin(angle) * radius,
  };
}
```

---

## 3. Veri Modeli (DB Güncellemesi)

### Prisma Schema'ya Eklenecek Modeller

```prisma
model Match {
  id        String   @id @default(cuid())
  code      String   // lobby code
  status    MatchStatus @default(IN_PROGRESS)
  hostId    String
  createdAt DateTime @default(now())
  endedAt   DateTime?
  winner    Team?
  players   MatchPlayer[]
}

model MatchPlayer {
  id        String  @id @default(cuid())
  match     Match   @relation(fields: [matchId], references: [id])
  matchId   String
  user      User    @relation(fields: [userId], references: [id])
  userId    String
  role      Role?
  isAlive   Boolean @default(true)
  color     String

  @@unique([matchId, userId])
}

enum MatchStatus { LOBBY IN_PROGRESS ENDED }
enum Role        { IMPOSTOR CREW }
enum Team        { CREW IMPOSTOR }
```

### In-Memory GameState

```typescript
interface GameState {
  matchId: string;
  code: string;
  status: "IN_PROGRESS" | "ENDED";
  players: Map<string, GamePlayer>; // userId → player
  tickRate: number;                 // 20
  lastTick: number;
  tickInterval: NodeJS.Timeout;
}

interface GamePlayer {
  userId: string;
  username: string;
  color: string;
  role: "IMPOSTOR" | "CREW";
  isAlive: boolean;
  x: number;          // tile koordinatı (float)
  y: number;
  inputDx: number;    // istemci input (-1, 0, 1, veya 0.707)
  inputDy: number;
  facing: "up" | "down" | "left" | "right";
  lastInputSeq: number;
  socketId: string;
}
```

---

## 4. GameEngine (Server, Otoriter)

### Sabitler

```typescript
const PLAYER_SPEED = 3.0;              // tile/saniye
const TICK_RATE_HZ = 20;
const TICK_INTERVAL_MS = 1000 / 20;    // 50ms
const DIAGONAL_FACTOR = 1 / Math.sqrt(2); // ~0.707
const TILE_SIZE = 32;                  // piksel
const PLAYER_HITBOX = 20;              // piksel (tile'dan küçük)
```

### Tick Döngüsü (20Hz)

```
her 50ms:
  for each active game:
    const delta = TICK_INTERVAL_MS / 1000; // 0.05sn
    for each player:
      1. dx, dy = player.inputDx, inputDy
      2. normalize diagonal (zaten client normalize ediyor, ama server da teyit eder)
      3. newX = x + dx * PLAYER_SPEED * delta
      4. newY = y + dy * PLAYER_SPEED * delta
      5. collision check (wall layer tile'ları)
      6. geçerliyse x, y güncelle
      7. facing güncelle (dx, dy'ye göre)
    broadcast game:tick:
      players: [{userId, x, y, facing, isAlive}]
```

### Çarpışma Sistemi

Tilemap'in **wall layer**'ında çarpışma. Server harita verisini bir **2D boolean grid** olarak tutar (wallGrid[x][y] = true/false):

```typescript
function isWall(wallGrid: boolean[][], tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0) return true;
  if (tileX >= wallGrid.length || tileY >= wallGrid[0].length) return true;
  return wallGrid[tileX][tileY];
}

function canMoveTo(wallGrid, newX, newY): boolean {
  // oyuncunun hitbox'ından etkilenen tile'ları kontrol et
  const halfBox = PLAYER_HITBOX / TILE_SIZE / 2;
  const corners = [
    [newX - halfBox, newY - halfBox],
    [newX + halfBox, newY - halfBox],
    [newX - halfBox, newY + halfBox],
    [newX + halfBox, newY + halfBox],
  ];
  return corners.every(([cx, cy]) => !isWall(wallGrid, Math.floor(cx), Math.floor(cy)));
}
```

### Yeni Socket Event'leri

**Client → Server:**

| Event | Payload | Açıklama |
|-------|---------|----------|
| `game:input` | `{ dx: number, dy: number, seq: number }` | WASD input (normalize edilmiş) |

**Server → Client:**

| Event | Payload | Açıklama |
|-------|---------|----------|
| `game:started` | `GameStartedPayload` | Oyun başlangıcı (sadece kendi rolün) |
| `game:tick` | `{ players: TickPlayer[] }` | 20Hz pozisyon güncellemesi |
| `game:ended` | `{ winner: "CREW" \| "IMPOSTOR" }` | Oyun bitti (Sub-project 4+ için, bu sub-project'te tetiklenmez) |

### Payload Tipleri

```typescript
interface GameStartedPayload {
  matchId: string;
  role: "IMPOSTOR" | "CREW";
  players: {
    userId: string;
    username: string;
    color: string;
  }[];                          // roller YOK (gizli)
  spawn: { x: number; y: number };
}

interface TickPlayer {
  userId: string;
  x: number;
  y: number;
  facing: "up" | "down" | "left" | "right";
  isAlive: boolean;
}
```

---

## 5. Tilemap (Tiled Format, Programmatic)

### Tilemap Yapısı

Tiled editor'ın JSON export formatı. 3 layer:

| Layer | Tile Anlamı | Çarpışma |
|-------|-------------|----------|
| **Ground** | Zemin (koridor, oda zemini) | Hayır |
| **Walls** | Duvar | **Evet** |
| **Objects** | Mobilyalar, görev noktaları | Decorative |

### Tile Tanımları

- Tile boyutu: **32×32 piksel**
- Harita boyutu: **50×50 tile** (1600×1600 piksel)
- Tile ID'leri:
  - `0` = boş (görünmez)
  - `1` = koyu gri duvar (çarpışma)
  - `2` = açık gri zemin (koridor)
  - `3` = mavi zemin (oda zemini)
  - `4` = sarı zemin (spawn bölgesi, cafeteria)

### Harita Planı (50×50 grid)

8 oda + koridorlar:

```
            [SECURITY]
[NAVI]   [CAFETERIA]   [WEAPONS]
            (spawn)
[O2]     [CORRIDORS]   [ADMIN]
            
[REACTOR]               [STORAGE]
[ELECTRICAL]
```

Her oda yaklaşık 8×6 tile, duvarlarla çevrili, kapı boşlukları ile koridorlara bağlı.

### Programmatic Harita Üretimi

Elle Tiled editor'da çizmek yerine, bir Node script'i JSON üretir:

```typescript
// scripts/generate-map.mjs
// - 50×50 grid oluştur
// - Duvar çerçevesi (kenarlar)
// - Her oda için: dikdörtgen duvar + zemin doldur
// - Kapı boşlukları (duvarlarda 2-tile boşluk)
// - Koridorları bağla
// - Tiled JSON formatında export
```

Bu script'in çıktısı `packages/client/public/assets/map.json`.

### Tileset Görseli

Basit bir programmatic tileset PNG (4 tile):
- Tile 0: şeffaf
- Tile 1: koyu gri (#333) — duvar
- Tile 2: açık gri (#666) — zemin
- Tile 3: mavi (#3a5a8c) — oda zemini
- Tile 4: sarı (#c9a227) — spawn

Script ile `tileset.png` üretilir (her tile 32×32).

---

## 6. Phaser Client (GameScene)

### Dosya Yapısı (Client Yeni)

```
packages/client/src/
├── phaser/
│   ├── main.ts            # Phaser.Game config + başlatma
│   ├── config.ts          # Sabitler (TILE_SIZE, vb.)
│   └── scenes/
│       ├── BootScene.ts   # Asset preload
│       └── GameScene.ts   # Ana oyun sahnesi
├── screens/
│   └── game.ts            # game:started → Phaser başlat
```

### Phaser.Config

```typescript
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container", // <div id="game-container"> in index.html
  width: 800,
  height: 600,
  physics: { default: "arcade", arcade: { gravity: { y: 0 } } },
  scene: [BootScene, GameScene],
  pixelArt: true,           // crisp pixels
  render: { pixelArt: true },
};
```

### GameScene — init()

```typescript
init(data: GameStartedPayload) {
  this.matchId = data.matchId;
  this.myRole = data.role;
  this.players = data.players;
  this.mySpawn = data.spawn;
  this.myUserId = this.getMyUserId(); // from /api/auth/me
}
```

### GameScene — preload()

```typescript
preload() {
  this.load.image("tileset", "/assets/tileset.png");
  this.load.tilemapTiledJSON("map", "/assets/map.json");
  this.load.spritesheet("player", "/assets/player.png", {
    frameWidth: 32,
    frameHeight: 32,
  });
}
```

### GameScene — create()

```typescript
create() {
  // 1. Tilemap oluştur
  const map = this.make.tilemap({ key: "map" });
  const tileset = map.addTilesetImage("tileset", "tileset");
  const groundLayer = map.createLayer("Ground", tileset, 0, 0);
  const wallLayer = map.createLayer("Walls", tileset, 0, 0);
  // (Objects layer decorative, atlanabilir)

  // 2. Tüm oyuncu sprite'larını oluştur
  for (const p of this.players) {
    const sprite = this.add.sprite(p.x * 32, p.y * 32, "player");
    sprite.tint = colorToHex(p.color); // lobby rengini uygula
    this.playerSprites[p.userId] = sprite;
  }

  // 3. Kendi oyuncum
  this.myPlayer = this.playerSprites[this.myUserId];

  // 4. İsim etiketleri
  for (const p of this.players) {
    const text = this.add.text(..., p.username, { fontSize: "10px" });
    text.setOrigin(0.5);
    // sprite'a attach et
  }

  // 5. Kamera
  this.cameras.main.startFollow(this.myPlayer, true);
  this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
  this.cameras.main.setZoom(2);

  // 6. Input
  this.cursors = this.input.keyboard.createCursorKeys();
  this.wasd = this.input.keyboard.addKeys("W,A,S,D");

  // 7. Socket listener
  this.socket.on("game:tick", (data) => this.onTick(data));
}
```

### GameScene — update()

```typescript
update(time: number, delta: number) {
  // 1. Input oku
  let dx = 0, dy = 0;
  if (this.wasd.W.isDown || this.cursors.up.isDown) dy -= 1;
  if (this.wasd.S.isDown || this.cursors.down.isDown) dy += 1;
  if (this.wasd.A.isDown || this.cursors.left.isDown) dx -= 1;
  if (this.wasd.D.isDown || this.cursors.right.isDown) dx += 1;

  // 2. Normalize diagonal
  if (dx !== 0 && dy !== 0) {
    dx *= DIAGONAL_FACTOR;
    dy *= DIAGONAL_FACTOR;
  }

  // 3. Sunucuya gönder (throttle 50ms)
  if (time - this.lastInputSent > 50) {
    if (dx !== this.lastDx || dy !== this.lastDy) { // sadece değiştiyse
      this.socket.emit("game:input", { dx, dy, seq: ++this.seqCounter });
    }
    this.lastInputSent = time;
    this.lastDx = dx;
    this.lastDy = dy;
  }

  // 4. Diğer oyuncuları interpolasyonla güncelle
  for (const [userId, sprite] of Object.entries(this.playerSprites)) {
    if (userId === this.myUserId) continue;
    if (sprite.targetX !== undefined) {
      sprite.x = Phaser.Math.Linear(sprite.x, sprite.targetX, 0.3);
      sprite.y = Phaser.Math.Linear(sprite.y, sprite.targetY, 0.3);
    }
  }

  // 5. Animasyon güncelle (walk/idle, yön)
  this.updateAnimation(dx, dy);
}
```

### onTick()

```typescript
onTick(data: { players: TickPlayer[] }) {
  for (const p of data.players) {
    const sprite = this.playerSprites[p.userId];
    if (!sprite) continue;
    if (p.userId === this.myUserId) {
      // Kendi pozisyonumuz: server otoriter, ama küçük fark varsa düzelt
      const serverX = p.x * TILE_SIZE;
      const serverY = p.y * TILE_SIZE;
      const dx = Math.abs(serverX - sprite.x);
      const dy = Math.abs(serverY - sprite.y);
      if (dx > 5 || dy > 5) {
        // Büyük sapma → snap to server
        sprite.x = serverX;
        sprite.y = serverY;
      }
      // küçük sapma → yoksay (akıcılık için)
    } else {
      // Başka oyuncu → hedef pozisyonu sakla, update()'te lerp
      sprite.targetX = p.x * TILE_SIZE;
      sprite.targetY = p.y * TILE_SIZE;
      sprite.targetFacing = p.facing;
      sprite.visible = p.isAlive;
    }
  }
}
```

### Animasyon

Sprite sheet: 4 yön × 2 frame (idle, walk) = 8 frame.

```
Frame layout (player.png, 32×32 per frame):
  Row 0: down (idle 0, walk 1)
  Row 1: up (idle 2, walk 3)
  Row 2: left (idle 4, walk 5)
  Row 3: right (idle 6, walk 7)
```

```typescript
create() {
  // Animasyonları tanımla
  this.anims.create({ key: "walk-down", frames: this.anims.generateFrameNumbers("player", { frames: [0, 1] }), frameRate: 8, repeat: -1 });
  this.anims.create({ key: "idle-down", frames: [{ key: "player", frame: 0 }] });
  // ... up, left, right için aynı
}

updateAnimation(dx, dy) {
  let anim = "idle";
  let direction = this.currentFacing;
  if (Math.abs(dy) > Math.abs(dx)) {
    direction = dy < 0 ? "up" : "down";
  } else if (dx !== 0) {
    direction = dx < 0 ? "left" : "right";
  }
  const moving = dx !== 0 || dy !== 0;
  anim = `${moving ? "walk" : "idle"}-${direction}`;
  if (this.myPlayer.anims.currentAnim?.key !== anim) {
    this.myPlayer.play(anim);
  }
}
```

### Karakter Sprite Üretimi

`player.png` programmatic olarak üretilir (basit "bean" şekli):
- 32×32 canvas, 8 frame
- Beyaz oval gövde (bean shape)
- Göz (küçük koyu şekil, yöne göre konum değişir)
- Şeffaf arka plan
- Phaser'da `sprite.tint` ile renk uygulanır

Script: `scripts/generate-player-sprite.mjs` (canvas npm paketi ile).

---

## 7. Screen Geçişi (Lobby → Game)

Client `screens/game.ts`:

```typescript
import { startPhaserGame } from "../phaser/main.js";

export function initGameScreen(): void {
  const socket = getSocket();

  socket.on("game:started", (payload: GameStartedPayload) => {
    // Lobby ekranını gizle
    showScreen("game");
    // Phaser'ı başlat
    startPhaserGame(payload);
  });

  socket.on("game:ended", (payload) => {
    // TODO (Sub-project 4+): sonuç ekranı
    stopPhaserGame();
    showScreen("menu");
  });
}
```

`index.html`'e yeni bir `<section id="game-screen">` eklenir:

```html
<section id="game-screen" class="screen" hidden>
  <div id="game-container"></div>
  <div class="role-badge" id="my-role"></div>
</section>
```

---

## 8. Sabitler & Tipler (Shared Güncellemesi)

`packages/shared/src/constants.ts`'ye ekle:

```typescript
// ─── Game constants ────────────────────────────────────────────────────
export const PLAYER_SPEED = 3.0;              // tiles per second
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ; // 50ms
export const DIAGONAL_FACTOR = 1 / Math.sqrt(2);
export const TILE_SIZE = 32;                  // pixels
export const PLAYER_HITBOX = 20;              // pixels

// ─── Role distribution ─────────────────────────────────────────────────
export function getImpostorCount(playerCount: number): number {
  if (playerCount <= 5) return 1;
  if (playerCount <= 7) return 2;
  return Math.min(3, Math.floor(playerCount / 3));
}
```

`packages/shared/src/types.ts`'ye ekle:

```typescript
// ─── Game types ────────────────────────────────────────────────────────
export type PlayerRole = "IMPOSTOR" | "CREW";
export type PlayerFacing = "up" | "down" | "left" | "right";

export interface GameStartedPlayer {
  userId: string;
  username: string;
  color: string;
}

export interface GameStartedPayload {
  matchId: string;
  role: PlayerRole;
  players: GameStartedPlayer[];
  spawn: { x: number; y: number };
}

export interface TickPlayer {
  userId: string;
  x: number;
  y: number;
  facing: PlayerFacing;
  isAlive: boolean;
}

export interface GameTickPayload {
  players: TickPlayer[];
}

export interface GameEndedPayload {
  winner: "CREW" | "IMPOSTOR";
}

export const GAME_EVENTS = {
  INPUT: "game:input",
  STARTED: "game:started",
  TICK: "game:tick",
  ENDED: "game:ended",
} as const;

export interface GameInputPayload {
  dx: number;
  dy: number;
  seq: number;
}
```

---

## 9. Test Stratejisi

### Unit Test'leri

**GameEngine** (`tests/game.engine.test.ts`):
- Match oluştur → GameState doğru
- Rol dağılımı: sayılar tabloya uygun
- Hareket: input → pozisyon değişimi (speed × delta)
- Çarpışma: duvara doğru hareket reddedilir
- Diagonal normalize: çapraz hız == yatay hız
- Facing: yöne göre doğru değer
- Tick broadcast: doğru payload

**Rol dağılımı** (`tests/game.roles.test.ts`):
- 4 oyuncu → 1 impostor
- 6 oyuncu → 2 impostor
- 10 oyuncu → 3 impostor
- Dağılım rastgele (aynı input → farklı sonuç, ama sayı doğru)

**Harita üretimi** (`tests/map.generate.test.ts`):
- 50×50 grid boyutu doğru
- Kenarlar duvar
- Her oda var (içinde zemin tile)
- Kapı boşlukları (duvarlarda geçiş var)

### Integration Test'leri

**Socket game akışı** (`tests/game.socket.test.ts`):
- 4 client bağlan, lobby oluştur + katıl, start
- Her biri game:started alır (kendi rolü ile)
- game:input gönderir, game:tick alır
- Pozisyon değişimi görünür

---

## 10. Dosya Yapısı Özeti

### Server Yeni

```
packages/server/src/
├── game/
│   ├── engine.ts          # GameEngine class (tick loop, hareket, çarpışma)
│   ├── roles.ts           # dağıtRoller() + getImpostorCount
│   ├── types.ts           # GameState, GamePlayer (server-internal)
│   └── map.ts             # wallGrid (harita çarpışma verisi)
├── sockets/
│   └── gameHandlers.ts    # game:input handler, game:started/tick emit
└── prisma/
    └── schema.prisma      # +Match, +MatchPlayer modelleri

packages/server/scripts/
└── generate-map-data.mjs  # map.json + wallGrid üretimi
```

### Client Yeni

```
packages/client/src/
├── phaser/
│   ├── main.ts            # Phaser.Game config + start/stop
│   ├── config.ts          # TILE_SIZE vb. sabitler
│   └── scenes/
│       ├── BootScene.ts   # preload assets
│       └── GameScene.ts   # ana sahne
├── screens/
│   └── game.ts            # game:started → Phaser başlat
└── public/assets/
    ├── map.json           # Tiled format harita (generate-map script çıktısı)
    ├── tileset.png        # 4-tile tileset (generate script çıktısı)
    └── player.png         # 8-frame karakter spritesheet (generate script çıktısı)
```

### Shared Güncellemesi

```
packages/shared/src/
├── constants.ts           # +PLAYER_SPEED, TICK_RATE, getImpostorCount
└── types.ts               # +GameStartedPayload, TickPlayer, GAME_EVENTS
```

---

## 11. Sub-project 3 Tamamlama Kriterleri

- [ ] Prisma: Match + MatchPlayer modelleri + migration
- [ ] Rol dağılımı (getImpostorCount + Fisher-Yates, test'lerle)
- [ ] GameEngine sınıfı (tick loop, hareket, çarpışma)
- [ ] Harita verisi üretimi (map.json + wallGrid, programmatic)
- [ ] Tileset + player sprite PNG üretimi (programmatic)
- [ ] Socket: game:started, game:input, game:tick event'leri
- [ ] Phaser GameScene (preload, create, update)
- [ ] WASD input → server → otoriter pozisyon → tick broadcast
- [ ] Diğer oyuncular interpolasyonla akıcı render
- [ ] Karakter animasyonu (4 yön, walk/idle, tint)
- [ ] Kamera takip + zoom
- [ ] Lobby → game ekranı geçişi
- [ ] Tüm unit + integration testler yeşil
- [ ] Manuel E2E: 2+ tarayıcıda haritada yürüme

---

## 12. Sub-project 4'e Köprü

Bu sub-project tamamlandığında:
- Oyuncular haritada yürür, birbirlerini görür
- Roller dağıtılmış ama henüz bir anlamı yok (kill/görev yok)
- `game:ended` event'i tanımlı ama tetiklenmez (Sub-project 4'te kazanma koşulları eklenecek)
- Sub-project 4: Görevler + Kill + Meeting + Kazanma koşulları → ilk TAM oynanabilir versiyon
