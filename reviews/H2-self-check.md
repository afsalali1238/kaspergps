# H2 self-check — Correctness fixes (PARTIAL)
Branch `h2-correctness-fixes` on top of `h1-merge-f1-f3`.

## Done in this phase
| Item | Change | Proof |
| --- | --- | --- |
| H2.1 Invisible buttons | `Button.tsx`: `background-*` → `bg-*` (ink, paper-2, transparent, red, yellow) | Tailwind tokens verified in `app/globals.css`. Playwright computed-style check not run (no browser in sandbox). |
| H2.4 Time zone | `clock.dubaiToIso` now uses `formatInTimeZone(…, 'Asia/Dubai', "yyyy-MM-dd'T'HH:mm:ssXXX")` | `TZ=Asia/Dubai` and `TZ=UTC`: 523/523 each. Fixes `cost.test.ts`. |
| H2.5 Ctrl+K | Removed the Ctrl/Cmd+K binding and "Ctrl K" hint from `SearchCommand.tsx`; View as keeps it | Code review; no unit test yet. |

## Not done yet (remaining H2 items)
- H2.2 Site User with no site (access/capabilities/team refusal and unit tests)
- H2.3 Sites multi-select in Invite and Edit user
- H2.6 Route guards on `/app/*`
- H2.7 Renter sees owner's site names
- H2.8 API gate checks `can` on every exported tenant-data function, with an allow-list
- H2.9 Cross-tenant audit write with dedup
- Unit test for "every Button variant has a bg- class" (H2.1)
