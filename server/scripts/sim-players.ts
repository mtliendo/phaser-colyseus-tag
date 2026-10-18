/**
 * Headless 3-player verification.
 * Uses `guest:<id>:<nickname>` when AUTH_MODE=guest, otherwise the local
 * `dev:` token path (ALLOW_DEV_TOKENS=true, not production).
 * Run the server first (`pnpm --filter @tag/server dev`) then `pnpm sim`.
 */
import { Client } from "@colyseus/sdk";

const SERVER = process.env.COLYSEUS_URL ?? "http://localhost:2567";
const ROOM = "tag";

type PlayerView = {
  sessionId: string;
  nickname: string;
  x: number;
  y: number;
  isIt: boolean;
  timeItMs: number;
  connected: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function token(id: string, nickname: string): string {
  const prefix = process.env.AUTH_MODE === "guest" ? "guest" : "dev";
  return `${prefix}:${id}:${nickname}`;
}

function playersOf(state: { players: Map<string, PlayerView> }): PlayerView[] {
  return [...state.players.values()];
}

async function main(): Promise<void> {
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
  const chaseStarted = Date.now();
  let tagged = false;

  while (Date.now() - chaseStarted < 8_000) {
    const snapshot = playersOf(host.state as never);
    const it = snapshot.find((p) => p.isIt);
    if (!it) throw new Error("lost it during chase");

    for (const room of rooms) {
      const me = (room.state as { players: Map<string, PlayerView> }).players.get(room.sessionId);
      if (!me) continue;
      if (me.isIt) {
        const prey = snapshot.find((p) => !p.isIt && p.connected);
        if (!prey) continue;
        room.send("input", directionToward(me, prey));
      } else {
        room.send("input", directionToward(me, it));
      }
    }

    await sleep(50);
    const itNow = playersOf(host.state as never).find((p) => p.isIt);
    if (itNow && itNow.sessionId !== itBefore.sessionId) {
      tagged = true;
      console.log("tag passed", itBefore.nickname, "->", itNow.nickname);
      break;
    }
  }

  if (!tagged) {
    throw new Error("tag did not transfer within 8s");
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

function directionToward(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { dx: number; dy: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mag = Math.hypot(dx, dy) || 1;
  return { dx: dx / mag, dy: dy / mag };
}

main().catch((error) => {
  console.error("SIM_FAIL", error);
  process.exit(1);
});
