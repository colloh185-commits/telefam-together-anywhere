# Telefam native stack (source only — not built or run in Lovable)

This folder holds the native apps and backend that mirror the web app 1:1.
Nothing here is compiled by the web build; open it in Android Studio / Xcode / GoLand.

```text
native/
  kmp/                 Kotlin Multiplatform + Compose Multiplatform
    shared/            UI (auth, OTP, profile setup, home), rules, offline engine, API
      commonMain       shared UI + logic (same screens, colors, copy as web)
      androidMain      Keystore token vault, device fingerprint, integrity checks
      iosMain          Keychain vault, Sign in with Apple
      desktopMain      Desktop window entry
    androidApp/        Android launcher (animated adaptive icon, R8 obfuscation)
  core-cpp/            C++ core engine: outbox, backoff, cooldown ladder, string vault
  backend-go/          Go API: OTP + rate limits, rotating refresh tokens, media pipeline
```

## Shared rules (must match `src/lib/rules.ts`)
- Code resend cooldown: 1 min for requests 1–3, then 15 min, 1 hour, then 1 day.
- Minimum age 13 (client, server and database).
- Username: `^[a-z0-9_.]{3,24}$`, unique, auto-suggested from the email prefix.

## Layouts
`WindowSizeClass` drives three layouts: bottom bar (compact phones / folded),
navigation rail (medium: tablets, unfolded foldables), and rail + wide content (expanded: iPad, desktop).

## Security
- Tokens: short-lived access token (memory only) + rotating refresh token (Keystore AES-GCM / iOS Keychain,
  `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`). Every refresh issues a new refresh token; reuse of an old
  one revokes the whole token family server-side (`backend-go/internal/tokens`).
- R8 full mode + repackaging + log stripping, native secrets in C++ with compile-time XOR, root/debugger/
  emulator/tamper checks, TLS certificate pinning, `FLAG_SECURE` on auth screens.
- Offline first: every write goes into the C++ outbox (persisted), flushed with exponential backoff + jitter;
  requests use short connect timeouts and resumable retries for weak networks.
