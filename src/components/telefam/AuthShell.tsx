import type { ReactNode } from "react";
import { LogoMark, Wordmark } from "./Logo";
import { BottomWave, TopWave } from "./Waves";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-background px-5 pt-safe">
      <TopWave />
      <BottomWave />
      <div className="relative z-10 flex w-full max-w-[400px] flex-1 flex-col items-center pt-14 pb-40 sm:pt-20">
        <div className="animate-launch">
          <LogoMark size={92} />
        </div>
        <h1 className="mt-4 animate-rise [animation-delay:0.1s]">
          <Wordmark className="text-[44px] leading-none" />
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground animate-rise [animation-delay:0.18s]">
          Stay connected. Stay together.
        </p>
        <section className="mt-8 w-full rounded-3xl bg-card p-6 shadow-card animate-rise [animation-delay:0.25s]">
          {children}
        </section>
      </div>
    </main>
  );
}
