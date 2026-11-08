import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const VP = 260; // viewport size in px
const OUT = 512; // output size in px

/** Circular crop with drag + zoom. Produces a re-encoded 512x512 JPEG (metadata stripped). */
export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File | null;
  onCancel: () => void;
  onDone: (jpegBase64: string, previewUrl: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setZoom(1);
      setOff({ x: 0, y: 0 });
    };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = img ? Math.max(VP / img.naturalWidth, VP / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : VP;
  const h = img ? img.naturalHeight * base * zoom : VP;
  const clamp = (x: number, y: number) => ({
    x: Math.min((w - VP) / 2, Math.max(-(w - VP) / 2, x)),
    y: Math.min((h - VP) / 2, Math.max(-(h - VP) / 2, y)),
  });

  useEffect(() => {
    setOff((o) => clamp(o.x, o.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function save() {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const k = OUT / VP;
    const left = (VP - w) / 2 + off.x;
    const top = (VP - h) / 2 + off.y;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, left * k, top * k, w * k, h * k);
    const dataUrl = c.toDataURL("image/jpeg", 0.86);
    onDone(dataUrl.split(",")[1] ?? "", dataUrl);
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle>Adjust your photo</DialogTitle>
          <DialogDescription>Drag to position, slide to zoom.</DialogDescription>
        </DialogHeader>
        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-full bg-muted ring-4 ring-primary/25"
          style={{ width: VP, height: VP }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setOff(clamp(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y));
          }}
          onPointerUp={() => (drag.current = null)}
          onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.002)))}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="absolute max-w-none cursor-grab active:cursor-grabbing"
              style={{ width: w, height: h, left: (VP - w) / 2 + off.x, top: (VP - h) / 2 + off.y }}
            />
          )}
        </div>
        <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0] ?? 1)} className="mt-2" aria-label="Zoom" />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="pill" size="sm" className="px-5" onClick={save} disabled={!img}>
            Use photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
