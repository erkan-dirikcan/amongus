import Phaser from "phaser";

// The canvas fills #game-container (which fills the viewport); the camera
// zoom is picked per screen size in GameScene so the visible world stays a
// similar number of tiles on a laptop and a 4K monitor.
export const PHASER_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#0b0f1a",
  parent: "game-container",
  pixelArt: true,
  render: { pixelArt: true, antialias: false },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: "100%",
    height: "100%",
    // Never let the canvas collapse to 0×0 (hidden tabs / pre-layout), which
    // breaks the WebGL framebuffer.
    min: { width: 320, height: 240 },
  },
  input: {
    // Never preventDefault on keys: chat inputs and minigames need them.
    keyboard: { capture: [] },
  },
};

export const TILE_SIZE = 32;
/** Camera zoom for a given canvas width: ~640px of world width feels right. */
export function cameraZoomFor(width: number, height: number): number {
  const z = Math.min(width, height * 1.6) / 560;
  return Math.max(1.5, Math.min(3.5, Math.round(z * 2) / 2));
}
export const DIAGONAL_FACTOR = 1 / Math.sqrt(2);
export const INPUT_SEND_INTERVAL_MS = 50;
export const INTERP_FACTOR = 0.3;
