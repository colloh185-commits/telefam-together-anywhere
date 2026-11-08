// Public (pre-sign-in) auth endpoints with server-side throttling per account, device and IP.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const deviceSchema = z.string().regex(/^[a-f0-9]{64}$/).optional();

function publicAuthClient() {
  // Created per request; never persists a session on the server.
  return import("@supabase/supabase-js").then(({ createClient }) => {
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
  });
}

const GENERIC_WAIT = { ok: false as const, retryAfter: 60 };

export const requestEmailCode = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({ email: emailSchema, device: deviceSchema, redirectTo: z.string().url().max(300) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sec = await import("./security.server");
    const { ipHash, deviceHash } = await sec.requestFingerprints(data.device);
    const emailHash = await sec.fingerprintHash("email", data.email);

    // Only allow redirecting back to the calling site.
    const origin = sec.getRequestOrigin();
    let redirectTo = data.redirectTo;
    try {
      if (origin && new URL(redirectTo).origin !== origin) redirectTo = origin;
    } catch {
      redirectTo = origin ?? "";
    }

    const ipCheck = await sec.throttle(`otp:ip:${ipHash}`, "window", 20, 3600);
    const devCheck = await sec.throttle(`otp:dev:${deviceHash}`, "window", 10, 3600);
    if (ipCheck.wait > 0 || devCheck.wait > 0) {
      await sec.logActivity({ event: "auth.code_blocked", ipHash, deviceHash, meta: { scope: "net" } });
      return { ok: false as const, retryAfter: Math.max(ipCheck.wait, devCheck.wait) };
    }

    const ladder = await sec.throttle(`otp:email:${emailHash}`, "ladder", 0, 86400);
    if (ladder.wait > 0) {
      await sec.logActivity({ event: "auth.code_blocked", ipHash, deviceHash, meta: { scope: "acct" } });
      return { ok: false as const, retryAfter: ladder.wait };
    }

    const client = await publicAuthClient();
    const { error } = await client.auth.signInWithOtp({
      email: data.email,
      options: redirectTo ? { shouldCreateUser: true, emailRedirectTo: redirectTo } : { shouldCreateUser: true },
    });
    if (error) {
      console.error("otp send failed", error.status, error.message);
      await sec.logActivity({ event: "auth.code_failed", ipHash, deviceHash, meta: { status: error.status ?? 0 } });
      return error.status === 429 ? { ok: false as const, retryAfter: Math.max(ladder.cooldown, 300) } : GENERIC_WAIT;
    }
    await sec.logActivity({ event: "auth.code_sent", ipHash, deviceHash, meta: { e: emailHash.slice(0, 16) } });
    return { ok: true as const, retryAfter: ladder.cooldown };
  });

export const verifyEmailCode = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({ email: emailSchema, code: z.string().regex(/^[0-9]{6,8}$/), device: deviceSchema })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sec = await import("./security.server");
    const { ipHash, deviceHash } = await sec.requestFingerprints(data.device);
    const emailHash = await sec.fingerprintHash("email", data.email);

    const checks = await Promise.all([
      sec.throttle(`ver:ip:${ipHash}`, "window", 60, 3600),
      sec.throttle(`ver:dev:${deviceHash}`, "window", 25, 3600),
      sec.throttle(`ver:email:${emailHash}`, "window", 6, 900),
    ]);
    const wait = Math.max(...checks.map((c) => c.wait));
    if (wait > 0) {
      await sec.logActivity({ event: "auth.verify_blocked", ipHash, deviceHash });
      return { ok: false as const, retryAfter: wait };
    }

    const client = await publicAuthClient();
    const { data: res, error } = await client.auth.verifyOtp({ email: data.email, token: data.code, type: "email" });
    if (error || !res.session) {
      await sec.logActivity({ event: "auth.verify_failed", ipHash, deviceHash });
      return { ok: false as const, retryAfter: 0 };
    }
    await Promise.all([
      sec.throttleReset(`ver:email:${emailHash}`),
      sec.throttleReset(`otp:email:${emailHash}`),
      sec.logActivity({ userId: res.session.user.id, event: "auth.signed_in", ipHash, deviceHash, meta: { via: "code" } }),
    ]);
    return {
      ok: true as const,
      session: { access_token: res.session.access_token, refresh_token: res.session.refresh_token },
    };
  });
