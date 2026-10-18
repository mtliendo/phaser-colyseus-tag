/** Authoritative arena. Server and both Phaser views share these numbers. */
export const ARENA = {
  width: 960,
  height: 540,
  spawnPadding: 48,
} as const;

export type Obstacle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Axis-aligned obstacles. Coordinates are top-left. */
export const OBSTACLES: Obstacle[] = [
  { id: "mid-block", x: 420, y: 210, width: 120, height: 120 },
  { id: "left-bar", x: 140, y: 80, width: 160, height: 36 },
  { id: "right-bar", x: 660, y: 424, width: 160, height: 36 },
  { id: "top-pillar", x: 720, y: 90, width: 48, height: 140 },
  { id: "bottom-pillar", x: 190, y: 310, width: 48, height: 140 },
];

export const PLAYER_COLORS = [
  0xf43f5e, // rose
  0x22d3ee, // cyan
  0xa3e635, // lime
  0xfbbf24, // amber
  0xa78bfa, // violet
  0xfb7185, // pink
  0x38bdf8, // sky
  0xf97316, // orange
] as const;
