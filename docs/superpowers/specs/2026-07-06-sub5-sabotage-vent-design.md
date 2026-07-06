# Sub-project 5: Sabotage + Vent — Tasarım Dokümanı

**Tarih:** 2026-07-06
**Durum:** Otonom mod (tüm kararlar geliştirici tarafından alındı)
**Amaç:** Sabotaj sistemleri (Lights, Comms, Reactor, O2) ve vent (havalandırma) sistemi ekleyerek Among Us deneyimini eksiksiz hale getirmek. Bu, projenin **son sub-project'i**.

---

## 1. Hedefler ve Kapsam

### Hedefler
- **Vent sistemi**: Impostor vent'e girer/çıkar, vent ağında gezinir, görünmez olur
- **Lights sabotajı**: Crewmate görüş alanı yarıya iner, repairing task ile düzeltilir
- **Comms sabotajı**: Görev listesi gizlenir, repairing task ile düzeltilir
- **Reactor sabotajı**: 30sn içinde 2 kişi butona basmazsa Impostor kazanır
- **O2 sabotajı**: 30sn içinde kod girilmezse Impostor kazanır
- Sabotaj cooldown: 30sn

### Kapsam Dışı (YAGNI)
- Ek sabotaj türleri
- Security cameras (Admin table zaten yok, bu da sonra)
- Vent动画 efektileri

---

## 2. Vent Sistemi

### Mekanik
- Sadece Impostor kullanabilir (server doğrular)
- Haritada vent noktaları (her odada 1-2 tane)
- Vent'e gir → görünmez ol → hareket serbest (vent ağında) → başka vent'ten çık
- Vent'teyken: kill yapılamaz, görev yapılamaz, görülemez

### Vent Noktaları
```
Electrical: (8, 31)
Cafeteria: (24, 24)
Reactor: (9, 42)
O2: (37, 42)
Navigation: (40, 30)
Security: (24, 18) — eğer varsa
```

### Vent Ağı
Tüm vent'ler birbirine bağlı (basit: herhangi bir vent'ten herhangi birine geçebilir). Among Us'da bölgere bölünmüş ama basit tutuyoruz.

### Akış
```
1. Impostor vent tile'ına yaklaşır (≤ 1.5 tile)
2. "E ile vent'e gir" prompt
3. E'ye basınca → socket.emit("game:ventEnter")
4. Server: doğrula (impostor mu? yakında mı?)
5. player.inVent = true → tick'te görünmez render
6. Client: vent menüsü açılır (diğer vent noktaları listesi)
7. Oyuncu bir vent seçer → socket.emit("game:ventMove", { targetVentId })
8. Server: pozisyonu taşı, doğrula
9. Oyuncu vent'ten çıkmak ister → socket.emit("game:ventExit")
10. player.inVent = false → tekrar görünür
```

---

## 3. Sabotaj Sistemi

### Sabotaj Türleri

| Tür | Etki | Süre | Çözüm |
|-----|------|------|-------|
| **Lights** | Crewmate görüş alanı yarıya iner | Süresiz | Electrical'de switch repairing task |
| **Comms** | Görev listesi gizlenir | Süresiz | Admin'de number kodu gir |
| **Reactor** | 30sn içinde 2 kişi buton basmazsa Impostor kazanır | 30sn | Reactor'da 2 buton (2 oyuncu) |
| **O2** | 30sn içinde kod girilmezse Impostor kazanır | 30sn | Admin + O2'de kod panel |

### Sabotaj Cooldown
- Impostor her 30sn'de bir sabotaj yapabilir
- Aynı anda sadece 1 sabotaj aktif olabilir
- Sabotaj aktifken emergency button kullanılamaz

### Lights Sabotajı
```
Impostor → "Lights" sabotaj butonu (UI)
Server: gameState.sabotage = { type: "lights", active: true }
Broadcast → tüm crewmate'lerin görüş alanı yarıya iner (client zoom/visibility değişir)
Repair: Electrical'de bir switch task (tıkla-aç) → sabotage kapanır
```

### Comms Sabotajı
```
Impostor → "Comms" sabotaj butonu
Server: sabotage = { type: "comms", active: true }
Broadcast → görev listesi gizlenir, harita kapanır (client UI)
Repair: Admin'de number kodu gir (4 hane, rastgele) → sabotage kapanır
```

### Reactor Meltdown
```
Impostor → "Reactor" sabotaj butonu
Server: sabotage = { type: "reactor", active: true, expiresAt: now + 30sn }
Broadcast → uyarı: "REACTOR MELTDOWN"
Repair: Reactor'da 2 buton, 2 farklı oyuncu basmalı (holding pattern)
30sn dolunca → Impostor wins
```

### O2 Leak
```
Impostor → "O2" sabotaj butonu
Server: sabotage = { type: "o2", active: true, expiresAt: now + 30sn }
Broadcast → uyarı: "O2 SİLİNDİRİ"
Repair: Admin'de 4 haneli kod + O2'de 4 haneli kod (2 oyuncu)
30sn dolunca → Impostor wins
```

---

## 4. Veri Modeli

### GameEngine'e Eklemeler

```typescript
interface GameState {
  // ... existing
  sabotage: SabotageState | null;
  sabotageCooldownUntil: number;  // impostor cooldown
  ventPositions: { id: string; x: number; y: number; room: string }[];
}

interface SabotageState {
  type: "lights" | "comms" | "reactor" | "o2";
  active: boolean;
  startedAt: number;
  expiresAt?: number;  // reactor/o2 için
  holders: Set<string>; // reactor: butona basan oyuncular
}

// GamePlayer'a:
interface GamePlayer {
  // ... existing
  inVent: boolean;
}
```

### Vent Noktaları
```typescript
const VENT_POSITIONS = [
  { id: "vent-electrical", x: 8, y: 31, room: "electrical" },
  { id: "vent-cafeteria", x: 24, y: 24, room: "cafeteria" },
  { id: "vent-reactor", x: 9, y: 42, room: "reactor" },
  { id: "vent-o2", x: 37, y: 42, room: "o2" },
  { id: "vent-navigation", x: 40, y: 30, room: "navigation" },
];
```

---

## 5. Socket Events

### Client → Server

| Event | Payload | Açıklama |
|-------|---------|----------|
| `game:ventEnter` | `{ ventId }` | Vent'e gir |
| `game:ventMove` | `{ targetVentId }` | Vent ağında gez |
| `game:ventExit` | `{}` | Vent'ten çık |
| `game:sabotage` | `{ type }` | Sabotaj başlat (impostor) |
| `game:repairLights` | `{}` | Lights repairing (switch) |
| `game:repairComms` | `{ code }` | Comms kod gir |
| `game:reactorHold` | `{}` | Reactor buton bas |
| `game:o2Code` | `{ code, location }` | O2 kod gir |

### Server → Client

| Event | Payload | Açıklama |
|-------|---------|----------|
| `game:ventState` | `{ inVent, ventId? }` | Vent durumu değişti |
| `game:ventMenu` | `{ vents: [...] }` | Vent seçim menüsü |
| `game:sabotageStarted` | `{ type, expiresAt? }` | Sabotaj başladı |
| `game:sabotageFixed` | `{ type }` | Sabotaj düzeltildi |
| `game:sabotageCooldown` | `{ until }` | Impostor cooldown |
| `game:lightsEffect` | `{ active }` | Crewmate görüş efekti |

---

## 6. Client UI

### Impostor Sabotaj Paneli
```
Sağ altta (kill butonunun yanında):
┌──────────────┐
│  ⚡ SABOTAGE │  → tıklayınca açılır menü
└──────────────┘
Açılan menü:
┌──────────────────┐
│  💡 Lights       │
│  📡 Comms        │
│  ☢️ Reactor      │
│  🫧 O2           │
└──────────────────┘
```

### Vent Menüsü
```
Vent'e girince:
┌──────────────────┐
│  VENT SEÇ        │
│  • Electrical    │
│  • Cafeteria     │
│  • Reactor       │
│  • O2            │
│  • Navigation    │
│  [Çık]           │
└──────────────────┘
```

### Lights Efekti
- Crewmate görüş: kamera zoom 2x → 1x (yakınlaşır), viewport küçülür
- Phaser: `cameras.main.setZoom(1)` lights aktifken

### Comms Efekti
- Görev listesi gizlenir (task progress bar görünmez)
- Oyuncu isimleri gizlenir

---

## 7. Test Stratejisi

- Vent: enter/exit/move doğrulama (impostor mu? yakında mı?)
- Sabotaj: cooldown, aynı anda 1, role kontrolü
- Reactor/O2: timeout → Impostor win
- Repair: lights/comms düzeltme

---

## 8. Dosya Yapısı

```
packages/server/src/game/
├── engine.ts          # MODIFY: +vent, +sabotage methods
├── types.ts           # MODIFY: +SabotageState, +inVent
├── vents.ts           # NEW: VENT_POSITIONS
└── sabotage.ts        # NEW: sabotage helpers

packages/server/src/sockets/
└── gameHandlers.ts    # MODIFY: +vent/sabotage handlers

packages/client/src/
├── phaser/scenes/GameScene.ts  # MODIFY: +vent, +lights effect
├── screens/game.ts   # MODIFY: +sabotage/vent listeners
└── minigames/
    ├── lights.ts      # NEW: switch repair minigame
    ├── comms.ts       # NEW: code entry minigame
    ├── reactor.ts     # NEW: hold button minigame
    └── o2.ts          # NEW: code entry minigame
```

---

## 9. Tamamlama Kriterleri

- [ ] Vent sistemi (enter/move/exit, sadece impostor)
- [ ] Lights sabotajı (view daralma + repair)
- [ ] Comms sabotajı (görev gizleme + repair)
- [ ] Reactor sabotajı (timeout + 2-buton repair)
- [ ] O2 sabotajı (timeout + kod repair)
- [ ] Sabotaj cooldown (30sn)
- [ ] Impostor sabotaj paneli
- [ ] Tüm testler yeşil
- [ ] Tag sub-project-5-complete
- [ ] Proje tamamlandı!
