/** Decorative top (pale) and bottom (brand red) waves used on auth screens. */
export function TopWave() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-28 w-full text-wave-top sm:h-36"
      viewBox="0 0 400 120"
      preserveAspectRatio="none"
    >
      <path d="M0 0 H400 V92 C340 60 300 40 220 52 C140 64 80 20 0 34 Z" fill="currentColor" />
    </svg>
  );
}

export function BottomWave() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full text-primary sm:h-52"
      viewBox="0 0 400 180"
      preserveAspectRatio="none"
    >
      <path d="M0 40 C60 0 130 10 200 50 C270 90 340 70 400 30 V180 H0 Z" fill="currentColor" />
    </svg>
  );
}
