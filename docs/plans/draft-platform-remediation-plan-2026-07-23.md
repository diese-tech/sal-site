# SAL Draft Platform Remediation Plan

- Date: 2026-07-23
- Scope: `diese-tech/sal-database`, `diese-tech/sal-site`, and
  `diese-tech/lab-salbot`
- Source audit:
  [Draft Engine Audit](../audit-draft-engine-2026-07-22.md)
- Canonical decisions:
  - [Database ADR-0001](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0001-season-scoped-captain-roster-draft-eligibility.md)
  - [Database ADR-0002](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0002-roster-transactions-and-public-bulletin.md)
  - [Database ADR-0003](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0003-draft-room-lifecycle-authorization-and-failure-recovery.md)
  - [Site ADR-0001](../adr/0001-audience-specific-draft-views-and-production-board.md)
  - [SALBot ADR-009](https://github.com/diese-tech/lab-salbot/blob/main/docs/adrs/ADR-009-roster-transactions-discord-workflow.md)

## Outcome

Deliver a season-scoped, division-room draft platform with:

- database-enforced eligibility and concurrency;
- safe staging, confirmation, timeout, skip, undo, redo, and finalization;
- Discord-role captain authorization;
- separate spectator, captain, administrator, and production views;
- durable roster transactions, Discord announcements, and role synchronization;
  and
- real database concurrency verification before production rollout.

## Operating rules

1. `sal-database` owns schema, constraints, functions, audit records, outbox
   contracts, generated consumer types, and immutable database releases.
2. `sal-site` owns web authorization, draft interactions, audience projections,
   administration, production presentation, and cross-repository E2E.
3. `lab-salbot` owns Discord configuration commands, transaction workflows,
   outbox delivery, role reconciliation, and failure alerts.
4. Database migration branches merge serially through one migration owner.
   Consumer work may proceed in parallel against reviewed contract fixtures.
5. Consumers pin one immutable database release. They do not copy migrations
   into their own repositories.
6. Production verification is read-only.
7. Each workbranch is independently reviewable and must meet its exit gate before
   its dependents merge.

## Dependency graph

```text
DOC-1
  |
  +--> SITE-0
  |
  +--> DB-1 --> DB-2 --> DB-3 --> DB-4
          |       |       |       |
          |       |       |       +--> RELEASE-1
          |       |       +----------> SITE-2
          |       +------------------> SITE-1
          |       +------------------> BOT-1
          +--------------------------> DB-TEST

SITE-1 + SITE-2 + SITE-3 + BOT-1 + BOT-2 + RELEASE-1
                         |
                         v
                       E2E-1
                         |
                         v
                     ROLLOUT-1
```

## Workbranch register

| ID | Repository | Suggested branch | Depends on | May run alongside |
| --- | --- | --- | --- | --- |
| DOC-1 | all three | existing ADR branches | none | none |
| SITE-0 | `sal-site` | `codex/draft-current-safety` | DOC-1 | DB-1, DB-TEST |
| DB-1 | `sal-database` | `codex/draft-schema-foundation` | DOC-1 | SITE-0 |
| DB-TEST | `sal-database` | `codex/disposable-db-ci` | DB-1 migration skeleton | SITE-0 |
| DB-2 | `sal-database` | `codex/draft-slot-engine` | DB-1 | SITE-1 fixture work, BOT-1 fixture work |
| DB-3 | `sal-database` | `codex/draft-history-finalization` | DB-2 | SITE-2 fixture work, SITE-3 |
| DB-4 | `sal-database` | `codex/roster-transactions-outbox` | DB-3 | BOT-2 fixture work |
| SITE-1 | `sal-site` | `codex/draft-auth-lifecycle` | reviewed DB-1/DB-2 contracts | SITE-2, SITE-3, BOT-1 |
| SITE-2 | `sal-site` | `codex/draft-audience-views` | reviewed DB-2/DB-3 contracts | SITE-1, SITE-3 |
| SITE-3 | `sal-site` | `codex/draft-production-board` | Site ADR-0001 fixtures | SITE-1, SITE-2, BOT-1 |
| BOT-1 | `lab-salbot` | `codex/draft-role-config` | reviewed DB-1 contracts | SITE-1, SITE-2, SITE-3 |
| BOT-2 | `lab-salbot` | `codex/roster-transaction-discord` | DB-4 contracts | SITE-2, SITE-3 |
| RELEASE-1 | `sal-database` | `codex/draft-platform-release` | DB-TEST, DB-4 | consumer fixture work |
| E2E-1 | `sal-site` | `codex/draft-platform-e2e` | RELEASE-1 and consumer branches | none |
| ROLLOUT-1 | all three | release PRs | E2E-1 | none |

Database branches are listed separately for review clarity but are a stacked,
serial migration chain. Do not merge competing migration-number branches in
parallel.

## Wave 0: merge the decision record

### DOC-1 — ADR and audit merge

Merge:

- `sal-database/codex/adr-season-draft-eligibility`;
- `sal-site/codex/adr-audience-draft-views`; and
- `lab-salbot/codex/adr-roster-transactions-discord`.

Exit gate:

- all cross-repository links resolve on each default branch;
- the audit points to this plan and the canonical ADRs; and
- no implementation branch changes an approved invariant without a reviewed ADR
  amendment.

## Wave 1: contain current risk and establish the database foundation

### SITE-0 — current-engine safety containment

This branch reduces risk while the replacement contracts are implemented.

Scope:

- DE-00: publish completed picks through the current season-roster assignment
  path rather than relying on global player state;
- DE-01: exclude players already confirmed anywhere in the active season and
  reject creation or activation of another live room for that season;
- DE-02: require expected slot/index when skipping and reject stale updates;
- DE-03: reject rounds, order, and timer changes after the room leaves `pending`;
- DE-06: validate a captain token's room before consuming it;
- add focused route tests for each containment fix; and
- retain compatibility until the new database release is adopted.

Exit gate:

- current drafts cannot silently miss `season_rosters`;
- the current engine cannot show or accept a season-confirmed player in another
  room, and only one room can be active or paused for the season;
- skip cannot advance a stale slot;
- active configuration cannot mutate;
- a wrong-room URL cannot burn a valid token; and
- test, lint, build, and existing E2E checks pass.

### DB-1 — schema and authorization foundation

Scope:

- numeric division `draft_tier`;
- one confirmed player assignment per season;
- room lifecycle and immutable configuration snapshots;
- room version and canonical slot records;
- organization-seat readiness;
- staged selections;
- event-backed pick/skip history;
- division-specific Captain role mappings;
- organization, Caster, and Production role mappings;
- hashed overlay credentials;
- transaction and outbox base tables; and
- indexes and foreign keys required by later functions.

Exit gate:

- migrations apply from a clean database;
- rollback/recovery notes exist;
- uniqueness and foreign-key invariants are database-enforced;
- generated types compile in all consumers; and
- no consumer release is required to understand partially deployed functions.

### DB-TEST — disposable database CI

Scope:

- start disposable Postgres/Supabase in CI;
- apply the entire migration sequence;
- open independent connections for races;
- add fixtures for two seasons and all three division tiers;
- provide read-only production guards; and
- publish reusable test helpers for DB-2 through DB-4.

Exit gate:

- CI proves migrations from zero;
- at least one intentional race demonstrates independent-connection behavior;
- production-mutating verification is rejected; and
- failures preserve database logs as CI artifacts.

## Wave 2: implement authoritative database behavior

### DB-2 — slot engine, timers, and eligibility

Scope:

- unified atomic resolution for confirm, timeout auto-pick, captain skip, and
  admin skip;
- same-division or exactly one-tier-up eligibility;
- season-scoped cross-room uniqueness;
- authoritative deadlines, pause remainder, and resume;
- staged-selection auto-pick at expiration;
- stale room-version and slot rejection;
- verified platform-outage recovery pause; and
- public-safe and private audit events.

Required real races:

- pick versus pick;
- pick versus skip;
- confirm versus timeout;
- timeout auto-pick versus skip; and
- the same player across division rooms.

Exit gate:

- exactly one canonical resolution wins every exclusive race;
- no partial slot, timer, player, or audit state survives a conflict;
- retries are idempotent; and
- consumer contract fixtures are published.

### DB-3 — reversible history and End Draft

Scope:

- repeatable undo and redo over immutable linked events;
- canonical history branch selection;
- displaced staged-selection clearing;
- public correction events;
- `completion_review`;
- administrator emergency-pick attribution;
- idempotent End Draft;
- atomic `season_rosters` publication;
- skipped roster vacancies;
- exactly-once draft-conclusion outbox event; and
- recovery finalization through the same function.

Required real races:

- undo versus a new pick;
- redo versus a conflicting eligibility change;
- duplicate End Draft;
- End Draft versus undo; and
- finalization versus roster conflict.

Exit gate:

- history is reversible without deleting evidence;
- rosters remain unpublished before End Draft;
- only one final publication and conclusion event exist; and
- finalized history cannot be reopened.

### DB-4 — roster transactions and durable projections

Scope:

- claims, drops, uneven trades, Draft Position Swaps, and reversals;
- proposal revisions, counteroffers, consent revocation, and admin approval;
- linked `pending_actions` orchestration through the shared approval pipeline;
- roster-capacity enforcement;
- waiver evidence without automatic winner selection;
- post-drop eligibility and private sanctions;
- immutable public-safe transaction events;
- Discord role-reconciliation work;
- failure and retry state; and
- transaction availability configuration.

Exit gate:

- every mutation is atomic and audited;
- cross-division trades fail at the database boundary;
- pending claims do not reserve players;
- Discord failures cannot roll back canonical transactions; and
- duplicate consumers cannot duplicate public events.

## Wave 3: parallel consumer implementation

### SITE-1 — authentication and room lifecycle

Scope:

- Discord OAuth captain authorization using division Captain plus organization
  role;
- ambiguous-role rejection;
- emergency access codes;
- minimal room creation;
- ordered drag-and-drop list with up/down fallback;
- open, readiness, start, pause, resume, recovery pause, and reconnect;
- realtime-to-polling degradation;
- staged selection, confirmation, timeout status, and skip;
- repeatable undo/redo;
- completion review and End Draft; and
- administrator emergency picks.

Exit gate:

- all mutations include expected room version and slot;
- private fields never enter public responses;
- keyboard and touch paths work; and
- route, component, authorization, and lifecycle tests pass.

### SITE-2 — audience projections

Scope:

- separate server-authorized spectator, captain, administrator, production, and
  overlay projections;
- ghost-pick, shortlist, search, private-reason, and audit isolation;
- complete administrator audit and failure view;
- captain all-roster view;
- same-division main pool and one-tier Draft Up Search;
- public correction ledger; and
- transaction bulletin using full names on desktop and canonical tags on
  constrained mobile layouts.

Exit gate:

- response-shape tests prove privileged fields are absent;
- spectators receive confirmed state only;
- captains see only their organization's private intent; and
- administrators retain complete operational evidence.

### SITE-3 — production board and overlays

Scope:

- logical 1920×1080 no-scroll board;
- team grid, top status bar, and live ledger;
- on-clock and latest-event emphasis;
- fit-to-viewport scaling at widths of `375px` and greater;
- keyboard, pointer, and pinch zoom;
- pan and reset-to-fit;
- stacked layout below `375px`;
- hashed, expiring, revocable overlay-token administration; and
- broadcast-safe read-only overlay route.

Exit gate:

- all teams and the active ledger fit at 1920×1080;
- zoom and pan are accessible;
- no private fields reach overlay responses; and
- visual regression tests cover representative team counts and viewports.

### BOT-1 — canonical Discord role configuration

Scope:

- audited configuration commands for division Captain roles;
- audited organization-role mappings;
- audited Caster and Production role mappings;
- separation from ordinary player division-role sync;
- authorization refresh support; and
- clear mapping-conflict diagnostics.

Exit gate:

- commands update canonical database mappings;
- changes are audited;
- ambiguous/missing configuration is actionable; and
- the bot never becomes an alternate authorization source.

### BOT-2 — transactions, roles, and conclusion delivery

Scope:

- ephemeral `/trade`, `/claim`, `/drop`, and `/draft-position-swap` wizards;
- explicit Post Proposal;
- public Accept, Counter, and Decline controls;
- private administrator review;
- shared pending-action claim and dispatch;
- durable lease-based outbox worker;
- stable-marker reconciliation for ambiguous Discord posts;
- consolidated transactions-channel delivery;
- organization-role reconciliation after roster mutations;
- private failure alerts;
- duplicate suppression; and
- one draft-conclusion message only after End Draft succeeds.

Exit gate:

- incomplete wizards post nothing publicly;
- stale proposal revisions cannot execute;
- role failures retry and alert without rolling back rosters;
- transaction and conclusion posts are idempotent; and
- mobile messages use division chips and canonical organization tags.

## Wave 4: immutable release and cross-repository verification

### RELEASE-1 — database contract release

Scope:

- run the complete disposable-database suite;
- verify generated types;
- publish an immutable database release;
- publish migration and deployment runbooks;
- pin the release in both consumers; and
- verify schema parity before consumer merges.

Exit gate:

- release inputs are attested;
- consumers compile against the exact release;
- production migration plan has backup and recovery checkpoints; and
- no consumer points at an unversioned database branch.

### E2E-1 — built-site platform suite

Run the built site and bot fixtures against the disposable released database.

Required workflow:

1. Configure role mappings.
2. Create a season and three division rooms.
3. Configure order, open the room, ready captains, and start.
4. Confirm same-division and one-tier-up picks.
5. Reject a two-tier or downward pick.
6. Race the same player across rooms.
7. Auto-pick a staged player at timeout.
8. Skip an unstaged timeout.
9. Pause, reconnect, poll through realtime loss, and resume.
10. Repeatedly undo and redo.
11. Submit an administrator emergency pick.
12. Enter completion review.
13. Verify audience privacy and production-board behavior.
14. End Draft and verify atomic rosters plus one conclusion event.
15. Execute claim, drop, uneven trade, counteroffer, reversal, and role sync.
16. Force Discord delivery failure, retry, and prove no duplicate post.

Exit gate:

- every ADR acceptance criterion is mapped to a passing test or reviewed manual
  production check;
- concurrency uses real database connections;
- browser flows use the built application;
- production checks remain read-only; and
- no P1 or P2 draft finding remains open.

## Wave 5: rollout

### ROLLOUT-1 — deployment order

1. Announce a transaction and draft maintenance window.
2. Confirm database backup and recovery checkpoints.
3. Deploy the immutable database release.
4. Verify schema, functions, mappings, and read-only health.
5. Deploy `lab-salbot` with outbox consumers initially paused.
6. Deploy `sal-site`.
7. Run one disposable/staging full-draft rehearsal.
8. Enable bot consumers.
9. Run a production read-only smoke check.
10. Open one controlled draft room and verify readiness, overlay, and
    transactions delivery.
11. Monitor outbox lag, failed role sync, authorization failures, and room
    version conflicts.
12. Close the maintenance window only after the first End Draft publication and
    conclusion event reconcile.

## Audit coverage

| Finding | Containment | Durable resolution | Verification |
| --- | --- | --- | --- |
| DE-00 | SITE-0 current roster propagation | DB-3 End Draft atomic publication | DB-3 race tests, E2E-1 |
| DE-01 | season-scoped application filtering | DB-1 uniqueness plus DB-2 eligibility | DB-2 cross-room race, E2E-1 |
| DE-02 | SITE-0 expected-index skip | DB-2 unified slot resolution | pick-versus-skip race |
| DE-03 | SITE-0 pending-only mutation guard | DB-1 immutable snapshot | migration and route tests |
| DE-04 | none | SITE-1 staged selection and confirmation | site contract tests, E2E-1 |
| DE-05 | add focused containment tests | DB-TEST plus all workbranch test gates | disposable DB and built-site E2E |
| DE-06 | SITE-0 validate before token consume | SITE-1 Discord OAuth role authorization | auth route and E2E tests |

## Definition of done

- All ADR branches and cross-repository pointers are merged.
- DE-00 through DE-06 have passing durable-resolution tests.
- The disposable database suite exercises real concurrency.
- The built-site E2E completes a full division draft and End Draft publication.
- Spectator, captain, admin, caster, production, and overlay privacy boundaries
  are verified.
- Discord transactions, role sync, failure alerts, and draft conclusion are
  idempotent.
- Production rollout and recovery runbooks are approved.
- The audit is updated from open findings to verified remediation evidence.
