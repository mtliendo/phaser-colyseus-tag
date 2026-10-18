import Phaser from "phaser";
import { ARENA } from "@tag/shared";
import type { SyncedObstacle, SyncedPlayer } from "../state";
import { drawBackground, drawObstacles, pruneSprites, upsertPlayerSprite } from "./drawArena";

export class PlayerScene extends Phaser.Scene {
  private sprites = new Map<string, Phaser.GameObjects.Container>();
  private snapshot: { players: SyncedPlayer[]; obstacles: SyncedObstacle[]; me?: string } = {
    players: [],
    obstacles: [],
  };
  private paintedObstacles = false;

  constructor() {
    super({ key: "player" });
  }

  setSnapshot(players: SyncedPlayer[], obstacles: SyncedObstacle[], me?: string): void {
    this.snapshot = { players, obstacles, me };
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
      upsertPlayerSprite(this, this.sprites, player, player.sessionId === this.snapshot.me);
    }
    pruneSprites(this.sprites, living);

    const me = this.snapshot.players.find((p) => p.sessionId === this.snapshot.me);
    if (me) {
      this.cameras.main.centerOn(me.x, me.y);
      this.cameras.main.setZoom(1.35);
    }
  }
}
