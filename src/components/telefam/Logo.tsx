import { cn } from "@/lib/utils";

/** Telefam mark: red disc with a white paper plane. Colors are brand constants of the logo artwork. */
export function LogoMark({ size = 96, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Telefam"
      className={cn(animated && "animate-pop", className)}
    >
      <defs>
        <radialGradient id="tf-disc" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ef2b37" />
          <stop offset="60%" stopColor="#cf0f1f" />
          <stop offset="100%" stopColor="#a50b17" />
        </radialGradient>
        <linearGradient id="tf-shadow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7d0811" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#7d0811" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#tf-disc)" />
      <path d="M46 58 L60 78 L96 62 L80 24 Z" fill="url(#tf-shadow)" />
      <g className={cn(animated && "animate-fly")} style={{ transformOrigin: "50% 50%" }}>
        <path d="M19 49.5 L80 23 L44.5 57.5 Z" fill="#ffffff" />
        <path d="M44.5 57.5 L80 23 L60.5 77.5 Z" fill="#f6f1f1" />
        <path d="M44.5 57.5 L46.5 75 L54.5 64.5 Z" fill="#e9c9cc" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("font-display font-extrabold tracking-tight text-primary", className)}>Telefam</span>;
}
