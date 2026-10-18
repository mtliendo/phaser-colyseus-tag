export const RoomPhase = {
  lobby: "lobby",
  playing: "playing",
  results: "results",
} as const;

export type RoomPhase = (typeof RoomPhase)[keyof typeof RoomPhase];
