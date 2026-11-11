import Phaser from "phaser";
import { getSocket } from "../../network/socket.js";
import { TILE_SIZE, cameraZoomFor, DIAGONAL_FACTOR, INPUT_SEND_INTERVAL_MS } from "../config.js";
import type { GameStartedPayload, GameTickPayload, TaskClient } from "../../types.js";
import {
  MONITOR_POSITIONS, MONITOR_INTERACT_DISTANCE, MEDBAY_SCAN_DURATION_MS,
  ROOMS, VENT_POSITIONS, VENT_INTERACT_DISTANCE, EMERGENCY_BUTTON, EMERGENCY_BUTTON_DISTANCE,
  SABOTAGE_LOCATIONS, SABOTAGE_INTERACT_DISTANCE, KILL_DISTANCE,
} from "../../constants.js";
import {
  playerKey, playerFrame, DEAD_FRAME, GHOST_FRAME, PLAYER_SPRITE_SCALE,
  createPlayerAnimations, type Dir,
} from "../sprites.js";
import { renderShipInterior } from "../shipRenderer.js";

const PLAYER_SPEED = 4; // tiles per second (matches server @amongus/shared)
const PLAYER_RADIUS = 0.3; // tile units hitbox half-size (matches server engine.ts)

interface PlayerSprite {
  sprite: Phaser.GameObjects.Sprite;
  color: string;
  targetX?: number;
  targetY?: number;
  usernameText: Phaser.GameObjects.Text;
  lastX: number;
  lastY: number;
  facing: Dir;
  isAlive: boolean;
  inVent: boolean;
  movingUntil: number;
}

const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "Segoe UI, system-ui, sans-serif",
  fontSize: "11px",
  fontStyle: "bold",
  color: "#ffffff",
  stroke: "#000000",
  strokeThickness: 3.5,
  resolution: 2,
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
  private myAlive = true;
  private impostorIds = new Set<string>();
  private playerSprites: Record<string, PlayerSprite> = {};
  private myPlayer?: Phaser.GameObjects.Sprite;

  private wallGrid: boolean[][] = [];
  private mapW = 50;
  private mapH = 50;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  private lastInputSent = 0;
  private lastDx = 0;
  private lastDy = 0;
  private seqCounter = 0;

  private tasks: TaskClient[] = [];
  private corpses: { id: string; x: number; y: number; sprite: Phaser.GameObjects.Sprite }[] = [];
  private taskSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private sabotageSprites: Map<string, { type: string; container: Phaser.GameObjects.Container }> = new Map();
  private activeSabotage: { type: string; expiresAt?: number } | null = null;
  private sabotageCountdownTimer: ReturnType<typeof setInterval> | null = null;

  private myColor = "red";
  private lightsOverlay?: Phaser.GameObjects.Image;
  private targetRing?: Phaser.GameObjects.Arc;
  private killCooldownUntil = 0;
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
    this.myUserId = payload.myUserId || "";
    this.myAlive = payload.isAlive ?? true;
    this.impostorIds = new Set(
      payload.impostorIds ?? (payload.role === "IMPOSTOR" && payload.myUserId ? [payload.myUserId] : [])
    );
  }

  create(): void {
    const payload = this.game.registry.get("gamePayload") as GameStartedPayload;
    if (import.meta.env.DEV) (window as any).__scene = this; // devtools hook

    // 0. Deep space starfield background behind the ship hull
    this.createStarfield();

    // 1. Extract exact collision grid from map.json & render seamless high-res ship interior
    const mapData = this.cache.tilemap.get("map")?.data;
    this.mapW = mapData?.width ?? 50;
    this.mapH = mapData?.height ?? 50;
    const groundLayer = mapData?.layers?.find((l: any) => l.name === "Ground");
    const flatGround: number[] = groundLayer?.data ?? [];

    this.wallGrid = Array.from({ length: this.mapH }, (_, r) =>
      Array.from({ length: this.mapW }, (_, c) => (flatGround[r * this.mapW + c] ?? 0) === 0)
    );

    renderShipInterior(this, this.wallGrid, this.mapW, this.mapH);

    // 1b. Crisp room floor labels
    for (const room of ROOMS) {
      const label = this.add.text((room.x + room.w / 2) * TILE_SIZE, (room.y + 1.15) * TILE_SIZE, room.label, {
        fontFamily: "Segoe UI, system-ui, sans-serif",
        fontSize: "12px",
        fontStyle: "bold",
        color: "#e2e8f0",
        stroke: "#090d16",
        strokeThickness: 3,
        resolution: 2,
      });
      label.setOrigin(0.5).setAlpha(0.75).setDepth(1.5);
    }

    // Emergency button on the cafeteria table
    this.add
      .image(EMERGENCY_BUTTON.x * TILE_SIZE, EMERGENCY_BUTTON.y * TILE_SIZE, "emergency-button")
      .setScale(0.5)
      .setDepth(2);

    // Vents (impostors use them; everyone sees the grate)
    for (const v of VENT_POSITIONS) {
      this.add
        .image((v.x + 0.5) * TILE_SIZE, (v.y + 0.5) * TILE_SIZE, "vent")
        .setScale(0.5)
        .setDepth(2);
    }

    // Target highlight ring for Impostor kill range
    this.targetRing = this.add.circle(0, 0, 16).setStrokeStyle(2.5, 0xff2a55).setDepth(9).setVisible(false);

    // 2. Player sprites (high-res 96×96 scaled to PLAYER_SPRITE_SCALE)
    for (const p of payload.players) {
      const isMe = p.userId === this.myUserId;
      const sx = (isMe ? payload.spawn.x : 25) * TILE_SIZE;
      const sy = (isMe ? payload.spawn.y : 25) * TILE_SIZE;
      const sprite = this.add.sprite(sx, sy, playerKey(p.color), playerFrame("down", 0));
      sprite.setScale(PLAYER_SPRITE_SCALE).setDepth(10);

      const isFellowImpostor = this.myRole === "IMPOSTOR" && this.impostorIds.has(p.userId);
      const text = this.add.text(sprite.x, sprite.y - 23, p.username, {
        ...NAME_STYLE,
        color: isFellowImpostor ? "#ff4d6d" : "#ffffff",
      });
      text.setOrigin(0.5).setDepth(11);

      this.playerSprites[p.userId] = {
        sprite,
        color: p.color,
        targetX: sx,
        targetY: sy,
        usernameText: text,
        lastX: sx,
        lastY: sy,
        facing: "down",
        isAlive: true,
        inVent: false,
        movingUntil: 0,
      };

      if (isMe) {
        this.myPlayer = sprite;
        this.myColor = p.color;
      }
    }

    // 3. Create animations
    createPlayerAnimations(this);

    // 4. Camera — smooth sub-pixel follow (roundPixels = false)
    if (this.myPlayer) {
      this.cameras.main.startFollow(this.myPlayer, false, 0.25, 0.25);
      this.cameras.main.setBounds(0, 0, this.mapW * TILE_SIZE, this.mapH * TILE_SIZE);
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
      this.killBtn.onclick = () => {
        getSocket().emit("game:kill");
      };
    }

    this.reportBtn = document.getElementById("report-btn") as HTMLButtonElement;
    this.reportBtn.onclick = () => {
      const nearest = this.findNearestCorpse();
      if (nearest && this.myAlive) {
        getSocket().emit("game:report", { corpseId: nearest.id });
      }
    };

    this.interactPrompt = document.getElementById("interact-prompt")!;

    // E key for task interaction / sabotage repair / report / monitor / vent / emergency
    this.input.keyboard!.on("keydown-E", () => {
      if (uiOwnsKeyboard()) return;
      if (this.myAlive) {
        const corpse = this.findNearestCorpse();
        if (corpse) {
          getSocket().emit("game:report", { corpseId: corpse.id });
          return;
        }
        const sabLoc = this.findNearestSabotageLocation();
        if (sabLoc) {
          this.openSabotageMinigame(sabLoc);
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
      }
      this.tryInteractTask();
    });

    // Q key for quick Kill (Impostor)
    this.input.keyboard!.on("keydown-Q", () => {
      if (uiOwnsKeyboard()) return;
      if (this.myRole === "IMPOSTOR" && this.myAlive) {
        getSocket().emit("game:kill");
      }
    });

    // R key for quick Report
    this.input.keyboard!.on("keydown-R", () => {
      if (uiOwnsKeyboard() || !this.myAlive) return;
      const corpse = this.findNearestCorpse();
      if (corpse) {
        getSocket().emit("game:report", { corpseId: corpse.id });
      }
    });

    // M key to toggle Minimap overlay
    this.input.keyboard!.on("keydown-M", () => {
      if (uiOwnsKeyboard()) return;
      window.dispatchEvent(new CustomEvent("game:toggleMap"));
    });

    // Task consoles with a bobbing arrow above the ones still to do
    for (const task of this.tasks) {
      const px = (task.x + 0.5) * TILE_SIZE;
      const py = (task.y + 0.5) * TILE_SIZE;
      const console_ = this.add.image(0, 0, "task-marker").setScale(0.5);
      const arrow = this.add.image(0, -22, "task-arrow").setScale(0.5);
      const group = this.add.container(px, py, [console_, arrow]).setDepth(3);
      this.tweens.add({ targets: arrow, y: -16, duration: 500, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      if (task.completed) {
        arrow.setVisible(false);
        console_.setAlpha(0.45);
      }
      this.taskSprites.set(task.id, group);
    }

    // Sabotage repair consoles (visible only while that sabotage is active)
    for (const sLoc of SABOTAGE_LOCATIONS) {
      const px = (sLoc.x + 0.5) * TILE_SIZE;
      const py = (sLoc.y + 0.5) * TILE_SIZE;
      const marker = this.add.image(0, 0, "sabotage-marker").setScale(0.5);
      const arrow = this.add.image(0, -24, "task-arrow").setScale(0.5).setTint(0xff4d6d);
      const group = this.add.container(px, py, [marker, arrow]).setDepth(4).setVisible(false);
      this.tweens.add({ targets: arrow, y: -18, duration: 350, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.tweens.add({ targets: marker, scale: { from: 0.45, to: 0.56 }, duration: 450, yoyo: true, repeat: -1 });
      this.sabotageSprites.set(sLoc.id, { type: sLoc.type, container: group });
    }

    // Monitors (cameras / admin / vitals)
    for (const mon of MONITOR_POSITIONS) {
      this.add
        .image((mon.x + 0.5) * TILE_SIZE, (mon.y + 0.5) * TILE_SIZE, "monitor")
        .setScale(0.5)
        .setDepth(3);
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

    // Listen for corpse & task events
    window.addEventListener("game:corpse", this.onCorpseEvent);
    window.addEventListener("game:killResult", this.onKillResult);
    window.addEventListener("game:reportResult", this.onReportResult);
    window.addEventListener("game:taskCompleted", this.onTaskCompleted);

    // Sabotage button (impostor only)
    this.sabotageBtn = document.getElementById("sabotage-btn") as HTMLButtonElement;
    if (this.myRole === "IMPOSTOR") {
      this.sabotageBtn.hidden = false;
      this.sabotageBtn.onclick = () => {
        const menu = document.getElementById("sabotage-menu")!;
        menu.hidden = !menu.hidden;
      };
      document.querySelectorAll("[data-sab]").forEach((btn) => {
        (btn as HTMLButtonElement).onclick = () => {
          const type = (btn as HTMLElement).dataset.sab!;
          getSocket().emit("game:sabotage", { type });
          document.getElementById("sabotage-menu")!.hidden = true;
        };
      });
    }

    // Vent menu + exit
    this.ventMenu = document.getElementById("vent-menu");
    const ventExitBtn = document.getElementById("vent-exit-btn");
    if (ventExitBtn) {
      ventExitBtn.onclick = () => {
        getSocket().emit("game:ventExit");
      };
    }

    // Vent/sabotage event listeners
    window.addEventListener("game:ventState", this.onVentState);
    window.addEventListener("game:sabotageStarted", this.onSabotageStarted);
    window.addEventListener("game:sabotageFixed", this.onSabotageFixed);
  }

  private isWallTile(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return true;
    return this.wallGrid[ty]?.[tx] ?? true;
  }

  private canMoveToTile(newX: number, newY: number): boolean {
    const r = PLAYER_RADIUS;
    return (
      !this.isWallTile(newX - r, newY - r) &&
      !this.isWallTile(newX + r, newY - r) &&
      !this.isWallTile(newX - r, newY + r) &&
      !this.isWallTile(newX + r, newY + r)
    );
  }

  private createStarfield(): void {
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0x050811, 1);
    g.fillRect(-400, -400, 50 * TILE_SIZE + 800, 50 * TILE_SIZE + 800);

    let seed = 42;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    for (let i = 0; i < 320; i++) {
      const sx = -200 + rnd() * (50 * TILE_SIZE + 400);
      const sy = -200 + rnd() * (50 * TILE_SIZE + 400);
      const r = rnd() < 0.78 ? 1 : rnd() < 0.92 ? 1.8 : 2.6;
      const color = rnd() < 0.7 ? 0xffffff : rnd() < 0.5 ? 0x9ad9f5 : 0xffd166;
      const alpha = 0.25 + rnd() * 0.75;
      g.fillStyle(color, alpha);
      g.fillCircle(sx, sy, r);
    }
  }

  private applyZoom(width: number, height: number): void {
    this.cameras.main.setZoom(cameraZoomFor(width, height));
  }

  private nearEmergencyButton(): boolean {
    if (!this.myPlayer || !this.myAlive) return false;
    return (
      Math.hypot(
        this.myPlayer.x / TILE_SIZE - EMERGENCY_BUTTON.x,
        this.myPlayer.y / TILE_SIZE - EMERGENCY_BUTTON.y
      ) <= EMERGENCY_BUTTON_DISTANCE
    );
  }

  private nearAnyTask(): boolean {
    if (!this.myPlayer) return false;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    return this.tasks.some((t) => !t.completed && Math.hypot(t.x - myX, t.y - myY) <= 1.5);
  }

  private findNearestSabotageLocation(): (typeof SABOTAGE_LOCATIONS)[number] | undefined {
    if (!this.myPlayer || !this.myAlive || !this.activeSabotage) return undefined;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;
    let nearest: (typeof SABOTAGE_LOCATIONS)[number] | undefined;
    let nearestDist = Infinity;
    for (const loc of SABOTAGE_LOCATIONS) {
      if (loc.type !== this.activeSabotage.type) continue;
      const dist = Math.hypot(loc.x - myX, loc.y - myY);
      if (dist <= SABOTAGE_INTERACT_DISTANCE && dist < nearestDist) {
        nearest = loc;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  private openSabotageMinigame(loc: (typeof SABOTAGE_LOCATIONS)[number]): void {
    if (loc.type === "lights") {
      import("../../minigames/lights.js").then(({ openLightsRepair }) =>
        openLightsRepair(() => getSocket().emit("game:repairLights"))
      );
    } else if (loc.type === "comms") {
      import("../../minigames/comms.js").then(({ openCommsRepair }) =>
        openCommsRepair((code) => getSocket().emit("game:repairComms", { code }))
      );
    } else if (loc.type === "reactor") {
      import("../../minigames/reactor.js").then(({ openReactorRepair }) =>
        openReactorRepair(() => getSocket().emit("game:reactorHold"))
      );
    } else if (loc.type === "o2") {
      import("../../minigames/o2.js").then(({ openO2Repair }) =>
        openO2Repair(loc.room, (code, location) => getSocket().emit("game:o2Code", { code, location }))
      );
    }
  }

  private findNearestVent(): { id: string; room: string } | undefined {
    if (!this.myPlayer || !this.myAlive) return undefined;
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

  update(time: number, delta: number): void {
    if (!this.myPlayer) return;

    const dt = Math.min(delta || 16.67, 50) / 1000;

    // Check for nearby task/corpse/sabotage for interact prompt
    this.updateInteractPrompt();
    this.updateKillButton();

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

    // 3. Send to server IMMEDIATELY on input change, or throttled keepalive
    const inputChanged = dx !== this.lastDx || dy !== this.lastDy;
    if (inputChanged || time - this.lastInputSent > INPUT_SEND_INTERVAL_MS) {
      if (inputChanged) {
        const socket = getSocket();
        socket.emit("game:input", { dx, dy, seq: ++this.seqCounter });
      }
      this.lastInputSent = time;
      this.lastDx = dx;
      this.lastDy = dy;
    }

    // 4. Client-Side Prediction for My Player (smooth 60/144 FPS motion!)
    const me = this.playerSprites[this.myUserId];
    if (me) {
      const moving = (dx !== 0 || dy !== 0) && !me.inVent;
      if (moving) {
        let tx = me.sprite.x / TILE_SIZE;
        let ty = me.sprite.y / TILE_SIZE;
        const stepX = dx * PLAYER_SPEED * dt;
        const stepY = dy * PLAYER_SPEED * dt;

        if (this.myAlive) {
          if (this.canMoveToTile(tx + stepX, ty)) tx += stepX;
          if (this.canMoveToTile(tx, ty + stepY)) ty += stepY;
        } else {
          const nx = tx + stepX;
          const ny = ty + stepY;
          if (nx >= 1 && nx < this.mapW - 1) tx = nx;
          if (ny >= 1 && ny < this.mapH - 1) ty = ny;
        }

        me.sprite.x = tx * TILE_SIZE;
        me.sprite.y = ty * TILE_SIZE;
        me.facing = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? "up" : "down") : dx < 0 ? "left" : "right";
      }

      // Smooth reconciliation with authoritative server position
      if (me.targetX !== undefined && me.targetY !== undefined) {
        const errDist = Math.hypot(me.targetX - me.sprite.x, me.targetY - me.sprite.y);
        if (errDist > 64) {
          // Teleport (vent move or meeting spawn)
          me.sprite.setPosition(me.targetX, me.targetY);
        } else if (!moving && errDist > 0.5) {
          const settle = 1 - Math.exp(-16 * dt);
          me.sprite.x = Phaser.Math.Linear(me.sprite.x, me.targetX, settle);
          me.sprite.y = Phaser.Math.Linear(me.sprite.y, me.targetY, settle);
        } else if (moving && errDist > 6) {
          const blend = 1 - Math.exp(-6 * dt);
          me.sprite.x = Phaser.Math.Linear(me.sprite.x, me.targetX, blend);
          me.sprite.y = Phaser.Math.Linear(me.sprite.y, me.targetY, blend);
        }
      }

      this.playAnim(me, moving);
      me.usernameText.setPosition(me.sprite.x, me.sprite.y - 23);
      window.__myPos = { x: me.sprite.x / TILE_SIZE, y: me.sprite.y / TILE_SIZE };
    }

    // 5. Frame-rate independent interpolation for other players
    const remoteLerp = 1 - Math.exp(-16 * dt);
    const now = performance.now();
    for (const [userId, ps] of Object.entries(this.playerSprites)) {
      if (userId === this.myUserId) continue;
      if (ps.targetX !== undefined && ps.targetY !== undefined) {
        const distToTarget = Math.hypot(ps.targetX - ps.sprite.x, ps.targetY - ps.sprite.y);
        if (distToTarget > 96) {
          ps.sprite.setPosition(ps.targetX, ps.targetY);
        } else {
          ps.sprite.x = Phaser.Math.Linear(ps.sprite.x, ps.targetX, remoteLerp);
          ps.sprite.y = Phaser.Math.Linear(ps.sprite.y, ps.targetY, remoteLerp);
        }
        const moving = now < ps.movingUntil || distToTarget > 1.2;
        this.playAnim(ps, moving);
        ps.lastX = ps.sprite.x;
        ps.lastY = ps.sprite.y;
      }
      ps.usernameText.setPosition(ps.sprite.x, ps.sprite.y - 23);
    }

    // 6. Lights out: the vignette's hole stays on me (ghosts & impostors see normally)
    if (this.lightsActive && this.lightsOverlay && this.myPlayer) {
      this.lightsOverlay.setVisible(this.myAlive && this.myRole === "CREW");
      this.lightsOverlay.setPosition(this.myPlayer.x, this.myPlayer.y);
    }
  }

  private playAnim(ps: PlayerSprite, moving: boolean): void {
    if (!ps.isAlive) {
      ps.sprite.anims.stop();
      ps.sprite.setFrame(GHOST_FRAME);
      return;
    }
    const key = `${playerKey(ps.color)}-${moving ? "walk" : "idle"}-${ps.facing}`;
    if (ps.sprite.anims.currentAnim?.key !== key) ps.sprite.play(key);
  }

  private onTick(data: GameTickPayload): void {
    const meTick = data.players.find((p) => p.userId === this.myUserId);
    if (meTick && this.myAlive && !meTick.isAlive) {
      this.myAlive = false;
      const roleEl = document.getElementById("role-display");
      if (roleEl && !roleEl.textContent?.includes("👻")) {
        roleEl.textContent += " (👻 HAYALET)";
      }
    } else if (meTick) {
      this.myAlive = meTick.isAlive;
    }

    const now = performance.now();
    for (const p of data.players) {
      const ps = this.playerSprites[p.userId];
      if (!ps) continue;
      ps.isAlive = p.isAlive;
      ps.inVent = !!p.inVent;

      const serverX = p.x * TILE_SIZE;
      const serverY = p.y * TILE_SIZE;

      if (p.userId !== this.myUserId) {
        const deltaTarget =
          ps.targetX !== undefined && ps.targetY !== undefined
            ? Math.hypot(serverX - ps.targetX, serverY - ps.targetY)
            : 0;
        if (deltaTarget > 0.4) {
          ps.movingUntil = now + 95;
          if (p.facing) ps.facing = p.facing;
        }
      }

      ps.targetX = serverX;
      ps.targetY = serverY;

      // Visibility rules:
      // 1. Players in vents are invisible to others, translucent to self
      if (ps.inVent) {
        ps.sprite.visible = p.userId === this.myUserId;
        ps.sprite.setAlpha(0.4);
        ps.usernameText.visible = p.userId === this.myUserId;
      } else if (p.isAlive) {
        ps.sprite.visible = true;
        ps.sprite.setAlpha(1);
        ps.usernameText.visible = true;
        ps.usernameText.setAlpha(1);
      } else {
        // Dead player (Ghost): visible only when I am also dead!
        const showGhost = !this.myAlive;
        ps.sprite.visible = showGhost;
        ps.sprite.setAlpha(0.55);
        ps.sprite.setFrame(GHOST_FRAME);
        ps.usernameText.visible = showGhost;
        ps.usernameText.setAlpha(0.7);
      }
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
    const nearSab = this.myAlive ? this.findNearestSabotageLocation() : undefined;
    const nearMonitor = this.findNearestMonitor() !== undefined;
    const nearCorpse = this.myAlive ? this.findNearestCorpse() : null;
    const nearVent = this.myAlive && this.myRole === "IMPOSTOR" && this.findNearestVent() !== undefined;
    const nearButton = this.myAlive && this.nearEmergencyButton();

    if (nearCorpse || nearSab || nearTask || nearMonitor || nearVent || nearButton) {
      this.interactPrompt.hidden = false;
      this.interactPrompt.textContent = nearCorpse
        ? "📢 E / R - Cesedi Raporla"
        : nearSab
        ? `🛠️ E - Onar: ${nearSab.label}`
        : nearVent && !nearTask
        ? "🕳️ E - Vent'e Gir"
        : nearButton && !nearTask
        ? "🚨 E - Acil Toplantı"
        : nearMonitor && !nearTask
        ? "📺 E - Monitörü İncele"
        : "🛠️ E - Görev Yap";
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

  private updateKillButton(): void {
    if (!this.killBtn || this.myRole !== "IMPOSTOR" || !this.myPlayer) return;
    if (!this.myAlive) {
      this.killBtn.disabled = true;
      this.targetRing?.setVisible(false);
      return;
    }

    const onCooldown = Date.now() < this.killCooldownUntil;
    const myX = this.myPlayer.x / TILE_SIZE;
    const myY = this.myPlayer.y / TILE_SIZE;

    let nearestTarget: PlayerSprite | null = null;
    let nearestDist = Infinity;

    for (const [uid, ps] of Object.entries(this.playerSprites)) {
      if (uid === this.myUserId) continue;
      if (!ps.isAlive || ps.inVent) continue;
      if (this.impostorIds.has(uid)) continue; // cannot kill fellow impostor
      const dist = Math.hypot(ps.sprite.x / TILE_SIZE - myX, ps.sprite.y / TILE_SIZE - myY);
      if (dist <= KILL_DISTANCE && dist < nearestDist) {
        nearestTarget = ps;
        nearestDist = dist;
      }
    }

    if (nearestTarget && !onCooldown) {
      this.killBtn.disabled = false;
      this.targetRing?.setPosition(nearestTarget.sprite.x, nearestTarget.sprite.y + 4).setVisible(true);
    } else {
      this.targetRing?.setVisible(false);
      if (!onCooldown) {
        this.killBtn.style.opacity = nearestTarget ? "1" : "0.65";
      }
    }
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
    const sprite = this.add.sprite(
      detail.x * TILE_SIZE,
      detail.y * TILE_SIZE,
      this.textures.exists(key) ? key : playerKey("red"),
      DEAD_FRAME
    );
    sprite.setScale(PLAYER_SPRITE_SCALE).setDepth(5);
    this.corpses.push({ id: detail.corpseId, x: detail.x, y: detail.y, sprite });
  };

  private onKillResult = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { success: boolean; cooldownUntil: number };
    if (this.killBtn && detail.cooldownUntil) {
      this.killCooldownUntil = detail.cooldownUntil;
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
    setTimeout(() => {
      prompt.hidden = true;
    }, 3000);
  };

  private onTaskCompleted = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { taskId: string };
    const group = this.taskSprites.get(detail.taskId);
    if (group) {
      const [console_, arrow] = group.list as Phaser.GameObjects.Image[];
      arrow?.setVisible(false);
      console_?.setAlpha(0.45);
    }
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
        btn.textContent = `🕳️ ${v.room.toUpperCase()}`;
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
    this.activeSabotage = detail;
    const alert = document.getElementById("sabotage-alert")!;
    const messages: Record<string, string> = {
      lights: "💡 IŞIKLAR KESİLDİ — Elektrik odasında şalteri aç!",
      comms: "📡 İLETİŞİM KESİLDİ — Yönetim odasında frekansı gir!",
      reactor: "☢️ REAKTÖR ERİYOR! — Reaktörde el izi okut!",
      o2: "🫧 O2 TÜKENİYOR! — O2 veya Yönetimde kodu gir!",
    };

    // Show sabotage repair markers on map
    for (const [, entry] of this.sabotageSprites) {
      entry.container.setVisible(entry.type === detail.type);
    }

    if (this.sabotageCountdownTimer) {
      clearInterval(this.sabotageCountdownTimer);
      this.sabotageCountdownTimer = null;
    }

    const updateAlertText = () => {
      const base = messages[detail.type] || "SABOTAJ!";
      if (detail.expiresAt) {
        const sec = Math.max(0, Math.ceil((detail.expiresAt - Date.now()) / 1000));
        alert.textContent = `${base} (${sec}s)`;
      } else {
        alert.textContent = base;
      }
    };
    updateAlertText();
    if (detail.expiresAt) {
      this.sabotageCountdownTimer = setInterval(updateAlertText, 500);
    }

    alert.hidden = false;
    if (detail.type === "lights") {
      this.lightsActive = true;
      this.lightsOverlay?.setVisible(this.myAlive && this.myRole === "CREW");
    }
  };

  private onSabotageFixed = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { type: string };
    this.activeSabotage = null;
    if (this.sabotageCountdownTimer) {
      clearInterval(this.sabotageCountdownTimer);
      this.sabotageCountdownTimer = null;
    }
    for (const [, entry] of this.sabotageSprites) {
      entry.container.setVisible(false);
    }
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

    const ring = this.add.circle(px, py, 18).setDepth(9);
    ring.setStrokeStyle(3, 0x06d6a0);
    const label = this.add.text(px, py - 34, "✓ TARANIYOR", {
      fontSize: "10px",
      fontStyle: "bold",
      color: "#06d6a0",
      stroke: "#000000",
      strokeThickness: 2,
      resolution: 2,
    });
    label.setOrigin(0.5).setDepth(12);

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
    if (this.sabotageCountdownTimer) {
      clearInterval(this.sabotageCountdownTimer);
      this.sabotageCountdownTimer = null;
    }
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
