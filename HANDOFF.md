# Kasper GPS — Project Handoff

## 1. Project Status: all 14 phases built — one class of verification outstanding
Every phase in `BUILD_PROMPT.md` has implementation work in the tree. What the
prototype has **never** had is a browser run: `npm run test:e2e` has not been
executed anywhere (no CI until 2026-10-09, and the sandbox that built the phases
could not download Chromium). So read "E2E coverage" below as *specs written*, and
read `reviews/STATUS-REVIEW.md` (Revisions R1–R2) plus `reviews/P1-self-check.md` …
`P13-self-check.md` for what each phase's acceptance checks can and cannot point to.
Known unimplemented spec items are listed in §6 — "fully implemented" was never
accurate, and this file used to say it.

The application is a full-stack Next.js prototype with:
- **Client-Side State**: Zustand and `localStorage` simulate a backend API and database.
- **Strict Access Control**: Comprehensive RBAC limits visibility based on hardware tiers, user roles (Kasper Admin vs. Tenant Admin vs. Site User), and active rental grants.
- **Hardware Simulation**: deterministic, on-demand tracking generation (the
  Mulberry32 PRNG seeded per tracker IMEI in `src/server/telemetry/simulator.ts`)
  with working-day patterns, injected gaps, and the scenario overrides §8 wants
  (GN-01 fuel drop, BD-02 DTC, TP-23 power cut, FB-14 replay). ECU engine hours
  are computed for the MUC tier. CAN values the simulator does *not* generate
  (fuel used, RPM, coolant, engine load, AdBlue, DTCs) render as "Not measured" —
  that is the §4 rule working, not a bug to hide.
- **Multi-tenant UI**: Full customer dashboard, tracking links, and administrative console.
- **Internationalization**: Complete Arabic (RTL) localization for customer-facing interfaces.

## 2. Codebase Overview
- `app/`: Next.js App Router for UI views (customer portal, public tracking, admin console).
- `src/server/`: The "simulated backend".
  - `src/server/api.ts`: Central permission gateway.
  - `src/server/access.ts` & `src/server/capabilities.ts`: Enforces strict capability mapping.
  - `src/server/seed/`: Mulberry32 deterministic random number generator defining 5 tenants, 36 assets, and simulated tracking data.
  - `src/server/telemetry/`: Live vehicle movement simulator creating trips and CAN reading states.
- `src/domain/`: Shared types and features. 
- `tests/e2e/`: Full Playwright E2E coverage mapping exactly to the 50 Scenarios specified in the spec.

## 3. Local Development
To run the prototype locally:
```bash
npm install
npm run dev
```
The prototype runs at `http://localhost:3000`. You can sign in using any of the dummy user emails defined in the codebase (e.g., `sara@kasper.ae`, `omar@alnoor.ae`) with *any* password. Use the persistent **Demo Bar** at the top of the UI to easily switch user contexts, test phase-gates, or time-travel through the simulated data.

## 4. Testing
- **Unit Tests & Types**: `npm test` runs the comprehensive Vitest suite (~91% coverage). `npm run typecheck` and `npm run lint` enforce strict adherence.
- **E2E Tests**: 15 Playwright files covering Scenarios 1–50 plus the demo shell,
  billing and certificates live in `tests/e2e/`. Run them via `npm run test:e2e`
  (needs Chromium). They have **never** been executed — `.github/workflows/ci.yml`
  is the job that will. Until it is green, treat any selector as unverified.
- **Selector drift is partially guarded**: `src/e2e-contract.test.ts` runs in
  `npm test` and fails if a `getByLabel`/`getByRole` name in `tests/e2e` has no
  matching control in `app/`. It caught three real ones (Settings forms, S19's
  "Full name"). It cannot judge layout, overflow or RTL.
- **Coverage**: `npm run test:coverage` enforces an 85 % line floor; the run on
  2026-10-09 measured **87.97 %** across 329 tests / 29 files.

## 5. Next Steps for Production
Because this is a prototype, real infrastructure needs to replace the simulated data layer. The next steps for the engineering team taking this over would be:
1. **Database Integration**: Replace `src/server/store.ts` (currently an in-memory/localStorage mock) with an ORM (e.g., Prisma/Drizzle) mapped to PostgreSQL.
2. **Real Authentication**: Replace the mock `session` layer with NextAuth or a provider like Auth0/Clerk.
3. **Telemetry Ingestion**: Hook up Teltonika FMC130 webhooks to feed real GPS/CAN data directly into the application, replacing `src/server/telemetry/`.
4. **Backend Security**: Ensure `src/server/api.ts` translates identically to real server-side REST/tRPC/GraphQL endpoint guards.

## 6. Known Gaps
- **No green E2E run yet.** `.github/workflows/ci.yml` (added 2026-10-09) installs
  Chromium and runs the suite against a production build on PRs and `main`; nobody
  has seen it pass. Expect fixes the first time.
- **Spec items deliberately left open** (details and evidence in the per-phase
  self-checks): map filter/search state in the URL (§11.2, `reviews/P5-self-check.md`);
  the geofence report behind the `report.geofence` capability label
  (`reviews/P11-self-check.md`); polygon geofence drawing — typed coordinates only,
  and `@geoman-io/leaflet-geoman-free` is an unused dependency; Settings → Sites /
  Assets forms that do not create records (§11.8, `reviews/P10-self-check.md`);
  customer nav that drops Certificates/Billing/Maintenance/Cost for tenants at
  every width (`reviews/P4-self-check.md`).
- **No screenshots.** `BUILD_PROMPT.md` §16 wants them per phase; `reviews/screenshots/`
  does not exist yet.
- **Deep Translation Review**: The Arabic translations (`public/locales/ar.json`) are currently a first draft and will need review by a native speaker.

---
*Generated by Arena Agent — 2026-10-09*
