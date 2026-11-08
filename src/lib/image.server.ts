// Server-side image sanitizing: sniff type, fully decode, crop/resize, re-encode, fingerprint.
// Re-encoding from raw pixels drops metadata and any payload hidden in the original file.
import jpeg from "jpeg-js";

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const OUTPUT_SIZE = 512;

export type SanitizedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  sha256: string;
  dhash: string;
  mime: "image/jpeg";
};

export function sniffMime(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf.length > 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return "image/webp";
  return null;
}

function resizeSquare(src: Uint8Array, sw: number, sh: number, size: number): Uint8Array {
  // center square crop + bilinear resample to size x size (RGBA)
  const side = Math.min(sw, sh);
  const ox = (sw - side) / 2;
  const oy = (sh - side) / 2;
  const out = new Uint8Array(size * size * 4);
  const scale = side / size;
  for (let y = 0; y < size; y++) {
    const fy = oy + (y + 0.5) * scale - 0.5;
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = ox + (x + 0.5) * scale - 0.5;
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = src[(y0 * sw + x0) * 4 + c]!;
        const b = src[(y0 * sw + x1) * 4 + c]!;
        const d = src[(y1 * sw + x0) * 4 + c]!;
        const e = src[(y1 * sw + x1) * 4 + c]!;
        out[o + c] = Math.round((a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy);
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/** 64-bit difference hash (perceptual fingerprint) as 16 hex chars. */
function dHash(rgba: Uint8Array, size: number): string {
  const W = 9;
  const H = 8;
  const gray: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(size - 1, Math.floor(((x + 0.5) * size) / W));
      const sy = Math.min(size - 1, Math.floor(((y + 0.5) * size) / H));
      const i = (sy * size + sx) * 4;
      gray.push(0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!);
    }
  }
  let bits = "";
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) bits += gray[y * W + x]! > gray[y * W + x + 1]! ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class ImageRejected extends Error {}

export async function sanitizeAvatar(input: Uint8Array): Promise<SanitizedImage> {
  if (input.byteLength < 100 || input.byteLength > MAX_INPUT_BYTES) throw new ImageRejected("size");
  const mime = sniffMime(input);
  // The app always sends a cropped JPEG; anything else is refused.
  if (mime !== "image/jpeg") throw new ImageRejected("type");

  let decoded: { width: number; height: number; data: Uint8Array };
  try {
    decoded = jpeg.decode(input, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 96 });
  } catch {
    throw new ImageRejected("decode");
  }
  if (decoded.width < 64 || decoded.height < 64 || decoded.width > 4096 || decoded.height > 4096) {
    throw new ImageRejected("dimensions");
  }
  const pixels = resizeSquare(decoded.data, decoded.width, decoded.height, OUTPUT_SIZE);
  const encoded = jpeg.encode({ data: pixels, width: OUTPUT_SIZE, height: OUTPUT_SIZE }, 82);
  const bytes = new Uint8Array(encoded.data.buffer, encoded.data.byteOffset, encoded.data.byteLength);
  return {
    bytes,
    width: OUTPUT_SIZE,
    height: OUTPUT_SIZE,
    sha256: await sha256Hex(bytes),
    dhash: dHash(pixels, OUTPUT_SIZE),
    mime: "image/jpeg",
  };
}
