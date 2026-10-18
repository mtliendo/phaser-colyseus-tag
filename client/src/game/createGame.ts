import Phaser from "phaser";

export function createGame(parent: string, scene: Phaser.Types.Scenes.SceneType): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#070b16",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 960,
      height: 540,
    },
    scene,
    disableContextMenu: true,
    banner: false,
    input: {
      keyboard: false,
      mouse: true,
      touch: true,
    },
  });
}
