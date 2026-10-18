import QRCode from "qrcode";
import type { Room } from "@colyseus/sdk";
import { displayName, initAuth, login, renderAuthActions } from "../auth";
import { createHostRoom, formatClock } from "../colyseus";
import { createGame } from "../game/createGame";
import { HostScene } from "../game/HostScene";
import { hexColor, listPlayers, type SyncedObstacle, type SyncedPlayer, type SyncedScore } from "../state";

const actions = must("#auth-actions");
const statusEl = must("#host-status");
const timerEl = must("#host-timer");
const lobbyEl = must("#lobby");
const arenaWrap = must("#arena-wrap");
const resultsEl = must("#results");
const roomIdEl = must("#room-id");
const joinUrlEl = must("#join-url");
const qrEl = must<HTMLImageElement>("#qr");
const playerList = must("#player-list");
const liveList = must("#live-list");
const startBtn = must<HTMLButtonElement>("#start-btn");
const lobbyError = must("#lobby-error");
const itBanner = must("#it-banner");
const scoreboard = must("#scoreboard");

const session = await initAuth();
renderAuthActions(session, actions);

if (!session.authenticated || !session.token) {
  statusEl.textContent = "Login required";
  await login();
  throw new Error("redirecting to login");
}

statusEl.textContent = `Host · ${displayName(session)}`;

let room: Room;
try {
  room = await createHostRoom(session.token);
} catch (error) {
  statusEl.textContent = "Could not create room";
  showError(error);
  throw error;
}

const joinUrl = `${window.location.origin}/play?room=${room.roomId}`;
roomIdEl.textContent = room.roomId;
joinUrlEl.textContent = joinUrl;
qrEl.src = await QRCode.toDataURL(joinUrl, { margin: 1, width: 512 });

startBtn.addEventListener("click", () => {
  lobbyError.hidden = true;
  try {
    room.send("start");
  } catch (error) {
    showError(error);
  }
});

room.onError((code, message) => {
  showError(new Error(`${code}: ${message}`));
});

const scene = new HostScene();
let game: ReturnType<typeof createGame> | undefined;

room.onStateChange(() => {
  const state = room.state as {
    phase: string;
    remainingMs: number;
    itSessionId: string;
    players: Map<string, SyncedPlayer>;
    obstacles: SyncedObstacle[];
    scores: SyncedScore[];
  };
  const players = listPlayers(state);
  renderPlayerList(playerList, players);
  renderPlayerList(liveList, players);
  startBtn.disabled = players.filter((p) => p.connected).length < 2;

  if (state.phase === "lobby") {
    lobbyEl.hidden = false;
    arenaWrap.hidden = true;
    resultsEl.hidden = true;
    timerEl.hidden = true;
  } else if (state.phase === "playing") {
    lobbyEl.hidden = true;
    arenaWrap.hidden = false;
    resultsEl.hidden = true;
    timerEl.hidden = false;
    timerEl.textContent = formatClock(state.remainingMs);
    const it = players.find((p) => p.isIt);
    itBanner.textContent = it ? `${it.nickname} is IT` : "No one is IT";
    itBanner.classList.toggle("is-it", Boolean(it));
    if (!game) {
      game = createGame("game-container", scene);
    }
    scene.setSnapshot(players, [...state.obstacles]);
  } else if (state.phase === "results") {
    lobbyEl.hidden = true;
    arenaWrap.hidden = true;
    resultsEl.hidden = false;
    timerEl.hidden = true;
    renderScores([...state.scores]);
    game?.destroy(true);
    game = undefined;
  }
});

function renderPlayerList(list: HTMLElement, players: SyncedPlayer[]): void {
  list.replaceChildren();
  if (players.length === 0) {
    const empty = document.createElement("li");
    empty.innerHTML = `<span class="muted">No players yet</span>`;
    list.append(empty);
    return;
  }
  for (const player of players) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = hexColor(player.color);
    name.append(dot, document.createTextNode(player.nickname + (player.connected ? "" : " (away)")));
    const extra = document.createElement("span");
    extra.textContent = player.isIt ? "IT" : formatMs(player.timeItMs);
    li.append(name, extra);
    list.append(li);
  }
}

function renderScores(scores: SyncedScore[]): void {
  scoreboard.replaceChildren();
  for (const row of scores) {
    const li = document.createElement("li");
    li.textContent = `${row.place}. ${row.nickname} — ${formatMs(row.timeItMs)} as IT`;
    scoreboard.append(li);
  }
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function showError(error: unknown): void {
  lobbyError.hidden = false;
  lobbyError.textContent = error instanceof Error ? error.message : String(error);
}

function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}
