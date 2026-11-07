import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Splash } from "@/components/telefam/Splash";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, hasProfile } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Telefam — Stay connected. Stay together." },
      { name: "description", content: "Chat with friends, family and groups on Telefam." },
      { property: "og:title", content: "Telefam — Stay connected. Stay together." },
      { property: "og:description", content: "Chat with friends, family and groups on Telefam." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Launcher,
});

function Launcher() {
  const navigate = useNavigate();
  useEffect(() => {
    let alive = true;
    const started = Date.now();
    (async () => {
      // Lets the client finish reading a sign-in link from the address bar.
      await supabase.auth.getSession();
      const uid = await currentUserId();
      const dest = !uid ? "/auth" : (await hasProfile(uid)) ? "/home" : "/setup";
      const wait = Math.max(0, 900 - (Date.now() - started));
      setTimeout(() => alive && navigate({ to: dest, replace: true }), wait);
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);
  return <Splash />;
}
