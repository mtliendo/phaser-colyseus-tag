import type { PlayerState, TagRoomState } from "../rooms/schema.js";

export type TagDecisionContext = {
  nowMs: number;
  state: TagRoomState;
};

/**
 * SINGLE TAG-DECISION HOOK
 * ------------------------
 * Every "can A tag B?" answer goes through this function. Do not sprinkle
 * extra tag permission checks in the sim loop.
 *
 * Later extension points (leave these comments):
 *  1. OpenFGA — call a tuple check here (e.g. `can_tag` between tagger and
 *     target, or a room-level `allow_tag` relation) and return false on deny.
 *     Keep the local geometry / immunity / `rules.allowTag` checks either
 *     before or after the FGA call so the room still owns physics.
 *  2. Live rule changes — `state.rules` is already on the synced room state.
 *     A host `setRule` message (gated by `rules.allowLiveRuleChanges`) can
 *     flip `allowTag`, `tagBackImmunityMs`, `tagRadius`, etc. mid-round.
 *     This function already reads those fields; no extra wiring needed once
 *     the host control and/or OpenFGA writer updates `state.rules`.
 */
export function canTag(
  tagger: PlayerState,
  target: PlayerState,
  room: TagDecisionContext,
): boolean {
  const { state, nowMs } = room;
  const rules = state.rules;

  if (state.phase !== "playing") return false;
  if (!rules.allowTag) return false;

  if (!tagger.connected || !target.connected) return false;
  if (!tagger.isIt) return false;
  if (target.isIt) return false;
  if (tagger.sessionId === target.sessionId) return false;
  if (tagger.authSub && tagger.authSub === target.authSub) return false;

  if (nowMs < tagger.immuneUntilMs) return false;
  if (nowMs < target.immuneUntilMs) return false;

  const dx = tagger.x - target.x;
  const dy = tagger.y - target.y;
  const distSq = dx * dx + dy * dy;
  const reach = rules.tagRadius;
  if (distSq > reach * reach) return false;

  // --- OpenFGA hook ---
  // const allowed = await fga.check({ user: tagger.authSub, relation: "can_tag", object: `player:${target.authSub}` });
  // if (!allowed) return false;

  return true;
}
