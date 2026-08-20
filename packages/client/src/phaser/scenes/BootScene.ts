import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.load.image("tileset", "/assets/tileset.png");
    this.load.tilemapTiledJSON("map", "/assets/map.json");
    this.load.spritesheet("player", "/assets/player.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  create(): void {
    // Payload is stored in game registry by startPhaserGame()
    const payload = this.game.registry.get("gamePayload");
    this.scene.start("GameScene", payload);
  }
}
