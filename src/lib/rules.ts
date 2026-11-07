// Shared business rules used by both browser and server code.
// Keep these pure so they can be unit tested and mirrored in the native core.

/** Seconds a user must wait after their Nth code request within the window. */
export function otpCooldownForHit(hit: number): number {
  if (hit <= 3) return 60;
  if (hit === 4) return 15 * 60;
  if (hit === 5) return 60 * 60;
  return 24 * 60 * 60;
}

export const MIN_AGE = 13;

/** True when someone born on `dob` (YYYY-MM-DD) is at least 13 on `today`. */
export function isOldEnough(dob: string, today: Date = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return false;
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  const td = today.getUTCDate();
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age -= 1;
  return age >= MIN_AGE && age <= 120;
}

/** Strips invisible/control characters, angle brackets and collapses whitespace. */
export function sanitizeText(input: string, { multiline = false }: { multiline?: boolean } = {}): string {
  let s = input.normalize("NFKC");
  // zero-width, bidi overrides and control chars (keep \n for multiline)
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "");
  s = multiline ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "") : s.replace(/[\u0000-\u001F\u007F]/g, "");
  s = s.replace(/[<>]/g, "");
  s = multiline ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim();
}

export const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

/** Builds a valid username candidate from an email address prefix. */
export function usernameFromEmail(email: string): string {
  const prefix = (email.split("@")[0] ?? "").toLowerCase();
  let u = prefix.replace(/\+.*$/, "").replace(/[^a-z0-9_.]/g, "").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
  if (u.length > 20) u = u.slice(0, 20);
  while (u.length < 3) u += "0";
  return u;
}

/** Builds a display name from an email address prefix: "jane.doe_99" -> "Jane Doe". */
export function nameFromEmail(email: string): string {
  const prefix = (email.split("@")[0] ?? "").replace(/\+.*$/, "");
  const words = prefix
    .replace(/[0-9]+/g, " ")
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const name = words.join(" ").trim();
  return name.length >= 2 ? name.slice(0, 60) : "";
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
