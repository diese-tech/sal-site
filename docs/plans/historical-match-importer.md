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

Manually reconstructing every matchup in the site would be slow and error-prone. The goal is to restore the missing historical data while preserving SAL's existing domain model and publication rules.

## Goal

Build an admin-only historical match importer that accepts a structured spreadsheet and replays the normal SAL lifecycle in bulk.

The importer must not create a parallel historical data model or write directly into arbitrary tables. It should reuse the same schedule, match-report, stat publication, approval, and standings behavior used by normal SAL operations wherever possible.

Target flow:

`Spreadsheet -> validate -> create/find scheduled match -> create/find match report -> attach games/player stats -> review/approve -> publish stats -> recalculate standings`

## Guiding Principles

1. **The spreadsheet schema is the import contract.** Define and test the spreadsheet shape before building the parser.
2. **Reuse existing SAL contracts.** Do not bypass current domain validation simply because the source is historical.
3. **Dry run before write.** Every import must support a no-write preview.
4. **Idempotent by default.** Re-running the same source should not duplicate matches, reports, games, player stats, or standings effects.
5. **Resolve identities before publication.** Unknown, duplicate, ambiguous, or unlinked players must be surfaced as errors rather than guessed.
6. **Do not require screenshots when structured stats are already trusted.** Screenshots may remain optional evidence/audit references.
7. **Preserve provenance.** Keep enough source information to identify where each historical result came from, such as Discord message/thread IDs and optional evidence URLs.
8. **Use the normal publication path.** Imported data should end up indistinguishable from data produced by normal SAL reporting once approved.

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
- team
- player identifier / IGN
- kills
- deaths
- assists
- damage and other statistics already supported by SAL
- any game-level fields required by the current match-report contract

The schema should be tested using 2–3 real historical series before being frozen.

## Import Behavior

For each historical matchup, the importer should:

1. Parse and normalize the spreadsheet rows.
2. Resolve season, division, teams, and players to canonical SAL IDs.
3. Determine whether the scheduled match already exists.
4. Create the scheduled match when missing.
5. Determine whether a match report already exists.
6. Create the report when missing.
7. Convert spreadsheet rows into SAL's existing structured game/player stat shape.
8. Run the same identity and stat validation used by the normal reporting/review workflow.
9. Present a dry-run result before writes.
10. Write only clean, explicitly accepted records.
11. Route imported results through the existing review/approval/publication path.
12. Verify that public player stats and standings reflect the approved result.

## Dry-Run Output

The importer should summarize the file before any mutation. Example categories:

- matches to create
- existing matches to reuse
- reports to create
- existing reports to reuse or skip
- player mappings resolved
- unresolved player mappings
- duplicate source records
- conflicting scores/results
- malformed game/stat rows
- records safe to import
- records blocked from import

The user must be able to inspect conflicts before committing the import.

## Idempotency and Duplicate Protection

The importer should have a stable external/import key for each historical matchup.

Preferred provenance inputs include the Discord message ID or thread ID when available. A deterministic fallback can be derived from season + division + week + teams + played date, but source IDs are preferable.

Re-running the same spreadsheet must result in `reuse`, `skip`, or `update` decisions rather than duplicate inserts.

## Database Strategy

### Default position

Do **not** add new database tables or RPCs just to make the importer convenient.

First inspect the current released SAL database contract and determine whether the importer can safely:

- create/find scheduled matches,
- create/find match reports,
- persist reviewed structured game data,
- publish canonical `player_stats`,
- complete/finalize match results, and
- enqueue/recalculate standings.

If the existing contracts already provide those operations safely, keep all new implementation work in `sal-site`.

### When `sal-database` should change

Touch `diese-tech/sal-database` only if one of these is true:

- there is no supported atomic path for creating the required historical domain objects,
- current RPCs hard-require screenshot/OCR state that is irrelevant to structured imports,
- idempotent provenance cannot be represented safely,
- current validation/publication logic cannot be reused without bypassing integrity checks, or
- bulk import exposes a transactional/data-consistency hole that should live in the database contract.

Any database change must land and release before the site bumps its generated types/contract lock.

## `lab-salbot` Scope

The initial importer does not require `lab-salbot`.

Do not modify the bot merely to support spreadsheet ingestion.

A future phase may optionally use the bot for:

- generating/importing source references from Discord,
- linking proof threads to imported matches,
- notifying admins of imported historical results, or
- providing a Discord shortcut into the admin importer.

Those are follow-up enhancements, not blockers for restoring historical data.

## Implementation Phases

### Phase 0: Contract verification

Before coding the importer:

- inspect the current `sal-site` match scheduling/reporting implementation,
- inspect the current released `sal-database` contract,
- confirm which existing APIs/RPCs should be reused,
- identify any screenshot/OCR assumptions that prevent structured import,
- document whether database changes are actually required.

Deliverable: a short implementation note added to this document or a linked issue/PR.

### Phase 1: Freeze spreadsheet schema

- Define exact `Matches` columns.
- Define exact `Games/Stats` columns.
- Populate 2–3 real historical series.
- Confirm every required SAL field can be represented.
- Confirm no spreadsheet field exists solely because the importer implementation was poorly designed.

Deliverable: versioned sample/template file and schema documentation.

### Phase 2: Parser and dry run

- Parse CSV/XLSX input.
- Normalize values.
- Resolve teams/players/seasons/divisions.
- Detect duplicates/conflicts.
- Produce a no-write preview.
- Add focused tests around malformed files and identity conflicts.

No production writes in this phase.

### Phase 3: Safe import

- Create/reuse scheduled matches.
- Create/reuse reports.
- Persist validated structured game/player data.
- Preserve provenance.
- Prevent duplicate writes.
- Route results through existing approval/publication logic.

### Phase 4: Small staging/backfill verification

Import 2–3 real historical series and verify:

- schedule entries render correctly,
- matchup/week/division assignment is correct,
- player stats are correct,
- series/game results are correct,
- standings update correctly,
- re-running the same file is safe,
- conflicts remain blocked rather than guessed.

### Phase 5: Full historical backfill

Only after the small verification pass succeeds:

- import the remaining backlog in controlled batches,
- review dry-run summaries before each batch,
- record rejected/conflicting rows for manual cleanup,
- verify aggregate standings/stat counts after each batch.

## Acceptance Criteria

The importer is complete when:

- an admin can upload the agreed spreadsheet format,
- the importer can reconstruct missing scheduled matchups,
- structured game/player stats can be imported without requiring screenshots,
- existing matches/reports are detected rather than duplicated,
- unresolved identities and conflicts block publication,
- dry-run output clearly explains intended actions,
- approved imports populate the same canonical public stat surfaces as normal match reporting,
- standings are recalculated through the normal mechanism,
- re-running an already imported file is safe,
- a small real-world staging/backfill test has been verified before the full season is imported.

## Non-Goals

This project does not currently include:

- redesigning the SAL admin experience,
- migrating SAL work into a GitHub Project,
- general issue/PR hygiene cleanup,
- replacing the existing live match-reporting flow,
- building a second stats store,
- requiring OCR when the spreadsheet already contains trusted structured data,
- broad Discord bot redesign.

Those can be addressed after historical functionality is restored.

## Agent Handoff Instructions

An implementation agent starting from this plan should:

1. Read this document first.
2. Inspect the current implementations and released DB contract rather than relying on old issue checklists.
3. Treat `sal-site` as the default implementation repo.
4. Do not modify `sal-database` until the need for a contract change is proven.
5. Do not modify `lab-salbot` for the initial importer unless a concrete blocker requires it.
6. Preserve the normal SAL lifecycle and canonical public stat stores.
7. Build the dry-run and identity/conflict checks before enabling writes.
8. Test against a few real historical series before attempting the full backlog.
9. Update this document when implementation decisions materially change the plan.

## Follow-Up After Restoration

Once the importer is working and the historical backlog is restored, SAL can be reorganized into an organization-level GitHub Project for cross-repository planning, dependency visibility, and issue/PR lifecycle tracking. That organizational cleanup is intentionally deferred until the site's core season data is trustworthy again.
