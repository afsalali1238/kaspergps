# Accessibility baseline (axe, report mode)

Recorded by agent D (night run, 13 Oct 2026) on `main` at `811979a`, desktop 1440 × 900, demo clock at the anchor, axe-core 4.x default rules (WCAG 2.0/2.1 A + AA and best practices).

`tests/e2e/a11y.spec.ts` reads the JSON block below. It fails only when a screen shows a **critical** violation that isn't listed here for that screen, or the same critical rule on more nodes. Serious, moderate and minor findings are reported in the log (`A11Y <screen> {...}`) and attached to the test, but don't fail it yet. Wave 3 (agent J) makes the check strict: no serious or critical violation on any of these screens (UI-UPGRADE §11.5).

To refresh after a fix: run `npx playwright test a11y --project=desktop`, copy the `A11Y` log lines into the block, and lower the counts. Never raise a count to get green.

## Counts

| Screen | Path | Critical | Serious | Moderate |
| --- | --- | --- | --- | --- |
| sign-in | `/sign-in` | 0 | color-contrast (1) | landmark-one-main (1), region (8) |
| map | `/app` (Khalid) | 0 | 0 | page-has-heading-one (1), region (2) |
| alerts | `/app/alerts` (Khalid) | **select-name (2)** | 0 | region (2) |
| reports | `/app/reports` (Khalid) | 0 | 0 | region (2) |
| maintenance | `/app/maintenance` (Khalid) | 0 | color-contrast (2) | region (2) |
| asset-ex04 | `/app/assets/a-ex04` (Khalid) | 0 | aria-command-name (1) | page-has-heading-one (1), region (2) |
| settings | `/app/settings` (Khalid) | 0 | 0 | region (2) |
| console | `/console` (Sara) | 0 | color-contrast (4) | region (2) |
| tracking-link | `/t/k7Qm…Ye5` (no account) | 0 | aria-command-name (1), color-contrast (2) | landmark-one-main (1), region (2) |
| verify | `/verify/MUC-2026-09-EX-04-01` (no account) | 0 | color-contrast (1) | landmark-one-main (1), region (4) |
| **Total** (rule × screen, nodes) | 10 screens | **1, 2 nodes** | **7, 12 nodes** | **15, 33 nodes** |

Owners of the fixes (Wave 2):
- **G (Alerts):** the two filter `<select>`s have no accessible name (critical).
- **G (Maintenance):** two text colours below 4.5:1.
- **I (Console):** four low-contrast elements (includes the yellow "Manage →" links noted in PROGRESS.md).
- **F (Asset page):** no `<h1>`; one `role="button"`-style element without a name (also on the tracking page, likely the shared map control).
- **E (Map):** no `<h1>`.
- **J:** `region` / `landmark-one-main` (content outside landmarks; mostly the demo bar and public pages) and the sign-in / verify contrast.

<!-- BASELINE START -->
```json
{
  "sign-in": { "color-contrast": { "impact": "serious", "nodes": 1 }, "landmark-one-main": { "impact": "moderate", "nodes": 1 }, "region": { "impact": "moderate", "nodes": 8 } },
  "map": { "page-has-heading-one": { "impact": "moderate", "nodes": 1 }, "region": { "impact": "moderate", "nodes": 2 } },
  "alerts": { "region": { "impact": "moderate", "nodes": 2 }, "select-name": { "impact": "critical", "nodes": 2 } },
  "reports": { "region": { "impact": "moderate", "nodes": 2 } },
  "maintenance": { "color-contrast": { "impact": "serious", "nodes": 2 }, "region": { "impact": "moderate", "nodes": 2 } },
  "asset-ex04": { "aria-command-name": { "impact": "serious", "nodes": 1 }, "page-has-heading-one": { "impact": "moderate", "nodes": 1 }, "region": { "impact": "moderate", "nodes": 2 } },
  "settings": { "region": { "impact": "moderate", "nodes": 2 } },
  "console": { "color-contrast": { "impact": "serious", "nodes": 4 }, "region": { "impact": "moderate", "nodes": 2 } },
  "tracking-link": { "aria-command-name": { "impact": "serious", "nodes": 1 }, "color-contrast": { "impact": "serious", "nodes": 2 }, "landmark-one-main": { "impact": "moderate", "nodes": 1 }, "region": { "impact": "moderate", "nodes": 2 } },
  "verify": { "color-contrast": { "impact": "serious", "nodes": 1 }, "landmark-one-main": { "impact": "moderate", "nodes": 1 }, "region": { "impact": "moderate", "nodes": 4 } }
}
```
<!-- BASELINE END -->
