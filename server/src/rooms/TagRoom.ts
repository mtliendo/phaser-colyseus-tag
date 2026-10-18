import { CloseCode, Room, ServerError } from "colyseus";
import type { Client } from "colyseus";
import {
  ARENA,
  DEFAULT_RULES,
  MessageType,
  OBSTACLES,
  PLAYER_COLORS,
  RoomPhase,
  type InputMessage,
  type JoinOptions,
  type SetNicknameMessage,
  type SetRuleMessage,
} from "@tag/shared";
import { verifyJoinToken, type AuthIdentity } from "../auth/verifyToken.js";
import { canTag } from "../rules/canTag.js";
import { moveWithCollisions, randomSpawn } from "../sim/physics.js";
import {
  ObstacleState,
  PlayerState,
  RulesState,
  ScoreState,
  TagRoomState,
} from "./schema.js";

const TICK_MS = 50;
const RECONNECT_SECONDS = 30;

type Occupant = {
  role: "host" | "player";
  authSub: string;
  input: { dx: number; dy: number };
};

/**
 * Authoritative tag room.
 *
 * Clients send input; this room simulates a fixed tick and broadcasts schema
 * state. Tag permission is exclusively `canTag()` in ../rules/canTag.ts.
 */
export class TagRoom extends Room<{ state: TagRoomState }> {
  maxClients = 12;
  state = new TagRoomState();

  private occupants = new Map<string, Occupant>();
  private colorCursor = 0;

  onCreate(): void {
    this.state.phase = RoomPhase.lobby;
    this.state.hostSessionId = "";
    this.state.itSessionId = "";
    this.state.remainingMs = DEFAULT_RULES.roundDurationMs;
    this.state.roundEndsAtMs = 0;
    this.state.mapWidth = ARENA.width;
    this.state.mapHeight = ARENA.height;
    this.state.rules = this.buildRules();

    for (const obstacle of OBSTACLES) {
      const row = new ObstacleState();
      row.id = obstacle.id;
      row.x = obstacle.x;
      row.y = obstacle.y;
      row.width = obstacle.width;
      row.height = obstacle.height;
      this.state.obstacles.push(row);
    }

    this.onMessage(MessageType.input, (client, message: InputMessage) => {
      this.onInput(client, message);
    });
    this.onMessage(MessageType.start, (client) => {
      this.onStart(client);
    });
    this.onMessage(MessageType.setNickname, (client, message: SetNicknameMessage) => {
      this.onSetNickname(client, message);
    });
    this.onMessage(MessageType.setRule, (client, message: SetRuleMessage) => {
      this.onSetRule(client, message);
    });

    this.setSimulationInterval((delta) => this.tick(delta), TICK_MS);
  }

  /**
   * Reject unauthenticated joins. `options.token` is the Auth0 access token
   * (or a `dev:` token when ALLOW_DEV_TOKENS is on).
   */
  async onAuth(_client: Client, options: JoinOptions): Promise<AuthIdentity> {
    try {
      return await verifyJoinToken(options?.token);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unauthorized";
      throw new ServerError(401, reason);
    }
  }

  onJoin(client: Client, options: JoinOptions, auth: AuthIdentity): void {
    const role = options?.role === "host" ? "host" : "player";

    if (role === "host") {
      if (this.state.hostSessionId && this.state.hostSessionId !== client.sessionId) {
        const existing = this.clients.find((c) => c.sessionId === this.state.hostSessionId);
        if (existing) {
          throw new ServerError(409, "This room already has a host");
        }
      }
      this.state.hostSessionId = client.sessionId;
      this.occupants.set(client.sessionId, { role: "host", authSub: auth.sub, input: { dx: 0, dy: 0 } });
      return;
    }

    const existing = this.findPlayerByAuth(auth.sub);
    if (existing) {
      // Reconnect: take over the existing player slot.
      this.state.players.delete(existing.sessionId);
      existing.sessionId = client.sessionId;
      existing.connected = true;
      existing.nickname = sanitizeNickname(options?.nickname || existing.nickname || auth.nickname);
      this.state.players.set(client.sessionId, existing);
      if (this.state.itSessionId === existing.sessionId || existing.isIt) {
        this.state.itSessionId = client.sessionId;
        existing.isIt = true;
      }
      this.occupants.set(client.sessionId, { role: "player", authSub: auth.sub, input: { dx: 0, dy: 0 } });
      return;
    }

    if (this.state.phase === RoomPhase.results) {
      throw new ServerError(409, "This round is already over");
    }

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.authSub = auth.sub;
    player.nickname = sanitizeNickname(options?.nickname || auth.nickname);
    player.color = PLAYER_COLORS[this.colorCursor % PLAYER_COLORS.length]!;
    this.colorCursor += 1;
    player.isIt = false;
    player.connected = true;
    player.immuneUntilMs = 0;
    player.timeItMs = 0;

    const occupied = [...this.state.players.values()].map((p) => ({ x: p.x, y: p.y }));
    const spawn = randomSpawn(this.state.rules.playerRadius, OBSTACLES, occupied);
    player.x = spawn.x;
    player.y = spawn.y;

    this.state.players.set(client.sessionId, player);
    this.occupants.set(client.sessionId, { role: "player", authSub: auth.sub, input: { dx: 0, dy: 0 } });
  }

  async onLeave(client: Client, code?: number): Promise<void> {
    const occupant = this.occupants.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);

    if (player) {
      player.connected = false;
    }

    if (code !== CloseCode.CONSENTED) {
      try {
        await this.allowReconnection(client, RECONNECT_SECONDS);
        if (player) player.connected = true;
        return;
      } catch {
        // Reconnect window expired or leave was consented.
      }
    }

    this.occupants.delete(client.sessionId);

    if (occupant?.role === "host" && this.state.hostSessionId === client.sessionId) {
      this.state.hostSessionId = "";
    }

    if (player) {
      const wasIt = player.isIt || this.state.itSessionId === client.sessionId;
      this.state.players.delete(client.sessionId);
      if (wasIt && this.state.phase === RoomPhase.playing) {
        this.reassignIt();
      }
    }

    if (
      this.state.phase === RoomPhase.playing &&
      this.connectedPlayerCount() === 0
    ) {
      this.finishRound();
    }
  }

  private onInput(client: Client, message: InputMessage): void {
    const occupant = this.occupants.get(client.sessionId);
    if (!occupant || occupant.role !== "player") return;
    if (this.state.phase !== RoomPhase.playing) return;
    occupant.input.dx = clampAxis(message?.dx);
    occupant.input.dy = clampAxis(message?.dy);
  }

  private onStart(client: Client): void {
    if (client.sessionId !== this.state.hostSessionId) {
      throw new ServerError(403, "Only the host can start the round");
    }
    if (this.state.phase !== RoomPhase.lobby) {
      throw new ServerError(409, "Round already started");
    }
    if (this.connectedPlayerCount() < this.state.rules.minPlayersToStart) {
      throw new ServerError(400, `Need at least ${this.state.rules.minPlayersToStart} players`);
    }

    this.state.scores.clear();
    for (const player of this.state.players.values()) {
      player.timeItMs = 0;
      player.isIt = false;
      player.immuneUntilMs = 0;
    }

    const it = this.pickRandomConnectedPlayer();
    if (!it) {
      throw new ServerError(400, "No players to start");
    }
    it.isIt = true;
    this.state.itSessionId = it.sessionId;
    it.immuneUntilMs = Date.now() + this.state.rules.tagBackImmunityMs;

    this.state.phase = RoomPhase.playing;
    this.state.remainingMs = this.state.rules.roundDurationMs;
    this.state.roundEndsAtMs = Date.now() + this.state.rules.roundDurationMs;
  }

  private onSetNickname(client: Client, message: SetNicknameMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.nickname = sanitizeNickname(message?.nickname || player.nickname);
  }

  /**
   * Host live-rule extension point. Disabled until `rules.allowLiveRuleChanges`
   * is true (the later OpenFGA / host-controls agent should flip that flag
   * and optionally authorize the key here).
   */
  private onSetRule(client: Client, message: SetRuleMessage): void {
    if (client.sessionId !== this.state.hostSessionId) {
      throw new ServerError(403, "Only the host can change rules");
    }
    if (!this.state.rules.allowLiveRuleChanges) {
      throw new ServerError(403, "Live rule changes are disabled in this starter");
    }
    const key = message?.key;
    const value = message?.value;
    if (typeof key !== "string" || !(key in this.state.rules)) {
      throw new ServerError(400, "Unknown rule");
    }
    const current = (this.state.rules as unknown as Record<string, unknown>)[key];
    if (typeof current !== typeof value) {
      throw new ServerError(400, "Rule type mismatch");
    }
    (this.state.rules as unknown as Record<string, unknown>)[key] = value;
  }

  private tick(delta: number): void {
    if (this.state.phase !== RoomPhase.playing) return;

    const now = Date.now();
    const dt = Math.min(delta, 100) / 1000;
    this.state.remainingMs = Math.max(0, this.state.roundEndsAtMs - now);

    const speed = this.state.rules.playerSpeed;
    const radius = this.state.rules.playerRadius;

    for (const [sessionId, player] of this.state.players) {
      if (!player.connected) continue;
      const occupant = this.occupants.get(sessionId);
      if (!occupant) continue;
      const { dx, dy } = occupant.input;
      const mag = Math.hypot(dx, dy);
      if (mag > 0) {
        const vx = (dx / mag) * speed * dt;
        const vy = (dy / mag) * speed * dt;
        const next = moveWithCollisions(player.x, player.y, vx, vy, radius, OBSTACLES);
        player.x = next.x;
        player.y = next.y;
      }
      if (player.isIt) {
        player.timeItMs += Math.min(delta, 100);
      }
    }

    this.resolveTags(now);

    if (this.state.remainingMs <= 0) {
      this.finishRound();
    }
  }

  private resolveTags(nowMs: number): void {
    const it = this.state.players.get(this.state.itSessionId);
    if (!it || !it.connected) {
      this.reassignIt();
      return;
    }

    for (const target of this.state.players.values()) {
      if (!canTag(it, target, { nowMs, state: this.state })) continue;
      this.transferIt(it, target, nowMs);
      break;
    }
  }

  private transferIt(tagger: PlayerState, target: PlayerState, nowMs: number): void {
    tagger.isIt = false;
    target.isIt = true;
    this.state.itSessionId = target.sessionId;
    const immune = nowMs + this.state.rules.tagBackImmunityMs;
    tagger.immuneUntilMs = immune;
    target.immuneUntilMs = immune;
  }

  private reassignIt(): void {
    const next = this.pickRandomConnectedPlayer();
    for (const player of this.state.players.values()) {
      player.isIt = false;
    }
    if (!next) {
      this.state.itSessionId = "";
      if (this.state.phase === RoomPhase.playing) {
        this.finishRound();
      }
      return;
    }
    next.isIt = true;
    this.state.itSessionId = next.sessionId;
    next.immuneUntilMs = Date.now() + this.state.rules.tagBackImmunityMs;
  }

  private finishRound(): void {
    this.state.phase = RoomPhase.results;
    this.state.remainingMs = 0;
    this.state.roundEndsAtMs = 0;

    const ranked = [...this.state.players.values()].sort((a, b) => a.timeItMs - b.timeItMs);
    this.state.scores.clear();
    ranked.forEach((player, index) => {
      const row = new ScoreState();
      row.sessionId = player.sessionId;
      row.nickname = player.nickname;
      row.timeItMs = player.timeItMs;
      row.place = index + 1;
      this.state.scores.push(row);
    });
  }

  private pickRandomConnectedPlayer(): PlayerState | undefined {
    const connected = [...this.state.players.values()].filter((p) => p.connected);
    if (connected.length === 0) return undefined;
    return connected[Math.floor(Math.random() * connected.length)];
  }

  private connectedPlayerCount(): number {
    return [...this.state.players.values()].filter((p) => p.connected).length;
  }

  private findPlayerByAuth(authSub: string): PlayerState | undefined {
    return [...this.state.players.values()].find((p) => p.authSub === authSub);
  }

  private buildRules(): RulesState {
    const rules = new RulesState();
    rules.roundDurationMs = DEFAULT_RULES.roundDurationMs;
    rules.tagBackImmunityMs = DEFAULT_RULES.tagBackImmunityMs;
    rules.playerSpeed = DEFAULT_RULES.playerSpeed;
    rules.tagRadius = DEFAULT_RULES.tagRadius;
    rules.playerRadius = DEFAULT_RULES.playerRadius;
    rules.allowTag = DEFAULT_RULES.allowTag;
    rules.allowLiveRuleChanges = DEFAULT_RULES.allowLiveRuleChanges;
    rules.minPlayersToStart = DEFAULT_RULES.minPlayersToStart;
    return rules;
  }
}

function clampAxis(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(-1, Math.min(1, n));
}

function sanitizeNickname(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, 24);
  return cleaned || "Player";
}
