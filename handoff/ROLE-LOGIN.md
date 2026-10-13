# Handoff R: role-first entry (owner decision, 13 Oct 15:09)

**Owner request:**
- the home page is a login page where you pick a role;
- you land in that role's screens and explore them;
- **Log out** takes you back to the picker to try another role;
- no people or emails up front, just roles, with their context ("Tier 1", "renter", "client"…) where it matters;
- keep it minimal.

## 1. Recommendation (why "personas", not bare roles)

The app has 5 roles, but what a screen shows depends on **three things**:
- the **role** (Kasper Admin, Kasper Ops, company admin, site user);
- the company's **relationship to the asset** (owns it, rents it, or rents only);
- the **hardware tier** (Tier 1 GPS-only, Tier 2, Tier 3 CAN with ECU hours and fuel).

A bare "Tenant Admin" can't show you both Tier 1 and Tier 3, or both owner and renter. So each card on the login page is a **persona: one role plus its context**. Each is wired to one seeded account behind the scenes and labelled by what it lets you try. No names, no emails, no passwords.

**8 cards, in 4 groups**:

| # | Card title | Chips | "What you can try" (one line) | Lands on | Seeded account (hidden) |
| --- | --- | --- | --- | --- | --- |
| 1 | Kasper Admin | Kasper · console | Onboard companies, hardware stock, bookings, billing, audit | `/console` | `u-sara` |
| 2 | Kasper Ops | Kasper · console | Trackers, CAN adapters and bookings; no billing or audit | `/console` | `u-ravi` |
| 3 | Fleet owner · Tier 3 | Owner · Tier 3 CAN | ECU engine hours, fuel, certificates, billing, maintenance | `/app` | `u-khalid` (Emirates Earthmovers) |
| 4 | Fleet owner · Tier 1 | Owner · Tier 1 GPS | GPS-only fleet: trips, tracking links, estimated hours | `/app` | `u-omar` (Al Noor Transport) |
| 5 | Owner and renter · mixed tiers | Owner · Renter · T1–T3 | Mixed fleet, a rented-in asset with a fault code | `/app` | `u-priya` (Gulf Lift Rentals) |
| 6 | Renter | Renter · owns a few | Rented equipment from the rental start only; own pickups | `/app` | `u-lina` (Marina Builders) |
| 7 | Client · rents only | Client · no own fleet | Rented equipment, invoices to pay, access that ended early | `/app` | `u-fatima` (Palm Contracting) |
| 8 | Site user · one site | Site user · Gulf Lift | One site's assets only; no settings, no money | `/app` | `u-mark` |
| + | Hirer · tracking link | Public · no account | The one-asset tracking page an outside hirer gets | `/t/<FB-12 token>` | none |

**Show the company name** in small text on each customer card, because the screens show it in the top bar. **Don't show** the person's name, email or password anywhere on the page.

**Why these 8:** together they hit every rule the prototype demonstrates:
- console vs app;
- Admin vs Ops;
- Tier 1 vs Tier 3, and mixed tiers;
- owner vs renter vs client-only;
- company admin vs site user;
- the public link.

Everyone else in the seed (Hessa, Ahmed, John, Anil, Rashid, Deepa, Karim, Sam) stays in the data, because Settings, scenarios and tests use them. They just aren't on the login page.

## 2. Behaviour

1. **`/` is the login page**, always, even with a session.
   - Remove the redirect in `app/page.tsx`.
   - If a session exists, show a slim "Continue as <card title> →" bar above the cards. It's the only shortcut.
   - `/sign-in` redirects to `/`.
2. **Picking a card:**
   - calls `signInAs(userId)` (exists in `src/server/api.ts`) and `storeActions.setSession`;
   - resets the demo clock to the anchor;
   - routes to the card's home.
   - The hirer card opens `/t/<token>` with no session.
3. **Log out** (user menu in the app top bar, and the console header):
   - clears the session (`storeActions.setSession(null)`);
   - closes any walkthrough;
   - routes to `/`.
   - **Back after logging out** must not show app screens: `/app/**` and `/console/**` with no session redirect to `/`.
4. **The demo bar becomes minimal:**
   - **Replace "View as ▾"** with a **role chip** (the card title, e.g. "Fleet owner · Tier 3") and a **"Switch role"** button. "Switch role" does the same as Log out.
   - **Keep:** Clock (Jump to presets), Features (what this role can and can't do, and why), Sales view.
   - **Scenarios ▾** and **Tools ▾** move into a single **"More ▾"** menu.
   - Scenarios still set their own user. When one starts, the role chip shows the matching card title, or "Scenario user" if that account isn't one of the 8.
5. **On the public tracking page**, the demo pill gets "← Back to roles" (demo only).
6. **The email/password form is not on the page.**
   - Move it to `/dev/sign-in` (prototype-only, not linked) so the tests and the sign-in error messages (deactivated, invited, suspended: §11.1) keep working.
   - The PRD keeps those messages for production.
7. **Arabic:** every card title, chip and line has `ar.json` keys (namespace `roles`). The page works at 390 px: one column of cards, each a tap target ≥ 48 px high.

## 3. Look (minimal)

- **Page:** Kasper logo; the title "Choose a role to explore"; one line, "Prototype with dummy data. Log out any time to try another role."
- **Groups:** a small eyebrow per group (Kasper team · Fleet owners · Renters and clients · On site · Public). Cards in a 2-column grid on desktop (max width 880 px), 1 column on phone.
- **Card:** the title (Space Grotesk 15), chips (the B2 `Badge`, tones: Tier 3 = info, Tier 1 = neutral, Renter = accent, Client = warn, Kasper = ink), one muted line of "what you can try", the company name in mono 10 px, and a chevron.
  - The whole card is one button.
  - Keyboard: Tab, then Enter.
- **No** demo bar on `/`. Keep only the "DEMO" tag in the header.

## 4. Files (owner: this chunk, "R")

- `app/page.tsx`: the role picker; drop the redirect.
- `app/sign-in/page.tsx`: redirect to `/`.
- `app/dev/sign-in/page.tsx` (new): the email form moved here.
- `src/config/personas.ts` (new): the 8 cards above as data (`id`, `userId` or `publicPath`, `titleKey`, `chips`, `blurbKey`, `group`). One place to edit.
- `src/components/auth/RolePicker.tsx` (new). Delete `UserPicker.tsx` once nothing imports it.
- `src/components/layout/AppShell.tsx`: Log out clears the session and goes to `/`; guard `/app/**` without a session. Touch only the sign-out item and the guard (G2 adds the Fuel tab in the same file).
- `app/console/layout.tsx`: a Log out button in the header; no session redirects to `/`.
- `src/components/demo/DemoBar.tsx`, `ViewAsMenu.tsx`: role chip + Switch role. View as is removed from the bar; keep `ViewAsMenu` only if a test or scenario still needs it.
- `public/locales/ar.json`: `roles.*`.
- `tests/e2e/helpers.ts`: `signIn(page, email)` uses `/dev/sign-in`. Add `pickRole(page, '<card id>')`. `demo({ user })` switches by signing in as that user through `/dev/sign-in`, not through View as.

## 5. Tests

**New `tests/e2e/roles-login.spec.ts`:**
- `/` shows exactly the 8 cards plus the hirer card, with no email field and no person names.
- **Each card lands on its home, as its role:**
  - Kasper Admin sees Audit log under More, Ops doesn't (`openMore()` before the negative check);
  - Tier 1 has no Fuel or engine UI;
  - the renter sees "Rented";
  - the site user sees one site.
- Log out returns to `/` with no session. Then going directly to `/app` and `/console` lands on `/`.
- "Switch role" from the demo bar does the same.
- 390 px: no sideways scroll; cards are full-width.
- Arabic `/ar`: cards mirror, and every string is translated.

**Existing specs:** update locators only.
- Anything that used View as (`f2-screens`, S4, S9, S17–S22, `phone-layout`) switches through `signIn` / `/dev/sign-in`.
- `demo-shell` sign-in tests point at `/dev/sign-in`.
- S22 (deactivated message) runs on `/dev/sign-in`.

**Unit:** `personas.test.ts` checks that each card's account exists, is active, has the role the card claims, and that the chips match the data:
- Tier chips come from the fleet's adapters (`tierOf`);
- "Renter" means `getRelationship` finds a rented asset;
- "Client" means the tenant type is `client`.

That way a card can't lie.

## 6. Done when

- The four checks pass: typecheck, lint, build, and unit tests in UTC and Asia/Dubai.
- The full e2e suite passes in CI.
- `reviews/R-self-check.md` exists, with screenshots of `/` at 1440 and 390 px (English and Arabic), each card's landing screen, and the Log out → `/` loop.
- `PROGRESS.md` has an R row.
- PRD `BUILD_PROMPT.md` §0a D13 is in.

**Effort:** 2–3 hours. It can run now, in parallel with F2, G2, H1 and I. The only shared file is `AppShell.tsx`; R touches only the sign-out item and the session guard there.

## 7. Builder prompt (paste as is, after the common header in `handoff/REMAINING.md`)

> Chunk **R** (role-first entry). Read `handoff/ROLE-LOGIN.md` and build exactly that.
>
> - **Home and auth:** `/` is a role picker with the 8 persona cards plus the hirer link. `/sign-in` redirects there, and the email form moves to `/dev/sign-in`. Log out (app and console) clears the session and returns to `/`. With no session, `/app` and `/console` redirect to `/`.
> - **Demo bar:** a role chip and "Switch role" replace View as; Scenarios and Tools go under More.
> - **Data and tests:** the cards come from `src/config/personas.ts`, guarded by `personas.test.ts`. Add `roles-login.spec.ts`, and move every existing spec off View as by changing locators and helpers only.
> - **Copy:** no names, emails or passwords on `/`; Arabic for every string; 390 px works.
>
> Branch `night-r`. Self-check `reviews/R-self-check.md`, PR `R: role-first entry`. Don't merge it yourself.
