/**
 * Headless 3-player verification.
 *
 * Tokens: `guest:<id>:<nickname>` when AUTH_MODE=guest (or when pointing at a
 * remote host). Local default is `dev:` unless AUTH_MODE=guest.
 *
 *   AUTH_MODE=guest pnpm sim
 *   AUTH_MODE=guest COLYSEUS_URL=https://phaser-colyseus-tag.up.railway.app pnpm sim
 *
 * Run a local server first (`pnpm --filter @tag/server dev`) for the default URL.
 */
import { Client } from "@colyseus/sdk";
import { ARENA, DEFAULT_RULES, OBSTACLES } from "@tag/shared";
import { moveWithCollisions } from "../src/sim/physics.js";

const SERVER = process.env.COLYSEUS_URL ?? "http://localhost:2567";
const ROOM = "tag";
const CHASE_MS = Number(process.env.SIM_CHASE_MS ?? 20_000);
const TICK_MS = 50;
const LOOKAHEAD_TICKS = 14;
const STUCK_PX = 1.4;

type PlayerView = {
  sessionId: string;
  nickname: string;
  x: number;
  y: number;
  isIt: boolean;
  timeItMs: number;
  connected: boolean;
};

type ChaseMem = {
  x: number;
  y: number;
  stuck: number;
  side: 1 | -1;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return true;
  }
}

function useGuestTokens(): boolean {
  if (process.env.AUTH_MODE === "auth0") return false;
  if (process.env.AUTH_MODE === "guest") return true;
  return !isLocalHost(SERVER);
}

function token(id: string, nickname: string): string {
  const prefix = useGuestTokens() ? "guest" : "dev";
  return `${prefix}:${id}:${nickname}`;
}

function playersOf(state: { players: Map<string, PlayerView> }): PlayerView[] {
  return [...state.players.values()];
}

async function main(): Promise<void> {
  const prefix = useGuestTokens() ? "guest" : "dev";
  console.log(`sim server=${SERVER} tokens=${prefix}:  chase=${CHASE_MS}ms`);

  const client = new Client(SERVER);

  const host = await client.create(ROOM, {
    token: token("host", "Host"),
    role: "host",
    nickname: "Host",
  });
  console.log("host created room", host.roomId);

  const alice = await client.joinById(host.roomId, {
    token: token("alice", "Alice"),
    role: "player",
    nickname: "Alice",
  });
  const bob = await client.joinById(host.roomId, {
    token: token("bob", "Bob"),
    role: "player",
    nickname: "Bob",
  });
  const cara = await client.joinById(host.roomId, {
    token: token("cara", "Cara"),
    role: "player",
    nickname: "Cara",
  });

  await sleep(400);
  const lobbyPlayers = playersOf(host.state as never);
  if (lobbyPlayers.length !== 3) {
    throw new Error(`expected 3 lobby players, got ${lobbyPlayers.length}`);
  }
  console.log(
    "lobby players",
    lobbyPlayers.map((p) => p.nickname).join(", "),
  );

  host.send("start");
  await sleep(300);

  if ((host.state as { phase: string }).phase !== "playing") {
    throw new Error(`expected playing, got ${(host.state as { phase: string }).phase}`);
  }

  const remainingBefore = (host.state as { remainingMs: number }).remainingMs;
  if (remainingBefore <= 0 || remainingBefore > 120_000) {
    throw new Error(`unexpected remainingMs ${remainingBefore}`);
  }

  const itBefore = playersOf(host.state as never).find((p) => p.isIt);
  if (!itBefore) throw new Error("no player is it after start");
  console.log("it at start", itBefore.nickname, itBefore.sessionId);

  const rooms = [alice, bob, cara];
  const memory = new Map<string, ChaseMem>();
  const chaseStarted = Date.now();
  let tagged = false;

  while (Date.now() - chaseStarted < CHASE_MS) {
    const snapshot = playersOf(host.state as never);
    const it = snapshot.find((p) => p.isIt);
    if (!it) throw new Error("lost it during chase");

    for (const room of rooms) {
      const me = (room.state as { players: Map<string, PlayerView> }).players.get(room.sessionId);
      if (!me) continue;
      const target = me.isIt ? closestOther(me, snapshot) : it;
      if (!target) continue;
      const mem = memory.get(me.sessionId) ?? { x: me.x, y: me.y, stuck: 0, side: 1 as const };
      room.send("input", steerToward(me, target, mem));
      mem.x = me.x;
      mem.y = me.y;
      memory.set(me.sessionId, mem);
    }

    await sleep(TICK_MS);
    const itNow = playersOf(host.state as never).find((p) => p.isIt);
    if (itNow && itNow.sessionId !== itBefore.sessionId) {
      tagged = true;
      const elapsed = Date.now() - chaseStarted;
      console.log("tag passed", itBefore.nickname, "->", itNow.nickname, `after ${elapsed}ms`);
      break;
    }
  }

  if (!tagged) {
    throw new Error(`tag did not transfer within ${CHASE_MS}ms`);
  }

  await sleep(600);
  const remainingAfter = (host.state as { remainingMs: number }).remainingMs;
  if (!(remainingAfter < remainingBefore)) {
    throw new Error(`timer did not decrease (${remainingBefore} -> ${remainingAfter})`);
  }
  console.log("timer", remainingBefore, "->", remainingAfter);

  const itHolder = playersOf(host.state as never).find((p) => p.isIt);
  if (itHolder && itHolder.timeItMs <= 0) {
    throw new Error("it holder has no accumulated time");
  }
  console.log("it time", itHolder?.nickname, itHolder?.timeItMs);

  await alice.leave();
  await sleep(200);
  const afterLeave = playersOf(host.state as never);
  const stillIt = afterLeave.find((p) => p.isIt);
  if (alice.sessionId === itHolder?.sessionId) {
    if (!stillIt || stillIt.sessionId === alice.sessionId) {
      throw new Error("it was not reassigned after the it player left");
    }
    console.log("reassigned it after leave ->", stillIt.nickname);
  } else {
    console.log("non-it leave ok; it still", stillIt?.nickname);
  }

  await host.leave();
  await bob.leave();
  await cara.leave();

  console.log("SIM_OK");
}

function closestOther(me: PlayerView, snapshot: PlayerView[]): PlayerView | undefined {
  let best: PlayerView | undefined;
  let bestDist = Infinity;
  for (const other of snapshot) {
    if (other.sessionId === me.sessionId || !other.connected || other.isIt) continue;
    const dist = Math.hypot(other.x - me.x, other.y - me.y);
    if (dist < bestDist) {
      best = other;
      bestDist = dist;
    }
  }
  return best;
}

function directionToward(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { dx: number; dy: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mag = Math.hypot(dx, dy) || 1;
  return { dx: dx / mag, dy: dy / mag };
}

function rotate(dir: { dx: number; dy: number }, radians: number): { dx: number; dy: number } {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { dx: dir.dx * c - dir.dy * s, dy: dir.dx * s + dir.dy * c };
}

/**
 * Chase heading that walks around the shared AABB obstacles.
 *
 * Samples headings around the goal and scores each by simulating a short
 * `moveWithCollisions` lookahead. If the player is not actually moving,
 * apply a perpendicular sidestep so they unstick from a wall.
 */
function steerToward(
  from: { x: number; y: number },
  to: { x: number; y: number },
  mem: ChaseMem,
): { dx: number; dy: number } {
  const goal = directionToward(from, to);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist <= DEFAULT_RULES.tagRadius) return goal;

  const radius = DEFAULT_RULES.playerRadius;
  const step = DEFAULT_RULES.playerSpeed * (TICK_MS / 1000);
  const offsetsDeg = [0, 20, -20, 40, -40, 70, -70, 90, -90, 120, -120, 150, -150, 180];

  let best = goal;
  let bestScore = Infinity;
  let bestTravel = 0;

  for (const deg of offsetsDeg) {
    const dir = rotate(goal, (deg * Math.PI) / 180);
    const predicted = project(from, dir, step, radius, LOOKAHEAD_TICKS);
    const remain = Math.hypot(to.x - predicted.x, to.y - predicted.y);
    const travel = Math.hypot(predicted.x - from.x, predicted.y - from.y);
    const score = remain + Math.abs(deg) * 0.08;
    if (score < bestScore) {
      bestScore = score;
      best = dir;
      bestTravel = travel;
    }
  }

  const moved = Math.hypot(from.x - mem.x, from.y - mem.y);
  if (moved < STUCK_PX) {
    mem.stuck += 1;
  } else {
    mem.stuck = 0;
  }

  if (mem.stuck >= 3 || bestTravel < step * 0.35) {
    if (mem.stuck > 0 && mem.stuck % 12 === 0) {
      mem.side = mem.side === 1 ? -1 : 1;
    }
    const waypoint = sidestepWaypoint(from, goal, mem.side);
    if (waypoint) return directionToward(from, waypoint);
    return { dx: -goal.dy * mem.side, dy: goal.dx * mem.side };
  }

  return best;
}

function project(
  from: { x: number; y: number },
  dir: { dx: number; dy: number },
  step: number,
  radius: number,
  ticks: number,
): { x: number; y: number } {
  let x = from.x;
  let y = from.y;
  for (let i = 0; i < ticks; i++) {
    const next = moveWithCollisions(x, y, dir.dx * step, dir.dy * step, radius, OBSTACLES);
    if (Math.hypot(next.x - x, next.y - y) < 0.15) break;
    x = next.x;
    y = next.y;
  }
  return { x, y };
}

/** Corner just past the first blocking obstacle, used when the player is jammed. */
function sidestepWaypoint(
  from: { x: number; y: number },
  goal: { dx: number; dy: number },
  side: 1 | -1,
): { x: number; y: number } | null {
  const pad = DEFAULT_RULES.playerRadius + 10;
  const probe = { x: from.x + goal.dx * 48, y: from.y + goal.dy * 48 };
  const blocker = OBSTACLES.find((box) =>
    circleHitsBox(probe.x, probe.y, DEFAULT_RULES.playerRadius + 4, box),
  );
  const box = blocker ?? nearestObstacle(from);
  if (!box) return null;

  const corners = [
    { x: box.x - pad, y: box.y - pad },
    { x: box.x + box.width + pad, y: box.y - pad },
    { x: box.x + box.width + pad, y: box.y + box.height + pad },
    { x: box.x - pad, y: box.y + box.height + pad },
  ].map((c) => ({
    x: clamp(c.x, pad, ARENA.width - pad),
    y: clamp(c.y, pad, ARENA.height - pad),
  }));

  const along = { x: goal.dx, y: goal.dy };
  const perp = { x: -goal.dy * side, y: goal.dx * side };
  let best = corners[0]!;
  let bestScore = -Infinity;
  for (const corner of corners) {
    const vx = corner.x - from.x;
    const vy = corner.y - from.y;
    const score = vx * perp.x + vy * perp.y + 0.25 * (vx * along.x + vy * along.y);
    if (score > bestScore) {
      bestScore = score;
      best = corner;
    }
  }
  return best;
}

function nearestObstacle(from: { x: number; y: number }) {
  let best = OBSTACLES[0];
  let bestDist = Infinity;
  for (const box of OBSTACLES) {
    const nx = clamp(from.x, box.x, box.x + box.width);
    const ny = clamp(from.y, box.y, box.y + box.height);
    const dist = Math.hypot(from.x - nx, from.y - ny);
    if (dist < bestDist) {
      best = box;
      bestDist = dist;
    }
  }
  return best;
}

function circleHitsBox(
  x: number,
  y: number,
  radius: number,
  box: (typeof OBSTACLES)[number],
): boolean {
  const nx = clamp(x, box.x, box.x + box.width);
  const ny = clamp(y, box.y, box.y + box.height);
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy < radius * radius;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

main().catch((error) => {
  console.error("SIM_FAIL", error);
  process.exit(1);
});
