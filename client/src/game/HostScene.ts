import Phaser from "phaser";
import { ARENA } from "@tag/shared";
import type { SyncedObstacle, SyncedPlayer } from "../state";
import { drawBackground, drawObstacles, pruneSprites, upsertPlayerSprite } from "./drawArena";

export class HostScene extends Phaser.Scene {
  private sprites = new Map<string, Phaser.GameObjects.Container>();
  private snapshot: { players: SyncedPlayer[]; obstacles: SyncedObstacle[] } = {
    players: [],
    obstacles: [],
  };
  private paintedObstacles = false;

  constructor() {
    super({ key: "host" });
  }

  setSnapshot(players: SyncedPlayer[], obstacles: SyncedObstacle[]): void {
    this.snapshot = { players, obstacles };
  }

  create(): void {
    drawBackground(this, ARENA.width, ARENA.height);
  }

  update(): void {
    if (!this.paintedObstacles && this.snapshot.obstacles.length > 0) {
      drawObstacles(this, this.snapshot.obstacles);
      this.paintedObstacles = true;
    }

    const living = new Set<string>();
    for (const player of this.snapshot.players) {
      living.add(player.sessionId);
      upsertPlayerSprite(this, this.sprites, player);
    }
    pruneSprites(this.sprites, living);
  }
}
