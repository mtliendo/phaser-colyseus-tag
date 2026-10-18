export type JoinRole = "host" | "player";

export type JoinOptions = {
  token?: string;
  role?: JoinRole;
  nickname?: string;
  /** Guest-mode identity when no Auth0 token is used. */
  guestId?: string;
};

export type InputMessage = {
  /** Horizontal axis, -1..1 */
  dx: number;
  /** Vertical axis, -1..1 */
  dy: number;
};

export type SetNicknameMessage = {
  nickname: string;
};

export type SetRuleMessage = {
  key: string;
  value: number | boolean | string;
};

export const MessageType = {
  input: "input",
  start: "start",
  setNickname: "setNickname",
  /** Extension point: host live rule changes (gated by rules.allowLiveRuleChanges). */
  setRule: "setRule",
} as const;
