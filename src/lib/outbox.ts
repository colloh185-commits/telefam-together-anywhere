// Offline-first action queue. Events are stored locally and flushed with backoff when online.
import { supabase } from "@/integrations/supabase/client";
import { trackEvents } from "./profile.functions";
import { getDeviceId } from "./device";

type Item = { event: string; ts: string; meta?: Record<string, string | number | boolean | null> };
const KEY = "tf.outbox";
const MAX = 300;
let flushing = false;
let attempt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Item[];
  } catch {
    return [];
  }
}
function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX)));
  } catch {
    /* storage full */
  }
}

export function track(event: string, meta?: Item["meta"]) {
  if (typeof window === "undefined") return;
  write([...read(), { event, ts: new Date().toISOString(), meta }]);
  schedule(800);
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), ms);
}

export async function flush() {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return;
  const items = read();
  if (!items.length) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return; // keep until signed in
  flushing = true;
  try {
    const batch = items.slice(0, 25);
    const device = await getDeviceId();
    await trackEvents({ data: { events: batch, device: device || undefined } });
    write(read().slice(batch.length));
    attempt = 0;
    if (read().length) schedule(300);
  } catch {
    attempt = Math.min(attempt + 1, 8);
    const backoff = Math.min(60_000, 1000 * 2 ** attempt) * (0.7 + Math.random() * 0.6);
    schedule(backoff);
  } finally {
    flushing = false;
  }
}

export function startOutbox() {
  if (typeof window === "undefined") return () => {};
  const on = () => schedule(200);
  window.addEventListener("online", on);
  document.addEventListener("visibilitychange", on);
  schedule(1500);
  return () => {
    window.removeEventListener("online", on);
    document.removeEventListener("visibilitychange", on);
  };
}
