# Usability script: Customer (tracking link)

**Tester plays:** a site manager at Al Habtoor Logistics waiting for FB-12, with only the link Omar sent them. No account.
**Device:** a phone (390 × 844), or a desktop browser in a phone-sized window.
**Link:** `/t/k7Qm2Xc9TpLw4ZaN8rVb3Ye5` (booking BK-1011, valid until 20:00 on the demo day).

| # | Task (read aloud) | Start state | Success criterion | Click target | Time target | Happy path |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | "Open the link you were sent." | The link, not yet opened | The page shows FB-12 on a map with no sideways scroll | 0 | ≤ 10 s | Open the link |
| C2 | "When will the truck arrive?" | The link open | The tester reads an arrival time (ETA, HH:MM) | 0 | ≤ 10 s | Read the ETA |
| C3 | "What else can you see about this company?" | The link open | Nothing: no navigation, no other machines, no company data | 0 | ≤ 10 s | Look around |
| C4 | "The owner just stopped sharing. Reload the link." | Omar has revoked the link (moderator does this: FB-12 → Share tracking link → Revoke) | The page says "This tracking link is no longer active." | 0 | ≤ 15 s | Reload |

Four tasks, as §11.1 lists them for this role. A fifth (C5, "share the link on to a colleague") is left for J if the owner wants it; it would need a share control on the public page, which doesn't exist.
