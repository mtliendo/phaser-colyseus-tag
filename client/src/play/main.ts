import type { Room } from "@colyseus/sdk";
import { displayName, initAuth, login, renderAuthActions } from "../auth";
import { formatClock, joinPlayerRoom } from "../colyseus";
import { createGame } from "../game/createGame";
import { attachJoystick, preventPageGestures } from "../game/joystick";
import { PlayerScene } from "../game/PlayerScene";
import type { SyncedObstacle, SyncedPlayer } from "../state";
import { listPlayers } from "../state";

preventPageGestures();

const actions = must("#auth-actions");
const statusEl = must("#play-status");
const timerEl = must("#play-timer");
const joinPanel = must("#join-panel");
const playArena = must("#play-arena");
const nicknameInput = must<HTMLInputElement>("#nickname");
const roomInput = must<HTMLInputElement>("#room-id-input");
const joinBtn = must<HTMLButtonElement>("#join-btn");
const joinError = must("#join-error");
const itStatus = must("#it-status");
const joystickEl = must("#joystick");

const session = await initAuth();
renderAuthActions(session, actions);

if (!session.authenticated || !session.token) {
  statusEl.textContent = "Login required";
  await login();
  throw new Error("redirecting to login");
}

nicknameInput.value = displayName(session);
const params = new URLSearchParams(window.location.search);
roomInput.value = params.get("room") ?? "";

joinBtn.addEventListener("click", () => {
  void connect();
});

if (roomInput.value) {
  void connect();
}

async function connect(): Promise<void> {
  joinError.hidden = true;
  const roomId = roomInput.value.trim();
  const nickname = nicknameInput.value.trim() || displayName(session);
  if (!roomId) {
    joinError.hidden = false;
    joinError.textContent = "Room id is required.";
    return;
  }
  if (!session.token) return;

  joinBtn.disabled = true;
  statusEl.textContent = "Joining…";
  try {
    const room = await joinPlayerRoom(roomId, session.token, nickname);
    onJoined(room);
  } catch (error) {
    joinBtn.disabled = false;
    joinError.hidden = false;
    joinError.textContent = error instanceof Error ? error.message : String(error);
    statusEl.textContent = "Join failed";
  }
}

function onJoined(room: Room): void {
  joinPanel.hidden = true;
  playArena.hidden = false;
  statusEl.textContent = `Room ${room.roomId}`;

  const scene = new PlayerScene();
  const game = createGame("game-container", scene);
  let axis = { dx: 0, dy: 0 };
  attachJoystick(joystickEl, (next) => {
    axis = next;
  });

  const sendInput = () => {
    if ((room.state as { phase?: string }).phase === "playing") {
      room.send("input", axis);
    }
  };
  const inputTimer = window.setInterval(sendInput, 50);

  room.onLeave(() => {
    window.clearInterval(inputTimer);
    game.destroy(true);
    statusEl.textContent = "Disconnected";
  });

  room.onStateChange(() => {
    const state = room.state as {
      phase: string;
      remainingMs: number;
      players: Map<string, SyncedPlayer>;
      obstacles: SyncedObstacle[];
    };
    const players = listPlayers(state);
    const me = state.players.get(room.sessionId);
    scene.setSnapshot(players, [...state.obstacles], room.sessionId);

    if (state.phase === "playing") {
      timerEl.hidden = false;
      timerEl.textContent = formatClock(state.remainingMs);
      if (me?.isIt) {
        itStatus.textContent = "You're IT!";
        itStatus.classList.add("hot");
      } else {
        const it = players.find((p) => p.isIt);
        itStatus.textContent = it ? `${it.nickname} is IT` : "Get ready";
        itStatus.classList.remove("hot");
      }
    } else if (state.phase === "results") {
      timerEl.hidden = true;
      const mine = me ? (me.timeItMs / 1000).toFixed(1) : "?";
      itStatus.textContent = `Done · you were IT for ${mine}s`;
      itStatus.classList.remove("hot");
    } else {
      timerEl.hidden = true;
      itStatus.textContent = "Waiting for host to start…";
    }
  });
}

function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}
