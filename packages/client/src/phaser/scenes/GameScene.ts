import Phaser from "phaser";
import { getSocket } from "../../network/socket.js";
import { TILE_SIZE, CAMERA_ZOOM, DIAGONAL_FACTOR, INPUT_SEND_INTERVAL_MS, INTERP_FACTOR } from "../config.js";
import type { GameStartedPayload, GameTickPayload } from "../../types.js";

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

  constructor() {
    super({ key: "GameScene" });
  }

  init(): void {
    const payload = this.game.registry.get("gamePayload") as GameStartedPayload;
    this.matchId = payload.matchId;
    this.myRole = payload.role;
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

    // 7. Fetch user ID if not set
    if (!this.myUserId) {
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (data.user) {
            this.myUserId = data.user.id;
            this.game.registry.set("userId", this.myUserId);
            this.myPlayer = this.playerSprites[this.myUserId]?.sprite;
          }
        })
        .catch(() => {});
    }
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
}
