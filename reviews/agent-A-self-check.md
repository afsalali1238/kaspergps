# Agent A — U0 bug fixes: self-check

**Branch:** `arena/21299846-kaspergps` (this Arena session is pinned to it, so the
handoff's `agent-a-bug-fixes` name could not be used).
**Spec:** `handoff/UI-UPGRADE.md` §12 U0 · **Handoff:** `handoff/agents/A-bug-fixes.md`
**Arabic namespace:** `fixes` — **unused.** Every string I touched already had a
key; no new `t()` keys were added, so `public/locales/ar.json` is untouched.

---

## 0. Re-check of each item on current `main` (as the handoff asks)

| # | Item | State on `main` at `2e7f778` | Action |
| --- | --- | --- | --- |
| 1 | Billing default tab | **Open.** `app/app/billing/page.tsx:63` was `useState<TabId>('received')`, and the `tabs` array always offers *Received* to a non-Kasper session, so `tabs.some(t => t.id === tab)` matched and Khalid landed on an empty table. | Fixed |
| 2 | Self-deactivate | **Half done.** The API half already existed (`src/server/team.ts:132`, and an assertion inside the last-admin test). The UI half did not: the Deactivate button rendered on every active row, including your own — and it had **no `onClick` at all**, so neither Deactivate nor Reactivate did anything. | Fixed (UI + wiring) |
| 3 | Reports phase labels | **Open.** `app/app/reports/page.tsx:175` rendered `Day one` / `Phase 2` / `Later` under every report type. | Fixed (that label line only) |
| 4 | Certificate actions | **Open.** Each certificate was a `<React.Fragment>` with a second `<tr><td colSpan={7}>` holding Void / Reissue / Verify, and a voided row printed `Voided` twice (Status badge + Actions cell). | Fixed |
| 5 | Stale P14 screenshots | **Open, and still open.** See §5 — no browser in this sandbox. | **Not done** |

---

## 1. What changed, and why

### `app/app/billing/page.tsx` (owned)
- `useState<TabId>('received')` → `useState<TabId | null>(null)`. `null` means
  "the visitor hasn't picked a tab yet", which is what makes a content-aware
  default possible without fighting React's initial-render order.
- Tab order and default moved into `src/lib/billing-tabs.ts` (new) so the rule is
  a pure function that vitest can run. `TAB_META` keeps the i18n keys/labels next
  to the page; the *order* comes from `billingTabs()`.
- `activeTab` is now `chooseBillingTab(chosen, ordered, content)`: honour the
  picked tab while it still exists → else the first tab with rows → else the
  first tab. The Reports tab summarises what you issued, so it counts as having
  content only when something was issued.
- Added `aria-current="true"` to the active tab button. It is the only
  `aria-current` in the repo (verified by grep), so tests can assert the default
  tab semantically instead of by colour class — which will survive Agent B's
  token pass and Agent H's redesign.

### `src/lib/billing-tabs.ts` + `src/lib/billing-tabs.test.ts` (new)
`billingTabs()` (which tabs exist, in order) and `chooseBillingTab()` (which one
opens). The test covers both, **and** pins the three users the handoff names
against the real seed: it calls `issuedInvoices` / `receivedInvoices` /
`statementsFor` — the same functions the page calls — and asserts
Khalid → `issued`, Lina → `received`, Sara → `issued`.

### `app/app/settings/page.tsx` (owned — Users tab)
- Deactivate is hidden on your own row (`u.id === session.userId`), replaced with
  a muted em dash so the Actions column doesn't read as broken.
- **Deactivate and Reactivate were dead buttons** (no `onClick`). Wired both to
  `deactivateUser` / `reactivateUser` through a `handleUserStatus` handler that
  surfaces the server's `message` or `error` in the Users tab (`role="status"` /
  `role="alert"`). This is slightly beyond the literal wording of the item, but
  without it "an e2e test for the button" would be testing a control that does
  nothing, and the API's self-deactivate refusal would be unreachable from the
  screen. Flagging it here rather than burying it.
- `data-user-id` on each row, so tests can select a row without matching on an
  email string.

### `app/app/reports/page.tsx` (owned — labels only)
Deleted the one `<div>` that printed `Day one` / `Phase 2` / `Later`. Nothing
else on the page was touched; Agent H rebuilds it in Wave 2.

### `app/app/certificates/page.tsx` (owned)
- `MucRow` now takes `canManage`, `onVoid`, `onReissue` and renders **one**
  Actions cell: View as a button, then Void (sealed) or Reissue (voided), then
  Verify. Inline in one row, which the handoff allows; B's `RowMenu` does not
  exist yet, so building a menu here would have meant touching `src/components/ui`.
- The second `<tr><td colSpan={7}>` and the `React.Fragment` are gone — one
  `<tr>` per certificate.
- `Voided` now appears only in the Status column.
- `data-muc-number` on each row for tests.
- Permission behaviour is unchanged: the actions are gated by exactly the old
  condition, now expressed as `canManage={canIssue && muc.ownerTenantId === session.tenantId}`.

### `src/server/team.test.ts` (owned)
Added a `team — you can't deactivate yourself` block: the exact refusal message,
the user stays `active`, **no audit entry is written for a refused change**, a
Kasper Admin is refused too, and an admin can still deactivate somebody else.
The pre-existing assertion inside the last-admin test was left in place.

### `tests/e2e/agent-a-fixes.spec.ts` (new)
11 tests × 2 projects = 22, covering all four items in a real browser.

---

## 2. Checks (BUILDER.md §4 step 3) — every command, its own exit code

| Command | Exit | Result |
| --- | --- | --- |
| `npm run typecheck` | **0** | clean |
| `npm run lint` | **0** | clean |
| `npm run build` | **0** | all routes compiled |
| `TZ=UTC npm test` | **0** | 64 files passed, 901 tests |
| `TZ=Asia/Dubai npm test` | **0** | 64 files passed, 901 tests |
| `npm run test:coverage` | **0** | **85.53 %** lines (floor 85 %) |
| `npx playwright test` | **not run** | no browser in this sandbox — see §3 |

Baseline before my changes, for comparison: 63 files / 886 tests, coverage
**85.5 %**. So the PR adds 1 file and 15 tests, and coverage is 85.53 % — the
repo sits ~0.5 pp above its floor, which matters for §3.

The test count is derived, not read off one line: the baseline run printed
`63 passed / 886`, the isolated runs printed `billing-tabs.test.ts (12 tests)` and
`team.test.ts (10 tests)` (7 before, 3 added), and both final full runs printed
`64 passed`. 886 + 12 + 3 = 901.

---

## 3. Two things I could not do here, and why

### 3a. The e2e suite cannot run in this sandbox

There is no Chromium anywhere in it, and the browser CDN is firewalled:

```
$ npx playwright install chromium
Error: Failed to download Chrome for Testing 153.0.8010.12 …
  host: 'cdn.playwright.dev'   code: 'ECONNRESET'
```

`/opt/pw-browsers` (BUILDER.md §7) does not exist here. I did not stop there:
`@sparticuz/chromium` is published to npm, so I installed it and brotli-extracted
a real 209 MB Chromium binary — it fails on three missing system libraries:

```
$ ldd /tmp/pwshim/chromium | grep 'not found'
  libnspr4.so   libnss3.so   libnssutil3.so
$ sudo apt-get update
Err:1 http://deb.debian.org/debian bookworm InRelease  Connection failed
```

No NSS package exists on npm (`npm view libnss3` → 404), nothing on the
filesystem provides them, and `deb.debian.org` is outside the sandbox allowlist.
So `npx playwright test` has **no exit code to report** — I am not claiming one.

What I did instead, so the markup was not shipped unverified: I rendered the
**real page components** in jsdom and asserted the same things the e2e spec
asserts. It ran and passed 9/9:

- `BillingPage` — `button[aria-current="true"]` reads `Issued` for Khalid,
  `Received` for Lina, `Issued` for Sara; Khalid is not greeted with
  "Nothing received".
- `SettingsPage` as Omar — `tr[data-user-id="u-omar"]` has **no** Deactivate
  button; `tr[data-user-id="u-hessa"]` does.
- `ReportsPage` — "Trip & Mileage" present; `Day one` and `Phase 2` absent.
- `CertificatesPage` — `table tbody tr` count equals the `tr[data-muc-number]`
  count; zero `td[colspan]`; the last cell of `MUC-2026-09-EX-04-01` holds View +
  Void + Verify; `MUC-2026-09-WL-03-01` says `Voided` exactly once and offers
  Reissue with no View.

**I removed that file from the PR.** With it present, vitest's v8 provider pulls
`app/**` into the coverage denominator (baseline report: 78 files, **0** of them
under `app/`) and coverage fell to **82.72 %**, failing CI's 85 % floor. Verified
by stashing my work, re-running coverage on clean `main` (85.5 %, exit 0),
restoring, and re-running (85.53 %, exit 0). The e2e spec carries the same
assertions and does run on CI's 3 shards, so nothing is left unguarded — but see
the request to Agent D below, because **every Wave 2 agent will hit this**.

### 3b. Item 5 — the P14 screenshots are not regenerated

`reviews/screenshots/P14/*` still holds the 46 stale captures (44 showing the
removed Phase switch). `tests/e2e/screenshots.spec.ts` needs a browser, which
this sandbox does not have, so I did not run it and I have not touched the
directory. This is the one item in my scope that is **not done**.

It is a one-command job for anyone with Chromium, and it should be run *after*
this PR merges so the captures show the fixes:

```
npx playwright test tests/e2e/screenshots.spec.ts
git add reviews/screenshots/P14 && git commit
```

Note that two of those captures (`khalid-billing-*`, `khalid-certificates-*`) are
the ones my fixes change, plus `omar-reports-*`.

---

## 4. Scorecard rows this moves (UI-UPGRADE.md §2)

These are individual *checks* inside rows that have many other checks owned by
Agents B and H. I am not claiming a 9 on any row.

| Row | Check delivered by this PR | Evidence |
| --- | --- | --- |
| **A6** Reports | "No phase labels" | the `<div>` is deleted; `ReportsPage` renders "Trip & Mileage" with no `Day one` / `Phase 2` |
| **A9** Money | "Billing opens on the first tab with content" | `billing-tabs.test.ts` — Khalid `issued`, Lina `received`, Sara `issued`, from the real seed |
| **A9** Money | "Certificate actions in one cell or a ⋯ menu" | one `<tr>` per certificate, `td[colspan]` count 0, View + Void + Verify in the last cell |
| **A10** Settings | "No self-deactivate" | button absent on your own row (UI) + refusal, no audit entry, exact message (API) |

---

## 5. Deviations

1. **Settings buttons wired up** (§1) — beyond the literal item, needed for the
   item to mean anything. Inside my owned file.
2. **`src/lib/billing-tabs.ts` is a new file outside my ownership list.** The
   alternative was leaving the rule inline in the page, where nothing could test
   it without a browser — and this sandbox has no browser. `src/lib/` is where
   the repo already keeps small pure helpers with colocated tests
   (`clock.ts`, `demo-state.ts`, `muc-pdf.ts`). No existing file was edited.
3. **`src/u0-fixes.test.tsx` was written, run (9/9 green) and then deleted** — see
   §3a. Asking for a ruling rather than shipping a red CI.
4. **`data-user-id` / `data-muc-number`** test hooks added to my own files.

---

## 6. Requests for other agents

1. **→ Agent D / supervisor (blocking for Wave 2).** Rendering any screen in a
   vitest test drags `app/**` into the v8 coverage denominator and breaks the 85 %
   floor (85.5 % → 82.72 % measured here). `vitest.config.ts` is D's. Please add
   `app/**` to the coverage `exclude` (or set an explicit `include` for `src/**`)
   in Wave 1, before five Wave 2 agents each rediscover this.
2. **→ Agent H.** `app/app/reports/page.tsx:178` still says
   `t('reports.none_available', 'No reports available for the current phase.')`.
   That is an empty-state sentence, not a label under a report type, so it is
   outside "change only that label line" — but BUILDER.md §1 says phases are gone
   *anywhere*. Yours to reword when you rebuild the page.
3. **→ Agent H.** The certificate detail modal shows `Voided` twice: once as the
   Status row's badge (`page.tsx:217`) and once as a field label whose value is
   the void timestamp (`page.tsx:231`). The item I was given is about the table
   row, so I left the modal alone; `certificates.detail.voided_at` would fix it
   and needs an `ar.json` key, which is your namespace.
4. **→ Agent H.** Billing tab order now comes from `billingTabs()` in
   `src/lib/billing-tabs.ts`, and the active tab carries `aria-current`. Please
   keep both when you redesign the screen.
5. **→ Agent B.** The certificate Actions cell uses the old inline
   `text-xs px-2 py-1 rounded bg-paper border border-line` styling rather than
   tokens, to stay inside the "labels/structure only" spirit of a Wave 1 bugfix
   PR. It will want your treatment.

---

## 7. Open questions

1. Item 5 needs a browser. Should the supervisor regenerate
   `reviews/screenshots/P14/*` after merging this, or send it back to a sandbox
   that has Chromium?
2. Is the deletion of `src/u0-fixes.test.tsx` acceptable, or would you rather
   take the `vitest.config.ts` coverage change first and keep it?
