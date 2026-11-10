<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (Telefam)
- Business rules (code-resend ladder, minimum age, username format, sanitizing) live in `src/lib/rules.ts` and are mirrored in `native/kmp/.../domain/Rules.kt`, `native/core-cpp/src/engine.cpp` and `native/backend-go/internal/rules`; change all together. Why: web, apps and backend must enforce identical rules.
- Email code send/verify go through `src/lib/auth.functions.ts` (server), never directly from the browser, so per-account/device/IP throttling (`throttle_hit` SQL function, service role only) always applies.
- Raw IPs, emails and device ids are never stored; only HMAC hashes with the `FINGERPRINT_PEPPER` secret. Why: privacy + still usable as rate-limit keys.
- Avatars are uploaded only via the `uploadAvatar` server function: sniff JPEG, decode, resize to 512, re-encode, fingerprint (sha256 + dHash), store as `<userId>/<uuid>.jpg` in the private `avatars` bucket; read via signed URLs.
- `_authenticated/route.tsx` falls back to the local session when the network fails (not on auth rejection). Why: offline-first, returning users are never sent back to sign-in.
- Client actions are logged through the offline outbox (`src/lib/outbox.ts` -> `trackEvents`), server actions via `logActivity`.
- `native/` is source only (KMP + Compose, C++ core, Go API); it is not built by the web app.
