# Sub-project 4A: Görevler + Kill — Tasarım Dokümanı

**Tarih:** 2026-07-06
**Durum:** Tasarımda (kullanıcı onayı bekleniyor)
**Amaç:** Crewmate görevleri (2 mini-oyun), Impostor kill mekanikleri, ceset/hayalet sistemi, ve iki kazanma koşulu. Bu, Sub-project 3'teki hareket+harita üzerine "rol kullanma" deneyimini ekler. Meeting/voting Sub-project 4B'de gelecek.

---

## 1. Hedefler ve Kapsam

### Hedefler
- 2 görev türü: Wire (kablo eşleştirme), Download (progress bar)
- Görev noktaları haritada (E ile etkileşim → mini-oyun overlay)
- Impostor kill mekanikleri (cooldown, mesafe, ceset, hayalet)
- Ceset rapor placeholder'ı ("Meeting yakında — Sub-project 4B")
- İki kazanma koşulu (görevler biter / sayı eşitlenir)
- Görev progress bar (tüm oyunculara broadcast)

### Kapsam Dışı (YAGNI)
- Meeting & voting (Sub-project 4B)
- Oyuncu atma/ejection
- Chat sistemi
- Sabotaj (Sub-project 5)
- Vent sistemi (Sub-project 5)
- Ek görev türleri (Card Swipe, Asteroids vb. — sonra eklenebilir)
- İlk kill gecikmesi (10sn) — bu versiyonda kill cooldown baştan 30sn

---

## 2. Görev Sistemi

### Görev Dağılımı

Oyun başlarken her crewmate'e görev atanır:
- Görev sayısı: `crewmate_count × 2` toplam (her crewmate'e 2 görev)
- Görevler haritadaki görev noktalarına yerleştirilir
- Her görev bir crewmate'e atanır (sadece o tamamlayabilir)

### Görev Noktaları (Harita)

Map'te belirli tile'lar görev olarak işaretlenir (Sub-project 3'teki harita generator güncellenecek):

```
Electrical → Wire görevi (2 nokta, tile ~8,30)
Storage → Download görevi (2 nokta, tile ~8,20)
Cafeteria → Wire görevi (1 nokta, tile ~25,22)
Admin → Download görevi (1 nokta, tile ~25,42)
```

Görev tile'ları haritada küçük bir ikon/sprite ile gösterilir (renkli kare).

### Görev Türleri

#### Wire (Kablo Eşleştirme)

HTML overlay mini-oyunu:
```
┌─────────────────────────────┐
│  KABLOLARI BAĞLA            │
│                             │
│  🔴 ───────────── [    ]    │  ← solda 4 renkli kablo
│  🔵 ───────────── [    ]    │  ← sağda 4 karışık yuva
│  🟢 ───────────── [    ]    │  ← sürükle-bırak veya tıkla-eşle
│  🟡 ───────────── [    ]    │
│                             │
│  [Kapat]                    │
└─────────────────────────────┘
```

Mantık: 4 renkli kablo, sağda 4 karışık yuva. Her kablo doğru renkli yuvaya tıklanınca bağlanır. Tümü bağlanınca görev biter.

#### Download (Progress Bar)

HTML overlay mini-oyunu:
```
┌─────────────────────────────┐
│  VERİ İNDİR                 │
│                             │
│  [████████████░░░░░] 70%    │  ← 3 saniye dolar
│                             │
│  [İptal]                    │
└─────────────────────────────┘
```

Mantık: "İndirmeye Başla" butonuna basınca progress bar 3 saniyede dolar. Dolduğunda görev biter. İptal ederse sıfırlanır.

### Görev Tamamlama Akışı

```
1. Crewmate görev tile'ına yaklaşır (≤ 1.5 tile)
2. "E bas" prompt görünür (GameScene'de)
3. E'ye basınca → mini-oyun HTML overlay açılır
4. Mini-oyun tamamlanınca → socket.emit("game:taskComplete", { taskId })
5. Server doğrular:
   - Oyuncu gerçekten crewmate mi?
   - Görev bu oyuncuya atanmış mı?
   - Görev zaten tamamlanmamış mı?
   - Oyuncu görev tile'ına yakın mı? (server-authoritative mesafe kontrolü)
6. Server: task.completed = true, taskProgress.completed++
7. Broadcast game:taskUpdate → tüm oyuncular progress bar görür
8. Tüm görevler bitti → checkWinConditions → CREW wins
```

---

## 3. Kill Mekaniği

### Kill Kuralları

- Sadece **Impostor** kill yapabilir (server doğrular)
- **Cooldown:** 30 saniye (oyun başında 30sn dolmadan kill yapılamaz)
- **Mesafe:** 1.5 tile (Impostor hedefe yakın olmalı)
- Hedef: en yakın **canlı Crewmate** (kendine kill yapamaz)
- Kill sonrası: hedef ölür, ceset oluşur

### Kill Akışı

```
1. Impostor bir crewmate'e 1.5 tile içinde yaklaşır
2. Client: en yakın canlı crewmate'i bulur, "Kill" butonu aktif
3. Kill butonuna basınca → socket.emit("game:kill")
4. Server doğrular:
   - İstek sahibi impostor mu?
   - Cooldown doldu mu?
   - Yakında canlı crewmate var mı? (≤ 1.5 tile)
5. Server: victim.isAlive = false, corpse oluştur
6. Server: impostor'a cooldown başlat (30sn)
7. Broadcast game:playerKilled { victimId, x, y } → tüm oyuncular
8. Victim client: hayalet moduna geç (sprite görünmez)
```

### Kill UI

```
Impostor ekranı (sağ alt):
┌──────────────┐
│  🔪 KILL     │  ← kırmızı buton, aktif
│  (1.2 tile)  │  ← hedef mesafesi gösterilir
└──────────────┘

Cooldown'dayken:
┌──────────────┐
│  ⏳ 18sn     │  ← gri buton, geri sayım
└──────────────┘
```

### Ceset Sistemi

```
Kill yapılınca:
1. victim.isAlive = false
2. Ceset: { id, victimId, x, y } gameState.corpses'a eklenir
3. Ceset haritada yatan karakter sprite'ı olarak görünür
4. Ceset tüm oyunculara görünür (hayatta + hayalet)
5. Ceset silinmez (report olmadığı için — Sub-project 4B'de meeting'den sonra temizlenir)
```

### Hayalet Modu

Ölen oyuncu hayalet olur:
- Haritada yürüyebilir (hareket hala çalışır)
- Görev yapabilir (crewmate hayaletleri)
- Ama hayattakiler onu **görmez** (sprite.visible = false)
- Diğer hayaletleri görür
- Kill yapamaz (hayaletse)

### Ceset Raporu (Placeholder)

```
Hayatta bir oyuncu cesede yaklaşırsa (≤ 1.5 tile):
→ "Report" butonu aktif
→ Tıklayınca → socket.emit("game:report", { corpseId })
→ Server: cesedi işaretler, "Meeting yakında (Sub-project 4B)" mesajı emit eder
→ Oyun devam eder (henüz meeting yok)
```

---

## 4. Kazanma Koşulları

### İki Koşul

```typescript
checkWinConditions(state: GameState): "CREW" | "IMPOSTOR" | null {
  // Crew wins: all tasks completed
  if (state.taskProgress.completed >= state.taskProgress.total) {
    return "CREW";
  }
  
  // Impostor wins: alive crew ≤ alive impostors
  const aliveCrew = [...state.players.values()]
    .filter(p => p.role === "CREW" && p.isAlive).length;
  const aliveImpostors = [...state.players.values()]
    .filter(p => p.role === "IMPOSTOR" && p.isAlive).length;
  
  if (aliveImpostors === 0) {
    return "CREW"; // all impostors dead (via future ejection)
  }
  if (aliveCrew <= aliveImpostors) {
    return "IMPOSTOR";
  }
  
  return null; // game continues
}
```

### Kontrol Noktaları

Kazanma kontrolü şu olaylardan sonra yapılır:
- Görev tamamlandıktan sonra
- Kill yapıldıktan sonra
- (Sub-project 4B'de: oyuncu atıldıktan sonra)

### Oyun Bitişi

```
Kazanan belirlenince:
1. gameState.status = "ENDED"
2. DB: Match kaydını güncelle (endedAt, winner)
3. UserStats güncelle (her oyuncu için win/loss)
4. Broadcast game:ended { winner: "CREW" | "IMPOSTOR" }
5. Client: bitiş ekranı göster
6. GameEngine.removeMatch(matchId) — temizlik
7. 10 saniye sonra client'ları lobby'ye döndür
```

---

## 5. Socket Events

### Yeni Client → Server Event'leri

| Event | Payload | Doğrulama |
|-------|---------|-----------|
| `game:taskComplete` | `{ taskId: string }` | Crewmate mi? Atandı mı? Yakında mı? Bitmemiş mi? |
| `game:kill` | `{}` | Impostor mu? Cooldown? Yakın crewmate? |
| `game:report` | `{ corpseId: string }` | Hayatta mı? Ceset yakın mı? |

### Yeni Server → Client Event'leri

| Event | Payload | Açıklama |
|-------|---------|----------|
| `game:tasksAssigned` | `{ tasks: TaskClient[], total: number }` | Oyun başında görev listesi |
| `game:taskUpdate` | `{ completed: number, total: number }` | Progress bar güncelle |
| `game:playerKilled` | `{ victimId: string, x: number, y: number }` | Bir oyuncu öldü |
| `game:killResult` | `{ success: boolean, cooldownUntil: number }` | Kill denemesi sonucu |
| `game:corpseAdded` | `{ corpseId: string, x: number, y: number, victimColor: string }` | Ceset haritada |
| `game:reportResult` | `{ success: boolean, message: string }` | Rapor sonucu (placeholder) |

### Payload Tipleri

```typescript
interface TaskClient {
  id: string;
  type: "wire" | "download";
  room: string;
  x: number;
  y: number;
  completed: boolean;
}
```

---

## 6. Veri Modeli Değişiklikleri

### GameEngine'e Eklemeler

```typescript
interface GameState {
  // ... existing (matchId, code, status, players, tickRate, createdAt)
  tasks: Map<string, Task>;        // taskId → Task
  taskProgress: { total: number; completed: number };
  corpses: Corpse[];               // ceset listesi
}

interface Task {
  id: string;
  type: "wire" | "download";
  room: string;
  x: number;                        // tile koordinatı
  y: number;
  assignedTo: string;              // userId (sadece bu tamamlayabilir)
  completed: boolean;
}

interface Corpse {
  id: string;
  victimId: string;
  victimColor: string;
  x: number;
  y: number;
}

// GamePlayer'a ek:
interface GamePlayer {
  // ... existing
  killCooldownUntil: number;       // timestamp, 0 = ready
}
```

### Görev Noktaları (Harita Generator Güncellemesi)

`generate-map.mjs` güncellenecek — haritaya görev tile'ları eklenecek:
- Tile ID 5 = Wire görev noktası
- Tile ID 6 = Download görev noktası

Bu tile'lar bir "Objects" layer'a konur (çarpışma yok, decorative+marker).

---

## 7. Client UI Eklemeleri

### Phaser GameScene Güncellemeleri

```
- Görev noktası sprite'ları (haritada küçük ikonlar)
- Ceset sprite'ları (yatan karakter, kırmızı işaret)
- Etkileşim prompt ("E bas")
- Kill butonu (sadece Impostor, HTML overlay)
- Görev progress bar (üstte, HTML)
- Hayalet görünürlük kontrolü
```

### HTML Overlay'lar

Yeni HTML element'leri `index.html`'de:

```html
<!-- Görev progress bar (oyun ekranında üstte) -->
<div id="task-progress" class="task-progress" hidden>
  Görevler: <span id="task-completed">0</span>/<span id="task-total">0</span>
</div>

<!-- Kill butonu (sağ altta, sadece Impostor) -->
<button id="kill-btn" class="kill-btn" hidden>🔪 KILL</button>

<!-- Report butonu (ceset yakınında) -->
<button id="report-btn" class="report-btn" hidden>📢 RAPORLA</button>

<!-- Etkileşim prompt -->
<div id="interact-prompt" class="interact-prompt" hidden>E bas</div>

<!-- Mini-oyun overlay (Wire / Download) -->
<div id="minigame-overlay" class="minigame-overlay" hidden>
  <div id="minigame-content"></div>
</div>

<!-- Oyun bitişi ekranı -->
<div id="game-over" class="game-over" hidden>
  <h1 id="winner-text"></h1>
  <button id="back-to-lobby">Lobiye Dön</button>
</div>
```

### Mini-oyun JS (Wire)

```typescript
// wire minigame: 4 kablo, 4 yuva, tıkla-eşle
function openWireMinigame(taskId: string) {
  const colors = ["red", "blue", "green", "yellow"];
  const shuffled = [...colors].sort(() => Math.random() - 0.5);
  // Render 4 kablo (sol) ve 4 yuva (sağ, karışık)
  // Tıkla-eşle mantığı
  // Tümü eşleşince → socket.emit("game:taskComplete", { taskId })
  // → overlay kapat
}
```

### Mini-oyun JS (Download)

```typescript
// download minigame: progress bar 3 saniye
function openDownloadMinigame(taskId: string) {
  // "Başlat" butonu → setInterval 100ms, progress %3.3 artar
  // 100% olunca → socket.emit("game:taskComplete", { taskId })
  // → overlay kapat
  // "İptal" → sıfırla
}
```

---

## 8. Dosya Yapısı

### Server Yeni/Değişen

```
packages/server/src/game/
├── engine.ts          # MODIFY: +tasks, +corpses, +kill, +checkWin
├── types.ts           # MODIFY: +Task, +Corpse, +killCooldownUntil
├── tasks.ts           # NEW: createTasks(), assignTasks(), görev noktaları
└── mapData.ts         # REGENERATE: +task tile'ları

packages/server/src/sockets/
└── gameHandlers.ts    # MODIFY: +taskComplete, +kill, +report handlers

packages/server/scripts/
└── generate-map.mjs   # MODIFY: +Objects layer (task tile'ları)
```

### Client Yeni/Değişen

```
packages/client/src/
├── phaser/scenes/
│   └── GameScene.ts   # MODIFY: +task sprites, +corpses, +kill btn, +prompt
├── screens/
│   └── game.ts        # MODIFY: +new event listeners, +minigame dispatch
├── minigames/
│   ├── wire.ts        # NEW: Wire mini-oyun mantığı
│   └── download.ts    # NEW: Download mini-oyun mantığı
└── types.ts           # MODIFY: +TaskClient, +corpse types

packages/client/public/styles.css  # MODIFY: +kill btn, +progress bar, +minigame, +overlay styles
packages/client/index.html         # MODIFY: +overlay elements
```

### Shared Güncellemesi

```
packages/shared/src/
├── constants.ts       # +KILL_COOLDOWN_MS, KILL_DISTANCE, TASK_DISTANCE, TASK_TYPES
└── types.ts           # +TaskClient, +new event payloads
```

---

## 9. Test Stratejisi

### Unit Test'leri

**TaskAssignment** (`tests/game.tasks.test.ts`):
- Görev sayısı doğru (crewmate × 2)
- Görevler doğru oyunculara atanır
- Görev noktaları haritada (geçerli tile)

**Kill Logic** (`tests/game.kill.test.ts`):
- Impostor kill yapabilir
- Crewmate kill yapamaz (error)
- Cooldown aktifken kill reddedilir
- Mesafe > 1.5 tile → reddedilir
- Hedef canlı olmalı

**Win Conditions** (`tests/game.win.test.ts`):
- Tüm görevler → CREW wins
- Crew ≤ Impostor → IMPOSTOR wins
- Normal durum → null (devam)

### Integration

**Full game flow** (`tests/game.flow.test.ts`):
- Oyun başlar → görevler atanır
- Bir görev tamamlanır → progress güncellenir
- Kill yapılır → ceset oluşur, victim hayalet
- Tüm görevler → CREW wins → game:ended

---

## 10. Sub-project 4A Tamamlama Kriterleri

- [ ] Görev noktaları haritada (map generator güncellendi)
- [ ] Görev atama (createTasks, crewmate'lere dağıtım)
- [ ] Wire mini-oyunu (HTML overlay, tıkla-eşle)
- [ ] Download mini-oyunu (HTML overlay, progress bar)
- [ ] Görev tamamlama akışı (server doğrulama + broadcast)
- [ ] Görev progress bar (üstte, tüm oyunculara)
- [ ] Kill mekanikleri (cooldown, mesafe, rol kontrolü)
- [ ] Ceset sistemi (oluşma, haritada görünme)
- [ ] Hayalet modu (ölen oyuncu görünmez, yürüyebilir)
- [ ] Kill butonu (sadece Impostor, cooldown görsel)
- [ ] Ceset rapor placeholder'ı
- [ ] Kazanma koşulları (her iki koşul)
- [ ] Oyun bitişi ekranı (winner display)
- [ ] GameEngine cleanup (removeMatch oyun bitince)
- [ ] Tüm testler yeşil
- [ ] Manuel E2E: kill + görev tamamlama testi

---

## 11. Sub-project 4B'ye Köprü

Bu sub-project tamamlandığında:
- Görevler + kill + ceset/hayalet çalışır
- İki kazanma koşulu aktif
- Ama meeting/voting yok → ceset raporu placeholder
- Sub-project 4B: Meeting & Voting & Ejection
  - Emergency button
  - Meeting ekranı (tartışma + chat)
  - Oylama (skip + her oyuncu)
  - Atılma (rol açıklanır, hayalet olur)
  - Sabotaj tetikli meeting'ler (Sub-project 5)
