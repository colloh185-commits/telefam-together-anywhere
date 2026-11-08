import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Contact, Layers, LogOut, MessageSquare, MessageSquarePlus, Monitor, Moon, MoreVertical, Plus, Search, Sun, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LogoMark } from "@/components/telefam/Logo";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, type MyProfile } from "@/lib/profile.functions";
import { cacheProfile, cachedProfile, clearLocalData, hasProfile } from "@/lib/session";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { track } from "@/lib/outbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Chats — Telefam" },
      { name: "description", content: "Your Telefam chats with friends, family and groups." },
      { property: "og:title", content: "Chats — Telefam" },
      { property: "og:description", content: "Your Telefam chats with friends, family and groups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    if (!(await hasProfile(context.userId))) throw redirect({ to: "/setup" });
  },
  component: HomePage,
});

const soon = (what: string) => {
  track("ui.coming_soon", { what });
  toast("Coming soon", { description: `${what} is on its way.` });
};

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function Avatar({ p, size = 28 }: { p: MyProfile | null; size?: number }) {
  const initials = (p?.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return p?.avatarUrl ? (
    <img src={p.avatarUrl} alt="" width={size} height={size} className="rounded-full object-cover ring-2 ring-background" style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary" style={{ width: size, height: size }}>
      {initials}
    </span>
  );
}

type Tab = "chats" | "contacts" | "post" | "feeds" | "profile";

function HomePage() {
  const { userId } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const online = useOnline();
  const [profileOpen, setProfileOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const { data: profile } = useQuery({
    queryKey: ["me", userId],
    queryFn: async () => {
      const r = await getMyProfile();
      cacheProfile(userId, r.profile);
      return r.profile;
    },
    initialData: () => cachedProfile(userId) ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
    networkMode: "offlineFirst",
    retry: (n) => n < 4,
    retryDelay: (n) => Math.min(30_000, 1000 * 2 ** n),
  });

  useEffect(() => {
    track("screen.home");
  }, []);

  const onTab = (t: Tab) => {
    if (t === "chats") return;
    if (t === "profile") {
      track("ui.profile_open");
      setProfileOpen(true);
      return;
    }
    soon(t === "post" ? "Posting" : t === "contacts" ? "Contacts" : "Feeds");
  };

  async function signOut() {
    track("auth.sign_out");
    await qc.cancelQueries();
    qc.clear();
    clearLocalData();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "chats", label: "Chats", icon: <MessageSquare className="h-[22px] w-[22px]" fill="currentColor" /> },
    { id: "contacts", label: "Contacts", icon: <Contact className="h-[22px] w-[22px]" /> },
    { id: "post", label: "Post", icon: <Plus className="h-6 w-6" strokeWidth={2.6} /> },
    { id: "feeds", label: "Feeds", icon: <Layers className="h-[22px] w-[22px]" /> },
    { id: "profile", label: "Profile", icon: <Avatar p={profile ?? null} size={26} /> },
  ];

  return (
    <div className="flex min-h-dvh bg-header md:bg-background">
      {/* Navigation rail: tablets, foldables (unfolded) and desktop */}
      <aside className="sticky top-0 hidden h-dvh w-[84px] shrink-0 flex-col items-center gap-2 border-r border-border bg-card py-5 md:flex lg:w-[220px] lg:items-stretch lg:px-3">
        <div className="mb-4 flex items-center gap-2.5 lg:px-2">
          <LogoMark size={38} />
          <span className="hidden text-xl font-extrabold text-primary lg:inline">Telefam</span>
        </div>
        {nav.map((n) =>
          n.id === "post" ? (
            <Button key={n.id} variant="pill" className="my-2 h-11 w-11 p-0 shadow-fab lg:w-full lg:gap-2" onClick={() => onTab(n.id)} aria-label="Post">
              {n.icon}
              <span className="hidden lg:inline">New post</span>
            </Button>
          ) : (
            <button
              key={n.id}
              onClick={() => onTab(n.id)}
              aria-current={n.id === "chats" ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition-colors lg:flex-row lg:gap-3 lg:px-3 lg:text-sm",
                n.id === "chats" ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {n.icon}
              {n.label}
            </button>
          ),
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 bg-header pt-safe text-header-foreground">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-3 pb-7 pt-3 sm:px-5 md:pb-4">
            <button
              onClick={() => soon("Search")}
              className="flex h-10 flex-1 items-center gap-2.5 rounded-full bg-card px-4 text-left text-[15px] text-muted-foreground shadow-sm transition-transform active:scale-[0.99]"
            >
              <Search className="h-[18px] w-[18px]" />
              Search chats, people, groups
            </button>
            <Button variant="onHeader" size="iconSm" aria-label="More options" onClick={() => soon("Menu")}>
              <MoreVertical className="!h-5 !w-5" />
            </Button>
          </div>
          {!online && (
            <div className="flex items-center justify-center gap-1.5 bg-primary-deep py-1 text-xs font-medium animate-fade">
              <WifiOff className="h-3.5 w-3.5" /> Waiting for network…
            </div>
          )}
        </header>

        <main className="-mt-4 flex flex-1 flex-col rounded-t-[28px] bg-background pb-24 md:mt-0 md:rounded-none md:pb-0">
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-[92px] w-[92px] items-center justify-center rounded-full bg-primary-soft animate-pop">
              <svg viewBox="0 0 48 48" className="h-11 w-11 text-primary" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="7" width="28" height="20" rx="6" />
                <path d="M11 27 L9 34 L18 27" />
                <path d="M12 15 H26 M12 20 H22" strokeLinecap="round" />
                <path d="M33 16 H37 a6 6 0 0 1 6 6 V30 a6 6 0 0 1 -6 6 H36 L38 41 L30 36 H24 a6 6 0 0 1 -6 -6 V31" />
              </svg>
            </div>
            <h1 className="mt-5 text-[22px] font-bold text-foreground animate-rise">Start a conversation</h1>
            <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted-foreground animate-rise [animation-delay:0.08s]">
              Tap the button below to chat with your friends, family or groups
            </p>
            <Button variant="pill" size="cta" className="mt-6 gap-2.5 px-7 animate-rise [animation-delay:0.15s]" onClick={() => soon("Chats")}>
              <MessageSquarePlus className="!h-5 !w-5" />
              Start chat
            </Button>
          </div>
        </main>

        {/* Bottom navigation: phones */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-safe backdrop-blur md:hidden" aria-label="Main">
          <ul className="mx-auto grid h-16 max-w-lg grid-cols-5 items-end">
            {nav.map((n) => (
              <li key={n.id} className="flex justify-center">
                {n.id === "post" ? (
                  <button onClick={() => onTab("post")} className="group -mt-6 flex flex-col items-center gap-1 pb-1.5" aria-label="Post">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-fab transition-transform group-active:scale-90">
                      {n.icon}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">Post</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onTab(n.id)}
                    aria-current={n.id === "chats" ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-1 pb-2 pt-2 text-[11px] font-semibold transition-transform active:scale-90",
                      n.id === "chats" ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {n.icon}
                    {n.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl pb-safe">
          <SheetHeader className="items-center text-center">
            <Avatar p={profile ?? null} size={72} />
            <SheetTitle className="mt-2">{profile?.full_name ?? "Your profile"}</SheetTitle>
            <SheetDescription>@{profile?.username}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                {(
                  [
                    ["light", "Light", <Sun key="s" className="h-4 w-4" />],
                    ["dark", "Dark", <Moon key="m" className="h-4 w-4" />],
                    ["system", "System", <Monitor key="d" className="h-4 w-4" />],
                  ] as [ThemeChoice, string, React.ReactNode][]
                ).map(([id, label, icon]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setTheme(id);
                      track("ui.theme", { theme: id });
                    }}
                    className={cn(
                      "flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
                      theme === id ? "bg-card text-primary shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="outline" className="h-10 w-full justify-center gap-2 rounded-xl text-destructive" onClick={signOut}>
              <LogOut /> Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
