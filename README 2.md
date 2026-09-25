# Plot Yangu — SEO & Marketing Page Overhaul

Everything below was verified against the live `LearnDigitalAdmin/PMS` repo
(cloned fresh, `main` branch) before being written. Where the brief and the
code disagreed, the code won — those cases are called out explicitly.

## How to apply this

1. Drop everything under `new/` into the repo at the matching path (e.g.
   `new/public/robots.txt` → `public/robots.txt`).
2. Replace `index.html` and `src/components/auh/AuthWrapper.tsx` with the
   versions under `modified/`, or apply `CHANGES.diff` with
   `git apply CHANGES.diff` from the repo root.
3. `npm install` (only needed if you haven't already), then
   `npx tsc -b && npx vite build` — both already pass clean against this
   change on my end.

## What changed, and why

### File footprint (verified with `git status` / `git diff` after building)

**Modified (2 files):**
- `index.html` — SEO meta tags, Open Graph, Twitter Card, JSON-LD. No
  existing tags were removed except the single bare `<meta
  name="description">` and `<title>`, which were rewritten.
- `src/components/auh/AuthWrapper.tsx` — `AuthWrapperScreen` now renders a
  nav and six new marketing sections around the **unchanged**
  `HeroSection`, `SignInScreen`, and `SignUpScreen` components. No auth
  logic, Firebase config, or routing in this file was touched — only the
  JSX returned by `AuthWrapperScreen`.

**New (16 files):** eight marketing components under
`src/components/marketing/`, `robots.txt`, `sitemap.xml`, `llms.txt`, four
browser tile icons, two dashboard mockup screenshots, and one OG image —
all under `public/`.

**Not touched, confirmed by `git status`:** routing (`App.tsx`), Firebase
config, `whatsapp/` Cloud Functions, Capacitor/Electron/Android build
files, the database layer, and every existing property/tenant/invoice/
payment/profile screen. `HeroSection.tsx`, `SignInScreen.tsx`, and
`SignUpScreen.tsx` are byte-for-byte unchanged.

### 1. The marketing page

I left `HeroSection.tsx` completely alone — its existing copy ("Reach
tenants by SMS, right from the app") is already accurate, and rewriting it
would have widened the diff for no benefit. Instead, `AuthWrapperScreen` in
`AuthWrapper.tsx` now composes, in order: `MarketingNav` → `HeroSection`
(unchanged) → `HowItWorksSection` → `FeaturesSection` → `PricingSection` →
`FaqSection` → `ContactSection` → the existing Sign In/Sign Up block
(unchanged) → `MarketingFooter`. The nav and hero's "Get Started"/"Sign In"
buttons reuse the same `goToAuth` scroll handler that already existed, so
clicking them still jumps straight to the real auth form, skipping the
marketing content — that behavior is unchanged.

All copy lives in one file, `src/components/marketing/marketingContent.ts`,
so it's easy to review or edit as a block.

**Contact section**: I built it as an inline page section rather than a
modal (there was no existing `ContactUs` component to reuse, per the
brief). A modal would work too if you'd rather — happy to switch it.

### 2. Technical SEO layer

- **`robots.txt`**: I disallowed nothing. This app gates access to real
  data client-side by session, not by URL path — `/properties` renders the
  same public marketing/sign-in screen to an unauthenticated crawler that
  `/` does. There's no path that's meaningfully more "private" at the HTTP
  level, so a `Disallow` would just be theater. Added all the crawler
  allowances you listed, plus a comment pointing at `llms.txt` (there's no
  formal robots.txt directive for it).
- **`sitemap.xml`**: Contains only `/`. Login/signup are a `showSignUp`
  boolean toggle on the same route, not separate URLs — I did not invent
  routes for them. If you'd like `/login` and `/signup` to be real,
  independently-linkable, SEO-indexable routes, that's a genuine (if small)
  routing change and I've deliberately left it undone rather than restructure
  routing without asking. Worth considering as a follow-up.
- **`llms.txt`**: Includes the Cogvana/Samuhia disambiguation (see below)
  explicitly, so an assistant asked "what is Cogvana" doesn't conflate the
  parent company with its sibling EdTech app.
- **`index.html`**: canonical, hreflang (`en-KE` + `x-default`), keywords,
  full OG + Twitter Card tags, and one `@graph` JSON-LD block
  (`Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`), validated
  by parsing it with `json.loads` — it's syntactically valid JSON.
  - **`SoftwareApplication.offers`** only states a price for the Free
    Forever tier (`0 KES`) — genuinely true and verifiable. No other tier's
    price appears anywhere, matching the constraint that real prices are
    Firestore-only.
  - **No `WebSite.SearchAction`** — there's no on-site search feature in
    this app to describe, so I left it out rather than fabricate one.
  - The **`FAQPage` JSON-LD is a hand-copied mirror** of the FAQ shown by
    `FaqSection.tsx` (sourced from `marketingContent.ts`). This is a
    client-rendered SPA with a single static `index.html` shell and no
    build-time generation step, so there's no automatic way to keep the two
    in sync — if you edit one, edit the other. I left comments in both
    files pointing at each other.
- **Fixed the two dead manifest.json screenshot links** (`dashboard.png`,
  `mobile-dashboard.png`) with real mockup images at the exact sizes
  `manifest.json` already declares (1280×720, 750×1334), plus a new OG
  image at 1200×630. **These are static mockups, not live app
  screenshots** — I didn't spin up a working authenticated session against
  real Firestore data (out of scope, and would've meant touching things
  I'm not supposed to touch). They're built from the actual layout and
  labels in `Dashboard.tsx` (Properties/Tenants/Monthly Revenue/Arrears
  cards, Financial Overview chart, Payment Status, Recent Activity, bottom
  nav with the real five routes) and your real logo — not invented
  features. Swap them for real screenshots whenever convenient.
- **Found and fixed a second broken-asset pattern you didn't flag**:
  `public/browserconfig.xml` references four Windows tile icons
  (`icon-70x70.png`, `icon-150x150.png`, `icon-310x310.png`,
  `icon-310x150.png`) that don't exist in `public/icons/` either. Generated
  all four from `assets/icon.png`, same as the two screenshots.

## Corrections to the brief (verified against the live code)

1. **Notifications are SMS-first, not WhatsApp-first.**
   `whatsapp/src/index.ts` sends SMS via HostPinnacle first (if the account
   has credits) and only falls back to WhatsApp on failure or when out of
   credits — and WhatsApp requires the tenant's consent
   (`handleConsent`/`CONSENT` logic in that file). This actually matches
   what `HeroSection.tsx` already says ("Reach tenants by SMS, right from
   the app") — your brief's "WhatsApp Business Cloud API" framing doesn't
   match what the code does. I've worded every place I mention
   notifications (Features, How It Works, FAQ, JSON-LD, `llms.txt`)
   accordingly: SMS first, WhatsApp fallback for tenants who've opted in.

2. **The "Cogvana" branding baked into invoices isn't property-management
   branding — it's cross-promotion for a different Cogvana product.**
   `src/assets/cogvana.json` and the strings built into
   `PDFService.tsx`/`ShareService.tsx` (not `Profile.tsx`, `Invoices.tsx`,
   or `AnInvoice.tsx` — a minor correction to where you said this branding
   lives) promote "Master Digital Skills with Cogvana," "Cogni Tutor," and
   a Play Store download link — an EdTech product, not Plot Yangu. A web
   search confirms `cogvana.co.ke/platforms/plot` frames "Cogvana
   Corporation" as parent to both an EdTech line and Plot Yangu (PropTech),
   so this isn't a bug so much as an overloaded brand name: **"Cogvana" is
   both the parent company and the name of a sibling consumer app.** I've
   made this disambiguation explicit in the FAQ, `llms.txt`, and JSON-LD
   `alternateName` so an AI assistant doesn't conflate them. I did **not**
   touch `PDFService.tsx`/`ShareService.tsx`/`cogvana.json` themselves —
   they're existing invoice/PDF generation code, out of scope for a
   marketing-page change, but you may want to review that cross-promotion
   copy separately.

3. **Couldn't find `createUserWithFirebaseAuth` or `chargeSmsTopUp`
   anywhere in this repo.** `AuthWrapper.tsx` and `SmsPurchaseModal.tsx`
   call these as `httpsCallable` functions, but `whatsapp/src/index.ts` (the
   only Cloud Functions source in `firebase.json`) doesn't export either
   one — I grepped the whole repo for both names and found nothing. They
   must be deployed from something outside this checkout. Doesn't block
   anything here since I didn't touch Cloud Functions, but worth confirming
   those are still correctly deployed in production.

## Judgment calls (flagging as asked, rather than picking silently)

1. **"By Cogvana" vs "by Samuhia" in the nav sub-label.** I went with
   **Cogvana** — it's the only brand directly attested in this specific
   app (the SignUp/SignIn footer literally says "Powered by: SMB KENYA LTD
   and Cogvana Technologies"). I found zero Samuhia touchpoints anywhere in
   the Plot Yangu codebase — WhatsApp/SMS messages sign with each
   landlord's own business name, not "Samuhia" — so asserting a Samuhia
   touchpoint here would be the exact overclaim your brief warned against.
   The FAQ ("Who's behind Plot Yangu?") mentions Cogvana Technologies and
   SMB Kenya Ltd only; it does not mention Samuhia at all, for the same
   reason.

2. **`Organization.legalName` encoding.** I set `name: "Cogvana
   Technologies"`, `legalName: "SMB Kenya Ltd"`, `alternateName: ["Cogvana",
   "Cogvana Corporation"]`. This is my best-effort reading of one footer
   line in `SignUpScreen.tsx`/`SignInScreen.tsx` — I have not seen a
   certificate of incorporation or any other legal document, so treat this
   as a reasonable inference, not a verified legal fact.

3. **Both `solo` and `pro` tiers are flagged `popular: true` in
   `PricingPage.tsx`'s `planStructure`** — almost certainly a copy-paste
   bug, but I didn't touch `PricingPage.tsx` (in-app component, out of
   scope). On the new public pricing section, I **dropped the "Popular"
   badge entirely** rather than arbitrarily pick a winner, and used a
   distinct, defensible "3 months free to start" tag on Business instead
   (which is separately, genuinely true). Let me know which tier should
   actually carry "Popular" and I'll add it.

4. **The SMS availability inconsistency.** `SmsPurchaseModal.tsx` has live,
   tier-priced SMS credit purchasing wired to a real (if unlocatable —
   see above) Cloud Function; separately, `PricingPage.tsx`'s Enterprise
   tier feature list says "Automated SMS Notifications (Coming on Jan
   2026)." Meanwhile `processInvoiceNotifications`/`checkOverdueInvoices`
   in `whatsapp/src/index.ts` already trigger automatically today. My read:
   the Jan-2026 line describes some specific Enterprise-tier enhancement,
   not the base capability, but the copy as written reads inconsistent
   with what's shipped. I worded the public page conservatively — crediting
   only what I could verify (credit top-ups + automatic notification
   triggers, SMS-first/WhatsApp-fallback) — and I'd recommend reviewing
   that Enterprise-tier line internally rather than have me guess at intent.

5. **No dedicated `/login` or `/signup` routes.** Flagged above under
   `sitemap.xml` — I didn't restructure routing to manufacture indexable
   URLs for these.

6. **Contact section as inline content, not a modal.** See "Contact
   section" above.

## Validation performed

- `npx tsc -b` — passes clean, zero errors.
- `npx vite build` — passes clean (2,800 modules, ~36s). The one warning
  it prints (`index-*.js` over 500kB) is pre-existing and unrelated to this
  change — it's the whole app's dependency graph, not the new marketing
  code.
- `git status --porcelain` / `git diff` — full footprint shown above and in
  `CHANGES.diff`; matches exactly what's described here, nothing else
  moved.
- Rendered the actual build with `vite preview` and screenshotted it with a
  headless browser at both a 1440px desktop width and a 390px mobile
  width, including the mobile hamburger menu open — nav, hero, how-it-works,
  features, all six pricing cards, the FAQ accordion, contact, the
  (unchanged) sign-in form, and the footer all render cleanly with no
  overlap at either width.
- Confirmed via `git status` that no routing, Firebase config, Cloud
  Functions, Capacitor/Electron/Android build files, or existing
  property/tenant/invoice/payment/profile screens appear in the diff.
- Validated `sitemap.xml` and `browserconfig.xml` with `xmllint --noout`,
  and the `index.html` JSON-LD block with `json.loads` in Python.
