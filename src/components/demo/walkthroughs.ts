// Guided walkthroughs for every §13 scenario (demo bar item 7).
// Each scenario: numbered "do" steps, then a final step that states what the
// reviewer should see. Steps may carry a `highlight` CSS selector (pulsing
// ring) and a `doneWhen` text that ticks the step itself once visible.

export interface WalkthroughStep {
  text: string;
  /** CSS selector to outline with the pulsing yellow ring. */
  highlight?: string;
  /** When this text appears on the page, the step ticks itself. */
  doneWhen?: string;
}

interface WalkthroughDef {
  do: string[];
  expect: string;
  highlights?: Record<number, string>;
  doneWhen?: Record<number, string>;
}

const DEFS: Record<number, WalkthroughDef> = {
  1: {
    do: ['Open the Map, then the Assets list.', 'Open FB-12, then the Reports page.'],
    expect: 'Only Tier 1 features anywhere: no fuel/engine columns, tiles, reports or alert types; ignition hours are labelled Estimated.',
    highlights: { 0: 'a[href="/app"]', 1: 'a[href="/app/reports"]' },
  },
  2: {
    do: ['Open EX-04.', 'Switch to the Engine & fuel tab.'],
    expect: 'ECU engine hours, RPM, load and a fuel chart; AdBlue shows "Not measured"; the rental strip says "Rented to Marina…".',
    highlights: { 1: 'button' },
  },
  3: {
    do: ['Open GR-01 from the Assets list.'],
    expect: 'Fuel used is shown; fuel level and coolant read "Not measured".',
  },
  4: {
    do: ['Open the Map.'],
    expect: 'PU-51, PU-52 and VN-01 (own, Tier 2) plus EX-04 and CR-02 (Rented) — and not EX-07 or CR-05.',
    highlights: { 0: 'a[href="/app"]' },
  },
  5: {
    do: ['Open EX-04 and go to History, range 7 days.'],
    expect: 'Nothing before the rental start, a banner that says so, and only the Run report button.',
  },
  6: {
    do: ['Open the Clock menu and jump to "1 min before EX-07 rental starts".', 'Now jump to "EX-07 rental starts".'],
    expect: 'EX-07 is hidden at 07:59 and appears at 08:00, marked Rented.',
    highlights: { 0: '.demo-bar' },
  },
  7: {
    do: ['Open the Map.'],
    expect: 'EX-04 and PU-51 only — and no site filter.',
    highlights: { 0: 'a[href="/app"]' },
  },
  8: {
    do: ['Open the Reports page.'],
    expect: 'VN-01 plus "Past rental: TP-21" with the range clipped to the rental window.',
    highlights: { 0: 'a[href="/app/reports"]' },
  },
  9: {
    do: ['Open the Alerts page.', 'Check the Site filter.'],
    expect: 'The GN-01 fuel drop is visible with no Acknowledge button; TH-01 and WL-06 alerts are visible; the Site filter lists her two sites only.',
    highlights: { 0: 'a[href="/app/alerts"]' },
  },
  10: {
    do: ['Open the Map.'],
    expect: 'WL-06, TH-01 and GN-01 — and EX-11 is gone because access ended early.',
    highlights: { 0: 'a[href="/app"]' },
  },
  11: {
    do: ['Open the Map, then open BD-02.'],
    expect: 'The rented-in BD-02 with its fault code; Priya\'s own mixed fleet; FL-09 Unknown; the Tier filter is shown.',
  },
  12: {
    do: ['Open the EX-04 asset page directly by URL.'],
    expect: 'A plain "Asset not found" — not a permission error.',
  },
  13: {
    do: ['Open FB-12 and create a Share link.', 'Open the link in a private window.', 'Come back and Revoke the link.'],
    expect: 'The link works, then shows "no longer active" within 30 seconds of revoking.',
    doneWhen: { 0: 'Link' },
  },
  14: {
    do: ['Open the FB-12 public link.'],
    expect: 'One live dot and no other data.',
  },
  15: {
    do: ['Open EX-04 and press "End access now".'],
    expect: 'Marina loses EX-04 on refresh; the audit entry has the reason; the nightly check does not restore access.',
    doneWhen: { 0: 'ended' },
  },
  16: {
    do: ['Open the Booking simulator (Tools → /dev/bookings).', 'Extend BK-1001 by 2 days and cancel BK-1002.'],
    expect: 'Lina keeps EX-04 but loses CR-02, and CR-02\'s links are revoked.',
    highlights: { 0: '.demo-bar' },
    doneWhen: { 1: 'cancelled' },
  },
  17: {
    do: ['Open Console → Trackers and pair a spare tracker to LD-09.', 'Send a test reading.'],
    expect: 'LD-09 goes Unknown → Live with an audit entry; there is no Users & sites and no Audit log for Ops.',
    doneWhen: { 1: 'Live' },
  },
  18: {
    do: ['Open Console → Onboarding and create a tenant plus an asset with ALL-CAN300.'],
    expect: 'The new tenant\'s admin can sign in and the asset shows tier T3.',
    doneWhen: { 0: 'created' },
  },
  19: {
    do: ['Open Settings and invite a user.', 'View as the new user.'],
    expect: 'The new user sees only their site.',
  },
  20: {
    do: ['In the demo bar, set Phase → Day one.'],
    expect: 'Every Phase 2 tab, tile, column, report and alert type disappears.',
    highlights: { 0: '.demo-bar' },
  },
  21: {
    do: ['Turn Sales view on in the demo bar.'],
    expect: 'Locked cards reading "Needs ALL-CAN300 (Tier 3)" appear on FB-12; turning it off removes them.',
    highlights: { 0: '.demo-bar' },
  },
  22: {
    do: ['View as Karim (deactivated) and try to sign in.'],
    expect: 'The deactivated message.',
  },
  23: {
    do: ['Open the Map and the Site filter.', 'Open the Reports page.'],
    expect: 'The Site filter lists Business Bay and JVC Villas; John sees CR-02, PU-52, VN-01 and TP-21 as "Past rental" — nothing from Dubai Hills.',
    highlights: { 0: 'a[href="/app"]', 1: 'a[href="/app/reports"]' },
  },
  24: {
    do: ['Label EX-04 and WL-03 "Project Alpha" and filter by the label.', 'View as Lina.'],
    expect: 'The filter shows 3 assets; Lina\'s EX-04 shows no labels and her filter has no Emirates labels.',
  },
  25: {
    do: ['Open Geofences and find "Palm Crescent works".', 'Jump to yesterday 19:00 and play WL-06 on the scrubber.'],
    expect: 'The exit at 19:10 and re-entry at 19:55 on the scrubber, and a closed alert. Viewed as Khalid, no Palm geofence appears anywhere.',
    highlights: { 0: 'a[href="/app/geofences"]' },
  },
  26: {
    do: ['Draw a 300 m circle "Hatta Quarry — gate" with an enter alert.', 'Jump the clock +1 day.'],
    expect: 'A BH-05 enter event around 10:15, an alert in the bell, and events visible in the geofence report.',
    highlights: { 0: 'button' },
  },
  27: {
    do: ['Open WT-07 and go to Trips.', 'Play yesterday\'s trip at 60×.'],
    expect: 'An over-speed pin at 104 km/h, a gap banner where data is missing, and no fuel/RPM in the readout.',
  },
  28: {
    do: ['Open EX-04 → History and press "Play this period".'],
    expect: 'The scrubber starts at the rental start; RPM/load appear in the readout; AdBlue reads "Not measured".',
  },
  29: {
    do: ['Open the FB-12 public link.', 'Jump the clock +90 minutes.'],
    expect: '"Arriving about … (in … min)" becomes "Arrived" — with no route and no history.',
  },
  30: {
    do: ['On Reports, schedule a daily Location history for EX-04.', 'Jump to "EX-04 rental ends" + 2 days and open Downloads.'],
    expect: 'Runs appear in Downloads until the rental ends, then "Skipped — you no longer have access…"; the schedule pauses after 2 skips.',
    highlights: { 0: 'a[href="/app/reports"]' },
    doneWhen: { 1: 'Skipped' },
  },
  31: {
    do: ['Open Certificates and issue last month for BD-02.', 'Reissue it.'],
    expect: 'Both are sealed, the reissue has the same seal, and the verify page says "Valid".',
    highlights: { 0: 'a[href="/app/certificates"]' },
    doneWhen: { 0: 'Sealed' },
  },
  32: {
    do: ['Tools → Tamper with a stored certificate.', 'Open its verify link.'],
    expect: '"Does not match its seal — contact Kasper."',
    doneWhen: { 1: 'seal' },
  },
  33: {
    do: ['Look for Certificates on the map and asset pages.'],
    expect: 'No Certificates nav or tab for a Tier 1 fleet — Sales view shows a locked card instead.',
  },
  34: {
    do: ['Open Billing → Received and invoice INV-EE-0412.', 'Open its MUC and Pay (simulated).'],
    expect: 'Hours on the invoice equal the MUC billable hours (plus the minimum top-up line); it shows Paid, also seen from View as Khalid.',
    doneWhen: { 1: 'Paid' },
  },
  35: {
    do: ['Open Billing → INV-AN-0098 (TP-21) and Record payment AED 500.'],
    expect: 'The basis is "Days on hire"; the invoice is Part-paid; an over-payment is refused.',
  },
  36: {
    do: ['Open Console → Billing.'],
    expect: 'GPS statements per tenant by tier; Gulf Lift unpaid; Ravi (Ops) has no Billing at all.',
  },
  37: {
    do: ['Open Maintenance.', 'Log a service on BD-02.', 'View as Priya.'],
    expect: 'EX-04 Due soon (ECU) and BD-02 Overdue while on hire to Gulf Lift; after logging, BD-02 is Ok. Priya sees no maintenance on BD-02.',
    highlights: { 0: 'a[href="/app/maintenance"]' },
    doneWhen: { 1: 'Ok' },
  },
  38: {
    do: ['Open Maintenance.'],
    expect: 'FB-14 by GPS distance and TP-22 by "Estimated" ignition hours — and no fault-code tasks.',
    highlights: { 0: 'a[href="/app/maintenance"]' },
  },
  39: {
    do: ['Open Cost & ROI and set the range to last month.'],
    expect: 'EX-04 fuel cost is labelled ECU; CP-03 fuel cost is "Estimated"; CP-03 idle cost is "Not measured".',
    highlights: { 0: 'a[href="/app/cost"]' },
  },
  40: {
    do: ['Look for Billing, Cost, Certificates and Maintenance edit.'],
    expect: 'Maintenance is view-only for own assets; Billing, Cost and Certificates are absent.',
  },
  41: {
    do: ['Set Phase → Phase 2, then Day one.'],
    expect: 'Phase 2 removes Maintenance and Cost & ROI. Day one also removes geofences, labels, playback, ETA, MUC, billing and schedules — Downloads stays.',
    highlights: { 0: '.demo-bar' },
  },
  42: {
    do: ['Onboard "Sharjah Plant Hire" (vendor) with 2 sites, admin Noura Khalid and 3 pasted CSV assets.', 'Register 3 new IMEIs — one on purpose with a bad check digit, then fix it.', 'Fit 1 ALL-CAN300 from stock and Create.', 'View as Noura.'],
    expect: 'Noura sees her 3 assets (Unknown → Live within minutes of simulated time); the CAN-fitted one is Tier 3 with Engine & fuel; the others show no CAN features.',
    doneWhen: { 3: 'assets' },
  },
  43: {
    do: ['Console → Trackers → Register many and paste 10 lines (2 duplicates, 1 bad SIM).'],
    expect: 'The preview shows 3 errors and "7 added · 3 skipped"; the new trackers are In stock.',
    doneWhen: { 0: 'skipped' },
  },
  44: {
    do: ['Console → Requests → Priya\'s MW-01 request → Pair a tracker.', 'Jump the clock +10 minutes.'],
    expect: 'MW-01 goes Unknown → Live and Priya\'s bell shows "Tracker fitted on MW-01".',
    doneWhen: { 1: 'Tracker fitted' },
  },
  45: {
    do: ['Console → CAN adapters → try to fit LVCAN200 to EX-11.', 'Instead fit it to PU-31.'],
    expect: 'EX-11 is refused with "LVCAN200 is for light vehicles…"; PU-31 works and becomes Tier 2 with a "CAN adapter fitted" marker in its charts — Omar now sees fuel columns.',
    doneWhen: { 1: 'fitted' },
  },
  46: {
    do: ['Console → Bookings → New booking: WL-03 to Palm, Palm Crescent, tomorrow → then +3 days.', 'Then try EX-04 three to five days from now.'],
    expect: 'WL-03 appears for Fatima and Rashid from the start; the EX-04 booking is refused for overlapping BK-1001.',
  },
  47: {
    do: ['Console → Assets → Transfer CP-03 from Emirates to Gulf Lift.'],
    expect: 'Khalid loses CP-03 from the map but can report on it up to the transfer; Priya sees it from the transfer only; the Emirates labels are gone.',
    doneWhen: { 0: 'transferred' },
  },
  48: {
    do: ['Settings → Assets → Add asset "EX-15".', 'Then try to retire EX-07.'],
    expect: 'EX-15 shows "No tracker" with "Request a tracker"; retiring EX-07 is refused because a booking starts tomorrow.',
  },
  49: {
    do: ['Settings → Sites → add "Al Furjan Villas".', 'Invite a Site User there and View as them.'],
    expect: 'An empty map with "No assets yet"; once Ravi books an asset to that site, it appears.',
  },
  50: {
    do: ['Console → Team → add an Ops user and View as them.', 'Then try to remove the last Kasper Admin.'],
    expect: 'The new Ops user works in the console; removing the last Kasper Admin is refused.',
    doneWhen: { 0: 'added' },
  },
};

export function walkthroughSteps(id: number): WalkthroughStep[] {
  const def = DEFS[id];
  if (!def) {
    return [{ text: `Walk through scenario S${id}.` }];
  }
  const steps: WalkthroughStep[] = def.do.map((text, i) => ({
    text,
    highlight: def.highlights?.[i],
    doneWhen: def.doneWhen?.[i],
  }));
  steps.push({ text: `What you should see: ${def.expect}` });
  return steps;
}
