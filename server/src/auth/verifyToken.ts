import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { sanitizeNickname } from "@tag/shared";

export type AuthIdentity = {
  sub: string;
  nickname: string;
  name?: string;
  email?: string;
  /** True when the join used the local-only `dev:` token path. */
  dev?: boolean;
  /** True when the join used guest mode (`guest:` token or nickname options). */
  guest?: boolean;
};

export type GuestJoinOptions = {
  nickname?: string;
  guestId?: string;
};

const GUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function issuer(): string {
  const raw = env("AUTH0_ISSUER") ?? env("AUTH0_DOMAIN");
  if (!raw) {
    throw new Error("AUTH0_DOMAIN (or AUTH0_ISSUER) is required");
  }
  const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}/`;
}

function audience(): string {
  const aud = env("AUTH0_AUDIENCE");
  if (!aud) {
    throw new Error("AUTH0_AUDIENCE is required");
  }
  return aud;
}

/** `guest` skips JWKS. Unset or `auth0` keeps the current strict path. */
export function authMode(): "guest" | "auth0" {
  return process.env.AUTH_MODE === "guest" ? "guest" : "auth0";
}

function allowDevTokens(): boolean {
  // Production never accepts `dev:` unless guest mode is explicitly on.
  if (authMode() === "guest") return true;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.ALLOW_DEV_TOKENS === "true";
}

function parsePrefixedToken(
  token: string,
  prefix: "guest" | "dev",
): { id: string; nickname: string } | null {
  const head = `${prefix}:`;
  if (!token.startsWith(head)) return null;
  const rest = token.slice(head.length);
  const colon = rest.indexOf(":");
  if (colon < 1) return null;
  const id = rest.slice(0, colon);
  const nickname = rest.slice(colon + 1);
  if (!GUEST_ID_RE.test(id)) return null;
  return { id, nickname: sanitizeNickname(nickname) };
}

function identityFromDevToken(token: string): AuthIdentity | null {
  const parsed = parsePrefixedToken(token, "dev");
  if (!parsed) return null;
  return {
    sub: `dev|${parsed.id}`,
    nickname: parsed.nickname,
    name: parsed.nickname,
    email: `${parsed.id}@dev.local`,
    dev: true,
  };
}

function identityFromGuestToken(token: string): AuthIdentity | null {
  const parsed = parsePrefixedToken(token, "guest");
  if (!parsed) return null;
  return {
    sub: `guest|${parsed.id}`,
    nickname: parsed.nickname,
    name: parsed.nickname,
    guest: true,
  };
}

function sanitizeGuestId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return GUEST_ID_RE.test(cleaned) ? cleaned : undefined;
}

function identityFromGuestOptions(options?: GuestJoinOptions): AuthIdentity {
  const id = sanitizeGuestId(options?.guestId) ?? `anon${Date.now().toString(36)}`;
  const nickname = sanitizeNickname(options?.nickname, `Guest${id.slice(0, 4)}`);
  return {
    sub: `guest|${id}`,
    nickname,
    name: nickname,
    guest: true,
  };
}

function nicknameFromPayload(payload: JWTPayload): string {
  const nickname = payload.nickname;
  const name = payload.name;
  const email = payload.email;
  if (typeof nickname === "string" && nickname.trim()) return sanitizeNickname(nickname);
  if (typeof name === "string" && name.trim()) return sanitizeNickname(name);
  if (typeof email === "string" && email.includes("@")) {
    return sanitizeNickname(email.split("@")[0]);
  }
  if (typeof payload.sub === "string") return sanitizeNickname(payload.sub);
  return "Player";
}

async function verifyAuth0Jwt(token: string): Promise<AuthIdentity> {
  const iss = issuer();
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${iss}.well-known/jwks.json`));
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: iss,
    audience: audience(),
  });

  if (!payload.sub) {
    throw new Error("Token missing sub");
  }

  return {
    sub: payload.sub,
    nickname: nicknameFromPayload(payload),
    name: typeof payload.name === "string" ? payload.name : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}

/**
 * Verify a Colyseus join token.
 *
 * - `AUTH_MODE=guest`: accept `guest:<id>:<nickname>` (or `dev:`), or join
 *   options with a nickname. JWKS is skipped. Nicknames are capped at 16 chars.
 * - unset / `AUTH_MODE=auth0`: Auth0 access token (issuer + audience, JWKS).
 *   `dev:<id>:<nickname>` only when ALLOW_DEV_TOKENS=true and not production.
 */
export async function verifyJoinToken(
  token: unknown,
  options?: GuestJoinOptions,
): Promise<AuthIdentity> {
  if (authMode() === "guest") {
    if (typeof token === "string" && token.length > 0) {
      const guest = identityFromGuestToken(token);
      if (guest) return guest;
      if (allowDevTokens()) {
        const dev = identityFromDevToken(token);
        if (dev) return dev;
      }
    }
    return identityFromGuestOptions(options);
  }

  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Missing access token");
  }

  if (allowDevTokens()) {
    const dev = identityFromDevToken(token);
    if (dev) return dev;
  }

  return verifyAuth0Jwt(token);
}
