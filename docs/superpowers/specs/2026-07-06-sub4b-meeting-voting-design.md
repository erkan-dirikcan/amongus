# Sub-project 4B: Meeting & Voting — Tasarım Dokümanı

**Tarih:** 2026-07-06
**Durum:** Otonom mod (tüm kararlar geliştirici tarafından alındı)
**Amaç:** Emergency button + ceset raporu → meeting ekranı → tartışma (chat) → oylama → atılma. Sub-project 4A'daki ceset rapor placeholder'ını gerçek meeting ile değiştirir. Bu, **tam oynanabilir Among Us deneyimini** tamamlar.

---

## 1. Hedefler ve Kapsam

### Hedefler
- Emergency button (Cafeteria, her oyuncu 1 kez)
- Ceset raporu → meeting başlatma (4A placeholder'ını değiştirir)
- Meeting ekranı: tartışma + chat + oylama
- Oylama: Skip + her oyuncu adı, çoğunluk = atılma
- Atılma: rol açıklanır, hayalet olur
- Kazanma kontrolü (atılma sonrası)
- Oyun durur meeting sırasında (hareket yok)

### Kapsam Dışı (YAGNI)
- Sabotaj tetikli meeting'ler (Sub-project 5)
- Sesli sohmet
- Emoji reaksiyonlar (ölüler için)
- Anonymize voting (gizli oy)

---

## 2. Meeting Akışı

### Tetikleyiciler

1. **Ceset raporu** (Sub-project 4A'daki report placeholder değiştirilir):
   - Oyuncu cesede yakın, report butonuna basar
   - Server: meeting başlat

2. **Emergency button** (Cafeteria):
   - Her oyuncu oyun başına 1 kez basabilir
   - Cafeteria merkez tile'ında olmalı
   - Buton basınca → meeting başlat

### Meeting Başlangıcı

```
report veya emergency → server:
1. gameState.status = "MEETING" (yeni durum)
2. Hareket durur (tick loop atlar)
3. Tüm oyunculara game:meetingStarted emit
4. Meeting verisi: { players, reason, duration }
5. 90 saniye süre başlar (tartışma + oy)
6. Süre dolunca veya herkes oy verince → sonuç
```

### Meeting Veri Yapısı

```typescript
interface MeetingState {
  matchId: string;
  reason: "report" | "emergency";
  reporterId: string;
  startedAt: number;
  durationMs: number;           // 90000 (90sn)
  votes: Map<string, string | "skip">;  // voterId → targetId | "skip"
  emergencyUsed: Set<string>;   // userId who used emergency button
}
```

---

## 3. Oylama Sistemi

### Oylama Kuralları

- Her **canlı** oyuncu 1 oy verir (veya skip)
- Ölü oyuncular oy veremez ama izler
- Oy değiştirilebilir (süre dolmadan)
- Süre dolunca otomatik sonuç

### Sonuç Hesaplama

```typescript
function tallyVotes(votes: Map<string, string | "skip">): { ejected: string | null; wasTie: boolean } {
  const counts = new Map<string, number>();
  for (const target of votes.values()) {
    counts.set(target, (counts.get(target) || 0) + 1);
  }
  
  let maxVotes = 0;
  let winners: string[] = [];
  for (const [target, count] of counts) {
    if (count > maxVotes) {
      maxVotes = count;
      winners = [target];
    } else if (count === maxVotes) {
      winners.push(target);
    }
  }
  
  if (winners.length === 1 && winners[0] !== "skip") {
    return { ejected: winners[0], wasTie: false };
  }
  // Tie or skip won → nobody ejected
  return { ejected: null, wasTie: winners.length > 1 };
}
```

### Atılma (Ejection)

```
Sonuç belirlenince:
1. Eğer ejected != null:
   - Oyuncu atılır (isAlive = false, hayalet)
   - Rolü tüm oyunculara açıklanır
   - game:ejectionResult emit { ejectedId, role, wasTie }
2. Eğer null (tie/skip):
   - "Kimse atılmadı" mesajı
3. 5 saniye bekle → game:meetingEnded → oyuna dön
4. checkWin → kazanma kontrolü
```

---

## 4. Socket Events

### Client → Server

| Event | Payload | Açıklama |
|-------|---------|----------|
| `game:emergency` | `{}` | Emergency button (Cafeteria) |
| `game:vote` | `{ targetId: string \| "skip" }` | Oy ver/değiştir |

### Server → Client

| Event | Payload | Açıklama |
|-------|---------|----------|
| `game:meetingStarted` | `MeetingStartedPayload` | Meeting başladı |
| `game:voteUpdate` | `{ votes: Record<string, boolean> }` | Kimler oy verdi (kim verdi, hedef değil) |
| `game:meetingEnded` | `MeetingResultPayload` | Sonuç + atılma |
| `game:chatMessage` | `{ userId, username, message }` | Chat mesajı (sadece meeting'de) |

### Payload Tipleri

```typescript
interface MeetingStartedPayload {
  reason: "report" | "emergency";
  reporterId: string;
  reporterName: string;
  duration: number;              // 90000
  players: { userId: string; username: string; color: string; isAlive: boolean }[];
  victimId?: string;             // report reason'da kim öldü
}

interface MeetingResultPayload {
  ejectedId: string | null;
  ejectedRole: "IMPOSTOR" | "CREW" | null;
  wasTie: boolean;
  votes: Record<string, string | "skip">;  // tüm oylar açıklanır
}
```

---

## 5. Chat Sistemi

- Meeting sırasında canlı oyuncular metin yazabilir
- Ölü oyuncular yazamaz (sadece izler)
- Mesajlar tüm lobby'ye broadcast
- Maksimum 200 karakter, rate-limited (basit)

---

## 6. Client UI — Meeting Ekranı

```
┌─────────────────────────────────────────────┐
│  📢 MEETING — Ali raporladı (veya Emergency)│
│  ⏱️ 67 saniye kaldı                         │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ [Chat mesajları burada akar]        │    │
│  │ Ayşe: ali şüpheli                    │    │
│  │ Dave: ben crewmate'im                │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Oyla:                                      │
│  ○ Ali (kırmızı) ✓ oy verdi                 │
│  ○ Ayşe (mavi)                              │
│  ○ Dave (yeşil)                             │
│  ○ Skip                                     │
│                                             │
│  [Mesaj yaz...] [Gönder]                    │
└─────────────────────────────────────────────┘
```

Yeni HTML element'leri:
- `#meeting-screen` section (gizli, meeting'de görünür)
- Chat listesi, vote butonları, timer, mesaj input

---

## 7. Veri Modeli Değişiklikleri

### GameEngine'e Eklemeler

```typescript
// GameState'e:
interface GameState {
  // ... existing
  meetingState: MeetingState | null;    // null = meeting yok
  emergencyUsed: Set<string>;           // emergency buton kullananlar
}

interface MeetingState {
  matchId: string;
  reason: "report" | "emergency";
  reporterId: string;
  startedAt: number;
  durationMs: number;
  votes: Map<string, string | "skip">;
}
```

### GameEngine Metodları

- `startMeeting(matchId, reason, reporterId, victimId?)`
- `vote(matchId, voterId, targetId | "skip")`
- `endMeeting(matchId)` — sonuç hesapla, atılma yap
- `isInMeeting(matchId): boolean`

---

## 8. Dosya Yapısı

### Server
```
packages/server/src/game/
├── engine.ts          # MODIFY: +meeting methods, tick skips during meeting
├── types.ts           # MODIFY: +MeetingState, meetingState field
└── meeting.ts         # NEW: tallyVotes(), MeetingState helpers

packages/server/src/sockets/
└── gameHandlers.ts    # MODIFY: +emergency, +vote, +chatMessage handlers; report triggers meeting
```

### Client
```
packages/client/src/
├── screens/
│   └── meeting.ts     # NEW: meeting screen logic
├── phaser/scenes/
│   └── GameScene.ts   # MODIFY: stop input during meeting, emergency button tile
└── types.ts           # MODIFY: +meeting types
```

### Shared
```
packages/shared/src/
├── constants.ts       # +MEETING_DURATION_MS, EMERGENCY_BUTTON_TILE
└── types.ts           # +MeetingStartedPayload, MeetingResultPayload, MEETING_EVENTS
```

---

## 9. Test Stratejisi

- `tallyVotes()` unit tests (çeşitli senaryolar)
- `startMeeting` / `vote` / `endMeeting` engine tests
- Emergency button (already used, not in cafeteria)
- Win condition after ejection

---

## 10. Tamamlama Kriterleri

- [ ] Emergency button (Cafeteria, 1 kullanım)
- [ ] Ceset raporu → meeting (4A placeholder değiştir)
- [ ] Meeting ekranı (chat + vote + timer)
- [ ] Oylama (skip + her oyuncu, değiştirilebilir)
- [ ] Atılma (rol açıklanır, hayalet)
- [ ] Oyun durur meeting sırasında
- [ ] Kazanma kontrolü atılma sonrası
- [ ] Chat (canlılar yazar)
- [ ] Tüm testler yeşil
- [ ] Tag sub-project-4b-complete
