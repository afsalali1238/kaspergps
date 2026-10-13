# Parallel build: one handoff per agent

The UI upgrade (`handoff/UI-UPGRADE.md`, target 9/10 in every area) is split into **10 agents in 3 waves**. Agents in the same wave run **at the same time**. They don't touch the same files, so their PRs merge without conflicts.

- **The supervisor is Claude Opus.** It reviews every PR and merges it. No agent merges, pushes to `main`, or edits another agent's files.
- **Owner decision (13 Oct, 00:36):** pages go in a **top navigation bar like fleetx; no left sidebar** (`UI-UPGRADE.md` §5.1; built in B3).

**What's left, how each chunk is delivered, the merge checklist and the builder prompts: `handoff/REMAINING.md`.** This file keeps the file-ownership table and the shared-file rules.

## Waves

| Wave | Agents (run together) | Starts when |
| --- | --- | --- |
| **1** | **A** Bug fixes · **B** Design system · **C** Data and simulator · **D** Test tooling | now, from `main` |
| **2** | **E** Fleet map · **F** Asset page · **G** Alerts, Fuel, Maintenance · **H** Reports and money · **I** Kasper console | B is merged (the design system must exist first). A, C and D should be merged too. |
| **3** | **J** Phone, Arabic, demo tools, final scorecard | every Wave 2 PR is merged |

Within a wave, merge order doesn't matter. After a merge, the others **rebase on `main`** before their next push (`git fetch && git rebase origin/main`).

## Who owns what

An agent edits **only** the files it owns, plus new files inside its own folders. To change a file owned by someone else, it writes the request in its self-check under "Requests for other agents". The supervisor routes it.

| Agent | Owns |
| --- | --- |
| A | `app/app/billing/**`, `app/app/certificates/**`, the Settings users tab in `app/app/settings/**`, `src/server/team.ts` (+ tests), the report-type labels in `app/app/reports/page.tsx` (labels only), `reviews/screenshots/P14/**` |
| B | `app/globals.css`, `app/layout.tsx`, `src/components/ui/**`, `src/components/layout/**`, `src/components/demo/**` (restyle only), `src/config/brand.ts`, `package.json` (adding `lucide-react` only), `reviews/fleetx-reference/**` |
| C | `src/server/telemetry/**`, `src/server/seed/**`, `src/domain/trips.ts`, `src/domain/playback.ts` (constants only), `src/server/cost.ts`, `src/server/utilisation.ts`, `src/server/muc.ts`, `src/lib/format.ts` (new), `src/server/consistency.test.ts` (new) |
| D | `tests/e2e/helpers.ts`, `tests/e2e/a11y.spec.ts` (new), `tests/e2e/visual.spec.ts` (new), `tests/e2e/no-raw-floats.spec.ts` (new), `reviews/usability/**`, `playwright.config.ts`, `package.json` (adding `@axe-core/playwright` only) |
| E | `app/app/page.tsx`, `src/components/map/**`, `src/components/fleet/**` (new) |
| F | `app/app/assets/**`, `src/components/assets/**`, `src/components/playback/**`, `src/components/history/**`, `src/components/share/**` (new) |
| G | `app/app/alerts/**`, `app/app/fuel/**` (new), `app/app/maintenance/**`, `src/components/alerts/**` (new), `src/components/fuel/**` (new), `src/components/maintenance/**` (new) |
| H | `app/app/reports/**`, `app/app/downloads/**`, `app/app/schedules/**`, `app/app/cost/**`, `app/app/billing/**`, `app/app/certificates/**`, `app/app/settings/**` (layout; A's fixes stay), `src/components/reports/**`, `src/components/money/**` (new) |
| I | `app/console/**`, `src/components/console/**` (new) |
| J | anything needed for its scope, after Wave 2 (see its file) |

**Exceptions:**
- Agent G may add **one** nav entry (Fuel) to `src/components/layout/AppShell.tsx` after B is merged.
- Agents A and H both touch Billing, Certificates and Settings, but in different waves: A fixes first; H redesigns later and keeps A's fixes.

**Shared files.** These rules prevent merge conflicts:

- **`public/locales/ar.json`:** add keys only, under your agent's own top-level namespaces, listed in your handoff. Never reorder or reformat the file. Insert your block with a JSON-aware script that keeps 2-space indent and key order.
- **`src/server/api.ts`:** add exports only, at the end of the file, under a comment `// ── Agent <X> ──`. Never edit existing lines.
- **`src/components/ui/**`** belongs to B. Wave 2 agents use these components and don't edit them. If one is missing a prop, put the change in your own folder (wrap the component) and request it from B through the supervisor.
- **Server domain logic** (`src/server/*.ts` other than C's files): an agent may add **new** files for its screen (e.g. `src/server/fuel-screen.ts`). Changing existing server files needs supervisor approval in the PR description.
