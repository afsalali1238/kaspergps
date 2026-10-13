# Usability script: Site User

**Tester plays:** Mark D'Souza, Site Supervisor at Gulf Lift Rentals, Al Quoz site. He can see his site's machines and run reports, but can't edit, deactivate or bill.
**Home (start state for every task):** signed in, on the Map (`/app`), demo clock at the anchor.

| # | Task (read aloud) | Start state | Success criterion | Click target | Time target | Happy path |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | "Are there any alerts on your site?" | Map | The Alerts page is open, showing only his site's alerts | ≤ 1 | ≤ 15 s | Alerts |
| M2 | "Try to change or switch off a machine or a user." | Map | The tester confirms there's no Settings page, no Edit asset and no End access / Deactivate button | ≤ 1 | ≤ 30 s | Look for Settings (More) → open CR-02: no Edit or End access |
| M3 | "Open CR-02's engine data." | Map | The Engine & fuel tab shows engine readings with their sources | ≤ 2 | ≤ 20 s | CR-02 → Engine & fuel |
| M4 | "Run a trip report for your site." | Map | A report runs and shows his site's machines only | ≤ 3 | ≤ 45 s | Reports → Trip & Mileage → Run report |
| M5 | "Use search to jump straight to CR-02." | Map | CR-02's page is open | 0 clicks (⌘K) | ≤ 15 s | ⌘K / Ctrl+K → type CR-02 → Enter |

**Watch for:** ⌘K. In the prototype today the shortcut opens the demo bar's "View as" picker, not product search, so testers need the Search button (2 clicks). Note what the tester tries first.
