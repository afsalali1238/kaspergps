# H5 self-check — public pages (H5.1–H5.4)

Date: 2026-10-12 · Agent: Claude (Haiku 5.5) · Branch `h4-spec-features`

## Commands (final run, each on its own)

Covered by the shared run in `H4-self-check.md`: typecheck 0, lint 0, unit tests 729 / 729 under
UTC and Asia/Dubai, coverage 86.05 %, Playwright 347 passed / 0 failed (exit 0).

## Items

| Item | Built | Proof | Not proven |
| --- | --- | --- | --- |
| **H5.1** `/t/[token]` reads the browser db and the demo clock; `storage` listener; refresh every 30 s; `noindex`, `no-referrer` | `app/t/[token]/page.tsx`: `REFRESH_MS = 30_000`; `window.addEventListener('storage', …)`; the page is its own route, outside the app shell | `public-tracking.spec.ts`: "is not indexed and never leaks a referrer" (passes); "Omar revokes FB-12 and the hirer's open tab shows the inactive message within 30 seconds" (two browser contexts, passes) | The app shell's absence is by design, not asserted. |
| **H5.2** invalid, unknown, expired, revoked, ended or altered link shows "This tracking link is no longer active." | Same copy for every inactive state | `public-tracking.spec.ts`: "tells the hirer a revoked link is dead" and "treats an unknown token the same way" | The test checks the message is present. It does not check that nothing else is on the page. Expired, ended and altered links are not separately tested. |
| **H5.3** ETA lines: "Arriving about HH:MM (in N min)", "Arrived HH:MM", "ETA unavailable — waiting for update"; owner's link row shows the same ETA | ETA lines in the public page; the owner can switch the ETA off | `public-tracking.spec.ts`: "shows the asset, its status and the arrival line" (accepts any of the three forms); "leaves the ETA out when the owner switched it off" | The three forms are matched by one regex, so the test does not prove each state. The owner's link row ETA is not asserted. |
| **H5.4** `/verify/[number]` reads the db; a tamper with the demo tool shows "Does not match its seal — contact Kasper." | `app/verify/[number]/page.tsx`: `verify.tampered` copy; certificate screen uses the same copy | `S31-S36.spec.ts` S32: "the verify page turns red after the tamper tool" asserts `/Does not match its seal/`; `certificate.spec.ts`: verified, voided-and-replaced, and unknown numbers | — |

Phone width: `public-tracking.spec.ts` "works on a phone-width viewport without sideways scroll" and
`phone-layout.spec.ts` (public pages `/t/…` and `/verify/…`) pass.

## Screenshots

`reviews/screenshots/P14/hirer-tracking-{1440,390}.png` and `auditor-verify-{1440,390}.png`.
The hirer page at 390 px shows the live status, the "Arriving about 10:28 (in 28 min)" line and the
destination. Its map area is blank because tiles are stubbed in tests, which is expected.

## Known gaps (H5)

- The "nothing else on the page" part of H5.2 is not asserted.
- Expired, ended and altered links are not individually tested.
- The owner's link-row ETA is not asserted.
- The three ETA states are matched by one regex, so a state can pass without being the right one.
