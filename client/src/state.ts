export type SyncedPlayer = {
  sessionId: string;
  authSub: string;
  nickname: string;
  color: number;
  x: number;
  y: number;
  isIt: boolean;
  connected: boolean;
  immuneUntilMs: number;
  timeItMs: number;
};

export type SyncedObstacle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SyncedScore = {
  sessionId: string;
  nickname: string;
  timeItMs: number;
  place: number;
};

export type SyncedState = {
  phase: string;
  hostSessionId: string;
  itSessionId: string;
  remainingMs: number;
  players: Map<string, SyncedPlayer>;
  obstacles: SyncedObstacle[];
  scores: SyncedScore[];
  mapWidth: number;
  mapHeight: number;
};

export function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

export function listPlayers(state: { players: Map<string, SyncedPlayer> }): SyncedPlayer[] {
  return [...state.players.values()];
}
