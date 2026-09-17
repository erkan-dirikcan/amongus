import Phaser from "phaser";
import { getSocket } from "../../network/socket.js";
import { TILE_SIZE, cameraZoomFor, DIAGONAL_FACTOR, INPUT_SEND_INTERVAL_MS, INTERP_FACTOR } from "../config.js";
import type { GameStartedPayload, GameTickPayload, TaskClient } from "../../types.js";
import {
  MONITOR_POSITIONS, MONITOR_INTERACT_DISTANCE, MEDBAY_SCAN_DURATION_MS,
  ROOMS, VENT_POSITIONS, VENT_INTERACT_DISTANCE, EMERGENCY_BUTTON, EMERGENCY_BUTTON_DISTANCE,
} from "../../constants.js";
import { playerKey, playerFrame, DEAD_FRAME, createPlayerAnimations, type Dir } from "../sprites.js";

interface PlayerSprite {
  sprite: Phaser.GameObjects.Sprite;
  color: string;
  targetX?: number;
  targetY?: number;
  usernameText: Phaser.GameObjects.Text;
  lastX: number;
  lastY: number;
  facing: Dir;
}

const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: "11px",
  color: "#ffffff",
  stroke: "#000000",
  strokeThickness: 3,
};

/** True while a DOM overlay/input should own the keyboard instead of the game. */
function uiOwnsKeyboard(): boolean {
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)) return true;
  for (const id of ["meeting-screen", "minigame-overlay", "monitor-panel", "vent-menu", "game-over"]) {
    const node = document.getElementById(id);
    if (node && !node.hidden) return true;
  }
  return false;
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
  private taskSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private myColor = "red";
  private lightsOverlay?: Phaser.GameObjects.Image;
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
    if (import.meta.env.DEV) (window as any).__scene = this; // devtools hook

    // 1. Tilemap
    const map = this.make.tilemap({ key: "map" });
    const tileset = map.addTilesetImage("tileset", "tileset");
    if (tileset) {
      map.createLayer("Ground", tileset, 0, 0);
      map.createLayer("Walls", tileset, 0, 0);
    }

    // Room labels on the floor
    for (const room of ROOMS) {
      const label = this.add.text((room.x + room.w / 2) * TILE_SIZE, (room.y + 1.6) * TILE_SIZE, room.label, {
        fontFamily: "Segoe UI, system-ui, sans-serif",
        fontSize: "12px",
        fontStyle: "bold",
        color: "#ffffff",
      });
      label.setOrigin(0.5).setAlpha(0.35).setDepth(1);
    }

    // Emergency button on the cafeteria table
    this.add.image(EMERGENCY_BUTTON.x * TILE_SIZE, EMERGENCY_BUTTON.y * TILE_SIZE, "emergency-button").setDepth(2);

    // Vents (impostors use them; everyone sees the grate)
    for (const v of VENT_POSITIONS) {
      this.add.image((v.x + 0.5) * TILE_SIZE, (v.y + 0.5) * TILE_SIZE, "vent").setDepth(2);
    }

    // 2. Player sprites
    for (const p of payload.players) {
      const isMe = p.userId === this.myUserId;
      const sx = (isMe ? payload.spawn.x : 25) * TILE_SIZE;
      const sy = (isMe ? payload.spawn.y : 25) * TILE_SIZE;
      const sprite = this.add.sprite(sx, sy, playerKey(p.color), playerFrame("down", 0));
      sprite.setDepth(10);

      const text = this.add.text(sprite.x, sprite.y - 22, p.username, NAME_STYLE);
      text.setOrigin(0.5).setDepth(11);

      this.playerSprites[p.userId] = { sprite, color: p.color, usernameText: text, lastX: sx, lastY: sy, facing: "down" };

      if (isMe) {
        this.myPlayer = sprite;
        this.myColor = p.color;
      }
    }

    // 3. Create animations
    createPlayerAnimations(this);

    // 4. Camera — zoom follows the canvas size so the visible area stays sane
    if (this.myPlayer) {
      this.cameras.main.startFollow(this.myPlayer, true, 0.15, 0.15);
      this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    }
    this.scale.on("resize", (size: Phaser.Structs.Size) => this.applyZoom(size.width, size.height));

    // Lights-out vignette: follows me, big enough to cover the view at any zoom
    this.lightsOverlay = this.add.image(0, 0, "darkness").setScale(4).setDepth(50).setVisible(false);
    this.applyZoom(this.scale.width, this.scale.height);

    // 5. Input — no key capture (see config), so typing in chat still works
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D", false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.clearCaptures();

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
      if (uiOwnsKeyboard()) return;
      const corpse = this.findNearestCorpse();
      if (corpse) {
        getSocket().emit("game:report", { corpseId: corpse.id });
        return;
      }
      const vent = this.findNearestVent();
      if (vent && this.myRole === "IMPOSTOR") {
        getSocket().emit("game:ventEnter", { ventId: vent.id });
        return;
      }
      if (this.nearEmergencyButton() && !this.nearAnyTask()) {
        getSocket().emit("game:emergency");
        return;
      }
      this.tryInteractTask();
    });

    // Task consoles with a bobbing arrow above the ones still to do
    for (const task of this.tasks) {
      const px = (task.x + 0.5) * TILE_SIZE;
      const py = (task.y + 0.5) * TILE_SIZE;
      const console_ = this.add.image(0, 0, "task-marker");
      const arrow = this.add.image(0, -22, "task-arrow");
      const group = this.add.container(px, py, [console_, arrow]).setDepth(3);
      this.tweens.add({ targets: arrow, y: -17, duration: 500, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      if (task.completed) arrow.setVisible(false);
      this.taskSprites.set(task.id, group);
    }

    // Monitors (cameras / admin / vitals)
    for (const mon of MONITOR_POSITIONS) {
      this.add.image((mon.x + 0.5) * TILE_SIZE, (mon.y + 0.5) * TILE_SIZE, "monitor").setDepth(3);
    }

    // Bodies that were already on the floor when we (re)joined
    for (const c of window.__gameCorpses ?? []) {
      this.onCorpseEvent(new CustomEvent("game:corpse", { detail: c }));
    }
    // ...and a sabotage that is still running
    if (window.__gameSabotage) {
      this.onSabotageStarted(new CustomEvent("game:sabotageStarted", { detail: window.__gameSabotage }));
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

  private applyZoom(width: number, height: number): void {
    this.cameras.main.setZoom(cameraZoomFor(width, height));
  }

  private nearEmergencyButton(): boolean {
    if (!this.myPlayer) return false;
    return Math.hypot(this.myPlayer.x / TILE_SIZE - EMERGENCY_BUTTON.x, this.myPlayer.y / TILE_SIZE - EMERGENCY_BUTTON.y) <= EMERGENCY_BUTTON_DISTANCE;
  }

  private nearAnyTask(): boolean {
    if (!this.myPlayer) return false;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    return this.tasks.some((t) => !t.completed && Math.hypot(t.x - myX, t.y - myY) <= 1.5);
  }

  private findNearestVent(): { id: string; room: string } | undefined {
    if (!this.myPlayer) return undefined;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    let nearest: { id: string; room: string } | undefined;
    let nearestDist = Infinity;
    for (const v of VENT_POSITIONS) {
      const dist = Math.hypot(v.x - myX, v.y - myY);
      if (dist <= VENT_INTERACT_DISTANCE && dist < nearestDist) {
        nearest = { id: v.id, room: v.room };
        nearestDist = dist;
      }
    }
    return nearest;
  }

  update(time: number): void {
    if (!this.myPlayer) return;

    // Check for nearby task/corpse for interact prompt
    this.updateInteractPrompt();
    this.updateKillButton(time);

    // 1. Input (ignored while chat/minigame/meeting owns the keyboard)
    let dx = 0;
    let dy = 0;
    if (!uiOwnsKeyboard()) {
      if (this.wasd.W.isDown || this.cursors.up.isDown) dy -= 1;
      if (this.wasd.S.isDown || this.cursors.down.isDown) dy += 1;
      if (this.wasd.A.isDown || this.cursors.left.isDown) dx -= 1;
      if (this.wasd.D.isDown || this.cursors.right.isDown) dx += 1;
    }

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

    // 4. Interpolate other players and animate them from their actual motion
    for (const [userId, ps] of Object.entries(this.playerSprites)) {
      if (userId !== this.myUserId && ps.targetX !== undefined) {
        ps.sprite.x = Phaser.Math.Linear(ps.sprite.x, ps.targetX, INTERP_FACTOR);
        ps.sprite.y = Phaser.Math.Linear(ps.sprite.y, ps.targetY!, INTERP_FACTOR);
        const mx = ps.sprite.x - ps.lastX;
        const my = ps.sprite.y - ps.lastY;
        const moving = Math.abs(mx) + Math.abs(my) > 0.15;
        if (moving) ps.facing = Math.abs(my) > Math.abs(mx) ? (my < 0 ? "up" : "down") : mx < 0 ? "left" : "right";
        this.playAnim(ps, moving);
        ps.lastX = ps.sprite.x;
        ps.lastY = ps.sprite.y;
      }
      ps.usernameText.setPosition(ps.sprite.x, ps.sprite.y - 22);
    }

    // 5. My animation follows my input
    const me = this.playerSprites[this.myUserId];
    if (me) {
      const moving = dx !== 0 || dy !== 0;
      if (moving) me.facing = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? "up" : "down") : dx < 0 ? "left" : "right";
      this.playAnim(me, moving);
    }

    // 6. Lights out: the vignette's hole stays on me
    if (this.lightsActive && this.lightsOverlay && this.myPlayer) {
      this.lightsOverlay.setPosition(this.myPlayer.x, this.myPlayer.y);
    }
  }

  private playAnim(ps: PlayerSprite, moving: boolean): void {
    const key = `${playerKey(ps.color)}-${moving ? "walk" : "idle"}-${ps.facing}`;
    if (ps.sprite.anims.currentAnim?.key !== key) ps.sprite.play(key);
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
      ps.usernameText.visible = p.isAlive;
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
    const nearVent = this.myRole === "IMPOSTOR" && this.findNearestVent() !== undefined;
    const nearButton = this.nearEmergencyButton();
    if (nearTask || nearCorpse || nearMonitor || nearVent || nearButton) {
      this.interactPrompt.hidden = false;
      this.interactPrompt.textContent = nearCorpse ? "📢 E - Raporla"
        : nearVent && !nearTask ? "🕳️ E - Vent'e gir"
        : nearButton && !nearTask ? "🚨 E - Acil Toplantı"
        : nearMonitor && !nearTask ? "📺 E - İncele"
        : "E - Görev Yap";
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
    const key = playerKey(detail.color);
    const sprite = this.add.sprite(detail.x * TILE_SIZE, detail.y * TILE_SIZE, this.textures.exists(key) ? key : playerKey("red"), DEAD_FRAME);
    sprite.setDepth(5);
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
    const group = this.taskSprites.get(detail.taskId);
    if (group) {
      const [console_, arrow] = group.list as Phaser.GameObjects.Image[];
      arrow?.setVisible(false);
      console_?.setAlpha(0.45);
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
      this.lightsOverlay?.setVisible(true);
    }
  };

  private onSabotageFixed = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { type: string };
    const alert = document.getElementById("sabotage-alert")!;
    alert.hidden = true;
    if (detail.type === "lights") {
      this.lightsActive = false;
      this.lightsOverlay?.setVisible(false);
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
