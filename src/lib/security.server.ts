// Server-only helpers: client IP, hashing, throttling and activity logging.
import { getRequest } from "@tanstack/react-start/server";

export function getClientIp(): string {
  const req = getRequest();
  const h = req?.headers;
  const ip =
    h?.get("cf-connecting-ip") ||
    h?.get("x-real-ip") ||
    h?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0";
  return ip.slice(0, 64);
}

export function getUserAgent(): string {
  return (getRequest()?.headers.get("user-agent") ?? "").slice(0, 256);
}

export function getRequestOrigin(): string | null {
  const h = getRequest()?.headers;
  return h?.get("origin") ?? null;
}

async function hmacHex(value: string): Promise<string> {
  const pepper = process.env["FINGERPRINT_PEPPER"] ?? "telefam-dev-pepper";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Keyed hash so raw IPs, emails and device ids are never stored. */
export const fingerprintHash = (kind: string, value: string) => hmacHex(`${kind}:${value}`);

export function cleanDeviceId(fp: unknown): string {
  return typeof fp === "string" && /^[a-f0-9]{64}$/.test(fp) ? fp : "unknown";
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Records a hit and returns seconds to wait (0 = allowed).
 * mode "window": allow `limit` hits per window. mode "ladder": code resend ladder.
 */
export async function throttle(
  key: string,
  mode: "window" | "ladder",
  limit: number,
  windowSeconds: number,
): Promise<{ wait: number; cooldown: number }> {
  const db = await admin();
  const { data, error } = await db.rpc("throttle_hit", {
    _key: key,
    _mode: mode,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error("throttle error", error.message);
    // Fail closed for auth surfaces.
    return { wait: 60, cooldown: 0 };
  }
  const n = Number(data ?? 0);
  if (n < 0) return { wait: 0, cooldown: -n };
  return { wait: n, cooldown: 0 };
}

export async function throttleReset(key: string) {
  const db = await admin();
  await db.rpc("throttle_reset", { _key: key });
}

export async function logActivity(entry: {
  userId?: string | null;
  event: string;
  ipHash?: string | null;
  deviceHash?: string | null;
  meta?: Record<string, unknown>;
  clientTs?: string | null;
}) {
  try {
    const db = await admin();
    await db.from("activity_logs").insert({
      user_id: entry.userId ?? null,
      event: entry.event.slice(0, 64),
      ip_hash: entry.ipHash ?? null,
      device_hash: entry.deviceHash ?? null,
      meta: (entry.meta ?? {}) as never,
      client_ts: entry.clientTs ?? null,
    });
  } catch (e) {
    console.error("log failed", e);
  }
}

/** Fingerprints for the current request: hashed IP + hashed device id. */
export async function requestFingerprints(deviceId: unknown) {
  const ip = getClientIp();
  const dev = cleanDeviceId(deviceId);
  const [ipHash, deviceHash] = await Promise.all([fingerprintHash("ip", ip), fingerprintHash("dev", dev)]);
  return { ipHash, deviceHash };
}
