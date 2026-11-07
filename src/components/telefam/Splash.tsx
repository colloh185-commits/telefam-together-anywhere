import { LogoMark, Wordmark } from "./Logo";

/** Animated launcher shown while the app decides where to go. */
export function Splash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <div className="relative">
        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ring" />
        <span className="absolute inset-0 rounded-full bg-primary/20 animate-ring [animation-delay:0.5s]" />
        <div className="animate-launch">
          <LogoMark size={104} animated />
        </div>
      </div>
      <Wordmark className="mt-6 text-4xl animate-rise [animation-delay:0.35s]" />
      <div className="mt-8 flex gap-1.5" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-primary animate-dot" style={{ animationDelay: `${i * 0.16}s` }} />
        ))}
      </div>
    </div>
  );
}
