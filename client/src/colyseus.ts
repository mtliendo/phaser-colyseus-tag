import { Client, type Room } from "@colyseus/sdk";
import type { JoinOptions } from "@tag/shared";

export function colyseusUrl(): string {
  return import.meta.env.VITE_COLYSEUS_URL || "http://localhost:2567";
}

export function getClient(): Client {
  return new Client(colyseusUrl());
}

export async function createHostRoom(token: string): Promise<Room> {
  return getClient().create("tag", { token, role: "host" } satisfies JoinOptions);
}

export async function joinPlayerRoom(
  roomId: string,
  token: string,
  nickname: string,
): Promise<Room> {
  return getClient().joinById(roomId, {
    token,
    role: "player",
    nickname,
  } satisfies JoinOptions);
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
