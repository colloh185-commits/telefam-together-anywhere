// Session + onboarding state with offline fallbacks so returning users are never asked to sign in again.
import { supabase } from "@/integrations/supabase/client";
import type { MyProfile } from "./profile.functions";

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return data.session.user.id; // offline: trust local session
  const { data: u, error } = await supabase.auth.getUser();
  if (u.user) return u.user.id;
  // Network trouble (not an auth rejection): keep the local session.
  if (error && (error.status === undefined || error.status === 0 || error.status >= 500)) return data.session.user.id;
  return null;
}

const profileKey = (uid: string) => `tf.profile.${uid}`;

export function cacheProfile(uid: string, p: MyProfile | null) {
  try {
    if (p) localStorage.setItem(profileKey(uid), JSON.stringify(p));
    else localStorage.removeItem(profileKey(uid));
  } catch {
    /* ignore */
  }
}

export function cachedProfile(uid: string): MyProfile | null {
  try {
    const raw = localStorage.getItem(profileKey(uid));
    return raw ? (JSON.parse(raw) as MyProfile) : null;
  } catch {
    return null;
  }
}

/** Whether this user finished profile setup. Uses the database when reachable, cache otherwise. */
export async function hasProfile(uid: string): Promise<boolean> {
  if (cachedProfile(uid)) return true;
  const { data, error } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
  if (error) return false;
  return !!data;
}

export function clearLocalData() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("tf.profile.") || k.startsWith("tf.draft") || k === "tf.outbox" || k.startsWith("tf.cd."))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
