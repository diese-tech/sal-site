# Draft Engine Readiness Audit — Captain Roster Draft (2026-07-22)

**Scope:** the snake-draft / turn-based system that drafts vetted players onto
team captains' rosters — `draft_rooms`, `draft_picks`, `captain_tokens`,
`captain_shortlists`, and every route/component under `src/app/api/draft`,
`src/app/api/admin/draft`, `src/lib/draft-data.ts`, `src/types/draft.ts`,
`src/components/draft/DraftBoardClient.tsx`, and
`src/components/admin/AdminDraftRoomClient.tsx`.

Out of scope: the unrelated "god draft" (in-match god/character pick-ban,
`src/app/draft/god`, `src/lib/god-draft-*`) — a different feature that
happens to share the `/draft` URL prefix.

> **Decision status (2026-07-23):** The audit remains a snapshot of the current
> implementation gaps. The resulting ADRs and remediation plan are merged, but
> the implementation waves are not thereby complete. For the accepted behavior
> in plain English, read
> [`draft-platform-guide.md`](draft-platform-guide.md).

This is a code-level correctness review, not a live/runtime verification —
findings are proven by direct trace of the request handlers and SQL
functions, cross-checked against the atomic-RPC migrations already in the
repo (issues #61, #67, #129) and against the design intent in
`docs/archive/draft-flow.md`. Per `supabase/migrations/README.md`, schema
ownership now lives in `diese-tech/sal-database`; any fix here that needs a
new SQL function is application-layer-only or must be filed against that
repo.

## Verdict

**Conditionally ready, revised down from the initial pass.** The core
turn-advance machinery (submit a pick, auto-advance on timeout, undo) is
genuinely well-built: each is a `SELECT ... FOR UPDATE` Postgres function
that re-validates `current_pick_index` under a row lock, specifically
because earlier races were found and fixed (#61, #67, #129). Turn ownership
and the "already picked" guard are both enforced server-side and at the DB
constraint level, not just in the client.

A round of external review (see Acknowledgments) surfaced a finding more
severe than anything in the initial pass: **finalizing a draft does not
durably put players on the roster the rest of the site reads**
(DE-00, P1) — this is true even for a single, isolated, non-concurrent
draft, so it supersedes the "will run a single division draft correctly"
claim below. On top of that, the unresolved risk from the initial pass
still stands: what happens when more than one division's draft exists for
the same season, which the code's own cross-division pick eligibility
explicitly allows and the admin UI does nothing to prevent (DE-01). There
are also two remaining instances of the exact concurrency bug class the
codebase has already fixed three times elsewhere (DE-02, DE-03), and
partial-at-best automated test coverage (DE-05, corrected below — coverage
exists for one specific concurrency path but not the engine broadly).

## Findings

| ID | Sev | Finding | Issue |
|---|---|---|---|
| DE-00 | **P1** | `finalizeDraftRosters()` writes to `players.org_id` directly, but every season-scoped consumer (`getLeagueData`/`getAdminLeagueData`) derives roster membership from `season_rosters` — drafted players never actually land on a team's roster anywhere the site looks. | [#210](https://github.com/diese-tech/sal-site/issues/210) |
| DE-01 | P1 | A player can be drafted into two different division draft rooms; nothing scopes "already picked" across rooms. | [#206](https://github.com/diese-tech/sal-site/issues/206) |
| DE-02 | P2 | Admin "Skip Pick" is not concurrency-safe — same bug class as #67/#129, left unfixed for this one endpoint. | [#207](https://github.com/diese-tech/sal-site/issues/207) |
| DE-03 | P2 | `PATCH /api/admin/draft/[id]` can change `baseOrder`/`rounds` while a draft is active or paused, breaking the invariant the atomic-pick RPC depends on. | [#208](https://github.com/diese-tech/sal-site/issues/208) |
| DE-04 | P3 | No pending-confirmation step before a pick locks in, despite the archived design doc specifying one. | — (product decision, not filed) |
| DE-05 | P3 | Partial coverage, not zero — a real concurrency test exists for one path, but the engine broadly is unverified. | — (roll into fix PRs) |
| DE-06 | P3 | Captain token is consumed (deleted) before the code checks it matches the requested draft room. | — (not filed; trivial, roll into DE-02 fix) |

### DE-00 — Draft finalize never writes to `season_rosters` (P1) — [#210](https://github.com/diese-tech/sal-site/issues/210)

**Where:** `src/lib/draft-data.ts:407-432` (`finalizeDraftRosters`) vs.
`src/lib/league-data.ts:303-396` (`fetchLeagueData`, cached as
`getLeagueData`) and `src/lib/league-data.ts:407-492`
(`getAdminLeagueData`).

`finalizeDraftRosters` does exactly one write: `supabase.from("players")
.update({ org_id: orgId, status: "drafted" }).in("id", playerIds)` — it
mutates the global `players` table directly. But every season-scoped
consumer of league data — which is nearly everything, since `getLeagueData`
is the primary read path for the public site and `getAdminLeagueData` for
the admin panel, including both draft pages themselves
(`src/app/draft/[id]/page.tsx`, `src/app/admin/draft/[id]/page.tsx`) —
does not read `players.org_id` for membership at all. It reads
`season_rosters` (`league-data.ts:329,431,576`), and
`scopeSeasonEntities` (`src/lib/season-scope.ts:40-50`) *reconstructs* each
returned player's `orgId`/`divisionId`/`isCaptain` from that season-roster
row, discarding whatever `players.org_id` held. The canonical write path
for "player X is on org Y's roster this season" is
`saveSeasonRosterAssignment` (`league-data.ts:616-652`), used by the admin
roster-management route (`src/app/api/admin/seasons/[id]/roster/route.ts`)
— `finalizeDraftRosters` never calls it, and nothing else calls it on the
draft's behalf.

**Consequence:** run a draft, complete it, finalize it — the picks are
correctly recorded in `draft_picks`, but the picked players do not appear
on their new team's roster on the team page, in the admin roster tools, or
anywhere else `getLeagueData`/`getAdminLeagueData` is the source, because
those paths never look at the field `finalizeDraftRosters` wrote to. This
reproduces on a single, non-concurrent, single-division draft — no race,
no second room, nothing exotic required. It is a bigger problem than DE-01
in the sense that even a *correctly isolated* draft doesn't accomplish its
stated purpose end to end; DE-01 is about what happens when two drafts
*do* interact.

This looks like drift from the season-scoping migration referenced in
`docs/audit-status.md` (PR #187, "scopes the public site and administrator
roster tools to the selected current season") landing after the draft
engine was built, without updating `finalizeDraftRosters` to match the new
canonical write path.

**Recommendation:** `finalizeDraftRosters` should call
`saveSeasonRosterAssignment({ seasonId: room.seasonId, playerId, orgId,
divisionId: room.divisionId, isCaptain: false })` per picked player (or a
batched equivalent) instead of — or in addition to, if `players.org_id` is
still read anywhere legacy — the direct `players` table update. No
migration needed; this is purely `src/lib/draft-data.ts`.

### DE-01 — Cross-division double-draft (P1) — [#206](https://github.com/diese-tech/sal-site/issues/206)

**Where:** `src/lib/league-data.ts:574` (the single query backing
`getLeagueData().players` — `select("*").is("archived_at", null)`, no
status/org filter), `src/components/draft/DraftBoardClient.tsx:163,176-177`
(`pickedIds`/`availableByDivision` computed only from `state.picks`, i.e.
this room's own picks), `src/components/admin/AdminDraftRoomClient.tsx:52-55`
(same pattern), `src/lib/draft-data.ts:376-398` (`getTopShortlistPick`, same
per-room scoping used for timeout auto-pick), and the DB constraint itself:
`supabase/migrations/002_draft_engine.sql:27-28`,
`unique (draft_room_id, player_id)` — scoped to one room, not global.

**Why it's reachable, not theoretical:** the draft's own tier-eligibility
rule (`src/app/api/draft/[id]/pick/route.ts:9,43-63`, mirrored client-side in
`DraftBoardClient.tsx:166-172`) *deliberately* lets a lower-tier room draft
players from higher-tier divisions — e.g. a `terra` room (tier 1) can pick
`solar` (2) or `lunar` (3) players. Nothing stops an admin from creating and
starting `terra`, `solar`, and `lunar` rooms for the same season
concurrently (`src/app/api/admin/draft/route.ts:27-37` only guards against
*two rooms for the same division*, not against sibling divisions running at
once). Once that happens, a `lunar` player can be picked from inside the
`terra` room; the `lunar` room's own "available players" list still shows
that player, because it only excludes players present in *its own*
`draft_picks` rows. The player can be picked a second time there.

Even without concurrency, this is a **sequencing hazard**: if `terra`
drafts first, completes, and only then `solar`/`lunar` start, a player
picked cross-division during `terra`'s run still shows as available in
`solar`/`lunar` afterward, because eligibility is derived from
`players.divisionId` + this-room's-picks, never from anything season-scoped.

**Blast radius:** `finalizeDraftRosters` is called per-room
(automatically on the final pick,
`src/app/api/draft/[id]/pick/route.ts:90-94`, and manually via
`src/app/api/admin/draft/[id]/finalize/route.ts`) and has no "already
assigned to a different org" check. If two rooms both draft the same
player, both rooms' `draft_picks` rows persist — the pick log/audit trail
shows two teams "owning" the same player with no conflict ever surfaced.
(Note: as of DE-00, `finalizeDraftRosters`'s *own* write doesn't durably
reach the roster either way — but the double `draft_picks` record and the
double "drafted" UX for two captains is the DE-01-specific damage,
independent of DE-00.)

**Recommendation:** do **not** use a global `players.status === 'drafted'`
flag — that field isn't
season-scoped (a player drafted last season and returning as a free agent
this season would be wrongly excluded forever). Instead, scope the
"already drafted" check to the *current season*: exclude a player if any
`draft_picks` row exists for them across draft rooms whose
`draft_rooms.season_id` matches the active season (not just this room),
mirroring the season-scoping `getLeagueData` already does via
`season_rosters`. Add that check alongside the existing per-room check in
the pick route, GET timeout-handler, and shortlist auto-pick. Until that
lands, treat "only one division draft room active at a time per season" as
an operational rule and say so explicitly in the admin UI (currently
unstated).

That application-layer lookup is necessary but **not sufficient as a
concurrency guarantee**: two picks submitted simultaneously in different
rooms can both observe the player as available before either insert commits,
and the existing unique constraint only covers `(draft_room_id, player_id)`.
Within `sal-site`, enforce one active-or-paused draft room per season and keep
the season-wide lookup to protect sequential rooms. A durable guarantee under
arbitrary concurrent database writers requires a transaction-level invariant
owned by `sal-database` (for example, an atomic pick RPC with a season-scoped
lock or uniqueness model); do not claim the application check alone closes
that race.

### DE-02 — Admin Skip is not concurrency-safe (P2) — [#207](https://github.com/diese-tech/sal-site/issues/207)

**Where:** `src/app/api/admin/draft/[id]/skip/route.ts:9-25`.

Pick submission (`submit_draft_pick`, migration 015), timer-expiry
auto-advance (`advance_pick_on_timeout`, migration 020), and undo
(`undo_last_pick`, migration 014) are all `SECURITY DEFINER` functions that
take `SELECT ... FOR UPDATE` on the room row and re-validate
`current_pick_index` before mutating — each one exists specifically because
an earlier plain read-then-write raced (issues #61, #67, #129; see the
comments at the top of each migration file). The admin skip route still
does the same thing those three were fixed to stop doing: it reads
`buildDraftState(id)`, computes `nextIndex` from that snapshot, and calls
`updateDraftRoom()` — an unconditional `UPDATE ... WHERE id = $1` with no
lock and no compare against the current DB value of
`current_pick_index`.

Both `AdminDraftRoomClient` and `DraftBoardClient` poll
`GET /api/draft/[id]` every 3 seconds from every open tab (captains,
spectators, and the admin panel itself), and that same GET route is what
performs the timeout auto-advance. An admin pressing "Skip Pick" at the same
moment a poll observes the timer as expired (or a captain's pick lands) is
a realistic interleaving, not a contrived one — and the skip route has no
protection against it.

**Recommendation:** give `skip` the same shape as `advancePickOnTimeout`:
either a new `SECURITY DEFINER` RPC (schema change — file against
`sal-database`), or an application-layer optimistic-concurrency guard using
Supabase's conditional update (`.eq("current_pick_index", expectedIndex)`
before `.select().single()`, treating a no-row-returned result as a
conflict) — the latter needs no migration and fits the current
ownership-transfer freeze.

### DE-03 — `baseOrder`/`rounds` mutable mid-draft (P2) — [#208](https://github.com/diese-tech/sal-site/issues/208)

**Where:** `src/app/api/admin/draft/[id]/route.ts:13-26` (`PATCH`).

Migration 015's own comment states the atomic pick RPC's correctness
depends on an invariant: *"base_order and rounds are immutable while a
draft is active."* The `PATCH` route that can change `baseOrder`, `rounds`,
and `pickTimerSeconds` (`src/lib/draft-data.ts:137-161`,
`updateDraftRoom`) has no `room.status === "pending"` guard — it accepts
the patch regardless of whether the draft is `pending`, `active`, or
`paused`. The only thing currently protecting this invariant is that
`AdminDraftRoomClient` hides the "Save Order" control once the draft leaves
`pending` (`src/components/admin/AdminDraftRoomClient.tsx:155-180`) — that's
UI-only, not enforced by the API it calls.

Because `buildPickSequence` (`src/types/draft.ts:40-47`) is recomputed
fresh from `baseOrder`+`rounds` on every read, changing `baseOrder` while
picks already exist desyncs the recorded pick log from the recomputed
sequence with no error surfaced anywhere — pick #3's org in the sequence
and pick #3's org in `draft_picks` can silently diverge.

**Recommendation:** add the same `if (room.status !== "pending")` guard
this route already omits, mirroring the check present in
`start/route.ts:14`.

### DE-04 — No pending-confirmation step (P3, design-drift)

`docs/archive/draft-flow.md` (Pick Flow, lines 72-80) specifies: player
enters a pending state → captain confirms → then the pick commits. The
shipped flow (`DraftBoardClient.makePick`,
`src/components/draft/DraftBoardClient.tsx:100-115`) submits on a single
click with no intermediate confirm, and a captain has no self-service undo
— only an admin can undo (`callUndo`,
`src/components/admin/AdminDraftRoomClient.tsx:74-87`). Under pick-timer
pressure this is a real misclick risk. This may be an intentional
simplification from the archived design, but it reads as drift rather than
a decision — worth a conscious call before season, not a discovery mid-draft.

### DE-05 — Test coverage is partial, not zero (P3, corrected)

An earlier version of this finding claimed zero coverage of the
roster-draft engine; that was wrong. `src/app/api/draft/[id]/route.test.ts`
exists and is a real, well-targeted test: it fires two concurrent
`GET /api/draft/[id]` calls against an expired-timer room and verifies
exactly one `draft_auto_pick` and one `draft_auto_pick_conflict` audit
entry get written, that only the winner's shortlist gets cleared, and that
a non-conflict failure logs nothing (issue #141). That's a genuine
concurrency-conflict-logging test, not a smoke test.

What's still uncovered: `buildPickSequence` itself has no unit test; the
pick-submission route (`src/app/api/draft/[id]/pick/route.ts`) has no test
for turn-ownership rejection or division-tier eligibility; the skip and
undo routes have no tests; and none of the SQL RPCs
(`submit_draft_pick`, `advance_pick_on_timeout`, `undo_last_pick`) have a
DB-integration test that exercises the actual Postgres function under
real concurrent connections — the existing test mocks `submitPickAtomic`
rather than hitting the RPC. `tests/integration/rls.test.ts` has two
incidental string matches unrelated to turn logic. So: partial, targeted
coverage of one specific race (auto-pick timeout conflict), and no coverage
of the rest of the turn/eligibility surface.

### DE-06 — Captain token consumed before room-match check (P3, minor)

`src/app/api/draft/[id]/token/route.ts:11-14` calls `exchangeToken()`
(which deletes the one-time token row inside
`consumeCaptainToken`, `src/lib/draft-data.ts:266-281`) *before* checking
`session.draftRoomId !== id`. A token opened against the wrong draft room's
URL (stale link, copy/paste error) is permanently burned with no session
granted anywhere — the admin has to regenerate it. Low impact, cheap fix:
check the room match before consuming, or make the token still work if
presented on the right room's URL by keying the lookup off the token alone
and rejecting only after confirming it's for a *different* still-valid
room.

## What's solid (don't re-litigate)

- **Turn ownership is server-enforced, not cosmetic.** The pick route
  independently recomputes `expectedOrgId` from `baseOrder`+
  `currentPickIndex` and rejects a mismatch
  (`src/app/api/draft/[id]/pick/route.ts:37-41`) — the client's `isMyTurn`
  only gates the UI button.
- **The three previously-fixed races are genuinely fixed.** Pick submit,
  timeout auto-advance, and undo each lock the room row and re-check the
  index under the lock (migrations 014, 015, 020), with clear comments
  explaining the bug they closed.
- **Double-pick within one room is impossible even under a race**, because
  it's enforced by a DB unique constraint
  (`draft_picks(draft_room_id, player_id)`), not just app-level filtering.
- **Captain sessions are HMAC-signed and timing-safe**
  (`src/lib/captain-auth.ts`), scoped to one draft room per cookie, httpOnly.
- **Cross-division pick eligibility is consistent client/server** — the tab
  visibility logic in `DraftBoardClient` and the rejection logic in the pick
  route use the same tier table, so the UI never dangles a pick option the
  server would refuse anyway (it's the *interaction* of this feature with
  per-room-only pool exclusion that's the problem in DE-01, not the
  eligibility rule itself).
- **Admin manual controls (pause/resume/skip/undo) match the design intent**
  for disconnect recovery in `docs/archive/draft-flow.md` — "admin control
  over full automation."
- **There is real, correctly-targeted concurrency test coverage for one
  path** (DE-05) — the timeout auto-pick conflict test (#141) is a good
  model for what coverage of the other RPCs should look like.

## Approved remediation direction (2026-07-23)

The findings in this audit have now been resolved at the architecture and
product-decision level. Implementation remains outstanding.

Canonical decisions:

- [SAL Database ADR-0001: Season-Scoped Captain-Roster Draft Eligibility](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0001-season-scoped-captain-roster-draft-eligibility.md)
- [SAL Database ADR-0002: Roster Transactions and Public Bulletin](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0002-roster-transactions-and-public-bulletin.md)
- [SAL Database ADR-0003: Draft Room Lifecycle, Authorization, and Failure Recovery](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0003-draft-room-lifecycle-authorization-and-failure-recovery.md)
- [SAL Site ADR-0001: Audience-Specific Draft Views and Production Board](adr/0001-audience-specific-draft-views-and-production-board.md)
- [SALBot ADR-009: Roster Transactions Discord Workflow](https://github.com/diese-tech/lab-salbot/blob/main/docs/adrs/ADR-009-roster-transactions-discord-workflow.md)

The dependency-ordered implementation and parallel workbranch plan is:

- [SAL Draft Platform Remediation Plan](plans/draft-platform-remediation-plan-2026-07-23.md)

The plan maps DE-00 through DE-06 to an immediate containment branch, canonical
database work, consumer work, real concurrency tests, cross-repository E2E, and
production rollout gates.

## Historical suggested order of work

The list below records the audit's pre-ADR recommendation. It is superseded by
the approved remediation plan above.

1. DE-00 (P1, application-layer, no migration) — point `finalizeDraftRosters`
   at `saveSeasonRosterAssignment` instead of (or in addition to) the direct
   `players` table write. Blocks the draft engine from accomplishing its
   purpose at all, independent of everything else on this list.
2. DE-01 (P1) — enforce one active-or-paused room per season in `sal-site`
   and add season-scoped "already drafted" exclusion keyed off
   `draft_rooms.season_id`, not a global player status flag. Track the
   database-level atomic guarantee separately with the canonical schema
   owner; application-only read-before-write checks cannot prove uniqueness
   across simultaneous room requests.
3. DE-03 (P2, one-line guard) — cheapest fix in this list.
4. DE-02 (P2) — optimistic-concurrency guard on skip, no migration needed
   if done via conditional `.eq()` update.
5. DE-06 (P3, trivial).
6. DE-05 — extend the #141-style pattern to pick-submit, skip, undo, and
   tier eligibility; add an RPC-level integration test if a test DB is
   available.
7. DE-04 — product decision, not a bug fix.

## Acknowledgments

DE-00 (the highest-severity finding in this document) and the correction to
DE-05 came from external review comments on the PR that carried the initial
version of this audit (`chatgpt-codex-connector[bot]`), not from the
original pass. The initial DE-01 remediation suggestion (a global
`players.status === 'drafted'` filter) was also flagged as season-unsafe by
the same review and has been corrected above. Recorded here so the doc's
history is honest about where each finding came from.
