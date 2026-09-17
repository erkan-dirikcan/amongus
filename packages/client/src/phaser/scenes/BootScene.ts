import Phaser from "phaser";
import { generatePlayerTextures, generateMarkerTextures } from "../sprites.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.load.image("tileset", "/assets/tileset.png");
    this.load.tilemapTiledJSON("map", "/assets/map.json");
  }

  create(): void {
    // Sprites and markers are drawn procedurally (see sprites.ts)
    generatePlayerTextures(this);
    generateMarkerTextures(this);
    // Payload is stored in game registry by startPhaserGame()
    const payload = this.game.registry.get("gamePayload");
    this.scene.start("GameScene", payload);
  }
}
