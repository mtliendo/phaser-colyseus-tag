/** Display-name cap for guest and Auth0 nicknames. */
export const NICKNAME_MAX = 16;

/**
 * Collapse whitespace, trim, and cap length. Empty input becomes `fallback`.
 * Shared by the client guest form and the server join / setNickname path.
 */
export function sanitizeNickname(value: unknown, fallback = "Player"): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, NICKNAME_MAX);
  return cleaned || fallback;
}
