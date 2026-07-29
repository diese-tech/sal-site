# Draft Engine Single-Day Fix Plan (2026-07-29)

Covers the four open issues from the 2026-07-22 draft-engine audit
([audit doc](../audit-draft-engine-2026-07-22.md)): [#210](https://github.com/diese-tech/sal-site/issues/210) (DE-00),
[#206](https://github.com/diese-tech/sal-site/issues/206) (DE-01),
[#207](https://github.com/diese-tech/sal-site/issues/207) (DE-02),
[#208](https://github.com/diese-tech/sal-site/issues/208) (DE-03).
All fixes are application-layer; no migrations.

**Season decision (2026-07-29):** no draft-ups are allowed this season — every
player is locked to their own division. This supersedes the tier-based
cross-division eligibility rule and removes the cross-division double-draft
surface that drove the original #206 scope; the #206 section below reflects
the reduced scope.

## Plan

### Order of operations

- **#208 (DE-03) first** — one guard clause in one file, zero coupling to anything else; freezing `baseOrder`/`rounds` post-`pending` restores the invariant the atomic-pick RPC depends on, so every later manual test of the other three fixes runs under that invariant.
- **#207 (DE-02) second** — isolated to the skip route plus one new data helper; clears both P2s in the first hour, leaving the rest of the day for the two P1s.
- **#210 (DE-00) third** — the highest-severity fix; rewrites `finalizeDraftRosters` and removes the auto-publish calls at the two completion call sites, per the accepted completion-review workflow in `docs/draft-platform-guide.md` ("Ending and publishing the draft"); has no dependency on #206.
- **#206 (DE-01) last** — edits the same two route files as #210 (`pick/route.ts` and the draft GET route), so landing it after #210 avoids merge conflicts; its division-lock rule and season-wide exclusion helper depend on nothing from the other issues.
- Dependency summary: #206 rebases on #210 (shared files); #208 and #207 are independent of everything and of each other.

### Per-issue changes

#### #210 — DE-00: finalize never writes to `season_rosters`

- **Files touched:** `src/lib/draft-data.ts`, `src/app/api/draft/[id]/pick/route.ts`, `src/app/api/draft/[id]/route.ts`, `src/lib/draft-data.test.ts` (new)
- **Concrete change:** In `finalizeDraftRosters`, first verify every picking org has a `season_orgs` row for `room.seasonId` and throw an error naming any missing orgs (otherwise `saveSeasonRosterAssignment`'s `.single()` lookup fails opaquely mid-loop — the start route validates `baseOrder` against global `orgs.division_id`, not `season_orgs`, so this is reachable). Then call `saveSeasonRosterAssignment({ seasonId: room.seasonId, playerId, orgId, divisionId: room.divisionId, isCaptain: false })` per pick, keeping the existing `players.org_id`/`status: "drafted"` write for legacy parity. Remove the automatic `finalizeDraftRosters` calls from the pick route and the GET timeout handler: per the accepted workflow in `docs/draft-platform-guide.md` ("Ending and publishing the draft"), the last resolved slot moves the room to completion review and must not publish rosters — publication happens only through the admin finalize endpoint (`POST /api/admin/draft/[id]/finalize`, the current End Draft & Publish Rosters action), which already calls `revalidateTag("league-data", {})`. Update that route's comment to state it is now the sole publication path.
- **Rollback risk:** Low — the new write goes through the existing canonical upsert path (`onConflict: "season_id,player_id"`) and is idempotent, so admin finalize can be re-run; removing auto-publish drops no real behavior because the write it removed never reached `season_rosters` (that is the DE-00 bug), and the admin route is the accepted publish path.
- **Test:** Unit test with a mocked Supabase client: a completed room with picks produces one `season_rosters` upsert per picked player carrying the room's `seasonId` and the picking org; a pick by an org missing from `season_orgs` throws an error naming that org. Route tests: the final pick completes the room without writing any roster row; the admin finalize route writes them. Manual check: run a draft to completion in staging, confirm rosters stay unpublished until admin finalize, then confirm the players appear on the team page and in the admin roster tool.

#### #206 — DE-01: cross-room double-draft in the same season

- **Files touched:** `src/lib/draft-data.ts`, `src/app/api/draft/[id]/pick/route.ts`, `src/app/api/draft/[id]/route.ts`, `src/app/api/admin/draft/route.ts`, `src/components/draft/DraftBoardClient.tsx`, `src/app/api/draft/[id]/route.test.ts`
- **Concrete change:** Three small pieces under the no-draft-ups season decision. **(a) Division lock** — the pick route replaces the tier-based rule (`DIVISION_TIER` / `playerTier < roomTier`, which existed to allow draft-ups) with a strict same-division check: a player with a `divisionId` different from the room's division is rejected 400; `DraftBoardClient` drops its mirrored tier cascade and shows only the room's own division pool. This makes sibling-division rooms' player pools disjoint, which is what eliminates the cross-division double-draft surface. **(b) Season-wide drafted exclusion** — add `getSeasonDraftedPlayerIds(seasonId)` to `draft-data.ts` (fetch `draft_rooms.id` for the season, then `draft_picks.player_id` with `.in("draft_room_id", ids)`, returning a `Set<string>`); the pick route replaces its per-room `existingPicks` check with membership in that set, and `getTopShortlistPick` takes the room's `seasonId` and excludes season-wide — this covers the one remaining double-draft path, a second same-division room created after an earlier one completed. **(c) Create guard gap** — the create route's duplicate-room guard checks only `active`/`pending`; add `paused` so a paused room also blocks creating a second same-division room. Dropped as no longer needed without draft-ups: the one-live-room-per-season activation guard, the `seasonDraftedPlayerIds` client payload, and `AdminDraftRoomClient` changes — sibling-division rooms can safely run concurrently over disjoint pools.
- **Rollback risk:** Medium — the division lock and exclusion set are blocking checks on every pick submission and timeout auto-pick, so a faulty check rejects legitimate picks league-wide; each piece reverts independently and the revert is a handful of lines.
- **Test:** Route tests: a pick for a player whose division differs from the room's returns 400; a pick for a player with a `draft_picks` row in another room of the same season returns 400; `getTopShortlistPick` skips a season-drafted player and returns the next undrafted entry; a player drafted only in a prior season's room is accepted; create returns 409 while a same-division room is `paused`.

#### #207 — DE-02: admin Skip Pick not concurrency-safe

- **Files touched:** `src/lib/draft-data.ts`, `src/app/api/admin/draft/[id]/skip/route.ts`, `src/app/api/admin/draft/[id]/skip/route.test.ts` (new)
- **Concrete change:** Add `updateDraftRoomIfPickIndex(id, expectedPickIndex, patch)` to `draft-data.ts` — same patch mapping as `updateDraftRoom` but with `.eq("current_pick_index", expectedPickIndex)` and `.select().maybeSingle()`, returning `null` when no row matched. The skip route calls it with the snapshot's `currentPickIndex`; on `null` it returns 409 "Another action advanced the draft. Refresh and retry." and skips the audit log.
- **Rollback risk:** Low — admin-only endpoint, and the guard only converts a silently-corrupting race into an explicit 409 that a refresh resolves; the success path is byte-identical to today's behavior.
- **Test:** Route test with a mocked client: when the conditional update matches zero rows the route returns 409 and writes no `draft_pick_skipped` audit entry; when it matches, the route advances the index, completes the draft on the final skip, and logs once.

#### #208 — DE-03: `baseOrder`/`rounds` mutable mid-draft

- **Files touched:** `src/app/api/admin/draft/[id]/route.ts`, `src/app/api/admin/draft/[id]/route.test.ts` (new)
- **Concrete change:** In the PATCH handler, fetch the room with `getDraftRoom(id)` (404 when missing) and return 400 `Cannot modify a draft with status "<status>".` when `status !== "pending"`, mirroring `start/route.ts:14`. This blocks `pickTimerSeconds` changes mid-draft too, which matches the audit's invariant framing (migration 015 assumes room config is immutable once started).
- **Rollback risk:** Low — pure rejection guard on an admin endpoint whose UI already hides these controls once the draft leaves `pending`, so no legitimate flow is blocked.
- **Test:** Route test: PATCH against an `active` room returns 400 and never calls `updateDraftRoom`; PATCH against a `pending` room still applies the patch.

### Shared refactors

- `getSeasonDraftedPlayerIds(seasonId)` in `src/lib/draft-data.ts` — the one genuinely shared piece; used by the pick route and `getTopShortlistPick` (all within #206).
- `updateDraftRoomIfPickIndex` (#207) lives beside `updateDraftRoom` in `draft-data.ts` as the reusable optimistic-concurrency variant; #207 is its only consumer today.
- Nothing is shared across issue boundaries — the four fixes stay independently revertable.

### PR plan

- **3 PRs, merged in order:**
  1. **PR 1 — #208 + #207** ("admin draft route guards"): both are small, single-concern guards on admin endpoints; one review pass covers them, and they touch no files the P1s touch.
  2. **PR 2 — #210** ("finalize writes season_rosters, publish via admin only"): the DE-00 fix plus removal of the auto-publish calls at the two completion call sites.
  3. **PR 3 — #206** ("division lock + season-wide drafted exclusion"): branched from PR 2's head since it edits the same two route files; rebased and merged after PR 2.
- Each PR body carries `Fixes #<issue>` so the issues close on merge.

### Open questions

1. `finalizeDraftRosters` will fail fast when a picking org has no `season_orgs` row for the room's season (nothing today guarantees one exists — the start route validates against global `orgs.division_id`). The plan surfaces a named-org error for the admin to fix via the season roster tool and re-run manual finalize; if auto-creating the row via `saveSeasonOrgAssignment(seasonId, orgId, room.divisionId)` is preferred instead, say so before PR 2.
2. With no draft-ups, the division lock makes sibling-room pools disjoint and the create guard prevents concurrent same-division rooms, so no simultaneous cross-room pick race remains to close this season. A durable season-scoped uniqueness constraint stays Wave-1 `sal-database` work (`draft-platform-remediation-plan-2026-07-23.md`) for whenever draft-ups return — confirm whether to file that issue now or leave it to the planned DB-1 branch.
