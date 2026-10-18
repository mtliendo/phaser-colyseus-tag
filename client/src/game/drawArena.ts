import Phaser from "phaser";
import type { SyncedObstacle, SyncedPlayer } from "../state";

export function drawBackground(scene: Phaser.Scene, width: number, height: number): void {
  const g = scene.add.graphics();
  g.fillStyle(0x0c1224, 1);
  g.fillRect(0, 0, width, height);
  g.lineStyle(1, 0x1c2744, 1);
  for (let x = 0; x <= width; x += 40) g.lineBetween(x, 0, x, height);
  for (let y = 0; y <= height; y += 40) g.lineBetween(0, y, width, y);
  g.lineStyle(3, 0x2a3354, 1);
  g.strokeRect(2, 2, width - 4, height - 4);
}

export function drawObstacles(scene: Phaser.Scene, obstacles: SyncedObstacle[]): void {
  const g = scene.add.graphics();
  for (const obstacle of obstacles) {
    g.fillStyle(0x334155, 1);
    g.fillRoundedRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 8);
    g.lineStyle(2, 0x64748b, 1);
    g.strokeRoundedRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 8);
  }
}

export function upsertPlayerSprite(
  scene: Phaser.Scene,
  sprites: Map<string, Phaser.GameObjects.Container>,
  player: SyncedPlayer,
  highlight = false,
): void {
  let container = sprites.get(player.sessionId);
  if (!container) {
    const body = scene.add.circle(0, 0, 16, player.color);
    const ring = scene.add.circle(0, 0, 20, 0xf43f5e, 0);
    ring.setStrokeStyle(3, 0xf43f5e, 1);
    ring.setVisible(false);
    const label = scene.add
      .text(0, 24, player.nickname, {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#e2e8f0",
      })
      .setOrigin(0.5, 0);
    container = scene.add.container(player.x, player.y, [ring, body, label]);
    container.setData("body", body);
    container.setData("ring", ring);
    container.setData("label", label);
    sprites.set(player.sessionId, container);
  }

  container.setPosition(player.x, player.y);
  container.setAlpha(player.connected ? 1 : 0.35);
  const ring = container.getData("ring") as Phaser.GameObjects.Arc;
  ring.setVisible(player.isIt);
  const label = container.getData("label") as Phaser.GameObjects.Text;
  label.setText(player.isIt ? `${player.nickname} · IT` : player.nickname);
  if (highlight) {
    container.setScale(1.15);
  }
}

export function pruneSprites(
  sprites: Map<string, Phaser.GameObjects.Container>,
  living: Set<string>,
): void {
  for (const [id, sprite] of sprites) {
    if (!living.has(id)) {
      sprite.destroy();
      sprites.delete(id);
    }
  }
}
