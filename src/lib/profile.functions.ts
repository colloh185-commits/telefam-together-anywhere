// Signed-in profile endpoints. Every input is validated and sanitized here regardless of the client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isOldEnough, sanitizeText, USERNAME_RE, usernameFromEmail } from "./rules";

const deviceSchema = z.string().regex(/^[a-f0-9]{64}$/).optional();

export type MyProfile = {
  id: string;
  full_name: string;
  username: string;
  phone_country: string;
  phone_e164: string;
  gender: string;
  date_of_birth: string;
  bio: string;
  location_label: string | null;
  avatarUrl: string | null;
};

export const getMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ profile: MyProfile | null; email: string | null }> => {
    const { supabase, userId, claims } = context;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, username, phone_country, phone_e164, gender, date_of_birth, bio, location_label, avatar_media_id")
      .eq("id", userId)
      .maybeSingle();
    const email = typeof claims?.email === "string" ? claims.email : null;
    if (!data) return { profile: null, email };
    let avatarUrl: string | null = null;
    if (data.avatar_media_id) {
      const { data: media } = await supabase
        .from("media_assets")
        .select("storage_path")
        .eq("id", data.avatar_media_id)
        .maybeSingle();
      if (media) {
        const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(media.storage_path, 60 * 60 * 24);
        avatarUrl = signed?.signedUrl ?? null;
      }
    }
    const { avatar_media_id: _omit, ...rest } = data;
    return { profile: { ...rest, avatarUrl }, email };
  });

export const suggestUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ base: z.string().max(254) }).parse(input))
  .handler(async ({ data, context }) => {
    const base = usernameFromEmail(data.base.includes("@") ? data.base : `${data.base}@x`);
    const candidates = [base];
    for (let i = 0; i < 6; i++) candidates.push(`${base.slice(0, 19)}${Math.floor(100 + Math.random() * 9900)}`);
    for (const c of candidates) {
      const { data: ok } = await context.supabase.rpc("username_available", { _username: c });
      if (ok) return { username: c };
    }
    return { username: `${base.slice(0, 14)}${Date.now().toString().slice(-6)}` };
  });

export const checkUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ username: z.string().max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const u = data.username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) return { available: false, valid: false };
    const { data: ok } = await context.supabase.rpc("username_available", { _username: u });
    return { available: !!ok, valid: true };
  });

export const uploadAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        // base64 JPEG, capped at ~2MB decoded
        image: z.string().max(2_800_000).regex(/^[A-Za-z0-9+/=]+$/),
        device: deviceSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sec = await import("./security.server");
    const img = await import("./image.server");
    const { ipHash, deviceHash } = await sec.requestFingerprints(data.device);

    const t = await sec.throttle(`upload:user:${context.userId}`, "window", 12, 3600);
    if (t.wait > 0) return { ok: false as const, error: "Please try again a little later." };

    const raw = Uint8Array.from(atob(data.image), (c) => c.charCodeAt(0));
    let clean: Awaited<ReturnType<typeof img.sanitizeAvatar>>;
    try {
      clean = await img.sanitizeAvatar(raw);
    } catch (e) {
      await sec.logActivity({ userId: context.userId, event: "media.rejected", ipHash, deviceHash, meta: { reason: e instanceof Error ? e.message : "x" } });
      return { ok: false as const, error: "This photo can't be used. Try another one." };
    }

    const id = crypto.randomUUID();
    const path = `${context.userId}/${id}.jpg`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage.from("avatars").upload(path, clean.bytes, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    if (up.error) {
      console.error("avatar upload failed", up.error.message);
      return { ok: false as const, error: "Upload failed. Please try again." };
    }
    const ins = await supabaseAdmin.from("media_assets").insert({
      id,
      owner_id: context.userId,
      kind: "avatar",
      storage_path: path,
      mime: clean.mime,
      bytes: clean.bytes.byteLength,
      width: clean.width,
      height: clean.height,
      sha256: clean.sha256,
      dhash: clean.dhash,
    });
    if (ins.error) {
      await supabaseAdmin.storage.from("avatars").remove([path]);
      return { ok: false as const, error: "Upload failed. Please try again." };
    }
    const { data: signed } = await supabaseAdmin.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24);
    await sec.logActivity({ userId: context.userId, event: "media.avatar_uploaded", ipHash, deviceHash, meta: { media: id } });
    return { ok: true as const, mediaId: id, url: signed?.signedUrl ?? null };
  });

const profileSchema = z.object({
  fullName: z.string().max(120),
  username: z.string().max(40),
  phoneCountry: z.string().regex(/^[A-Z]{2}$/),
  phoneNumber: z.string().max(32),
  gender: z.enum(["male", "female", "other", "prefer_not"]),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bio: z.string().max(600),
  location: z
    .object({ label: z.string().max(200), lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable() })
    .nullable(),
  avatarMediaId: z.string().uuid().nullable(),
  device: deviceSchema,
});

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sec = await import("./security.server");
    const { parsePhoneNumberFromString } = await import("libphonenumber-js/min");
    const { ipHash, deviceHash } = await sec.requestFingerprints(data.device);
    const fail = (field: string, error: string) => ({ ok: false as const, field, error });

    const t = await sec.throttle(`profile:user:${context.userId}`, "window", 30, 3600);
    if (t.wait > 0) return fail("form", "Please try again a little later.");

    const fullName = sanitizeText(data.fullName);
    if (fullName.length < 2 || fullName.length > 60) return fail("fullName", "Enter your full name.");

    const username = data.username.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return fail("username", "3–24 letters, numbers, dots or underscores.");

    const phone = parsePhoneNumberFromString(data.phoneNumber, data.phoneCountry as never);
    if (!phone || !phone.isValid()) return fail("phone", "Enter a valid phone number.");

    if (!isOldEnough(data.dateOfBirth)) return fail("dateOfBirth", "You must be at least 13 years old.");

    const bio = sanitizeText(data.bio, { multiline: true });
    if (bio.length > 150) return fail("bio", "Keep your bio under 150 characters.");

    const locationLabel = data.location ? sanitizeText(data.location.label).slice(0, 120) || null : null;
    const round = (n: number | null | undefined) => (typeof n === "number" ? Math.round(n * 100) / 100 : null);

    if (data.avatarMediaId) {
      const { data: m } = await context.supabase
        .from("media_assets")
        .select("id")
        .eq("id", data.avatarMediaId)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (!m) return fail("avatar", "Please upload your photo again.");
    }

    const { data: available } = await context.supabase.rpc("username_available", { _username: username });
    if (!available) return fail("username", "That username is taken.");

    const { error } = await context.supabase.from("profiles").upsert({
      id: context.userId,
      full_name: fullName,
      username,
      phone_country: data.phoneCountry,
      phone_e164: phone.number,
      gender: data.gender,
      date_of_birth: data.dateOfBirth,
      bio,
      location_label: locationLabel,
      location_lat: round(data.location?.lat),
      location_lng: round(data.location?.lng),
      avatar_media_id: data.avatarMediaId,
    });
    if (error) {
      if (error.code === "23505") return fail("username", "That username is taken.");
      if (error.message?.includes("age_requirement")) return fail("dateOfBirth", "You must be at least 13 years old.");
      console.error("profile save failed", error.code, error.message);
      return fail("form", "Couldn't save your profile. Please try again.");
    }
    await sec.logActivity({ userId: context.userId, event: "profile.saved", ipHash, deviceHash });
    return { ok: true as const };
  });

const eventSchema = z.object({
  event: z.string().regex(/^[a-z0-9_.]{2,64}$/),
  ts: z.string().datetime().optional(),
  meta: z.record(z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
});

export const trackEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ events: z.array(eventSchema).min(1).max(25), device: deviceSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sec = await import("./security.server");
    const t = await sec.throttle(`track:user:${context.userId}`, "window", 600, 3600);
    if (t.wait > 0) return { ok: true };
    const { ipHash, deviceHash } = await sec.requestFingerprints(data.device);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const meta = (m: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(m ?? {}).slice(0, 12));
    await supabaseAdmin.from("activity_logs").insert(
      data.events.map((e) => ({
        user_id: context.userId,
        event: e.event,
        ip_hash: ipHash,
        device_hash: deviceHash,
        meta: meta(e.meta) as never,
        client_ts: e.ts ?? null,
      })),
    );
    return { ok: true };
  });
