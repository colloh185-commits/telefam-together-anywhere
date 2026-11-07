// Browser device fingerprint: stable random install id + hardware/browser traits, hashed (SHA-256).
let cached: Promise<string> | null = null;

function installId(): string {
  try {
    let id = localStorage.getItem("tf.iid");
    if (!id) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("tf.iid", id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

function canvasTrait(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 120;
    c.height = 30;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#c8102e";
    ctx.fillRect(2, 2, 60, 20);
    ctx.fillStyle = "#fff";
    ctx.fillText("Telefam✈", 4, 5);
    return c.toDataURL().slice(-64);
  } catch {
    return "";
  }
}

function glTrait(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  } catch {
    return "";
  }
}

export function getDeviceId(): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve("");
  if (cached) return cached;
  cached = (async () => {
    const n = navigator as Navigator & { deviceMemory?: number };
    const traits = [
      installId(),
      n.userAgent,
      n.language,
      n.hardwareConcurrency,
      n.deviceMemory ?? "",
      screen.width,
      screen.height,
      screen.colorDepth,
      window.devicePixelRatio,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvasTrait(),
      glTrait(),
    ].join("|");
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(traits));
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
  })();
  return cached;
}
