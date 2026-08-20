# Sub-project 6: Monitörler + Yeni Görevler + Ses + İstatistik — Tasarım Dokümanı

**Tarih:** 2026-08-20
**Durum:** Tasarımda (kullanıcı onayı bekleniyor)
**Amaç:** Oyun sonrası deneyimi derinleştirmek: gözetim araçları (Security cams, Admin table, Vitals), yeni görev türleri (card swipe, asteroids, fuel, Medbay scan), Web Audio ses/müzik sistemi ve istatistik sayfası.

---

## 1. Hedefler ve Kapsam

### Hedefler
- **Gözetim araçları**: Crewmate'lerin bilgi toplaması için 3 monitör (kameralar, admin table, vitals)
- **Yeni görevler**: 4 yeni mini-oyun; görev havuzu 2 → 6 tip
- **Medbay odası**: Haritaya yeni oda + görsel görev (Medbay scan)
- **Ses & müzik**: Web Audio API ile sentezlenmiş sesler (asset dosyası yok, telif yok)
- **İstatistik sayfası**: DB'de hazır UserStats verisi için API + UI (profil + leaderboard)

### Kapsam Dışı (YAGNI)
- Gerçek video/kamera render'ı (Phaser viewport klonlama) — oda kartı listesi yeterli
- Kamera kullanımda kırmızı ışık ikonu
- Match history sayfası (son maçlar listesi) — ileride
- Özel roller (Detective/Jester), reconnect — ilerideki sub-project'ler
- Ses dosyası indirme (mp3/ogg) — sentez kullanıyoruz
- Mobil dokunmatik kontroller

---

## 2. Gözetim Araçları (Monitörler)

### Genel Mekanik
- 3 sabit monitör noktası haritada interact tile'ı olarak durur
- Yaklaşınca "E - İncele" prompt, E ile panel açılır
- **Comms sabotajı aktifken tüm monitörler "SIGNAL LOST" gösterir**
- Panel açıkken istemci 1sn'de bir sorgular (polling — sunucuda state tutulmaz)

### Security Cameras
- **Monitör konumu:** Cafeteria (25, 20) — merkezi ve herkesin uğradığı yer
- 4 kamera noktası: Navigation, Weapons, Storage, Reactor
- Panel: her kamera için oda kartı → odadaki oyuncuların renk + isim listesi
- Vent'teki oyuncular kameralarda görünmez
- Cesetler kamerada görünür (bkz. korku anı)

### Admin Table
- **Monitör konumu:** Admin odası (25, 44) — mevcut download görevinin yanında
- Panel: oda başına **canlı oyuncu sayısı** (Among Us mantığı)
- Sayım: diri + oyunda olanlar; **vent'tekiler sayılmaz**, cesetler sayılır
- Oda isimleri ile sayı listesi (isim gösterilmez — sadece sayı)

### Vitals
- **Monitör konumu:** Medbay (yeni oda, bkz. §3)
- Panel: her oyuncunun adı + durumu (✅ Yaşıyor / 💀 Ölü / ⚠️ Ölü — XX sn önce)
- Ghost'lar vitals'ta görünmez

### Akış
```
1. Oyuncu monitör tile'ına yaklaşır (≤ 1.5 tile)
2. "E - İncele" prompt → E → panel UI açılır
3. Client: socket.emit("game:monitorQuery", { type: "cameras" })
4. Server: snapshot üretir → callback "game:monitorResult" ile döner
5. Panel açıkken client her 1000ms'de tekrarlar (setInterval)
6. Panel kapanınca interval temizlenir
7. Comms aktifse server { error: "comms" } döner → UI "📡 SIGNAL LOST"
```

---

## 3. Medbay Odası + Yeni Görevler

### Medbay Odası (harita değişikliği)
- `scripts/generate-map.mjs`'e yeni oda: **medbay** — Cafeteria'nın üstü (x: 20-30, y: 12-18 bölgesi)
- Grid yeniden üretilir (`MAP_WIDTH/HEIGHT` değişmez: 50×50)
- İçinde: Medbay scan görev noktası + Vitals monitörü

### Yeni Görev Türleri

| Tür | Oda | Mekanik | Süre |
|-----|-----|---------|------|
| **cardSwipe** | Admin | Kartı sürükle — çok hızlı/yavaş = hata, "BAD READ" | ~5sn |
| **asteroids** | Weapons | Tıkla-yok et, 20 asteroid (canvas) | ~15sn |
| **fuel** | Storage | Basılı tut, depo doldur (2 kez) | ~8sn |
| **medbayScan** | Medbay | **Görsel görev**: 15sn tarama, bekleme | 15sn |

### Görsel Görev (Medbay Scan)
- Tarama sırasında oyuncunun üstünde yeşil halka + "DOĞRULANIYOR" animasyonu
- Aynı odadaki diğer oyuncular animasyonu görür → crewmate masumiyet kanıtı
- Server `task.isVisual = true` flag'i taşır; scan başlayınca broadcast `game:visualTaskStarted`
- Impostor'a scan görevi **atanmaz** (görev dağıtımı zaten role göre)

### Görev Dağıtımı Güncellemesi
- `TASK_LOCATIONS` yeniden düzenlenir: mevcut 10 nokta + yeni 6 nokta
- Türler karıştırılır; aynı oyuncuya aynı tip 2'den fazla düşmez (mümkün olduğunca)

---

## 4. Ses & Müzik (Web Audio)

### Yaklaşım
- `AudioContext` + osilatör/noise sentezi — **asset dosyası yok**
- Ses açılınca ilk kullanıcı etkileşiminde context resume (browser policy)
- Master mute toggle: HUD'da 🔊/🔇 butonu, `localStorage`'da kalıcı

### Ses Listesi

| Ses | Tetik | Sentez |
|-----|-------|--------|
| Kill | Impostor kill yaptığında | Düşük frekans thud (sine 80Hz decay) |
| Emergency alarm | Meeting başlarken | İki tonlu siren (880/660 alternating) |
| Report | Ceset bildirimi | Kısa yükselen sweep |
| Task complete | Görev bitince | Ding (sine 1318Hz kısa) |
| Sabotage alarm | Sabotaj başlarken | Düşük pulsating alarm |
| Vent | Vent giriş/çıkış | Noise burst filtreli |
| Eject | Oyuncu atılınca | Şşş (white noise fade) |
| Victory / Defeat | Oyun sonu | Major/minor akor |
| UI click | Buton tıklamaları | Kısa tick |

### Müzik
- Oyun sırasında **hafif ambient drone** (düşük gain, iki detune osilatör + LFO)
- Meeting sırasında hafif tempo artışı (LFO hızı x2)
- Menüde kapalı (sesless başlangıç — kullanıcı tercihi)

---

## 5. İstatistik Sayfası

### API
| Endpoint | Açıklama |
|----------|----------|
| `GET /api/stats/me` | Kendi UserStats (gamesPlayed, wins, losses, tasksCompleted, winRate hesaplanır) |
| `GET /api/stats/leaderboard?limit=20` | En çok kazanan 20 oyuncu (wins DESC, winRate ikincil) |

### UI
- Menüde yeni "📊 İstatistikler" butonu → tam ekran panel
- Üstte kendi kartı: oynanan / kazanılan / kaybedilen / kazanma % / toplam görev
- Altında leaderboard tablosu: sıra, kullanıcı adı, W/L, kazanma %
- Auth middleware ile korunur (JWT)

---

## 6. Veri Modeli

### GameEngine / Shared

```typescript
// shared/src/constants.ts
export const TASK_TYPES = ["wire", "download", "cardSwipe", "asteroids", "fuel", "medbayScan"] as const;
export const MONITOR_TYPES = ["cameras", "admin", "vitals"] as const;
export const MONITOR_QUERY_INTERVAL_MS = 1000;

export const CAMERA_ROOMS = ["navigation", "weapons", "storage", "reactor"];
export const MONITOR_POSITIONS = [
  { id: "monitor-cameras", type: "cameras", room: "cafeteria", x: 25, y: 20 },
  { id: "monitor-admin",   type: "admin",   room: "admin",     x: 25, y: 44 },
  { id: "monitor-vitals",  type: "vitals",  room: "medbay",    x: 27, y: 15 },
];

// Task'e:
interface Task {
  // ... existing
  isVisual?: boolean;  // medbayScan için
}
```

### Prisma
Değişiklik yok — `UserStats`, `Match`, `MatchPlayer` zaten yeterli.

---

## 7. Socket Events

### Client → Server
| Event | Payload | Açıklama |
|-------|---------|----------|
| `game:monitorQuery` | `{ type: "cameras"\|"admin"\|"vitals" }` | Monitör snapshot iste (polling) |

### Server → Client
| Event | Payload | Açıklama |
|-------|---------|----------|
| `game:monitorResult` | `{ type, data \| error }` | Snapshot veya comms hatası |
| `game:visualTaskStarted` | `{ userId, x, y, taskType }` | Görsel görev animasyonu (aynı odaya) |

### Mevcut eventler etkilenmez
`game:taskComplete` aynen kalır; yeni görev tipleri sadece client mini-oyun farkı.

---

## 8. Client UI

### Monitör Paneli (overlay)
```
┌───────── SECURITY CAMERAS ─────────┐
│ [Navigation]  🔴 •mavi •kırmızı     │
│ [Weapons]     (boş)                 │
│ [Storage]     💀 ceset •yeşil       │
│ [Reactor]     •sarı                 │
└─────────────────────────────────────┘
```

### Admin Table Paneli
```
┌───────── ADMIN TABLE ─────────┐
│ Cafeteria: 3    Electrical: 1 │
│ Storage: 2      Reactor: 0    │
│ Navigation: 1   Weapons: 0    │
│ O2: 0           Admin: 1      │
│ Medbay: 2                      │
└───────────────────────────────┘
```

### Vitals Paneli
```
┌───────── VITALS ─────────┐
│ Ali     ✅               │
│ Veli    💀 (12sn)        │
│ Ayşe    ✅               │
└──────────────────────────┘
```

### HUD Ses Butonu
- Sağ üst köşe: 🔊/🔇 toggle

---

## 9. Test Stratejisi

- **Monitörler**: comms aktifken hata; vent'teki oyuncu sayılmaz/görünmez; ölü vitals'ta doğru; admin sayımı doğru (vent hariç, ceset dahil)
- **Görevler**: yeni tipler dağıtımda çıkıyor; aynı oyuncuya max 2 aynı tip; medbayScan sadece crewmate'e; isVisual broadcast sadece aynı odakilere
- **Ses**: pure client — test yok, smoke ile doğrulanır
- **İstatistik**: API auth korumalı; leaderboard sıralaması; winRate hesabı
- Harita: Medbay eklenince duvar/collision testleri güncellenir (game.map.test.ts)

---

## 10. Dosya Yapısı

```
packages/shared/src/
├── constants.ts        # MODIFY: +TASK_TYPES, +MONITORS, +CAMERA_ROOMS
└── types.ts            # MODIFY: +MonitorPayload, +isVisual

packages/server/src/
├── game/
│   ├── tasks.ts        # MODIFY: +TASK_LOCATIONS, dağıtım çeşitliliği
│   ├── monitors.ts     # NEW: snapshot üretimi (cameras/admin/vitals)
│   ├── engine.ts       # MODIFY: +visual task broadcast
│   └── mapData.ts      # REGEN: +medbay odası
├── sockets/gameHandlers.ts  # MODIFY: +monitorQuery handler
├── stats/routes.ts     # NEW: /api/stats/me, /api/stats/leaderboard
└── scripts/generate-map.mjs  # MODIFY: +medbay

packages/client/src/
├── audio/
│   ├── synth.ts        # NEW: Web Audio ses fabrikası
│   └── manager.ts      # NEW: play(name), mute toggle, müzik loop
├── minigames/
│   ├── cardswipe.ts    # NEW
│   ├── asteroids.ts    # NEW
│   ├── fuel.ts         # NEW
│   └── medbayscan.ts   # NEW
├── screens/
│   ├── game.ts         # MODIFY: +monitör panelleri, +ses butonu
│   └── stats.ts        # NEW: istatistik ekranı
├── phaser/scenes/GameScene.ts  # MODIFY: +monitör interact, +scan animasyonu
└── app.ts              # MODIFY: +stats route ekranı
```

---

## 11. Tamamlama Kriterleri

- [ ] 3 monitör çalışıyor (cameras/admin/vitals) + comms kilidi
- [ ] Medbay odası haritada, collision testleri yeşil
- [ ] 4 yeni mini-oyun oynanabilir
- [ ] Medbay scan görsel görev animasyonu diğerlerine görünüyor
- [ ] 9+ ses tetikleyicisi çalışıyor + mute kalıcı
- [ ] Ambient müzik oyun içinde, meeting'de tempo artışı
- [ ] /api/stats/me + leaderboard + istatistik ekranı
- [ ] Tüm testler yeşil
- [ ] Tag sub-project-6-complete
