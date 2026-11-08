import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, AtSign, Calendar as CalendarIcon, Camera, Check, ChevronDown, Loader2, MapPin, MessageCircleMore, Phone, Plus, User, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarCropper } from "@/components/telefam/AvatarCropper";
import { CountryPicker } from "@/components/telefam/CountryPicker";
import { supabase } from "@/integrations/supabase/client";
import { checkUsername, getMyProfile, saveProfile, suggestUsername, uploadAvatar } from "@/lib/profile.functions";
import { getDeviceId } from "@/lib/device";
import { guessCountry } from "@/lib/countries";
import { isOldEnough, nameFromEmail, sanitizeText, USERNAME_RE } from "@/lib/rules";
import { cacheProfile, hasProfile } from "@/lib/session";
import { track } from "@/lib/outbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Profile setup — Telefam" },
      { name: "description", content: "Tell your friends who you are on Telefam." },
      { property: "og:title", content: "Profile setup — Telefam" },
      { property: "og:description", content: "Tell your friends who you are on Telefam." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    if (await hasProfile(context.userId)) throw redirect({ to: "/home" });
  },
  component: SetupPage,
});

type Draft = {
  fullName: string;
  username: string;
  phoneCountry: string;
  phoneNumber: string;
  gender: "" | "male" | "female" | "other" | "prefer_not";
  dateOfBirth: string;
  bio: string;
  location: { label: string; lat: number | null; lng: number | null } | null;
};

const empty: Draft = { fullName: "", username: "", phoneCountry: "KE", phoneNumber: "", gender: "", dateOfBirth: "", bio: "", location: null };

function Field({ icon, label, htmlFor, error, children }: { icon: ReactNode; label: string; htmlFor?: string | undefined; error?: string | undefined; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex items-center gap-2.5 text-[15px] font-semibold text-foreground">
        <span className="text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-destructive animate-fade">{error}</p>}
    </div>
  );
}

const boxCls =
  "h-12 w-full rounded-xl border border-input bg-field px-4 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-ring";

function SetupPage() {
  const { userId } = Route.useRouteContext();
  const navigate = useNavigate();
  const draftKey = `tf.draft.${userId}`;
  const [d, setD] = useState<Draft>(empty);
  type ErrKey = "fullName" | "username" | "phone" | "gender" | "dateOfBirth" | "bio" | "avatar" | "location" | "phoneCountry" | "phoneNumber";
  const [errors, setErrors] = useState<Partial<Record<ErrKey, string>>>({});
  const [avatar, setAvatar] = useState<{ id: string; url: string } | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uState, setUState] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [locating, setLocating] = useState(false);
  const [dobOpen, setDobOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k === "phoneNumber" ? "phone" : k]: "" }));
  };

  // Autofill from saved draft, then from the account email / Google profile.
  useEffect(() => {
    track("screen.setup");
    (async () => {
      let draft: Draft | null = null;
      try {
        draft = JSON.parse(localStorage.getItem(draftKey) ?? "null") as Draft | null;
      } catch {
        draft = null;
      }
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      const email = user?.email ?? "";
      const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
      const base: Draft = { ...empty, phoneCountry: guessCountry(), fullName: sanitizeText(meta.full_name ?? meta.name ?? "") || nameFromEmail(email) };
      setD(draft ? { ...base, ...draft } : base);
      loaded.current = true;
      if (!draft?.username && email) {
        try {
          const s = await suggestUsername({ data: { base: email } });
          setD((p) => (p.username ? p : { ...p, username: s.username }));
          setUState("ok");
        } catch {
          /* offline: user can type one */
        }
      }
      // Profile might already exist on another device.
      try {
        const r = await getMyProfile();
        if (r.profile) {
          cacheProfile(userId, r.profile);
          navigate({ to: "/home", replace: true });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [draftKey, navigate, userId]);

  // Offline-safe draft autosave
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => localStorage.setItem(draftKey, JSON.stringify(d)), 300);
    return () => clearTimeout(t);
  }, [d, draftKey]);

  // Debounced username availability
  useEffect(() => {
    const u = d.username.trim().toLowerCase();
    if (!u || !USERNAME_RE.test(u)) {
      setUState("idle");
      return;
    }
    setUState("checking");
    const t = setTimeout(async () => {
      try {
        const r = await checkUsername({ data: { username: u } });
        setUState(r.available ? "ok" : "taken");
      } catch {
        setUState("idle");
      }
    }, 450);
    return () => clearTimeout(t);
  }, [d.username]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|gif|heic|heif|avif)$/.test(f.type)) {
      toast.error("Choose a photo (JPG, PNG or WebP).");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast.error("That photo is too large.");
      return;
    }
    setCropFile(f);
  }

  async function onCropped(b64: string, preview: string) {
    setCropFile(null);
    setAvatar({ id: "", url: preview });
    setUploading(true);
    try {
      const device = await getDeviceId();
      const r = await uploadAvatar({ data: { image: b64, device: device || undefined } });
      if (!r.ok) {
        setAvatar(null);
        toast.error(r.error);
        return;
      }
      setAvatar({ id: r.mediaId, url: preview });
      setErrors((e) => ({ ...e, avatar: "" }));
    } catch {
      setAvatar(null);
      toast("Upload didn't finish", { description: "Check your connection and try again." });
    } finally {
      setUploading(false);
    }
  }

  function useLocation() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Math.round(pos.coords.latitude * 100) / 100;
        const lng = Math.round(pos.coords.longitude * 100) / 100;
        let label = `${lat}, ${lng}`;
        try {
          const r = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
          );
          const j = (await r.json()) as { city?: string; locality?: string; countryName?: string };
          const place = [j.city || j.locality, j.countryName].filter(Boolean).join(", ");
          if (place) label = place;
        } catch {
          /* keep coords */
        }
        set("location", { label: sanitizeText(label).slice(0, 120), lat, lng });
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast("Location not shared", { description: "You can type your city instead." });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  function validate(): boolean {
    const e: Partial<Record<ErrKey, string>> = {};
    if (sanitizeText(d.fullName).length < 2) e.fullName = "Enter your full name.";
    if (!USERNAME_RE.test(d.username.trim().toLowerCase())) e.username = "3–24 letters, numbers, dots or underscores.";
    else if (uState === "taken") e.username = "That username is taken.";
    if (d.phoneNumber.replace(/\D/g, "").length < 5) e.phone = "Enter your phone number.";
    if (!d.gender) e.gender = "Select your gender.";
    if (!d.dateOfBirth) e.dateOfBirth = "Select your date of birth.";
    else if (!isOldEnough(d.dateOfBirth)) e.dateOfBirth = "You must be at least 13 years old.";
    if (d.bio.length > 150) e.bio = "Keep it under 150 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate() || saving || uploading) return;
    if (!navigator.onLine) {
      toast("You're offline", { description: "Your details are saved. We'll be ready when you reconnect." });
      return;
    }
    setSaving(true);
    try {
      const device = await getDeviceId();
      const r = await saveProfile({
        data: {
          fullName: d.fullName,
          username: d.username.trim().toLowerCase(),
          phoneCountry: d.phoneCountry,
          phoneNumber: d.phoneNumber,
          gender: d.gender as Exclude<Draft["gender"], "">,
          dateOfBirth: d.dateOfBirth,
          bio: d.bio,
          location: d.location?.label ? d.location : null,
          avatarMediaId: avatar?.id || null,
          device: device || undefined,
        },
      });
      if (!r.ok) {
        if (r.field === "form") toast.error(r.error);
        else setErrors((e) => ({ ...e, [r.field as ErrKey]: r.error }));
        return;
      }
      localStorage.removeItem(draftKey);
      const p = await getMyProfile().catch(() => null);
      if (p?.profile) cacheProfile(userId, p.profile);
      navigate({ to: "/home", replace: true });
    } catch {
      toast("Connection is slow", { description: "Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const maxDob = new Date();
  maxDob.setFullYear(maxDob.getFullYear() - 13);
  const dobDate = d.dateOfBirth ? new Date(`${d.dateOfBirth}T00:00:00`) : undefined;

  return (
    <div className="min-h-dvh bg-header">
      <header className="pt-safe text-header-foreground">
        <div className="relative mx-auto flex max-w-2xl items-center justify-center px-4 pb-9 pt-5">
          <Button
            variant="onHeader"
            size="icon"
            aria-label="Back"
            className="absolute left-3 top-5"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth", replace: true });
            }}
          >
            <ArrowLeft className="!h-6 !w-6" />
          </Button>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Profile Setup</h1>
            <p className="mt-0.5 text-[15px] opacity-90">Tell us about yourself</p>
          </div>
        </div>
      </header>

      <main className="-mt-4 min-h-[calc(100dvh-110px)] rounded-t-[28px] bg-background pb-safe">
        <form
          className="mx-auto grid max-w-2xl gap-5 px-5 pb-10 pt-7 sm:px-8 md:grid-cols-2 md:gap-x-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          <div className="flex flex-col items-center text-center md:col-span-2 animate-rise">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative h-[124px] w-[124px] rounded-full border-2 border-dashed border-primary/60 bg-primary-soft p-1 transition-transform active:scale-95"
              aria-label="Upload profile photo"
            >
              {avatar ? (
                <img src={avatar.url} alt="Your profile photo" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-full">
                  <Camera className="h-11 w-11 text-primary" strokeWidth={2.2} />
                </span>
              )}
              {uploading && (
                <span className="absolute inset-1 flex items-center justify-center rounded-full bg-background/60">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </span>
              )}
              <span className="absolute bottom-0.5 right-0.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                {avatar && !uploading ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" strokeWidth={3} />}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <p className="mt-4 text-[17px] font-bold text-foreground">Upload Profile Photo</p>
            <p className="mt-1 max-w-[260px] text-sm text-muted-foreground">Add a clear photo to help your friends recognize you.</p>
          </div>

          <Field icon={<User />} label="Full Name" htmlFor="fullName" error={errors.fullName}>
            <input id="fullName" className={boxCls} placeholder="Enter your full name" autoComplete="name" maxLength={60} value={d.fullName} onChange={(e) => set("fullName", e.target.value)} />
          </Field>

          <Field icon={<AtSign />} label="Username" htmlFor="username" error={errors.username || (uState === "taken" ? "That username is taken." : undefined)}>
            <div className="relative">
              <input
                id="username"
                className={cn(boxCls, "pr-10")}
                placeholder="Choose a username"
                autoCapitalize="none"
                autoComplete="username"
                spellCheck={false}
                maxLength={24}
                value={d.username}
                onChange={(e) => set("username", e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {uState === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {uState === "ok" && <Check className="h-4 w-4 text-primary" />}
              </span>
            </div>
          </Field>

          <Field icon={<Phone />} label="Phone Number" htmlFor="phone" error={errors.phone}>
            <div className="flex h-12 items-stretch overflow-hidden rounded-xl border border-input bg-field focus-within:border-primary focus-within:ring-3 focus-within:ring-ring">
              <CountryPicker value={d.phoneCountry} onChange={(c) => set("phoneCountry", c)} />
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                maxLength={20}
                placeholder="Enter your phone number"
                className="h-full w-full bg-transparent px-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                value={d.phoneNumber}
                onChange={(e) => set("phoneNumber", e.target.value.replace(/[^\d\s()-]/g, ""))}
              />
            </div>
          </Field>

          <Field icon={<Users />} label="Gender" error={errors.gender}>
            <Select value={d.gender} onValueChange={(v) => set("gender", v as Draft["gender"])}>
              <SelectTrigger className="!h-12 w-full rounded-xl bg-field px-4 text-[15px] data-[placeholder]:text-muted-foreground" aria-label="Gender">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
                <SelectItem value="prefer_not">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field icon={<CalendarIcon />} label="Date of Birth" error={errors.dateOfBirth}>
            <Popover open={dobOpen} onOpenChange={setDobOpen}>
              <PopoverTrigger asChild>
                <button type="button" className={cn(boxCls, "flex items-center justify-between text-left")} aria-label="Date of birth">
                  <span className={cn(!d.dateOfBirth && "text-muted-foreground")}>
                    {dobDate ? format(dobDate, "d MMMM yyyy") : "Select date of birth"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  captionLayout="dropdown"
                  selected={dobDate}
                  defaultMonth={dobDate ?? new Date(maxDob.getFullYear() - 7, 0, 1)}
                  startMonth={new Date(1906, 0)}
                  endMonth={maxDob}
                  disabled={{ after: maxDob }}
                  onSelect={(date) => {
                    if (!date) return;
                    set("dateOfBirth", format(date, "yyyy-MM-dd"));
                    setDobOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>

          <Field icon={<MapPin />} label="Location" htmlFor="location">
            <div className="flex gap-2">
              <input
                id="location"
                className={boxCls}
                placeholder="City, Country"
                maxLength={120}
                value={d.location?.label ?? ""}
                onChange={(e) => set("location", e.target.value ? { label: e.target.value, lat: null, lng: null } : null)}
              />
              <Button type="button" variant="outline" className="h-12 shrink-0 rounded-xl px-3 text-primary" onClick={useLocation} disabled={locating} aria-label="Use my location">
                {locating ? <Loader2 className="animate-spin" /> : <MapPin />}
              </Button>
            </div>
          </Field>

          <div className="md:col-span-2">
            <Field icon={<MessageCircleMore />} label="Bio" htmlFor="bio" error={errors.bio}>
              <div className="relative">
                <textarea
                  id="bio"
                  rows={3}
                  maxLength={150}
                  placeholder="Tell us something about yourself..."
                  className={cn(boxCls, "h-auto min-h-[110px] resize-none py-3 pb-7")}
                  value={d.bio}
                  onChange={(e) => set("bio", e.target.value)}
                />
                <span className="absolute bottom-2.5 right-3 text-xs text-muted-foreground tabular-nums">{d.bio.length}/150</span>
              </div>
            </Field>
          </div>

          <Button type="submit" variant="brand" size="cta" className="mt-2 w-full md:col-span-2" disabled={saving || uploading}>
            {saving ? <Loader2 className="animate-spin" /> : "Continue"}
          </Button>
        </form>
      </main>

      <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={onCropped} />
    </div>
  );
}
