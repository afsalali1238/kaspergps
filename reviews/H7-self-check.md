# H7 self-check — evidence (screenshots, HANDOFF, Arabic keys)

Date: 2026-10-12 · Agent: Claude (Haiku 5.5) · Branch `h4-spec-features`

## 1. Screenshots

`tests/e2e/screenshots.spec.ts` writes `reviews/screenshots/P14/<user>-<screen>-<width>.png` at 1440 and
390 px. It runs once, in the desktop project, and every capture waits for real content, so a blank page
fails the run instead of saving.

- **46 files: 23 screens × 2 widths.** The final run wrote all 46. Two stale files from an earlier screen
  name (`priya-asset-detail-*`) were removed, so the folder matches the spec exactly.
- Customer: `omar-{map, asset-detail, alerts, reports, geofences, settings}`, `khalid-{maintenance, billing, cost, certificates}`,
  `priya-asset-detail-rented`, `lina-{downloads, schedules}`, `fatima-map`, `omar-ar-map` (Arabic, RTL).
- Console: `sara-{console-assets, console-billing, console-team}`, `ravi-{console-requests, console-trackers}`.
- Public: `hirer-tracking`, `auditor-verify`, `anon-sign-in`.

**Not captured** (so not reviewable from the folder): trip playback and the History tab (both need a tab
click; add them to the spec when a reviewer asks), the onboarding wizard (S18), Settings tabs other than
the default, the console hardware-stock and import screens, the Arabic public page, and the `/dev/*`
pages, which are prototype tools and are not reviewed.

Layout is checked by `phone-layout.spec.ts` and the console specs, not by these screenshots. The
screenshots are for review; they do not pass or fail on layout.

## 2. HANDOFF.md

Rewritten (see `HANDOFF.md`). It now contains:

- Final check results with their numbers (the earlier version had 697 tests and 253 Playwright passes).
- The per-phase table, P1–P14, each marked **Done** or **Gaps**, with the evidence and the open gap.
- Production notes corrected: the data layer is `src/server/db.ts` (no `store.ts`); the FMC130 sends
  Codec 8 / 8 Extended over TCP or UDP to an ingestion server and has no webhooks; every `api.ts` function
  becomes a server endpoint that checks `can`; auth replaces `signIn`.
- Known gaps, the open hosting decision, and the housekeeping items (stale `arena/*` branches; the
  Windows clone's seven uncommitted files).

Claims the old HANDOFF made and this review removed or corrected:

- "The simulator does not generate fuel used, RPM, coolant, load, AdBlue or DTCs". It does generate the
  CAN fields an adapter supports.
- "BD-02 DTC is a scenario override". The simulator has no BD-02 override.
- "The geofence report is not built" and "the geoman dependency is unused". Both are now built and in use.
- "Settings forms save nothing". They save and are audited.
- "~91 % coverage", "329 tests", "15 Playwright files", "never run". All out of date.

## 3. Arabic keys (`public/locales/ar.json`)

- `_meta.status` stays "Draft — needs native review".
- **98 keys added** since the 8 October merge (`eb70c32`). **10 are not yet in `HEAD`** and are marked
  uncommitted in HANDOFF section 8.
- **2 existing values corrected:** `map.updated_ago` and `asset_detail.last_updated` had an unfilled
  `{ago}` placeholder.
- **9 `alerts.words.*` entries removed.** They carried placeholders no caller filled. Those alerts now
  show the English sentence.
- **Placeholder audit:** 80 keys with placeholders. A text-window sweep of every caller found no live key
  missing a parameter. That is a sweep, not a proof for every call. 25 keys have no caller; they are harmless
  and listed for the native reviewer.
- **7 added keys with no exact caller** are listed in HANDOFF section 8 for the native reviewer to
  decide on.
- The end-access note gained `{company}` and `{code}` parameters. Its Arabic wording differs from the
  English draft and needs review.

The i18n test (`src/i18n/i18n.test.tsx`) still passes, and it checks that every `t()` key used in the app
exists in `ar.json`.

## Not proven

- The Arabic copy is a first draft. A native reviewer has to check it before it ships.
- The GitHub CI run (see H6).
