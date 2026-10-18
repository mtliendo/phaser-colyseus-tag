import { createAuth0Client, type Auth0Client, type User } from "@auth0/auth0-spa-js";
import { sanitizeNickname } from "@tag/shared";

const DEV_KEY = "tag:dev-session";
const GUEST_KEY = "tag:guest-session";

export type Session = {
  authenticated: boolean;
  token: string | null;
  user: User | { nickname?: string; name?: string; email?: string; sub?: string } | null;
  dev: boolean;
  guest: boolean;
};

type GuestRecord = {
  id: string;
  nickname: string;
};

let auth0: Auth0Client | null = null;
let ready: Promise<void> | null = null;

function authConfig() {
  return {
    domain: import.meta.env.VITE_AUTH0_DOMAIN,
    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
    audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    connection: import.meta.env.VITE_AUTH0_CONNECTION || "email",
  };
}

/** Client-side guest mode. Auth0 SPA code stays wired for AUTH0 mode. */
export function isGuestMode(): boolean {
  return import.meta.env.VITE_AUTH_MODE === "guest";
}

function newGuestId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function readGuestRecord(): GuestRecord | null {
  const raw = localStorage.getItem(GUEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GuestRecord>;
    if (typeof parsed.id !== "string" || parsed.id.length === 0) return null;
    return {
      id: parsed.id.slice(0, 64),
      nickname: sanitizeNickname(parsed.nickname),
    };
  } catch {
    return null;
  }
}

function writeGuestRecord(record: GuestRecord): void {
  localStorage.setItem(GUEST_KEY, JSON.stringify(record));
}

function sessionFromGuest(record: GuestRecord): Session {
  const nickname = sanitizeNickname(record.nickname);
  return {
    authenticated: true,
    token: `guest:${record.id}:${nickname}`,
    user: { nickname, name: nickname, sub: `guest|${record.id}` },
    dev: false,
    guest: true,
  };
}

/**
 * Persist a random guest id + nickname and return a join session.
 * The id is stable across reloads so the room can reconnect the same slot.
 */
export function ensureGuestSession(nickname?: string): Session {
  const existing = readGuestRecord();
  const id = existing?.id ?? newGuestId();
  const clean = sanitizeNickname(
    nickname ?? existing?.nickname,
    `Guest${id.slice(0, 4)}`,
  );
  const record = { id, nickname: clean };
  writeGuestRecord(record);
  return sessionFromGuest(record);
}

export function updateGuestNickname(nickname: string): Session {
  return ensureGuestSession(nickname);
}

export function clearGuestSession(): void {
  localStorage.removeItem(GUEST_KEY);
}

function readDevSession(): Session | null {
  if (!import.meta.env.DEV) return null;
  const raw = sessionStorage.getItem(DEV_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function startDevSession(nickname: string): Session {
  const id = crypto.randomUUID().slice(0, 8);
  const clean = sanitizeNickname(nickname, `Dev${id}`);
  const session: Session = {
    authenticated: true,
    token: `dev:${id}:${clean}`,
    user: { nickname: clean, name: clean, sub: `dev|${id}` },
    dev: true,
    guest: false,
  };
  sessionStorage.setItem(DEV_KEY, JSON.stringify(session));
  return session;
}

export function clearDevSession(): void {
  sessionStorage.removeItem(DEV_KEY);
}

async function ensureAuth0(): Promise<Auth0Client> {
  if (auth0) return auth0;
  const { domain, clientId, audience } = authConfig();
  auth0 = await createAuth0Client({
    domain,
    clientId,
    useRefreshTokens: true,
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience,
      scope: "openid profile email offline_access",
    },
  });
  return auth0;
}

function consumeNameParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  const name = params.get("guestName") || params.get("devName");
  if (!name) return null;
  params.delete("guestName");
  params.delete("devName");
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  window.history.replaceState({}, document.title, next);
  return name;
}

export async function initAuth(): Promise<Session> {
  if (isGuestMode()) {
    return ensureGuestSession(consumeNameParam() ?? undefined);
  }

  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search);
    const devName = params.get("devName");
    if (devName && !readDevSession()) {
      startDevSession(devName);
      params.delete("devName");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState({}, document.title, next);
    }
  }

  if (!ready) {
    ready = (async () => {
      const params = new URLSearchParams(window.location.search);
      if ((params.has("code") || params.has("error")) && params.has("state")) {
        const client = await ensureAuth0();
        const result = await client.handleRedirectCallback();
        const returnTo =
          (result.appState as { returnTo?: string } | undefined)?.returnTo ??
          window.location.pathname;
        window.history.replaceState({}, document.title, returnTo);
      }
    })();
  }
  await ready;

  const dev = readDevSession();
  if (dev?.authenticated) return { ...dev, guest: false };

  try {
    const client = await ensureAuth0();
    const authenticated = await client.isAuthenticated();
    if (!authenticated) {
      return { authenticated: false, token: null, user: null, dev: false, guest: false };
    }
    const [user, token] = await Promise.all([
      client.getUser(),
      client.getTokenSilently({
        authorizationParams: { audience: authConfig().audience },
      }),
    ]);
    if (!token) {
      return { authenticated: false, token: null, user: null, dev: false, guest: false };
    }
    return { authenticated: true, token, user: user ?? null, dev: false, guest: false };
  } catch {
    return { authenticated: false, token: null, user: null, dev: false, guest: false };
  }
}

export async function login(): Promise<void> {
  if (isGuestMode()) return;
  const client = await ensureAuth0();
  const { audience, connection } = authConfig();
  await client.loginWithRedirect({
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience,
      connection,
      scope: "openid profile email offline_access",
    },
    appState: { returnTo: window.location.pathname + window.location.search },
  });
}

export async function logout(): Promise<void> {
  clearDevSession();
  clearGuestSession();
  if (isGuestMode()) {
    window.location.assign("/");
    return;
  }
  const client = await ensureAuth0();
  await client.logout({
    logoutParams: { returnTo: window.location.origin },
  });
}

export function guestIdFromSession(session: Session): string | undefined {
  const sub = session.user && "sub" in session.user ? session.user.sub : undefined;
  if (typeof sub === "string" && sub.startsWith("guest|")) return sub.slice("guest|".length);
  return undefined;
}

export function displayName(session: Session): string {
  const user = session.user;
  if (!user) return "Player";
  return sanitizeNickname(user.nickname || user.name || user.email, "Player");
}

export function renderAuthActions(session: Session, mount: HTMLElement): void {
  mount.replaceChildren();

  if (isGuestMode()) {
    if (session.authenticated && session.user) {
      const who = document.createElement("span");
      who.className = "user-chip";
      who.textContent = displayName(session);
      mount.append(who);
    }
    return;
  }

  if (session.authenticated && session.user) {
    const who = document.createElement("span");
    who.className = "user-chip";
    who.textContent = displayName(session);
    mount.append(who);

    const out = document.createElement("button");
    out.className = "btn ghost";
    out.type = "button";
    out.textContent = "Log out";
    out.addEventListener("click", () => void logout());
    mount.append(out);
    return;
  }

  const inn = document.createElement("button");
  inn.className = "btn primary";
  inn.type = "button";
  inn.textContent = "Log in";
  inn.addEventListener("click", () => void login());
  mount.append(inn);

  if (import.meta.env.DEV) {
    const guest = document.createElement("button");
    guest.className = "btn";
    guest.type = "button";
    guest.textContent = "Dev guest";
    guest.addEventListener("click", () => {
      startDevSession(`Guest${Math.floor(Math.random() * 90 + 10)}`);
      window.location.reload();
    });
    mount.append(guest);
  }
}
