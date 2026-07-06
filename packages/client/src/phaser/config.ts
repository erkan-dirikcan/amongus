export const PHASER_CONFIG = {
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  parent: "game-container",
  pixelArt: true,
  render: { pixelArt: true, antialias: false },
} as const;

export const TILE_SIZE = 32;
export const CAMERA_ZOOM = 2;
export const DIAGONAL_FACTOR = 1 / Math.sqrt(2);
export const INPUT_SEND_INTERVAL_MS = 50;
export const INTERP_FACTOR = 0.3;
