import { ARENA, type Obstacle } from "@tag/shared";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function moveWithCollisions(
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
  obstacles: readonly Obstacle[],
): { x: number; y: number } {
  let nx = clamp(x + vx, radius, ARENA.width - radius);
  let ny = clamp(y + vy, radius, ARENA.height - radius);

  for (const obstacle of obstacles) {
    const resolved = resolveCircleAabb(nx, ny, radius, obstacle);
    nx = resolved.x;
    ny = resolved.y;
  }

  nx = clamp(nx, radius, ARENA.width - radius);
  ny = clamp(ny, radius, ARENA.height - radius);
  return { x: nx, y: ny };
}

function resolveCircleAabb(
  cx: number,
  cy: number,
  radius: number,
  box: Obstacle,
): { x: number; y: number } {
  const nearestX = clamp(cx, box.x, box.x + box.width);
  const nearestY = clamp(cy, box.y, box.y + box.height);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= radius * radius) {
    return { x: cx, y: cy };
  }

  if (distSq === 0) {
    // Center is inside the box — push out along the shallowest axis.
    const left = cx - box.x;
    const right = box.x + box.width - cx;
    const top = cy - box.y;
    const bottom = box.y + box.height - cy;
    const min = Math.min(left, right, top, bottom);
    if (min === left) return { x: box.x - radius, y: cy };
    if (min === right) return { x: box.x + box.width + radius, y: cy };
    if (min === top) return { x: cx, y: box.y - radius };
    return { x: cx, y: box.y + box.height + radius };
  }

  const dist = Math.sqrt(distSq);
  const overlap = radius - dist;
  return {
    x: cx + (dx / dist) * overlap,
    y: cy + (dy / dist) * overlap,
  };
}

export function randomSpawn(
  radius: number,
  obstacles: readonly Obstacle[],
  occupied: Array<{ x: number; y: number }>,
): { x: number; y: number } {
  const pad = ARENA.spawnPadding;
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = pad + Math.random() * (ARENA.width - pad * 2);
    const y = pad + Math.random() * (ARENA.height - pad * 2);
    if (circleHitsAny(x, y, radius + 4, obstacles)) continue;
    if (occupied.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 70 ** 2)) continue;
    return { x, y };
  }
  return { x: ARENA.width / 2, y: ARENA.height / 2 };
}

function circleHitsAny(
  x: number,
  y: number,
  radius: number,
  obstacles: readonly Obstacle[],
): boolean {
  return obstacles.some((box) => {
    const nx = clamp(x, box.x, box.x + box.width);
    const ny = clamp(y, box.y, box.y + box.height);
    const dx = x - nx;
    const dy = y - ny;
    return dx * dx + dy * dy < radius * radius;
  });
}
