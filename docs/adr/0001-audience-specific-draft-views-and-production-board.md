# ADR-0001: Audience-Specific Draft Views and Production Board

- Status: Accepted
- Date: 2026-07-23
- Owners: SAL site, database, and bot maintainers
- Related ADRs:
  - [SAL Database ADR-0001: Season-Scoped Captain-Roster Draft Eligibility](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0001-season-scoped-captain-roster-draft-eligibility.md)
  - [SAL Database ADR-0002: Roster Transactions and Public Bulletin](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0002-roster-transactions-and-public-bulletin.md)
  - [SAL Database ADR-0003: Draft Room Lifecycle, Authorization, and Failure Recovery](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0003-draft-room-lifecycle-authorization-and-failure-recovery.md)
  - [SALBot ADR-009: Roster Transactions Discord Workflow](https://github.com/diese-tech/lab-salbot/blob/main/docs/adrs/ADR-009-roster-transactions-discord-workflow.md)
- Related findings: DE-04, DE-05

## Context

A live SAL draft serves multiple audiences with different operational and
privacy needs:

- spectators need a clean public draft experience;
- captains need player-selection tools and roster context;
- administrators need complete operational control and audit visibility; and
- casters and production staff need a broadcast-oriented overview.

One shared interface with controls hidden through client-side CSS would risk
exposing staged selections, private audit data, captain searches, administrative
failure details, or privileged actions.

Each audience therefore requires a server-authorized data projection and a
purpose-built responsive presentation over the same authoritative draft state.

The production view must provide a centralized team overview and live ledger
that fits within a 1920×1080 broadcast window while remaining usable on smaller
screens.

## Decision

### Separate server-authorized projections

`sal-site` provides separate draft projections for:

- public spectators;
- authorized captains;
- authorized administrators;
- authenticated casters and production staff; and
- revocable read-only broadcast overlays.

Authorization and field filtering occur on the server.

Privileged fields are not sent to unauthorized clients and are not merely hidden
with client-side styling.

Every view derives canonical picks, slots, room state, deadlines, rosters,
corrections, and ledger events from the same database records defined by SAL
Database ADR-0003.

### Ghost-pick privacy

A ghost pick is the current server-persisted staged selection that has not yet
been confirmed or committed by timeout.

A ghost pick is visible only to:

- authorized captains controlling the selecting organization’s seat; and
- authorized administrators.

Ghost picks are never exposed to:

- other organizations’ captains;
- spectators;
- casters;
- production staff; or
- broadcast overlays.

The existence of a ghost pick is also private outside the selecting organization
and administrators.

### Spectator view

The public spectator view contains only broadcast-safe state:

- division;
- round and pick number;
- current organization on the clock;
- authoritative timer;
- confirmed canonical pick ledger;
- public correction events;
- confirmed organization rosters; and
- team cards populated as picks commit.

Spectators do not receive:

- the available-player pool;
- searches;
- shortlists;
- ghost picks;
- captain identity, presence, or readiness;
- administrator controls;
- private audit events;
- private pause reasons;
- detailed infrastructure errors; or
- authorization diagnostics.

A pause displays a neutral public message such as:

**Draft paused by league administration**

A verified platform outage displays a neutral delayed-state notice without
exposing infrastructure details.

Undo and redo update canonical team cards and add clear public correction events
to the ledger. Reversed history is never presented as the current roster.

The spectator view uses normal responsive reflow across desktop, tablet, and
mobile layouts.

### Captain view

An authorized captain receives the public draft state plus:

- every organization’s confirmed roster in the room;
- an emphasized view of their own organization;
- the eligible main player pool for the room’s division;
- private player search;
- private shortlist data;
- the approved Draft Up Search for only the immediately lower division;
- their organization’s staged ghost pick;
- staged-selection controls;
- pick confirmation controls when their organization is on the clock;
- ready and reconnect controls; and
- captain-safe failure and conflict messages.

Captains never receive another organization’s:

- ghost pick;
- shortlist;
- private searches; or
- authorization diagnostics.

Confirmed picks and timeout auto-picks update every captain’s roster view from
canonical state.

A reversed pick disappears from the canonical roster while its correction
remains visible in the public ledger.

### Administrator view

Authorized administrators receive:

- every participating organization and confirmed roster;
- the complete eligible-player pool;
- every current ghost pick;
- organization readiness and captain presence;
- captain-authorization diagnostics;
- the complete private draft audit ledger;
- timeout, reconnect, realtime, platform-outage, Discord, and role-sync failure
  details;
- current and historical room versions;
- pause, resume, skip, undo, redo, void, replacement, and conclusion controls;
- emergency-access controls;
- overlay-token controls; and
- the recovery controls defined by SAL Database ADR-0003.

Administrative controls remain server-authorized and use the atomic database
operations defined by the canonical database ADRs.

### Administrator-submitted emergency picks

An administrator may use **Submit Pick for Team** only for the organization
currently on the clock.

The emergency action:

- uses the same eligible-player projection as the captain;
- displays the organization’s current ghost pick, if any;
- allows the administrator to select a different eligible player;
- does not edit the organization’s staged selection silently;
- requires explicit confirmation;
- permits an optional but encouraged private reason;
- records the acting administrator;
- records that the pick was administrator-submitted;
- enforces room version, slot, deadline, season, division-tier, availability, and
  roster invariants; and
- commits through the same atomic slot-resolution function as a captain pick.

The public, spectator, and production projections display the result as the
organization’s normal pick. Administrator involvement remains private.

### Caster and production authorization

Caster and production staff authenticate through Discord OAuth.

Authorization uses database-owned mappings for:

- the configured Caster Discord role; and
- the configured Production Discord role.

Both roles receive the read-only production dashboard.

Caster and production users cannot:

- stage or confirm picks;
- skip slots;
- pause or resume;
- undo or redo;
- submit emergency picks;
- void or replace rooms;
- issue emergency captain access;
- generate or rotate overlay tokens unless separately authorized as an
  administrator; or
- finalize the draft.

Role mappings are audited and may be updated without redeploying `sal-site` or
`lab-salbot`.

### Production dashboard

The authenticated production dashboard is a read-only broadcast presentation.

Its logical 1920×1080 canvas contains:

- a compact top bar showing division, round, pick number, on-clock organization,
  authoritative timer, and connection state;
- a responsive main grid containing every organization’s team card and confirmed
  roster; and
- a chronological right-side ledger containing confirmed picks, timeout
  auto-picks, skips, undos, redos, and corrections.

The on-clock organization card is highlighted.

The latest ledger event receives brief visual emphasis for the cast.

Reversed picks remain visible as corrections in the ledger but disappear from
canonical team cards.

The layout adapts to the number of participating organizations.

At its logical 1920×1080 size, all organization cards and the active ledger are
visible without document scrolling.

The production dashboard never includes:

- the available-player pool;
- ghost picks;
- searches;
- shortlists;
- private audit events;
- private failure details; or
- mutation controls.

### Fit-to-viewport and zoom behavior

The production board preserves its logical 16:9 canvas on smaller screens rather
than immediately moving the ledger below the team grid.

At viewport widths of `375px` CSS pixels or greater:

- the complete canvas scales uniformly to fit the available viewport;
- the 16:9 composition remains intact;
- users may zoom with visible controls;
- `+` and `-` keyboard shortcuts change zoom;
- `0` and the **Fit** control restore fit-to-screen;
- touch clients support pinch-to-zoom;
- mouse clients support normal modifier-assisted wheel zoom; and
- users may pan when zoomed beyond the fitted size.

Important timer and connection indicators retain a minimum readable
presentation.

Below `375px` CSS width, the interface switches to a stacked mobile layout with
normal document scrolling.

This canvas behavior applies to caster, production, and overlay views. Public
spectator and captain interfaces continue using normal responsive reflow.

### Read-only broadcast overlays

Authorized production staff may generate a read-only overlay URL for browser
capture software such as OBS.

Each overlay credential is:

- bound to one draft room;
- restricted to the broadcast-safe production projection;
- stored only as a cryptographic hash;
- shown in plaintext only when generated;
- revocable;
- rotatable;
- assigned an expiration;
- invalid after the room concludes; and
- privately audited.

Overlay access never exposes Discord identity, captain data, ghost picks,
administrative audit records, private errors, or mutation endpoints.

Rotating an overlay credential does not affect the room, authenticated users, or
captain sessions.

A leaked overlay URL grants only temporary read access to broadcast-safe state.

### Public correction ledger

Pick and skip reversals append correction events.

Every projection renders only the current canonical resolution in team rosters
and current-slot calculations.

Spectator and production ledgers retain public-safe correction entries so viewers
can understand why a previously announced result changed.

Private administrator reasons are never included in public correction events.

### End Draft and publication

Resolving the final slot moves the room into `completion_review`.

During `completion_review`:

- draft mutation controls stop except authorized undo and redo;
- captains, spectators, and production views show that results are under final
  league review;
- administrators see the final pick, skip, vacancy, and roster summary; and
- canonical season rosters remain unpublished.

An administrator completes the draft with:

**End Draft & Publish Rosters**

This action:

- requires explicit confirmation;
- does not require a private reason;
- calls the shared idempotent finalization function from SAL Database ADR-0003;
- atomically publishes canonical season rosters;
- closes undo and redo permanently;
- emits the durable draft-conclusion event; and
- transitions every view to the final completed state.

Any authorized administrator may complete the action. One administrator
disconnecting does not block conclusion.

Rooms left in `completion_review` display repeated private administrative
reminders.

Recovery finalization uses the same function and never creates a second
publication path.

## Verification contract

This ADR follows the three-layer verification boundary in SAL Database ADR-0003.

### Site contract tests

`sal-site` tests its published database contract, server authorization, audience
projections, privacy filtering, state handling, and responsive interactions.

Tests that mock the database boundary are labeled as contract, route, component,
or interface tests. They do not claim to verify Postgres transactions or locking.

Required coverage includes:

- pick-sequence generation;
- turn-ownership rejection;
- same-division and one-tier-up eligibility;
- staged selection creation, replacement, clearing, and reconnect restoration;
- explicit pick confirmation;
- timeout auto-pick and timeout skip presentation;
- stale room-version and slot conflicts;
- repeatable undo and redo controls;
- completion review and End Draft confirmation;
- administrator-submitted emergency picks;
- Discord captain, organization, Caster, and Production role authorization;
- ambiguous organization-role rejection;
- spectator, captain, administrator, production, and overlay field filtering;
- ghost-pick, shortlist, search, audit, and private-reason isolation;
- realtime degradation and polling recovery;
- disconnected and recovered captain presentation;
- verified platform-outage presentation;
- production-board fit, zoom, pan, and narrow-mobile fallback;
- keyboard, pointer, touch, and screen-reader behavior; and
- hashed overlay creation, rotation, revocation, expiration, and room scoping.

### Cross-repository end-to-end tests

The built site runs against a disposable database containing the complete
`sal-database` migration sequence.

The end-to-end suite verifies:

1. An administrator creates and configures a room.
2. Captains authenticate through mapped Discord-role fixtures.
3. Every organization becomes ready.
4. The administrator starts the room.
5. A captain stages and confirms a player.
6. A staged player commits automatically at timeout.
7. An unstaged slot becomes a timeout skip.
8. An administrator pauses and resumes.
9. An administrator repeatedly undoes and redoes resolutions.
10. An administrator submits an emergency pick.
11. The final slot enters completion review.
12. Spectator and production projections contain only broadcast-safe state.
13. End Draft publishes canonical season rosters atomically.
14. The durable draft-conclusion event is created exactly once.

### Production safety

Site verification configured against production is read-only.

Test and verification commands reject production-mutating draft operations.
Production smoke checks may inspect safe routes, schema contracts, and health
state but never create rooms, stage players, resolve slots, alter rosters, or
conclude drafts.

## Consequences

### Positive

- Each audience receives only the information and controls it needs.
- Ghost picks, shortlists, searches, and private audit information remain
  protected.
- Captain views retain league-wide roster awareness without exposing another
  organization’s draft intent.
- Administrators can operate and diagnose the complete room from one surface.
- Casters receive a purpose-built ledger and team overview.
- Production can capture a stable 16:9 board at 1920×1080 or scale it to smaller
  devices.
- Overlay credentials can be rotated without disrupting the draft.
- Emergency administrator picks use the same invariants as captain picks.
- Final publication becomes an explicit production handoff.

### Negative

- Multiple projections and layouts require more implementation and test coverage
  than one shared page.
- Zoomable canvas behavior requires careful keyboard, pointer, touch, and
  accessibility testing.
- Database-backed staff role mappings and overlay tokens require new schema and
  administrative tooling.
- Production users must rotate leaked overlay URLs.
- Explicit final publication requires administrators to complete the End Draft
  action.

## Implementation ownership

### `diese-tech/sal-site`

- Add server-authorized spectator, captain, administrator, production, and overlay
  projections.
- Ensure privileged fields are omitted server-side.
- Implement the public spectator experience.
- Implement the captain player pool, private search, shortlist, staged selection,
  and roster views.
- Implement the complete administrator operations and audit interface.
- Implement administrator-submitted emergency picks.
- Implement the 1920×1080 production canvas, responsive scaling, zoom, pan, and
  stacked narrow-mobile fallback.
- Implement secure overlay generation, rotation, revocation, and consumption.
- Implement the completion-review and End Draft interfaces.
- Add authorization, privacy, accessibility, responsive, zoom, overlay,
  correction, and end-to-end tests.
- Label mocked database tests accurately as contract or interface coverage.
- Run the built site against the disposable migrated database for complete draft
  E2E workflows.
- Enforce read-only production verification.
- Link the draft audit and implementation documentation to this ADR and the
  canonical database ADRs.

### `diese-tech/sal-database`

- Add canonical Caster and Production Discord role mappings.
- Add hashed, room-scoped, expiring, and revocable overlay-token records.
- Add audited role-mapping and overlay-token functions.
- Provide audience-safe query contracts or views where appropriate.
- Support administrator-submitted pick attribution.
- Support public-safe correction events.
- Add `completion_review` to the canonical room lifecycle.
- Change final-slot resolution to enter `completion_review`.
- Publish rosters only through the idempotent End Draft function.
- Add authorization, token, concurrency, privacy, and finalization tests.
- Publish updated immutable consumer types and a database release.
- Link SAL Database ADR-0003 to this canonical site ADR.

### `diese-tech/lab-salbot`

- Add audited configuration commands for Caster and Production role mappings if
  Discord remains the operational configuration surface.
- Keep staff-role mapping changes separate from player division-role sync.
- Consume the draft-conclusion event only after End Draft succeeds.
- Link Discord operations documentation to this ADR and SAL Database ADR-0003.

## Acceptance criteria

1. Spectators, captains, administrators, production users, and overlays receive
   separate server-authorized projections.
2. Unauthorized fields are omitted from server responses, not merely hidden in
   the client.
3. Ghost picks are visible only to the selecting organization and administrators.
4. Spectators receive only confirmed canonical draft state and public-safe
   corrections.
5. Spectators never receive player pools, shortlists, searches, readiness,
   presence, ghost picks, private reasons, or administrative details.
6. Captains see every confirmed organization roster.
7. Captains see only their own organization’s shortlist, search state, and ghost
   pick.
8. Draft Up Search contains only available players from the immediately lower
   division.
9. Administrators see every current ghost pick and the complete private draft
   audit ledger.
10. Administrator actions remain server-authorized.
11. Submit Pick for Team is available only for the current organization and
    current slot.
12. Administrator-submitted picks enforce the same database invariants as captain
    picks.
13. Administrator involvement in a pick remains private.
14. Caster and Production role mappings are database-owned and audited.
15. Caster and Production roles grant read-only production-dashboard access.
16. Production users receive no mutation controls or private draft intent.
17. At logical 1920×1080 size, all team cards and the active ledger fit without
    document scrolling.
18. The production ledger updates for picks, timeout auto-picks, skips, undos,
    redos, and corrections.
19. Reversed picks disappear from canonical team cards but remain understandable
    through correction entries.
20. At widths of `375px` or greater, the complete production canvas scales to fit
    while preserving its 16:9 composition.
21. Production users can zoom, reset to fit, and pan using keyboard, pointer, and
    touch input appropriate to their device.
22. Below `375px`, the production view uses a stacked scrolling layout.
23. Public spectator and captain pages use normal responsive reflow.
24. Overlay credentials are stored only as hashes and displayed in plaintext only
    when generated.
25. Overlay credentials are room-bound, expiring, revocable, rotatable, and
    invalid after conclusion.
26. Overlay responses contain only broadcast-safe read-only state.
27. Rotating an overlay credential does not affect authenticated draft sessions.
28. Resolving the final slot enters `completion_review`.
29. Season rosters remain unpublished during completion review.
30. Admins may repeatedly undo and redo during completion review.
31. End Draft & Publish Rosters requires explicit administrator confirmation.
32. End Draft uses the shared idempotent database finalization function.
33. Successful publication permanently closes undo and redo.
34. The draft-conclusion event is emitted only after successful publication.
35. Rooms remaining in completion review produce private administrative
    reminders.
36. Site tests cover every audience projection and prove privileged fields are
    absent from unauthorized responses.
37. Site tests cover staged selection, confirmation, timeout, skip, undo, redo,
    completion review, and End Draft interactions.
38. Production-board tests cover fit, zoom, pan, keyboard, touch, and the
    `375px` layout boundary.
39. Cross-repository E2E runs the built site against the complete disposable
    database migration sequence.
40. E2E verifies exactly-once roster publication and draft-conclusion event
    creation.
41. Mocked site tests do not claim to verify database concurrency.
42. Production verification remains read-only and rejects draft mutations.
