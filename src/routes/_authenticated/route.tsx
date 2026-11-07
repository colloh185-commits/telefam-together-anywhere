import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { currentUserId } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const uid = await currentUserId();
    if (!uid) throw redirect({ to: "/auth" });
    return { userId: uid };
  },
  component: () => <Outlet />,
});
