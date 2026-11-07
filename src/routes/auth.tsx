import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AuthShell } from "@/components/telefam/AuthShell";
import { GoogleButton } from "@/components/telefam/GoogleButton";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { requestEmailCode, verifyEmailCode } from "@/lib/auth.functions";
import { getDeviceId } from "@/lib/device";
import { formatCountdown } from "@/lib/rules";
import { track } from "@/lib/outbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Telefam" },
      { name: "description", content: "Sign in to Telefam with your email or Google." },
      { property: "og:title", content: "Sign in — Telefam" },
      { property: "og:description", content: "Sign in to Telefam with your email or Google." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const emailOk = (v: string) => z.string().trim().email().max(254).safeParse(v).success;
const cdKey = (email: string) => `tf.cd.${email}`;

function readCooldown(email: string): number {
  try {
    const until = Number(localStorage.getItem(cdKey(email)) ?? 0);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch {
    return 0;
  }
}
function saveCooldown(email: string, seconds: number) {
  try {
    localStorage.setItem(cdKey(email), String(Date.now() + seconds * 1000));
  } catch {
    /* ignore */
  }
}

async function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const [shake, setShake] = useState(false);
  const lastSubmit = useRef(0);

  // Already signed in (or arrived from the email link): continue.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/", replace: true });
    });
    track("screen.auth");
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft(() => (step === "code" || email ? readCooldown(email.trim().toLowerCase()) : 0)), 1000);
    return () => clearInterval(t);
  }, [left, email, step]);

  const offline = () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast("You're offline", { description: "Connect to the internet to continue." });
      return true;
    }
    return false;
  };

  async function sendCode(isResend = false) {
    const clean = email.trim().toLowerCase();
    if (!emailOk(clean)) {
      setEmailError("Enter a valid email address");
      return;
    }
    // Client-side guard: debounce + local cooldown
    if (Date.now() - lastSubmit.current < 1500) return;
    lastSubmit.current = Date.now();
    const local = readCooldown(clean);
    if (local > 0) {
      setLeft(local);
      setStep("code");
      return;
    }
    if (offline()) return;
    setBusy(true);
    try {
      const device = await getDeviceId();
      const res = await withTimeout(
        requestEmailCode({ data: { email: clean, device: device || undefined, redirectTo: window.location.origin } }),
      );
      if (res.retryAfter > 0) saveCooldown(clean, res.retryAfter);
      setLeft(res.retryAfter);
      setStep("code");
      if (res.ok) {
        if (isResend) toast.success("New code sent");
      } else {
        toast("Please wait a moment", { description: "You can request a new code when the timer ends." });
      }
    } catch {
      toast("Connection is slow", { description: "Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    if (value.length !== 6 || busy) return;
    if (offline()) return;
    setBusy(true);
    try {
      const device = await getDeviceId();
      const res = await withTimeout(
        verifyEmailCode({ data: { email: email.trim().toLowerCase(), code: value, device: device || undefined } }),
      );
      if (!res.ok) {
        setShake(true);
        setTimeout(() => setShake(false), 450);
        setCode("");
        toast.error(res.retryAfter > 0 ? "Too many attempts. Try again later." : "That code isn't right");
        return;
      }
      const { error } = await supabase.auth.setSession(res.session);
      if (error) throw error;
      navigate({ to: "/", replace: true });
    } catch {
      toast("Connection is slow", { description: "Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (offline()) return;
    track("auth.google_start");
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Google sign-in didn't finish. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/", replace: true });
  }

  return (
    <AuthShell>
      {step === "email" ? (
        <form
          key="email"
          className="animate-fade"
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
          noValidate
        >
          <h2 className="text-center text-[22px] font-bold text-primary">Enter Your Email</h2>
          <p className="mt-1 text-center text-sm text-muted-foreground">Enter your email to get OTP</p>

          <label htmlFor="email" className="mt-6 block text-sm font-semibold text-foreground">
            Email
          </label>
          <div
            className={cn(
              "mt-2 flex h-11 items-center gap-3 rounded-xl border border-input bg-field px-3 transition-shadow focus-within:border-primary focus-within:ring-3 focus-within:ring-ring",
              emailError && "border-destructive",
            )}
          >
            <Mail className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="Enter your email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              className="h-full w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {emailError && <p className="mt-1.5 text-xs text-destructive">{emailError}</p>}

          <Button type="submit" variant="brand" size="cta" className="mt-4 w-full" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : "Send OTP"}
          </Button>

          <div className="my-5 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <GoogleButton onClick={google} disabled={busy} />

          <p className="mt-5 text-center text-xs text-muted-foreground">
            New here? We'll create your account automatically.
          </p>
        </form>
      ) : (
        <div key="code" className="animate-fade">
          <h2 className="text-center text-[22px] font-bold text-primary">Enter OTP</h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">We sent a verification code to</p>
          <p className="mt-0.5 break-all text-center text-[15px] font-semibold text-foreground">{email.trim().toLowerCase()}</p>
          <p className="mt-1 text-center text-xs text-muted-foreground">Enter the code below, or tap the link in the email.</p>

          <div className={cn("mt-6 flex justify-center", shake && "animate-shake")}>
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(v) => {
                const digits = v.replace(/\D/g, "");
                setCode(digits);
                if (digits.length === 6) void verify(digits);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="^[0-9]*$"
              autoFocus
              disabled={busy}
            >
              <InputOTPGroup className="gap-2 sm:gap-2.5">
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-12 w-11 rounded-xl border border-input bg-field text-lg font-semibold first:rounded-xl last:rounded-xl data-[active=true]:border-primary sm:h-13 sm:w-12"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button
            type="button"
            variant="brand"
            size="cta"
            className="mt-6 w-full"
            disabled={busy || code.length !== 6}
            onClick={() => void verify()}
          >
            {busy ? <Loader2 className="animate-spin" /> : "Verify OTP"}
          </Button>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {left > 0 ? (
              <>
                <p>
                  Resend code in <span className="font-semibold text-primary tabular-nums">{formatCountdown(left)}</span>
                </p>
                <p className="mt-1 text-xs">
                  After {formatCountdown(left)} you can <span className="text-primary">Resend code</span>
                </p>
              </>
            ) : (
              <p>
                Didn't get it?{" "}
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => void sendCode(true)} disabled={busy}>
                  Resend code
                </button>
              </p>
            )}
          </div>

          <div className="mt-4 text-center">
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setStep("email");
                setCode("");
              }}
            >
              Change email
            </Button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
