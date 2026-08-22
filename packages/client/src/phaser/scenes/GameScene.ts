import Phaser from "phaser";
import { getSocket } from "../../network/socket.js";
import { TILE_SIZE, CAMERA_ZOOM, DIAGONAL_FACTOR, INPUT_SEND_INTERVAL_MS, INTERP_FACTOR } from "../config.js";
import type { GameStartedPayload, GameTickPayload, TaskClient } from "../../types.js";
import { MONITOR_POSITIONS, MONITOR_INTERACT_DISTANCE, MEDBAY_SCAN_DURATION_MS } from "../../constants.js";

const COLOR_HEX: Record<string, number> = {
  red: 0xe53935, blue: 0x1e88e5, green: 0x43a047, pink: 0xec407a,
  orange: 0xfb8c00, yellow: 0xfdd835, black: 0x212121, white: 0xfafafa,
  purple: 0x8e24aa, brown: 0x795548, cyan: 0x00acc1, lime: 0xc0ca33,
};

interface PlayerSprite {
  sprite: Phaser.GameObjects.Sprite;
  targetX?: number;
  targetY?: number;
  usernameText: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private matchId = "";
  private myRole: "IMPOSTOR" | "CREW" = "CREW";
  private myUserId = "";
  private playerSprites: Record<string, PlayerSprite> = {};
  private myPlayer?: Phaser.GameObjects.Sprite;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private lastInputSent = 0;
  private lastDx = 0;
  private lastDy = 0;
  private seqCounter = 0;

  private tasks: TaskClient[] = [];
  private corpses: { id: string; x: number; y: number; sprite: Phaser.GameObjects.Sprite }[] = [];
  private taskSprites: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private killBtn: HTMLButtonElement | null = null;
  private reportBtn: HTMLButtonElement | null = null;
  private interactPrompt: HTMLElement | null = null;
  private sabotageBtn: HTMLButtonElement | null = null;
  private ventMenu: HTMLElement | null = null;
  private lightsActive = false;

  constructor() {
    super({ key: "GameScene" });
  }

  init(): void {
    const payload = this.game.registry.get("gamePayload") as GameStartedPayload;
    this.matchId = payload.matchId;
    this.myRole = payload.role;
    // Set synchronously — the game screen fetches userId before starting Phaser (C2 fix)
    this.myUserId = payload.myUserId || "";
  }

  create(): void {
    const payload = this.game.registry.get("gamePayload") as GameStartedPayload;

    // 1. Tilemap
    const map = this.make.tilemap({ key: "map" });
    const tileset = map.addTilesetImage("tileset", "tileset");
    if (tileset) {
      map.createLayer("Ground", tileset, 0, 0);
      map.createLayer("Walls", tileset, 0, 0);
    }

    // 2. Player sprites
    for (const p of payload.players) {
      const sprite = this.add.sprite(p.userId === this.myUserId ? payload.spawn.x * TILE_SIZE : 25 * TILE_SIZE, p.userId === this.myUserId ? payload.spawn.y * TILE_SIZE : 25 * TILE_SIZE, "player");
      sprite.tint = COLOR_HEX[p.color] ?? 0xffffff;

      const text = this.add.text(sprite.x, sprite.y - 24, p.username, {
        fontSize: "10px",
        color: "#ffffff",
      });
      text.setOrigin(0.5);

      this.playerSprites[p.userId] = { sprite, usernameText: text };

      if (p.userId === this.myUserId) {
        this.myPlayer = sprite;
      }
    }

    // 3. Create animations
    this.createAnimations();

    // 4. Camera
    if (this.myPlayer) {
      this.cameras.main.startFollow(this.myPlayer, true);
      this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
      this.cameras.main.setZoom(CAMERA_ZOOM);
    }

    // 5. Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;

    // 6. Socket listener
    const socket = getSocket();
    socket.on("game:tick", (data: GameTickPayload) => this.onTick(data));

    // Load tasks
    this.tasks = window.__gameTasks || [];

    // Show kill button only for impostor
    this.killBtn = document.getElementById("kill-btn") as HTMLButtonElement;
    if (this.myRole === "IMPOSTOR") {
      this.killBtn.hidden = false;
      this.killBtn.addEventListener("click", () => {
        getSocket().emit("game:kill");
      });
    }

    this.reportBtn = document.getElementById("report-btn") as HTMLButtonElement;
    this.reportBtn.addEventListener("click", () => {
      // Report nearest corpse
      const nearest = this.findNearestCorpse();
      if (nearest) {
        getSocket().emit("game:report", { corpseId: nearest.id });
      }
    });

    this.interactPrompt = document.getElementById("interact-prompt")!;

    // E key for task interaction / report / monitor
    this.input.keyboard!.on("keydown-E", () => {
      const corpse = this.findNearestCorpse();
      if (corpse) {
        getSocket().emit("game:report", { corpseId: corpse.id });
        return;
      }
      this.tryInteractTask();
    });

    // Render task sprites (small colored squares at task locations)
    const TASK_COLORS: Record<string, number> = {
      wire: 0xffd166,
      download: 0x06d6a0,
      cardSwipe: 0xef476f,
      asteroids: 0x118ab2,
      fuel: 0xf78c6b,
      medbayScan: 0x9d4edd,
    };
    for (const task of this.tasks) {
      const rect = this.add.rectangle(task.x * TILE_SIZE, task.y * TILE_SIZE, 16, 16, TASK_COLORS[task.type] ?? 0x06d6a0);
      rect.setStrokeStyle(2, 0xffffff);
      this.taskSprites.set(task.id, rect);
    }

    // Render monitor tiles (small screens)
    for (const mon of MONITOR_POSITIONS) {
      const rect = this.add.rectangle(mon.x * TILE_SIZE, mon.y * TILE_SIZE, 20, 16, 0x22223b);
      rect.setStrokeStyle(2, 0x4ea8de);
      const label = this.add.text(mon.x * TILE_SIZE, mon.y * TILE_SIZE + 14, "📺", { fontSize: "10px" });
      label.setOrigin(0.5);
    }

    // Visual task animation (medbayScan) from other players
    window.addEventListener("game:visualTaskStarted", this.onVisualTaskStarted);

    // Listen for corpse events
    window.addEventListener("game:corpse", this.onCorpseEvent);
    window.addEventListener("game:killResult", this.onKillResult);
    window.addEventListener("game:reportResult", this.onReportResult);
    window.addEventListener("game:taskCompleted", this.onTaskCompleted);

    // Sabotage button (impostor only)
    this.sabotageBtn = document.getElementById("sabotage-btn") as HTMLButtonElement;
    if (this.myRole === "IMPOSTOR") {
      this.sabotageBtn.hidden = false;
      this.sabotageBtn.addEventListener("click", () => {
        const menu = document.getElementById("sabotage-menu")!;
        menu.hidden = !menu.hidden;
      });
      document.querySelectorAll("[data-sab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const type = (btn as HTMLElement).dataset.sab!;
          getSocket().emit("game:sabotage", { type });
          document.getElementById("sabotage-menu")!.hidden = true;
        });
      });
    }

    // Vent menu + exit
    this.ventMenu = document.getElementById("vent-menu");
    document.getElementById("vent-exit-btn")!.addEventListener("click", () => {
      getSocket().emit("game:ventExit");
    });

    // Vent/sabotage event listeners
    window.addEventListener("game:ventState", this.onVentState);
    window.addEventListener("game:sabotageStarted", this.onSabotageStarted);
    window.addEventListener("game:sabotageFixed", this.onSabotageFixed);
  }

  private createAnimations(): void {
    // Frame layout: cols = [down, up, left, right], rows = [idle(0), walk(1)]
    const dirs = ["down", "up", "left", "right"];
    for (let d = 0; d < 4; d++) {
      const dir = dirs[d];
      this.anims.create({
        key: `idle-${dir}`,
        frames: [{ key: "player", frame: d * 2 }],
        frameRate: 1,
      });
      this.anims.create({
        key: `walk-${dir}`,
        frames: [{ key: "player", frame: d * 2 }, { key: "player", frame: d * 2 + 1 }],
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  update(time: number): void {
    if (!this.myPlayer) return;

    // Check for nearby task/corpse for interact prompt
    this.updateInteractPrompt();
    this.updateKillButton(time);

    // 1. Input
    let dx = 0;
    let dy = 0;
    if (this.wasd.W.isDown || this.cursors.up.isDown) dy -= 1;
    if (this.wasd.S.isDown || this.cursors.down.isDown) dy += 1;
    if (this.wasd.A.isDown || this.cursors.left.isDown) dx -= 1;
    if (this.wasd.D.isDown || this.cursors.right.isDown) dx += 1;

    // 2. Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      dx *= DIAGONAL_FACTOR;
      dy *= DIAGONAL_FACTOR;
    }

    // 3. Send to server (throttled)
    if (time - this.lastInputSent > INPUT_SEND_INTERVAL_MS) {
      if (dx !== this.lastDx || dy !== this.lastDy) {
        const socket = getSocket();
        socket.emit("game:input", { dx, dy, seq: ++this.seqCounter });
      }
      this.lastInputSent = time;
      this.lastDx = dx;
      this.lastDy = dy;
    }

    // 4. Interpolate other players
    for (const [userId, ps] of Object.entries(this.playerSprites)) {
      if (userId === this.myUserId) continue;
      if (ps.targetX !== undefined) {
        ps.sprite.x = Phaser.Math.Linear(ps.sprite.x, ps.targetX, INTERP_FACTOR);
        ps.sprite.y = Phaser.Math.Linear(ps.sprite.y, ps.targetY!, INTERP_FACTOR);
      }
      ps.usernameText.setPosition(ps.sprite.x, ps.sprite.y - 24);
    }

    // 5. Update my animation
    let direction = "down";
    if (Math.abs(dy) > Math.abs(dx)) {
      direction = dy < 0 ? "up" : dy > 0 ? "down" : "down";
    } else if (dx !== 0) {
      direction = dx < 0 ? "left" : "right";
    }

    const moving = dx !== 0 || dy !== 0;
    const animKey = `${moving ? "walk" : "idle"}-${direction}`;
    if (this.myPlayer.anims.currentAnim?.key !== animKey) {
      this.myPlayer.play(animKey);
    }
  }

  private onTick(data: GameTickPayload): void {
    for (const p of data.players) {
      const ps = this.playerSprites[p.userId];
      if (!ps) continue;

      if (p.userId === this.myUserId) {
        // Server-authoritative: snap if drifted too far
        const serverX = p.x * TILE_SIZE;
        const serverY = p.y * TILE_SIZE;
        const drift = Math.abs(serverX - ps.sprite.x) + Math.abs(serverY - ps.sprite.y);
        if (drift > 10) {
          ps.sprite.setPosition(serverX, serverY);
        }
      } else {
        // Other player: set target for interpolation
        ps.targetX = p.x * TILE_SIZE;
        ps.targetY = p.y * TILE_SIZE;
      }
      ps.sprite.visible = p.isAlive;
    }
  }

  private updateInteractPrompt(): void {
    if (!this.interactPrompt || !this.myPlayer) return;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    let nearTask = false;
    for (const task of this.tasks) {
      if (task.completed) continue;
      const dist = Math.sqrt((task.x - myX) ** 2 + (task.y - myY) ** 2);
      if (dist <= 1.5) {
        nearTask = true;
        break;
      }
    }
    const nearMonitor = this.findNearestMonitor() !== undefined;
    const nearCorpse = this.findNearestCorpse();
    if (nearTask || nearCorpse || nearMonitor) {
      this.interactPrompt.hidden = false;
      this.interactPrompt.textContent = nearCorpse ? "📢 E - Raporla" : nearMonitor && !nearTask ? "📺 E - İncele" : "E - Görev Yap";
      if (nearCorpse) this.reportBtn!.hidden = false;
      else this.reportBtn!.hidden = true;
    } else {
      this.interactPrompt.hidden = true;
      this.reportBtn!.hidden = true;
    }
  }

  private findNearestMonitor(): { id: string; type: string } | undefined {
    if (!this.myPlayer) return undefined;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    let nearest: { id: string; type: string } | undefined;
    let nearestDist = Infinity;
    for (const m of MONITOR_POSITIONS) {
      const dist = Math.sqrt((m.x - myX) ** 2 + (m.y - myY) ** 2);
      if (dist <= MONITOR_INTERACT_DISTANCE && dist < nearestDist) {
        nearest = { id: m.id, type: m.type };
        nearestDist = dist;
      }
    }
    return nearest;
  }

  private updateKillButton(time: number): void {
    if (!this.killBtn || this.myRole !== "IMPOSTOR" || !this.myPlayer) return;
    // Check if near a crewmate
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    // Simplified: enable button, server validates actual range
    this.killBtn.disabled = false;
  }

  private tryInteractTask(): void {
    if (!this.myPlayer) return;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;

    // Monitors take over when no task is in range
    const monitor = this.findNearestMonitor();
    let nearTask = false;
    for (const task of this.tasks) {
      if (!task.completed) {
        const dist = Math.sqrt((task.x - myX) ** 2 + (task.y - myY) ** 2);
        if (dist <= 1.5) {
          nearTask = true;
          break;
        }
      }
    }
    if (monitor && !nearTask) {
      window.dispatchEvent(new CustomEvent("game:monitorOpen", { detail: { type: monitor.type } }));
      return;
    }

    for (const task of this.tasks) {
      if (task.completed) continue;
      const dist = Math.sqrt((task.x - myX) ** 2 + (task.y - myY) ** 2);
      if (dist <= 1.5) {
        // Open the minigame matching the task type
        const onDone = (taskId: string) => {
          getSocket().emit("game:taskComplete", { taskId });
        };
        if (task.type === "wire") {
          import("../../minigames/wire.js").then(({ openWireMinigame }) => openWireMinigame(task.id, onDone));
        } else if (task.type === "cardSwipe") {
          import("../../minigames/cardswipe.js").then(({ openCardSwipeMinigame }) => openCardSwipeMinigame(task.id, onDone));
        } else if (task.type === "asteroids") {
          import("../../minigames/asteroids.js").then(({ openAsteroidsMinigame }) => openAsteroidsMinigame(task.id, onDone));
        } else if (task.type === "fuel") {
          import("../../minigames/fuel.js").then(({ openFuelMinigame }) => openFuelMinigame(task.id, onDone));
        } else if (task.type === "medbayScan") {
          import("../../minigames/medbayscan.js").then(({ openMedbayScanMinigame }) => openMedbayScanMinigame(task.id, onDone));
        } else {
          import("../../minigames/download.js").then(({ openDownloadMinigame }) => openDownloadMinigame(task.id, onDone));
        }
        break;
      }
    }
  }

  private findNearestCorpse(): { id: string; x: number; y: number } | null {
    if (!this.myPlayer || this.corpses.length === 0) return null;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    let nearest = null;
    let nearestDist = Infinity;
    for (const c of this.corpses) {
      const dist = Math.sqrt((c.x - myX) ** 2 + (c.y - myY) ** 2);
      if (dist <= 1.5 && dist < nearestDist) {
        nearest = { id: c.id, x: c.x, y: c.y };
        nearestDist = dist;
      }
    }
    return nearest;
  }

  private onCorpseEvent = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { corpseId: string; x: number; y: number; color: string };
    const sprite = this.add.sprite(detail.x * TILE_SIZE, detail.y * TILE_SIZE, "player");
    sprite.tint = 0x888888; // grayish for corpse
    sprite.setAngle(90); // lying down
    this.corpses.push({ id: detail.corpseId, x: detail.x, y: detail.y, sprite });
  };

  private onKillResult = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { success: boolean; cooldownUntil: number };
    if (this.killBtn && detail.cooldownUntil) {
      const update = () => {
        const remaining = Math.ceil((detail.cooldownUntil - Date.now()) / 1000);
        if (remaining > 0) {
          this.killBtn!.textContent = `⏳${remaining}`;
          this.killBtn!.disabled = true;
          setTimeout(update, 1000);
        } else {
          this.killBtn!.textContent = "🔪";
          this.killBtn!.disabled = false;
        }
      };
      update();
    }
  };

  private onReportResult = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { success: boolean; message: string };
    const prompt = document.getElementById("interact-prompt")!;
    prompt.textContent = detail.message;
    prompt.hidden = false;
    setTimeout(() => { prompt.hidden = true; }, 3000);
  };

  private onTaskCompleted = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { taskId: string };
    const sprite = this.taskSprites.get(detail.taskId);
    if (sprite) {
      sprite.setVisible(false); // hide completed task sprite
    }
    // Also update local tasks array
    const task = this.tasks.find((t) => t.id === detail.taskId);
    if (task) task.completed = true;
  };

  private onVentState = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { inVent: boolean; ventId?: string; availableVents?: any[] };
    const menu = document.getElementById("vent-menu")!;
    if (detail.inVent) {
      menu.hidden = false;
      const list = document.getElementById("vent-list")!;
      list.innerHTML = "";
      for (const v of detail.availableVents || []) {
        const btn = document.createElement("button");
        btn.textContent = v.room;
        btn.addEventListener("click", () => {
          getSocket().emit("game:ventMove", { targetVentId: v.id });
        });
        list.appendChild(btn);
      }
    } else {
      menu.hidden = true;
    }
  };

  private onSabotageStarted = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { type: string; expiresAt?: number };
    const alert = document.getElementById("sabotage-alert")!;
    const messages: Record<string, string> = {
      lights: "💡 IŞIKLAR KESİLDİ",
      comms: "📡 İLETİŞİM KESİLDİ",
      reactor: "☢️ REAKTÖR ERİYOR!",
      o2: "🫧 O2 SİLİNDİRİ!",
    };
    alert.textContent = messages[detail.type] || "SABOTAGE!";
    alert.hidden = false;
    if (detail.type === "lights") {
      this.lightsActive = true;
      this.cameras.main.setZoom(1); // reduce view
    }
  };

  private onSabotageFixed = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { type: string };
    const alert = document.getElementById("sabotage-alert")!;
    alert.hidden = true;
    if (detail.type === "lights") {
      this.lightsActive = false;
      this.cameras.main.setZoom(2); // restore view
    }
  };

  /** Another player started a visual task (medbayScan) in my room — green ring + label. */
  private onVisualTaskStarted = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { userId: string; x: number; y: number; taskType: string };
    const px = detail.x * TILE_SIZE;
    const py = detail.y * TILE_SIZE;

    const ring = this.add.circle(px, py, 18);
    ring.setStrokeStyle(3, 0x06d6a0);
    const label = this.add.text(px, py - 34, "DOĞRULANIYOR", { fontSize: "10px", color: "#06d6a0" });
    label.setOrigin(0.5);

    this.tweens.add({
      targets: ring,
      scale: { from: 0.7, to: 1.3 },
      alpha: { from: 1, to: 0.4 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    this.time.delayedCall(MEDBAY_SCAN_DURATION_MS, () => {
      ring.destroy();
      label.destroy();
    });
  };

  shutdown(): void {
    window.removeEventListener("game:corpse", this.onCorpseEvent);
    window.removeEventListener("game:killResult", this.onKillResult);
    window.removeEventListener("game:reportResult", this.onReportResult);
    window.removeEventListener("game:taskCompleted", this.onTaskCompleted);
    window.removeEventListener("game:ventState", this.onVentState);
    window.removeEventListener("game:sabotageStarted", this.onSabotageStarted);
    window.removeEventListener("game:sabotageFixed", this.onSabotageFixed);
    window.removeEventListener("game:visualTaskStarted", this.onVisualTaskStarted);
    window.dispatchEvent(new CustomEvent("game:monitorClose"));
    if (this.killBtn) this.killBtn.hidden = true;
    if (this.reportBtn) this.reportBtn.hidden = true;
    if (this.interactPrompt) this.interactPrompt.hidden = true;
    if (this.sabotageBtn) this.sabotageBtn.hidden = true;
    if (this.ventMenu) this.ventMenu.hidden = true;
    const tp = document.getElementById("task-progress");
    if (tp) tp.hidden = true;
    const sabMenu = document.getElementById("sabotage-menu");
    if (sabMenu) sabMenu.hidden = true;
    const sabAlert = document.getElementById("sabotage-alert");
    if (sabAlert) sabAlert.hidden = true;
  }
}
