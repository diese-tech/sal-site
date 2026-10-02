# Historical Match Importer Plan

## Status

Planning document. No importer implementation is implied by this document.

Canonical location: `diese-tech/sal-site/docs/plans/historical-match-importer.md`

Related repositories:

- `diese-tech/sal-site` — primary implementation owner for the admin import workflow.
- `diese-tech/sal-database` — conditional dependency only if the current match/report/stat contracts cannot safely support bulk historical import.
- `diese-tech/lab-salbot` — not required for the initial importer. Only touch if a later phase adds Discord-triggered import or source synchronization.

Relevant existing work:

- `diese-tech/sal-site#252` — host-first official match stat reporting and publication flow.
- `diese-tech/sal-database#103` — database-side Phase 2 work referenced by #252.
- `diese-tech/sal-site#262` — host web review work referenced by #252.
- `diese-tech/lab-salbot#90` — Discord reporting flow referenced by #252.

## Problem

SAL was designed around a normal live-season workflow:

1. A match is scheduled.
2. The match is played.
3. A result is reported against that scheduled match.
4. Game/player statistics are attached to the report.
5. The result is reviewed/approved.
6. Public player statistics and standings are updated.

The current historical backlog does not follow that sequence. Many completed matches exist only in Discord messages and scoreboard screenshots, and some historical matches were never created in the SAL schedule at all.

The screenshot parser already gives us the important player-level fact: each parsed statline is directly tied to the player who earned it. The remaining historical risk is organization attribution. Players may have filled, subbed, been dropped, or been traded after earning those stats. Current roster membership must never be used to rewrite which organization or division owns historical game production.

The goal is to restore the missing historical data while preserving SAL's existing domain model, player identity, game-time organization attribution, and publication rules.

## Goal

Build an admin-only historical match importer that accepts structured historical match data and replays the normal SAL lifecycle in bulk.

The importer must not create a parallel historical data model or write directly into arbitrary tables. It should reuse the same schedule, match-report, stat publication, approval, and standings behavior used by normal SAL operations wherever possible.

Target flow:

`Draft baseline + #transactions -> roster timeline -> spreadsheet/screenshot data -> validate -> create/find match -> create/find report -> attach player stats with game-time org/division -> review/approve -> publish -> recalculate standings`

## Guiding Principles

1. **Screenshot attribution is authoritative for who earned a statline.** Once a parsed statline is resolved to a canonical player ID, later roster moves must never move those stats to another player.
2. **Game-time organization attribution is historical data.** A stat row must retain the organization and division represented when the game was played. Current roster membership must never retroactively change that attribution.
3. **The spreadsheet schema is the import contract.** Define and test the spreadsheet shape before building the parser.
4. **Reuse existing SAL contracts.** Do not bypass current domain validation simply because the source is historical.
5. **Dry run before write.** Every import must support a no-write preview.
6. **Idempotent by default.** Re-running the same source should not duplicate matches, reports, games, player stats, or standings effects.
7. **Resolve identities before publication.** Unknown, duplicate, ambiguous, or unlinked players must be surfaced as errors rather than guessed.
8. **Preserve provenance.** Keep enough source information to identify where each historical result and roster transition came from.
9. **Use the normal publication path.** Imported data should end up indistinguishable from data produced by normal SAL reporting once approved.

## Historical Attribution Invariant

Published player-match stats must preserve two separate facts:

- `player_id`: the player who earned the statline.
- `org_id` / `division_id`: the organization and division that player represented for that game.

These facts must remain stable after publication.

Example:

- Player X deals 30,000 damage for Team A.
- Player X is later traded to Team B.
- Player X's career statistics still include the 30,000 damage.
- Team A's historical/aggregate statistics still include the 30,000 damage.
- Team B does not inherit that production merely because Player X is currently rostered there.

Any aggregate that groups historical production by a player's current roster rather than the stat row's game-time `org_id` / `division_id` is incorrect.

## Roster Timeline Reconstruction

The roster timeline exists to recover **game-time organization/division attribution**, not to decide who earned a screenshot statline.

### Sources

Use two inputs:

1. **Draft-day baseline**
   - Start from the draft result / screenshot.
   - Compare it with the season roster state already entered into SAL on draft day.
   - Verify and repair the baseline only when evidence shows it is wrong or incomplete.

2. **Discord `#transactions` export**
   - Export the season's transaction channel.
   - Parse every roster-changing transaction in chronological order.
   - Preserve original Discord provenance for every parsed event.

Expected event categories should follow the language actually used by SAL, for example:

- drafted / initial assignment
- signed / added
- dropped / released
- traded
- substitute / fill-in assignment
- substitute / fill-in return
- other explicit roster movement recorded by league staff

Do not invent a transaction type when the source message is ambiguous. Route it to manual review.

### Parsed transaction record

Each transaction event should retain at least:

- Discord message ID
- Discord timestamp
- raw message text
- canonical player ID
- source organization, when applicable
- destination organization, when applicable
- division
- transaction type
- whether the move is temporary or persistent when the source makes that distinction
- parser confidence / manual-review state

### Replay behavior

Replay the baseline and transactions chronologically to produce a roster timeline.

For any historical match date, the importer must be able to answer:

> Which organization and division was this player representing in this match?

That result is attached to the imported stat row. It is not derived from the player's roster today.

### Current-state reconciliation

The same replay can compute the expected current roster after the final transaction.

Compare that reconstructed state with SAL's current roster state and report differences such as:

- current assignment already matches
- SAL is missing an assignment
- SAL has a stale organization
- SAL has the wrong division
- player identity is unresolved
- transaction is ambiguous and requires manual review

The first run should be dry-run only. Do not silently rewrite current rosters from transcript parsing.

## Proposed Spreadsheet Shape

The exact column list is intentionally not frozen yet. It must be validated against the current SAL data model before implementation.

### Tab 1: `Matches`

One row per series/matchup.

Expected categories of fields:

- import/source identifier
- season
- division
- week
- scheduled/played date
- home team
- away team
- final series score
- series winner
- Discord source message/thread ID
- optional evidence/screenshot URLs
- optional notes

### Tab 2: `Games` or `Stats`

One row per player per game, linked back to a row in `Matches` through a stable import/match identifier.

Expected categories of fields:

- import/match identifier
- game number
- game winner
- team/side represented in that game
- canonical player identifier / parsed IGN
- kills
- deaths
- assists
- damage and other statistics already supported by SAL
- any game-level fields required by the current match-report contract

The screenshot parse is the source of the player statline. The roster timeline validates and supplies the historical organization/division context for that statline.

The schema should be tested using 2–3 real historical series before being frozen.

## Import Behavior

For each historical matchup, the importer should:

1. Parse and normalize the spreadsheet/screenshot-derived rows.
2. Resolve the parsed player to a canonical SAL player ID.
3. Resolve the match date, season, division, home organization, and away organization.
4. Consult the reconstructed roster timeline for each player at that match time.
5. Confirm the player was representing the expected side or surface the mismatch for manual review.
6. Attach game-time `org_id` and `division_id` to the stat attribution.
7. Determine whether the scheduled match already exists.
8. Create the scheduled match when missing.
9. Determine whether a match report already exists.
10. Create the report when missing.
11. Convert rows into SAL's existing structured game/player stat shape.
12. Present a dry-run result before writes.
13. Write only clean, explicitly accepted records.
14. Route imported results through the existing review/approval/publication path.
15. Verify that player stats, organization aggregates, and standings reflect the approved result.

A current roster mismatch is not permission to move the historical statline. The mismatch is evidence that roster history or current roster state needs reconciliation.

## Dry-Run Output

The importer should summarize the file before any mutation. Example categories:

- matches to create
- existing matches to reuse
- reports to create
- existing reports to reuse or skip
- player mappings resolved from screenshot data
- unresolved player mappings
- historical org/division attribution resolved
- player/team-at-match mismatches
- transaction messages parsed
- ambiguous transactions requiring review
- current roster reconciliation differences
- duplicate source records
- conflicting scores/results
- malformed game/stat rows
- records safe to import
- records blocked from import

The user must be able to inspect conflicts before committing the import.

## Idempotency and Duplicate Protection

The importer should have a stable external/import key for each historical matchup.

Preferred provenance inputs include the Discord message ID or thread ID when available. A deterministic fallback can be derived from season + division + week + teams + played date, but source IDs are preferable.

Transaction events should likewise retain their Discord message IDs so replaying the same `#transactions` export does not duplicate roster events.

Re-running the same spreadsheet or transcript must result in `reuse`, `skip`, or `update` decisions rather than duplicate inserts.

## Database Strategy

### Default position

Do **not** add new database tables or RPCs just to make the importer convenient.

First inspect the current released SAL database contract and determine whether the importer can safely:

- create/find scheduled matches,
- create/find match reports,
- persist reviewed structured game data with explicit game-time player/org/division attribution,
- publish canonical player stats,
- preserve organization attribution after later roster changes,
- complete/finalize match results, and
- enqueue/recalculate standings.

If the existing contracts already provide those operations safely, keep new implementation work in `sal-site`.

### When `sal-database` should change

Touch `diese-tech/sal-database` only if one of these is true:

- existing validation incorrectly requires current roster membership for a historical stat whose player identity and game-time organization are otherwise verified,
- historical `org_id` / `division_id` cannot be persisted independently of current roster state,
- organization aggregates currently derive historical production from current roster membership instead of game-time stat attribution,
- there is no supported atomic path for creating the required historical domain objects,
- idempotent provenance cannot be represented safely,
- current validation/publication logic cannot be reused without bypassing integrity checks, or
- bulk import exposes a transactional/data-consistency hole that belongs in the database contract.

Any database change must land and release before the site bumps its generated types/contract lock.

## `lab-salbot` Scope

The initial importer does not require `lab-salbot`.

Do not modify the bot merely to support spreadsheet or transcript ingestion.

A future phase may optionally use the bot for source synchronization or administrative shortcuts, but those are not blockers for restoring historical data.

## Implementation Phases

### Phase 0: Contract verification

Before coding the importer:

- inspect current `sal-site` match scheduling/reporting implementation,
- inspect the current released `sal-database` contract,
- verify how `player_match_stats` or equivalent canonical rows persist `player_id`, `org_id`, and `division_id`,
- verify organization aggregates use game-time stat attribution and do not recalculate from current rosters,
- confirm which existing APIs/RPCs should be reused,
- identify any current-roster validation that would incorrectly reject legitimate historical attribution,
- document whether database changes are actually required.

### Phase 1: Reconstruct roster timeline

- Verify the draft-day roster baseline against SAL.
- Export the season `#transactions` channel.
- Parse transaction messages into normalized events.
- Resolve players and organizations to canonical IDs.
- Replay events chronologically.
- Produce historical roster-at-time lookup behavior.
- Produce a dry-run current-roster reconciliation report.
- Require manual resolution for ambiguous transaction messages.

No current-roster mutations in this phase without explicit approval.

### Phase 2: Freeze spreadsheet schema

- Define exact `Matches` columns.
- Define exact `Games/Stats` columns.
- Populate 2–3 real historical series.
- Confirm screenshot-derived player identity survives independently of current roster state.
- Confirm every required SAL field can be represented.

### Phase 3: Parser and dry run

- Parse CSV/XLSX input.
- Normalize values.
- Resolve teams/players/seasons/divisions.
- Join each statline to game-time org/division using the roster timeline.
- Detect duplicates/conflicts.
- Produce a no-write preview.
- Add focused tests around malformed files, identity conflicts, trades, fills/subs, and players who moved after earning stats.

No production writes in this phase.

### Phase 4: Safe import

- Create/reuse scheduled matches.
- Create/reuse reports.
- Persist validated structured game/player data.
- Persist the player who earned the statline and the org/division represented in that game.
- Preserve provenance.
- Prevent duplicate writes.
- Route results through existing approval/publication logic.

### Phase 5: Small staging/backfill verification

Import 2–3 real historical series that deliberately include at least one roster change and verify:

- player stats stay with the correct player,
- historical organization stats stay with the organization represented in that match,
- later trades do not move old production between organizations,
- matchup/week/division assignment is correct,
- series/game results are correct,
- standings update correctly,
- re-running the same inputs is safe,
- conflicts remain blocked rather than guessed.

### Phase 6: Full historical backfill

Only after the small verification pass succeeds:

- import the remaining backlog in controlled batches,
- review dry-run summaries before each batch,
- record rejected/conflicting rows for manual cleanup,
- verify player totals, organization totals, and standings after each batch.

## Acceptance Criteria

The importer is complete when:

- an admin can upload the agreed historical match format,
- the importer can reconstruct missing scheduled matchups,
- screenshot-derived statlines remain attached to the canonical player who earned them,
- the `#transactions` history can reconstruct organization/division context at match time,
- a player traded after a match retains their personal stats while the original organization retains that game's organizational production,
- current roster membership never retroactively rewrites historical stat attribution,
- the transcript replay can identify current-roster discrepancies without silently modifying them,
- existing matches/reports are detected rather than duplicated,
- unresolved identities and ambiguous transactions block publication,
- dry-run output clearly explains intended actions,
- approved imports populate the same canonical public stat surfaces as normal match reporting,
- standings are recalculated through the normal mechanism,
- re-running already imported data is safe,
- a small real-world staging/backfill test has been verified before the full season is imported.

## Non-Goals

This project does not currently include:

- redesigning the SAL admin experience,
- migrating SAL work into a GitHub Project,
- general issue/PR hygiene cleanup,
- replacing the existing live match-reporting flow,
- building a second stats store,
- broad Discord bot redesign.

## Agent Handoff Instructions

An implementation agent starting from this plan should:

1. Read this document first.
2. Inspect current implementations and the released DB contract rather than relying on old issue checklists.
3. Treat screenshot-derived player identity as the owner of the statline.
4. Treat the reconstructed transaction timeline as the source for game-time organization/division context.
5. Never derive historical organization attribution from a player's current roster.
6. Treat `sal-site` as the default implementation repo.
7. Do not modify `sal-database` until a concrete contract limitation is proven.
8. Build transcript replay, dry-run, identity checks, and attribution checks before enabling writes.
9. Test against a few real historical series containing trades/subs/fills before attempting the full backlog.
10. Update this document when implementation decisions materially change the plan.

## Follow-Up After Restoration

Once the importer is working and the historical backlog is restored, SAL can be reorganized into an organization-level GitHub Project for cross-repository planning, dependency visibility, and issue/PR lifecycle tracking. That organizational cleanup is intentionally deferred until the site's core season data is trustworthy again.
