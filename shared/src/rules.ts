/**
 * Live-tunable tag rules. These values live on the Colyseus room state so a
 * later agent can patch them mid-game (host controls) and/or consult OpenFGA
 * inside `canTag()` before applying a tag.
 */
export type RulesConfig = {
  /** Round length in milliseconds. Default: 2 minutes. */
  roundDurationMs: number;
  /** After a successful tag, neither player can tag again until this elapses. */
  tagBackImmunityMs: number;
  /** Movement speed in world units per second. */
  playerSpeed: number;
  /** Distance at which a tag registers (center-to-center). */
  tagRadius: number;
  /** Player body radius used for wall collision. */
  playerRadius: number;
  /** Master switch for tagging. Flip this from host controls later. */
  allowTag: boolean;
  /** When true, the host `setRule` message is accepted. Off in this starter. */
  allowLiveRuleChanges: boolean;
  /** Minimum players required to start a round. */
  minPlayersToStart: number;
};

export const DEFAULT_RULES: RulesConfig = {
  roundDurationMs: 120_000,
  tagBackImmunityMs: 1_500,
  playerSpeed: 220,
  tagRadius: 40,
  playerRadius: 16,
  allowTag: true,
  allowLiveRuleChanges: false,
  minPlayersToStart: 2,
};

export const DEV_RULES: Partial<RulesConfig> = {
  // Keep the same gameplay; the sim script uses a shorter wait, not a shorter round.
};
