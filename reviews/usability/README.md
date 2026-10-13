# Usability kit

One script per role, five tasks each (UI-UPGRADE §11.1). Hand a script to a tester with the demo open; they think aloud while you note clicks and time. The same tasks run as Playwright happy paths in `tests/e2e/usability.spec.ts` (ids O1 … C4 match), which counts clicks and time on every CI run.

| Script | Role | Who you sign in as |
| --- | --- | --- |
| [owner.md](owner.md) | Owner | Khalid Rahman, Emirates Earthmovers (Omar Saleh, Al Noor, for FB-12) |
| [renter.md](renter.md) | Renter | Lina Aziz, Marina Builders |
| [site-user.md](site-user.md) | Site User | Mark D'Souza, Gulf Lift, Al Quoz |
| [kasper-ops.md](kasper-ops.md) | Kasper Ops | Ravi Menon |
| [customer.md](customer.md) | Customer | nobody: the FB-12 tracking link, on a phone |

## How to run a session

1. Open the demo in a fresh browser window (or Tools → Reset demo data). The clock must read the anchor, **10:00** in the demo bar.
2. Sign in as the script's user (role picker or email; any password).
3. Read the task aloud. Start the timer when you finish reading it.
4. Count every click or tap, including menu openings. Typing and keyboard shortcuts are not clicks. Choosing from a dropdown is one click.
5. Stop the timer when the success criterion is on screen. If the tester gives up or takes more than three times the time target, mark the task failed and note where they got stuck.
6. Between tasks, go back to the role's home screen (the start state of the next task).

**Scoring (scorecard A14):** a task passes when it's done within its click target and its time target. A14 reaches 9 when every task passes in the scripted run and at least 4 of 5 per role pass with a first-time tester.

## Report-only results (Playwright, 13 Oct 2026, `main` + D)

The scripted run's numbers are in `reviews/D-self-check.md` ("Usability run"). CI logs every task as a `USABILITY {...}` line in the Playwright shard that runs it. The spec doesn't fail on a missed target yet; agent J turns the targets into assertions.
