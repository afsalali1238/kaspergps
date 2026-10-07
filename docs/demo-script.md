# Kasper GPS — 20-minute demo script

Everything below runs on the seeded demo data. The **demo bar** at the top of every
page drives the whole walkthrough: **View as** switches user, **Clock** jumps time,
**Scenarios** lists S1–S50 with the user and screen each one starts from, and
**Tools** has the developer views, the certificate tamper and **Reset demo data**.

Sign in at `/sign-in` with any account's email and any password (all accounts are
demo accounts). Start from **Tools → Reset demo data** if the state looks dirty —
it puts the switches, the clock and the data back and keeps you signed in. Every
entry in the **Scenarios** menu switches to the Later phase, clears the sales view,
applies its own setup (clock jump, phase switch, sales view, tamper), switches user
and lands on the starting screen, so any scenario can be started cold.

---

## Opening — 0:00–2:00

| Time | Do | Say / expect |
| --- | --- | --- |
| 0:00 | Sign in as `sara@kasper.ae` | Kasper staff land in the console; customers land in the app. |
| 0:20 | Console → **Tenants** → Emirates Earthmovers | Fleet, sites, users and plan tier per company — one platform, many tenants. |
| 1:00 | **View as → Khalid Rahman** (Emirates Earthmovers) | The demo bar is the cast list: every role in the story is one click away. |
| 1:30 | Hover **Clock**, open **Scenarios** | Say it out loud: S1–S50 are all scripted here; this walkthrough is four of them. |

## Segment 1 — Omar: the Tier 1 fleet, 2:00–7:00

Omar runs Al Noor Transport: trackers only, no CAN bus. Run **S1** (or View as →
Omar Saleh).

| Time | Do | Say / expect |
| --- | --- | --- |
| 2:00 | Map | Every Al Noor asset is Tier 1, so there is no Tier filter and no CAN column — absent, not empty. |
| 2:45 | Open **FB-12** → **Certificates** / **Engine & fuel** | Both tabs are disabled with the reason; Tier 1 never sees a feature it can't have. |
| 3:15 | **FB-12 → Share tracking link → Create** | "Track FB-12 live: <link>". Copy the link. |
| 3:45 | Open the link in a private window | One live dot, "Updated 14:32", arrival time — no history, no other assets. |
| 4:15 | Back as Omar: **Revoke** | The public page says "This tracking link is no longer active." within 30 s. |
| 4:45 | **Reports** | Omar's picker has no Fuel report; hours are labelled *Estimated (ignition hours)*. |
| 5:30 | **Maintenance** (S38) | FB-14 is planned by GPS distance, TP-22 by estimated ignition hours; no fault-code tasks exist for a no-CAN fleet. |
| 6:15 | **Sales view: ON** (S21) | Locked "Needs ALL-CAN300 (Tier 3)" cards appear on FB-12; switch it off again. |

## Segment 2 — Khalid: the Tier 3 fleet, 7:00–12:00

Khalid runs Emirates Earthmovers: trucks and plant with CAN adapters. Run **S2**
(or View as → Khalid Rahman).

| Time | Do | Say / expect |
| --- | --- | --- |
| 7:00 | Open **EX-04** | Tier 3: ECU engine hours, RPM, load, fuel chart; the missing AdBlue sensor reads "Not measured", never 0. |
| 7:45 | **Utilisation** tab | ECU engine hours, working/idling split, gaps in minutes — the basis for a MUC. |
| 8:15 | **Clock → Start of last month → Certificates** | Issue last month's MUC for BD-02: sealed with a SHA-256 seal; reissue keeps the same seal. |
| 9:00 | **Open the public verify page** (`/verify/…`) | *Valid* — and the seal is printed in full. |
| 9:30 | **Tools → Tamper with a stored certificate** | The same page now says "Does not match its seal — contact Kasper." |
| 10:00 | EX-04 → **End access now** (S15) | The rental is cut short: the override is saved, the job links are revoked, the reason is audited — and the nightly check does not undo it. |
| 10:45 | **Maintenance** (S37) | EX-04 **Due soon** (ECU, hours left), BD-02 **Overdue** while on hire to Gulf Lift, GN-01 **Ok**. |
| 11:15 | **Log service** on BD-02 → the plan resets to **Ok** | The reading lands in the service history with its cost. |
| 11:40 | **Cost & ROI → last month** (S39) | Every line carries its basis: EX-04 fuel is **ECU (ALL-CAN300)**, CP-03 is **Estimated**, idle cost is **Not measured** where there is no CAN bus. |

## Segment 3 — Lina: the renter's view, 12:00–17:00

Lina runs Marina Builders, which rents Emirates kit. Run **S4** (or View as →
Lina Aziz).

| Time | Do | Say / expect |
| --- | --- | --- |
| 12:00 | Map | Her own Tier 2 kit **and** the rented assets; nothing from another company. |
| 12:30 | **Show: Rented in** | Just the rentals — and the owner's labels and geofences are nowhere on screen. |
| 13:00 | Open **EX-04 → History** | Nothing before the rental start; the banner says "History starts …"; only **Run report**, no Edit/Share/End access. |
| 13:45 | **Clock → 1 min before EX-07 rental starts**, then jump to the rental start (S6) | EX-07 is hidden at 07:59 and appears as **Rented** at 08:00. |
| 14:30 | **Geofences** (S25) | Palm Crescent with its 7-day event count; jump to yesterday 19:00 and play WL-06: exit at 19:10 and re-entry at 19:55. View as Khalid — the Palm geofence is gone. |
| 15:15 | **Schedules / Downloads** (S30) | A daily Location history schedule for EX-04; runs land in Downloads until access ends, then they are skipped. |
| 16:00 | **Billing → Received** (S34) | INV-EE-0415 with the hours taken from the MUC (including the minimum-hours top-up). **Pay** (simulated) → Paid. |
| 16:30 | **Playback** (S28) | The scrubber starts at the rental start; RPM/load in the readout; AdBlue "Not measured". |
| 16:45 | **Billing** (S35, as Omar) | INV-AN-0098 is **Days on hire**; record AED 500 → Part-paid; a larger amount is refused with the balance. |

## Segment 4 — Priya and the console: mixed and rented-in kit, 17:00–20:00

Priya runs Gulf Lift Rentals: her own fleet plus kit rented in from Emirates. Run
**S11** (or View as → Priya Nair).

| Time | Do | Say / expect |
| --- | --- | --- |
| 17:00 | Map | Mixed fleet, so the **Tier** filter appears; FL-09 is **Unknown** (paired, no reading yet). |
| 17:30 | Open **BD-02** | Rented-in asset with an active fault code; the owner's maintenance plan is not visible to her (S37). |
| 18:00 | **View as → Ravi Menon** (Ops) → Trackers (S17) | Pair a spare tracker to LD-09; the asset goes Unknown → Live; no Users & sites, no Audit log for Ops. |
| 18:30 | **Requests** (S44) | Priya's MW-01 request: **Pair a tracker** → +10 min → MW-01 is Live and Priya's bell shows "Tracker fitted on MW-01". |
| 19:00 | **CAN adapters** (S45) | Fitting LVCAN200 to a truck is refused ("…for light vehicles"); fit it to PU-31 instead — PU-31 becomes Tier 2 with a "CAN adapter fitted" marker. |
| 19:20 | **View as → Sara** → Console → Billing (S36) | GPS statements per tenant by tier; Gulf Lift unpaid; Ops has no Billing at all. |
| 19:40 | **Onboarding** (S42) | Walk the six steps for "Sharjah Plant Hire": company, 2 sites, admin Noura, 3 assets, 3 IMEIs (one bad check digit → error, fixed), one ALL-CAN300 fitted from stock. |

## Closing — the last minute

| Time | Do | Say / expect |
| --- | --- | --- |
| 19:50 | **Phase → Phase 2**, then **Day one** (S41) | Phase 2 hides Maintenance and Cost & ROI; Day one also hides geofences, labels, playback, ETA, MUC, billing and schedules (Downloads stays). |
| 19:58 | **Tools → Reset demo data** | Everything is back to the seeded anchor; every scenario in the menu runs the same way again. |

---

## What this walkthrough deliberately does not show

- **Real devices or a backend.** Readings come from the deterministic simulator and
  start when a tracker is paired.
- **Money moving.** Payments are recorded or simulated; there is no gateway.
- **Email, WhatsApp or SMS.** Alerts and scheduled reports land in the simulated
  outbox (**Tools → Email outbox**).
- **Route-based ETAs.** The arrival time is a straight-line estimate with a road
  factor, not a routing engine.
- **Arabic beyond the first draft.** The customer screens and the public page have
  an Arabic dictionary (marked *Draft — needs native review*); the console stays
  English. Maintenance and Cost & ROI are still English-only — see
  `reviews/P14-self-check.md`.

`docs/test-matrix.md` maps each scenario to the unit and end-to-end tests that
cover it.
