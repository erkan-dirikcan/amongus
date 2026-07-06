import Phaser from "phaser";
import { PHASER_CONFIG } from "./config.js";
import { BootScene } from "./scenes/BootScene.js";
import { GameScene } from "./scenes/GameScene.js";
import type { GameStartedPayload } from "../types.js";

let game: Phaser.Game | null = null;

export function startPhaserGame(payload: GameStartedPayload): void {
  if (game) {
    game.destroy(true);
  }
  game = new Phaser.Game({
    ...PHASER_CONFIG,
    scene: [BootScene, GameScene],
  });
  game.registry.set("gamePayload", payload);
}

export function stopPhaserGame(): void {
  if (game) {
    game.destroy(true);
    game = null;
  }
}
