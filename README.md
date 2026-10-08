# Kasper GPS

Clickable prototype of the Kasper GPS dashboard: one web app where a reviewer
picks any user from **View as** and sees exactly what that user would see —
every role, every hardware tier, with dummy data for five companies and 36
assets.

It is the working spec. Permission and hardware rules are exact; infrastructure
is fake (no backend, no real trackers).

## Run

```bash
npm install
npm run dev
```

Sign in at `/sign-in` with any seeded email (e.g. `omar@alnoor.ae`,
`khalid@emirates.ae`, `sara@kasper.ae`) and any password. The **demo bar** at
the top of every page is the cast list: View as, Clock, Phase, Scenarios
(S1–S50), Tools.

A 20-minute walkthrough is in [`docs/demo-script.md`](docs/demo-script.md).
The scenario → test map is in [`docs/test-matrix.md`](docs/test-matrix.md).

## Arabic / RTL

Customer screens, sign-in, the public tracking page (`/t/[token]`) and
certificate verify (`/verify/[number]`) are localised.

- **Language (EN / عربي)** in the customer user menu
- **عربي / EN** in the demo bar, so the public pages demo in Arabic without
  signing in
- The Kasper console (`/console`) and developer tools (`/dev`) stay English
- `/ar/...` URLs are shareable Arabic links; the `kasper_lang` cookie is what
  the toggle writes. Either one selects Arabic on the first paint
  (`<html lang="ar" dir="rtl">`)
- Codes, numbers and times stay on **Latin digits**. Product words (Kasper,
  GPS, ECU, CAN, PDF, Excel) stay Latin
- Copy lives in [`public/locales/ar.json`](public/locales/ar.json), marked
  *Draft — needs native review*. A missing key falls back to the English
  string in the component, never to the key itself

## Tests

```bash
npm test              # Vitest unit + component tests
npm run test:coverage
npm run typecheck
npm run lint
npx playwright test   # needs `npx playwright install chromium` once
```

i18n coverage is in `src/i18n/i18n.test.tsx` (dictionary, placeholders, digits,
RTL, cookie, console guard, every `t()` key) and
`src/components/i18n/LanguageToggle.test.tsx` (toggle behaviour).
