// Which Billing tabs exist, and which one the page opens on.
//
// Agent A / U0 (PR #29): the page used to hard-code
// `useState<TabId>('received')`, so an owner who issues invoices and receives
// none (Khalid) landed on an empty table. The rule now is: honour the tab the
// visitor picked while it still exists, otherwise open on the first tab that has
// something in it, otherwise the first tab.
//
// Both functions are pure so the rule is testable without a browser.

export type BillingTabId = 'issued' | 'received' | 'gps' | 'reports';

/** Row counts for the tabs whose content is fetched. */
export interface BillingTabCounts {
  issued: number;
  received: number;
  /** Kasper's GPS subscription statements. */
  gps: number;
}

/**
 * The tabs this visitor can see, in display order.
 *
 * 'issued' is always offered to Kasper (it issues the GPS statements) and to
 * anyone who has issued something. 'received' is offered to every customer, so
 * a renter can always see its own tab. 'gps' is always there, and the Reports
 * summary is customer-only.
 */
export function billingTabs(isKasper: boolean, counts: BillingTabCounts): BillingTabId[] {
  return [
    ...(counts.issued > 0 || isKasper ? (['issued'] as const) : []),
    ...(counts.received > 0 || !isKasper ? (['received'] as const) : []),
    'gps' as const,
    ...(!isKasper ? (['reports'] as const) : []),
  ];
}

/**
 * @param chosen  the tab the visitor clicked, or null before they pick one.
 * @param ordered the tabs this visitor can see, in display order.
 * @param content how many rows each tab would show. The Reports tab summarises
 *                what the visitor issued, so it counts as having content only
 *                when something was issued.
 */
export function chooseBillingTab(
  chosen: BillingTabId | null,
  ordered: BillingTabId[],
  content: Record<BillingTabId, number>,
): BillingTabId | undefined {
  if (chosen && ordered.includes(chosen)) return chosen;
  return ordered.find(id => content[id] > 0) ?? ordered[0];
}
