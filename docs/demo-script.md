# Kasper GPS — 20-minute demo script

Everything below runs on the seeded demo data. The **demo bar** at the top of every
page drives the whole walkthrough: **View as** switches user, **Clock** jumps time,
**Scenarios** lists S1–S50 with the user and screen each one starts from, and
**Tools** has the developer views, the certificate tamper and **Reset demo data**.

Sign in at `/sign-in` with any account's email and any password (all accounts are
demo accounts). Start from **Tools → Reset demo data** if the state looks dirty —
it puts the switches, the clock and the data back and keeps you signed in.

| Time | Do | Say / expect |
| --- | --- | --- |
| 0:00 | Sign in as `sara@kasper.ae` | Kasper staff land in the console; customers land in the app. |
| 0:30 | Console → **Tenants** → Emirates Earthmovers | Fleet, sites, users and plan tier per company. |
| 1:30 | **View as → Khalid Rahman** (Emirates Earthmovers) | Tier 3 fleet. Open **EX-04**: ECU engine hours, RPM, load, fuel chart; AdBlue reads "Not measured". |
| 3:00 | EX-04 → **Share** → create the job link | "Track FB-12 live: <link>". Open it in a private window: one live dot, "Updated 14:32", no history. |
| 4:00 | **View as → Omar Saleh** (Al Noor, Tier 1) | Only Tier 1 features anywhere: no fuel/engine columns, hours labelled *Estimated (ignition)*. |
| 5:00 | FB-12 → **Share** → Revoke | The public link says "This tracking link is no longer active." within 30 s. |
| 6:00 | **View as → Lina Aziz** (Marina Builders) | Sees her own Tier 2 kit **and** the Emirati assets rented to her; not the ones she doesn't have yet. |
| 7:00 | EX-04 → **History** | Nothing before the rental start; the banner says why. Only **Run report**. |
| 8:00 | **Clock → 1 min before EX-07 rental starts**, then jump to the rental | Hidden at 07:59, appears as **Rented** at 08:00. |
| 9:00 | **View as → Priya Nair** (Gulf Lift) → BD-02 | Rented-in asset with an active fault code; her own mixed fleet shows Tier chips. |
| 10:00 | **Clock → Start of last month** → **View as → Khalid** → Certificates | Issue last month's MUC for BD-02: sealed with a SHA-256 seal; reissue keeps the same seal; **Open the public verify page** says *Valid*. |
| 11:30 | **Tools → Tamper with a stored certificate** | The verify page says "Does not match its seal — contact Kasper." |
| 12:30 | **View as → Fatima Noor** (Palm Contracting) → Billing → Received | INV-EE-0412 shows the hours from the MUC, including the minimum-hours top-up. **Pay** (simulated) → Paid; Khalid sees it as Paid. |
| 14:00 | **View as → Omar** → Billing → INV-AN-0098 → Record payment AED 500 | Basis **Days on hire**; the invoice goes Part-paid; a bigger amount is refused with the balance. |
| 15:00 | **View as → Sara** → Console → Billing | GPS statements per tenant by tier; Gulf Lift unpaid; Ops has no Billing at all. |
| 16:00 | **View as → Khalid** → Maintenance | Board: EX-04 **Due soon** (ECU, hours left), BD-02 **Overdue** while on hire to Gulf Lift, GN-01 **Ok**. **Log service** on BD-02 → the plan resets to **Ok** and the reading lands in the history. |
| 17:30 | **View as → Priya** | BD-02's plan belongs to Emirates Earthmovers — Gulf Lift never sees the owner's maintenance. |
| 18:00 | **View as → Khalid** → Cost & ROI (period: last month) | EX-04 fuel is labelled **ECU (ALL-CAN300)**; CP-03 is **Estimated**; idle is **Not measured** where there's no CAN bus — never 0. |
| 19:00 | Click CP-03 for the asset view | Six-month revenue-vs-cost chart, ROI to date, payback estimate ("Not enough data" until it earns), cost inputs. |
| 19:30 | **Phase → Phase 2**, then **Day one** | Phase 2 hides Maintenance and Cost & ROI; Day one also hides geofences, labels, playback, ETA, MUC, billing and schedules. |
| 20:00 | **Tools → Reset demo data** | Everything is back to the seeded anchor. |

## Scenario coverage

The **Scenarios** menu lists every scenario from the spec (S1–S50). Each entry
switches to the Later phase, clears the sales view, applies its own setup (clock
jump, phase switch, sales view, certificate tamper), switches user and lands on
the starting screen. `docs/test-matrix.md` maps each scenario to the unit and
end-to-end tests that cover it.
