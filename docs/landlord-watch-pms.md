# Landlord Watch in the PMS app

Landlord Watch is a self-contained mode for property owners. Everything lives in `src/watch/**`.
Contract: `LANDLORD_WATCH_CONTRACT.md` v1.1.

## How the mode is entered
- The normal sign-in screen has a **Landlord Watch** button (`src/components/auh/SignInScreen.tsx`).
  It sets `localStorage['lw.mode']='1'` and reloads (`src/watch/session.ts`).
- `src/main.tsx` renders `WatchRoot` instead of `App` when that flag is set. `App` (and with it AuthProvider and
  the SQLite layer) is **lazy-loaded and never imported in Watch mode**. Nothing under `src/watch` imports
  `src/services/database/**` (Watch has its own Firebase handle in `src/watch/firebase.ts`).
- "Back to normal sign-in" clears the flag and reloads.
- Session: Firebase Auth persistence + the mode flag. A Watch session is a user whose ID token has the
  `otp_phone` claim; an e-mail PMS user is not treated as a Watch session.

## Files
| File | Purpose |
|---|---|
| `api.ts`, `api-types.ts` | the one typed client: real callables, or the mock when `VITE_LW_MOCK=1` |
| `mock.ts` | in-memory backend (worked example, masking, OTP, quota, transcript state machine) |
| `errors.ts` | callable error -> `LwError` / `SignInError` (branches on `details.lw`) |
| `cache.ts`, `useSnapshot.ts` | section 10 cache, stale-while-revalidate, `ifNoneMatch` |
| `i18n.ts` | English + Kiswahili (type-checked: every key in both) |
| `format.ts`, `otp.ts`, `transcriptFlow.ts` | pure helpers (tested) |
| `WatchProvider.tsx`, `useWatch.tsx`, `watchContext.ts` | app state and hooks |
| `WatchRoot.tsx`, `WatchApp.tsx`, `screens/`, `components/` | UI |

## Mock mode
```
VITE_LW_MOCK=1 npm run dev     # then open the app and tap "Landlord Watch"
```
Any Safaricom number signs in; the code is always `123456`.
- `0722000111` is the owner phone of PYP-0001 and PYP-0002: auto-unlock (`auth_phone_match`).
- Any other number sees `tenant` level until it unlocks by OTP (one unlock covers PYP-0001 and PYP-0002).
- `PYP-0003` starts fully masked (`full`). `PYP-9999` does not exist.
- Transcripts: first one free, then KES 99 by M-Pesa (payment confirms after ~6 s; `0700000000` fails).
- Mock unlock lasts 30 minutes (contract section 15).

## Tests
```
node --test src/watch/*.test.ts
```
(Node 22.18+ strips TypeScript types; the repo has no test runner, so `node:test` is used and no dependency is added.)
