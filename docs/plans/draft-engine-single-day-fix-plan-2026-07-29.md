# Draft Engine Single-Day Fix Plan (2026-07-29)

Covers the four open issues from the 2026-07-22 draft-engine audit
([audit doc](../audit-draft-engine-2026-07-22.md)): [#210](https://github.com/diese-tech/sal-site/issues/210) (DE-00),
[#206](https://github.com/diese-tech/sal-site/issues/206) (DE-01),
[#207](https://github.com/diese-tech/sal-site/issues/207) (DE-02),
[#208](https://github.com/diese-tech/sal-site/issues/208) (DE-03).
All fixes are application-layer; no migrations.

## Plan

### Order of operations

- **#208 (DE-03) first** — one guard clause in one file, zero coupling to anything else; freezing `baseOrder`/`rounds` post-`pending` restores the invariant the atomic-pick RPC depends on, so every later manual test of the other three fixes runs under that invariant.
- **#207 (DE-02) second** — isolated to the skip route plus one new data helper; clears both P2s in the first hour, leaving the rest of the day for the two P1s.
- **#210 (DE-00) third** — the highest-severity fix; self-contained in `finalizeDraftRosters` plus cache revalidation at the two auto-finalize call sites; has no dependency on #206.
- **#206 (DE-01) last** — edits the same two route files as #210 (`pick/route.ts` and the draft GET route), so landing it after #210 avoids merge conflicts; its new season-wide exclusion helper depends on nothing from the other issues.
- Dependency summary: #206 rebases on #210 (shared files); #208 and #207 are independent of everything and of each other.

### Per-issue changes

#### #210 — DE-00: finalize never writes to `season_rosters`

- **Files touched:** `src/lib/draft-data.ts`, `src/app/api/draft/[id]/pick/route.ts`, `src/app/api/draft/[id]/route.ts`, `src/lib/draft-data.test.ts` (new)
- **Concrete change:** In `finalizeDraftRosters`, first verify every picking org has a `season_orgs` row for `room.seasonId` and throw an error naming any missing orgs (otherwise `saveSeasonRosterAssignment`'s `.single()` lookup fails opaquely mid-loop — the start route validates `baseOrder` against global `orgs.division_id`, not `season_orgs`, so this is reachable). Then call `saveSeasonRosterAssignment({ seasonId: room.seasonId, playerId, orgId, divisionId: room.divisionId, isCaptain: false })` per pick, keeping the existing `players.org_id`/`status: "drafted"` write for legacy parity. Add `revalidateTag("league-data", {})` after the auto-finalize calls in the pick route and the GET timeout handler, matching what the manual finalize route already does.
- **Rollback risk:** Low — the new write goes through the existing canonical upsert path (`onConflict: "season_id,player_id"`), is idempotent, and the admin manual-finalize route already exists as the re-run mechanism if a finalize partially fails.
- **Test:** Unit test with a mocked Supabase client: a completed room with picks produces one `season_rosters` upsert per picked player carrying the room's `seasonId` and the picking org; a pick by an org missing from `season_orgs` throws an error naming that org. Manual check: run a draft to completion in staging and confirm the picked players appear on the team page and in the admin roster tool.

#### #206 — DE-01: cross-room double-draft in the same season

- **Files touched:** `src/lib/draft-data.ts`, `src/app/api/draft/[id]/pick/route.ts`, `src/app/api/draft/[id]/route.ts`, `src/app/api/draft/[id]/route.test.ts`
- **Concrete change:** Add `getSeasonDraftedPlayerIds(seasonId)` to `draft-data.ts`: fetch `draft_rooms.id` where `season_id` matches, then `draft_picks.player_id` with `.in("draft_room_id", ids)`, returning a `Set<string>`. In the pick route, replace the per-room `existingPicks` check with membership in that set (400 "Player has already been drafted this season."); in the GET timeout handler, use the same set for the pre-auto-pick guard; change `getTopShortlistPick` to take the room's `seasonId` and build its drafted-exclusion set season-wide instead of per-room. This closes the sequential cross-room double-draft; the simultaneous-cross-room-commit race stays open until `sal-database` ships a season-scoped constraint (see Open questions), and the client-side available-player lists stay per-room as scoped — captains in a second room get the server's 400.
- **Rollback risk:** Medium — this adds a new blocking check to every pick submission and to timeout auto-picks, so a faulty exclusion query rejects legitimate picks league-wide; the revert is small (restore three call sites), which caps the exposure.
- **Test:** Route tests: a pick request for a player who has a `draft_picks` row in a sibling room of the same season returns 400; `getTopShortlistPick` skips a shortlisted player drafted in a sibling room and returns the next undrafted entry; a player drafted only in a prior season's room is accepted.

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

- `getSeasonDraftedPlayerIds(seasonId)` in `src/lib/draft-data.ts` — the one genuinely shared piece; used by the pick route, the GET timeout handler, and `getTopShortlistPick` (all within #206).
- `updateDraftRoomIfPickIndex` (#207) lives beside `updateDraftRoom` in `draft-data.ts` as the reusable optimistic-concurrency variant; #207 is its only consumer today.
- Nothing is shared across issue boundaries — the four fixes stay independently revertable.

### PR plan

- **3 PRs, merged in order:**
  1. **PR 1 — #208 + #207** ("admin draft route guards"): both are small, single-concern guards on admin endpoints; one review pass covers them, and they touch no files the P1s touch.
  2. **PR 2 — #210** ("finalize writes season_rosters"): the DE-00 fix plus revalidation at the two auto-finalize call sites.
  3. **PR 3 — #206** ("season-wide drafted exclusion"): branched from PR 2's head since it edits the same two route files; rebased and merged after PR 2.
- Each PR body carries `Fixes #<issue>` so the issues close on merge.

### Open questions

1. `finalizeDraftRosters` will fail fast when a picking org has no `season_orgs` row for the room's season (nothing today guarantees one exists — the start route validates against global `orgs.division_id`). The plan surfaces a named-org error for the admin to fix via the season roster tool and re-run manual finalize; if auto-creating the row via `saveSeasonOrgAssignment(seasonId, orgId, room.divisionId)` is preferred instead, say so before PR 2.
2. #206 as scoped cannot close the simultaneous cross-room pick race — two picks committing in the same instant in different rooms both pass the read-before-write check, and a durable guarantee needs a season-scoped uniqueness model owned by `sal-database` (frozen for migrations). The app-layer alternative shipped here is the season-wide exclusion plus the audit's operational rule of one active-or-paused room per season; confirm whether to file the `sal-database` issue as part of this push.
