import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AuthIdentity = {
  sub: string;
  nickname: string;
  name?: string;
  email?: string;
  /** True when the join used the local-only `dev:` token path. */
  dev?: boolean;
};

const DEV_TOKEN_RE = /^dev:([A-Za-z0-9_-]{1,64}):(.{1,32})$/;

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

function allowDevTokens(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.ALLOW_DEV_TOKENS === "true";
}

function identityFromDevToken(token: string): AuthIdentity | null {
  const match = DEV_TOKEN_RE.exec(token);
  if (!match) return null;
  const [, sub, nickname] = match;
  return {
    sub: `dev|${sub}`,
    nickname,
    name: nickname,
    email: `${sub}@dev.local`,
    dev: true,
  };
}

function nicknameFromPayload(payload: JWTPayload): string {
  const nickname = payload.nickname;
  const name = payload.name;
  const email = payload.email;
  if (typeof nickname === "string" && nickname.trim()) return nickname.trim().slice(0, 32);
  if (typeof name === "string" && name.trim()) return name.trim().slice(0, 32);
  if (typeof email === "string" && email.includes("@")) {
    return email.split("@")[0]!.slice(0, 32);
  }
  if (typeof payload.sub === "string") return payload.sub.slice(0, 16);
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
 * Production: Auth0 access token (issuer + audience, JWKS via jose).
 * Local only: `dev:<id>:<nickname>` when ALLOW_DEV_TOKENS=true and not production.
 */
export async function verifyJoinToken(token: unknown): Promise<AuthIdentity> {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Missing access token");
  }

  if (allowDevTokens()) {
    const dev = identityFromDevToken(token);
    if (dev) return dev;
  }

  return verifyAuth0Jwt(token);
}
