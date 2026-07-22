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

This is a code-level correctness review, not a live/runtime verification —
findings are proven by direct trace of the request handlers and SQL
functions, cross-checked against the atomic-RPC migrations already in the
repo (issues #61, #67, #129) and against the design intent in
`docs/archive/draft-flow.md`. Per `supabase/migrations/README.md`, schema
ownership now lives in `diese-tech/sal-database`; any fix here that needs a
new SQL function is application-layer-only or must be filed against that
repo.

## Verdict

**Conditionally ready.** The core turn-advance machinery (submit a pick,
auto-advance on timeout, undo) is genuinely well-built: each is a
`SELECT ... FOR UPDATE` Postgres function that re-validates
`current_pick_index` under a row lock, specifically because earlier races
were found and fixed (#61, #67, #129). Turn ownership and the "already
picked" guard are both enforced server-side and at the DB constraint level,
not just in the client. The system will run a *single, isolated* division
draft correctly.

The unresolved risk is what happens when more than one division's draft
exists for the same season, which the code's own cross-division pick
eligibility explicitly allows and the admin UI does nothing to prevent
(DE-01). There are also two remaining instances of the exact concurrency bug
class the codebase has already fixed three times elsewhere (DE-02, DE-03),
and zero automated test coverage of any of it (DE-05).

## Findings

| ID | Sev | Finding | Issue |
|---|---|---|---|
| DE-01 | **P1** | A player can be drafted into two different division draft rooms; nothing scopes "already picked" across rooms. | [#206](https://github.com/diese-tech/sal-site/issues/206) |
| DE-02 | P2 | Admin "Skip Pick" is not concurrency-safe — same bug class as #67/#129, left unfixed for this one endpoint. | [#207](https://github.com/diese-tech/sal-site/issues/207) |
| DE-03 | P2 | `PATCH /api/admin/draft/[id]` can change `baseOrder`/`rounds` while a draft is active or paused, breaking the invariant the atomic-pick RPC depends on. | [#208](https://github.com/diese-tech/sal-site/issues/208) |
| DE-04 | P3 | No pending-confirmation step before a pick locks in, despite the archived design doc specifying one. | — (product decision, not filed) |
| DE-05 | P3 | Zero unit/integration/e2e coverage of the roster-draft engine (the sibling "god draft" feature has both). | — (roll into DE-01/02/03 fix PRs) |
| DE-06 | P3 | Captain token is consumed (deleted) before the code checks it matches the requested draft room. | — (not filed; trivial, roll into DE-02 fix) |

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
`players.divisionId` + this-room's-picks, never from
`players.status`/`org_id` (which does get set to `'drafted'` /
the picking org, but only by `finalizeDraftRosters`,
`src/lib/draft-data.ts:407-432` — and nothing reads that field back into
the pool-exclusion logic).

**Blast radius:** `finalizeDraftRosters` is called per-room
(automatically on the final pick,
`src/app/api/draft/[id]/pick/route.ts:90-94`, and manually via
`src/app/api/admin/draft/[id]/finalize/route.ts`) and unconditionally
overwrites `players.org_id`/`status` for that room's picks — it has no
"already assigned to a different org" check. If two rooms both drafted the
same player, whichever room finalizes second silently wins; the losing
org's `draft_picks` row still exists (so the pick log/audit trail shows two
teams "owning" the same player), but only one team keeps them in
`players.org_id`.

**Recommendation:** application-layer fix, no migration needed — exclude
players with `status === 'drafted'` (or with a `draft_picks` row in *any*
room for the current season, not just this one) from `getLeagueData()`'s
draft-facing consumers, or add a season-scoped "already drafted anywhere"
check alongside the existing per-room check in the pick route, GET
timeout-handler, and shortlist auto-pick. Until that lands, treat "only one
division draft room active at a time per season" as an operational rule and
say so explicitly in the admin UI (currently unstated).

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

### DE-05 — No test coverage of the roster-draft engine (P3)

`tests/load/god-draft-load.test.ts` and `src/lib/god-draft-rules.test.ts`
cover the *other* draft feature. The roster-draft engine —
`buildPickSequence`, the atomic pick/undo/timeout RPCs, division-tier
eligibility, shortlist auto-pick — has no dedicated unit, integration, or
e2e test; `tests/integration/rls.test.ts` has two incidental string matches
and nothing that exercises turn logic. Given the entire value of this
system is "the turn order and concurrency are correct," that correctness is
currently unverified by anything except manual testing.

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

## Suggested order of work

1. DE-01 (P1, application-layer, no migration) — season-scoped "already
   drafted" exclusion.
2. DE-03 (P2, one-line guard) — cheapest fix in this list.
3. DE-02 (P2) — optimistic-concurrency guard on skip, no migration needed
   if done via conditional `.eq()` update.
4. DE-06 (P3, trivial).
5. DE-05 — add coverage for whatever DE-01/02/03 fixes land, at minimum.
6. DE-04 — product decision, not a bug fix.
