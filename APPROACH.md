# Approach note — Embo

**Short version (for the email):** I modelled every *brand × process* as its own unit of coverage with an operating
calendar, a minimum staff and a shift, and linked people to it as owners or trained backups. A deterministic engine builds
the month: it applies leave and holidays, then places weekly offs by simulating every candidate day and scoring it
(unfillable gap ≫ rest-day rule ≫ backup needed ≫ preference). A separate validator re-checks every rule after every
action. Anything that can't be satisfied is flagged with simulated fixes rather than hidden, and changes are handled by a
non-destructive Repair plus a "what if X is unavailable" simulator.

**Architecture.** MERN: React 18 + Vite client, Express + Mongoose API, MongoDB database, all in TypeScript. The
scheduling engine is pure TypeScript in `/shared` (generate, validate, suggest, impact) and is covered by 17 Vitest tests.
The server runs it for Generate, Re-plan and Repair and saves the results to MongoDB. The browser runs the same code for
instant validation and fix simulation. Edits save automatically through idempotent REST calls. One Render service serves
both the API and the React build.

**Key decisions.**
- Generator and validator are independent, so there are no silent invalid rosters.
- Mandatory coverage outranks rest rules, which outrank preferences (encoded as costs).
- Repair is local: only what a change broke is touched. Manual edits are locked and never overridden.
- Humans keep the judgement calls: leave approval, publishing with open issues, cross-trained cover, client trade-offs.

See README.md for details and the answers to the eight questions.
