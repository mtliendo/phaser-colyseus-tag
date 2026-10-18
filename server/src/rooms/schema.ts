import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Synchronized room state.
 *
 * `rules` is the live config object a later agent should patch when wiring
 * host "change rules mid-game" controls. Tag permission is decided in
 * `canTag()` (server/src/rules/canTag.ts) — keep that the single hook.
 */
export const RulesState = schema({
  roundDurationMs: t.number(),
  tagBackImmunityMs: t.number(),
  playerSpeed: t.number(),
  tagRadius: t.number(),
  playerRadius: t.number(),
  allowTag: t.boolean(),
  allowLiveRuleChanges: t.boolean(),
  minPlayersToStart: t.number(),
});
export type RulesState = SchemaType<typeof RulesState>;

export const ObstacleState = schema({
  id: t.string(),
  x: t.number(),
  y: t.number(),
  width: t.number(),
  height: t.number(),
});
export type ObstacleState = SchemaType<typeof ObstacleState>;

export const PlayerState = schema({
  sessionId: t.string(),
  authSub: t.string(),
  nickname: t.string(),
  color: t.number(),
  x: t.number(),
  y: t.number(),
  isIt: t.boolean(),
  connected: t.boolean(),
  /** Epoch ms until which this player cannot be involved in a tag. */
  immuneUntilMs: t.number(),
  /** Cumulative milliseconds spent as "it" this round. */
  timeItMs: t.number(),
});
export type PlayerState = SchemaType<typeof PlayerState>;

export const ScoreState = schema({
  sessionId: t.string(),
  nickname: t.string(),
  timeItMs: t.number(),
  place: t.number(),
});
export type ScoreState = SchemaType<typeof ScoreState>;

export const TagRoomState = schema({
  phase: t.string(),
  hostSessionId: t.string(),
  itSessionId: t.string(),
  remainingMs: t.number(),
  roundEndsAtMs: t.number(),
  players: t.map(PlayerState),
  obstacles: t.array(ObstacleState),
  rules: RulesState,
  scores: t.array(ScoreState),
  mapWidth: t.number(),
  mapHeight: t.number(),
});
export type TagRoomState = SchemaType<typeof TagRoomState>;
