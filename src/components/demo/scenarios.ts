// Demo scenarios (spec §13). A scenario sets the phase, the user, the clock and
// the starting page, then the walkthrough card takes over. Set-up goes through
// the store actions, so a scenario moves the same state a reviewer would.

import * as clock from '@/lib/clock';
import { storeActions } from '@/hooks';
import { signInAs } from '@/server/api';
import { presetAt, dubaiYesterdayAt, fb12PublicPath, tamperWithMuc } from '@/server/api';

export interface Scenario {
  id: number;
  label: string;
  /** Who the scenario is run as (null keeps the current user). */
  user: string | null;
  path: string;
  /** Demo setup applied before navigating (phase, sales view, clock, tamper). */
  setup?: () => void;
  /** Start on the live FB-12 outside-hirer link instead of `path`. */
  fb12Public?: boolean;
}


// Spec 13: every scenario runs from here. Each entry lands on the screen the
// scenario starts from, as the right user, in the right phase.
export const SCENARIOS: Scenario[] = [
  { id: 1, label: 'Omar · No-CAN fleet — Tier 1 features only', user: 'u-omar', path: '/app' },
  { id: 2, label: 'Khalid · EX-04 Engine & fuel (Tier 3)', user: 'u-khalid', path: '/app/assets/a-ex04' },
  { id: 3, label: 'Khalid · GR-01 — fuel used, level not measured', user: 'u-khalid', path: '/app/assets/a-gr01' },
  { id: 4, label: 'Lina · Map — own and rented assets', user: 'u-lina', path: '/app' },
  { id: 5, label: 'Lina · EX-04 history starts at the rental', user: 'u-lina', path: '/app/assets/a-ex04' },
  { id: 6, label: 'Lina · One minute before the EX-07 rental', user: 'u-lina', path: '/app', setup: () => jumpToPreset('1 min before EX-07 rental starts') },
  { id: 7, label: 'Ahmed · Dubai Hills site user', user: 'u-ahmed', path: '/app' },
  { id: 8, label: 'Anil · JVC — own assets and past rentals', user: 'u-anil', path: '/app/reports' },
  { id: 9, label: 'Deepa · Two sites, fuel-drop alert', user: 'u-deepa', path: '/app/alerts' },
  { id: 10, label: 'Fatima · Palm — access ended early', user: 'u-fatima', path: '/app' },
  { id: 11, label: 'Priya · Rented-in BD-02 with a fault code', user: 'u-priya', path: '/app/assets/a-bd02' },
  { id: 12, label: 'Priya · EX-04 is not hers — not found', user: 'u-priya', path: '/app/assets/a-ex04' },
  { id: 13, label: 'Omar · FB-12 share link then revoke', user: 'u-omar', path: '/app/assets/a-fb12' },
  { id: 14, label: 'Outside hirer · FB-12 public link', user: null, path: '/app/assets/a-fb12', fb12Public: true },
  { id: 15, label: 'Khalid · EX-04 — End access now', user: 'u-khalid', path: '/app/assets/a-ex04' },
  { id: 16, label: 'Booking simulator · extend BK-1001, cancel BK-1002', user: null, path: '/dev/bookings' },
  { id: 17, label: 'Ravi · Pair a spare tracker to LD-09', user: 'u-ravi', path: '/console/trackers' },
  { id: 18, label: 'Sara · Create a tenant and a Tier 3 asset', user: 'u-sara', path: '/console/onboarding' },
  { id: 19, label: 'Lina · Settings — invite a user', user: 'u-lina', path: '/app/settings' },
  { id: 20, label: 'Phase → Day one — hide every Phase 2 screen', user: null, path: '/app', setup: () => storeActions.setDemoSwitches({ phase: 'day_one' }) },
  { id: 21, label: 'Omar · Sales view on — locked Tier 3 cards', user: 'u-omar', path: '/app/assets/a-fb12', setup: () => storeActions.setDemoSwitches({ salesView: true }) },
  { id: 22, label: 'Karim · Deactivated account — sign-in refuses', user: 'u-karim', path: '/sign-in' },
  { id: 23, label: 'John · Business Bay + JVC Villas', user: 'u-john', path: '/app' },
  { id: 24, label: 'Khalid · Label EX-04 and WL-03 "Project Alpha"', user: 'u-khalid', path: '/app/assets/a-ex04' },
  { id: 25, label: 'Fatima · Geofences — Palm Crescent works', user: 'u-fatima', path: '/app/geofences', setup: () => storeActions.setClockOffsetMs(dubaiYesterdayAt(19) - clock.getAnchor()) },
  { id: 26, label: 'Khalid · Geofences — Hatta Quarry gate', user: 'u-khalid', path: '/app/geofences' },
  { id: 27, label: 'Omar · WT-07 trips and playback', user: 'u-omar', path: '/app/assets/a-wt07' },
  { id: 28, label: 'Lina · EX-04 playback inside the rental', user: 'u-lina', path: '/app/assets/a-ex04' },
  { id: 29, label: 'Outside hirer · FB-12 arrival time', user: null, path: '/app/assets/a-fb12', fb12Public: true, setup: () => jumpToPreset('FB-12 arrives at Al Habtoor site') },
  { id: 30, label: 'Lina · Report schedules and downloads', user: 'u-lina', path: '/app/schedules' },
  { id: 31, label: 'Khalid · Certificates — issue and reissue', user: 'u-khalid', path: '/app/certificates' },
  { id: 32, label: 'Tools · Tamper with a certificate, then verify', user: 'u-khalid', path: '/verify/MUC-2026-09-EX-04-01', setup: () => { tamperWithMuc('MUC-2026-09-EX-04-01'); } },
  { id: 33, label: 'Omar · No certificates for a Tier 1 fleet', user: 'u-omar', path: '/app/certificates' },
  { id: 34, label: 'Fatima · Billing — pay an invoice (simulated)', user: 'u-fatima', path: '/app/billing' },
  { id: 35, label: 'Omar · Billing — record a part payment', user: 'u-omar', path: '/app/billing' },
  { id: 36, label: 'Sara · Console billing — GPS statements', user: 'u-sara', path: '/console/billing' },
  { id: 37, label: 'Khalid · Maintenance — EX-04 due soon, BD-02 overdue', user: 'u-khalid', path: '/app/maintenance' },
  { id: 38, label: 'Omar · Maintenance — GPS km and estimated hours', user: 'u-omar', path: '/app/maintenance' },
  { id: 39, label: 'Khalid · Cost & ROI — last month', user: 'u-khalid', path: '/app/cost' },
  { id: 40, label: 'Mark · Site user — maintenance view only', user: 'u-mark', path: '/app/maintenance' },
  { id: 41, label: 'Phase → Phase 2 — maintenance and cost go away', user: null, path: '/app', setup: () => storeActions.setDemoSwitches({ phase: 'phase2' }) },
  { id: 42, label: 'Sara · Onboard "Sharjah Plant Hire"', user: 'u-sara', path: '/console/onboarding' },
  { id: 43, label: 'Ravi · Register many trackers (paste 10)', user: 'u-ravi', path: '/console/trackers' },
  { id: 44, label: 'Ravi · Requests — pair Priya\u2019s MW-01', user: 'u-ravi', path: '/console/requests' },
  { id: 45, label: 'Ravi · CAN adapters — fit LVCAN200 to PU-31', user: 'u-ravi', path: '/console/adapters' },
  { id: 46, label: 'Ravi · Bookings — new booking, overlapping one', user: 'u-ravi', path: '/console/bookings' },
  { id: 47, label: 'Sara · Transfer CP-03 to Gulf Lift', user: 'u-sara', path: '/console/assets' },
  { id: 48, label: 'Khalid · Settings — add EX-15, retire EX-07', user: 'u-khalid', path: '/app/settings' },
  { id: 49, label: 'Lina · Settings — sites and a site user', user: 'u-lina', path: '/app/settings' },
  { id: 50, label: 'Sara · Kasper team — add an Ops user', user: 'u-sara', path: '/console/team' },
];


/** Move the demo clock to a "Jump to" preset, by its label. */
function jumpToPreset(label: string): void {
  const at = presetAt(label);
  if (at !== null) storeActions.setClockOffsetMs(at - clock.getAnchor());
}

/**
 * Start a scenario: put the demo into the Later phase (so every screen exists),
 * drop the sales view, apply the scenario's own setup, switch user and land on
 * the starting screen. A user the sign-in refuses (deactivated) signs out
 * instead, so the scenario shows the refusal on the sign-in page.
 */
export function startScenario(scenario: Scenario, go: (path: string) => void): void {
  storeActions.setDemoSwitches({ phase: 'later', salesView: false });
  scenario.setup?.();
  if (scenario.user) {
    const result = signInAs(scenario.user);
    storeActions.setSession(result.success && result.data ? result.data.session : null);
  }
  go(scenario.fb12Public ? (fb12PublicPath() ?? scenario.path) : scenario.path);
}
