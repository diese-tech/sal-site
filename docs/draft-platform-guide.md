# SAL Draft Platform Decisions in Plain English

This guide explains the accepted draft-platform decisions as users, operators,
designers, and site developers will experience them. It does not claim these
features are implemented yet. The dependency-ordered implementation plan is
[`plans/draft-platform-remediation-plan-2026-07-23.md`](plans/draft-platform-remediation-plan-2026-07-23.md).

## The short version

- Every division gets a separate draft room.
- Only one division room in a season is live or paused at a time.
- A player can be drafted only once per season.
- Captains normally see only their own division's pool.
- A separate search allows drafting an available player up exactly one
  division.
- Captains enter with a short team code typed into the draft room, and will
  eventually enter through Discord OAuth and current role mappings, rather than
  permanent captain-specific links.
- Selecting a player stages the pick; confirmation or timer expiration can lock
  that staged player in.
- A turn with no valid staged player becomes a skipped slot.
- Admins can repeatedly undo and redo while the draft is paused.
- Rosters are published only after an explicit completion review and **End
  Draft** action.

## Division and season rules

The draft hierarchy is:

1. Terra
2. Solar
3. Lunar

Terra may draft Terra players normally and may manually search Solar. Solar may
draft Solar normally and may manually search Lunar. Lunar may draft Lunar only.
No one may draft downward, and Terra cannot skip Solar to take Lunar.

The main pool contains only current-season, same-division players who have not
already been drafted anywhere in that season. **Draft Up** opens an
autocomplete instead of adding every lower-division player to the board.

Draft order does not grant poaching rights. Once a player is confirmed in one
room, later rooms cannot take that player. The same person may play for a
different team or division in a later season.

## Admin setup and room lifecycle

Room setup should be intentionally simple. Defaults are hard-coded where
possible. Admins choose the season and division, adjust rounds if needed, and
preconfigure the organization order using drag-and-drop or accessible
up/down controls.

The lifecycle is:

```text
Pending → Open → Ready check → Active ↔ Paused → Completion review → Finalized
```

Admins open the room, wait for captains to sync, and start when the broadcast
team is ready. Configuration locks after opening. If configuration must change,
the room is voided and replaced rather than silently rewriting active history.

A browser or admin disconnect does not reset the room, access, draft state, or
timer. On reconnect, the client reads authoritative server state. If realtime
updates fail, it polls. If both fail, it shows **Connection lost** and never
guesses.

## Captain access

### Current draft-day delegated access

Until Discord role-to-organization ownership is available as a trusted server-side
mapping, commissioners delegate access with short, room-and-organization-scoped
**team codes** from **Admin → Draft → Captain / Org Owner Access**:

1. Find the organization in the draft room.
2. Select **Issue code**. The code (for example `H7K2-QM4X`) stays visible in the
   admin panel for the life of the draft, so it can be re-read at any time.
3. Share the room link and the code with the captain and any backup org owner.
   The code can also simply be read aloud in voice chat.
4. The captain opens `/draft/<room>` and types the code into **Captain? Enter
   your team code**. That creates a signed session for exactly that draft room
   and organization. The recipient cannot select another organization in the
   client, and the pick and shortlist APIs enforce the same scope on the server.

A code works on any device, as many times as needed. A captain who switches
phones, clears cookies, or loses their session just re-enters the same code —
no admin action required.

**Why codes replaced one-time links.** The previous flow issued a 32-character
link that was deleted on first redemption. In practice captains could not get
in: opening the link on a second device failed, a browser that dropped the
session cookie burned the credential with nothing to show for it, and chat
clients mangled the long URL. Reissuing was also impossible, because the
database allows only one live credential per seat, so a second **Generate**
collided and returned a server error.

**The trade-off.** This reverses the earlier one-time-use hardening (SEC-06). A
leaked code stays usable until it expires or is rotated, so treat a code like a
password. It is mitigated by:

- redemption attempts being rate-limited per client, and every failure written
  to the audit log;
- **Rotate code**, which invalidates the previous code for that seat instantly —
  the revocation path the one-time links never actually had;
- codes being scoped to a single organization in a single room; and
- **Leave** in the draft room header, which releases a seat from a shared or
  borrowed device.

Rotate a seat's code if you suspect it has been shared beyond the intended
captain and backup owner.

Links already handed out before this change remain redeemable until they
expire, and are no longer consumed on first use.

The requested Discord Org Owner role ID `1482930940886909079` is deliberately
not an authorization input yet. The current player OAuth flow requests only
Discord `identify`, and neither `sal-site` nor the database has a trustworthy
owner-to-organization mapping. Hard-coding that global role would therefore
either be unverifiable or grant cross-organization access. No
`DISCORD_ORG_OWNER_ROLE_ID` environment variable is active until both guild-role
membership and organization ownership can be verified server-side.

### Intended role-mapped access

Captains do not need unique permanent links. Access is based on:

- Discord OAuth;
- the Captain role for the room's division; and
- the organization role for the team in that division.

SAL has separate Terra, Solar, and Lunar Captain roles. An organization may
field a team in all three divisions, so authorization always includes the room
division. This design survives captain changes by updating Discord roles.

Ambiguous, missing, or conflicting mappings block access and tell the user to
contact an admin. Emergency access codes are short-lived, room-specific,
single-purpose, hashed, revocable, and audited.

## Captain drafting experience

Captains see:

- every organization's confirmed roster;
- the same-division available pool;
- their own private shortlist and staged selection; and
- the manual Draft Up search when their division permits it.

Selecting a player stages the choice without immediately committing it.
**Confirm Pick** commits immediately. If the timer expires while a valid player
is staged, that player is automatically locked in. A captain who selected the
wrong player must use the post-draft ticket or trade process.

If time expires with no valid staged player, the slot is skipped. The team loses
that value pick and waits until the end of the draft for an admin-approved claim
to fill the vacancy.

## Admin controls, undo, and recovery

Admins see every roster, the available pool, staged or ghost picks, readiness,
connection state, failures, and the full private audit log.

Undo is a real, repeatable history cursor. While paused, an admin may undo
multiple picks or skips and redo them in sequence. History is not deleted:
reversed events remain recorded, and a new action after undo starts a new
canonical branch. A private reason is optional but encouraged.

Admins may also place an emergency pick when production recovery requires it.
The action is visibly attributed and audited.

## Ending and publishing the draft

The last resolved slot moves the room into completion review. It does not
publish rosters.

Admins inspect the result and select **End Draft & Publish Rosters**. That one
operation finalizes the canonical history, publishes season rosters, preserves
vacancies caused by skips, and creates one durable conclusion event.

SALBot then posts:

```text
[SOLAR] Solar draft has concluded.
[View Solar rosters](https://example.invalid/rosters/solar)
```

Normal picks, undo, redo, and completion review do not post to the consolidated
transactions channel.

## Audience-specific views

Authorization is enforced on the server. Hiding a button or field in React is
not a security boundary.

### Spectators

Spectators see confirmed public state: team cards filling, the public pick
ledger, turn status, and timer. They never receive shortlists, staged picks,
ghost picks, private reasons, readiness secrets, or internal failures.

### Captains

Captains receive the spectator state plus all confirmed rosters, the available
pool, and their own private drafting intent. They never receive another
captain's shortlist or staged selection.

### Administrators

Admins receive the complete operational view, including private audit details,
ghost picks, readiness, connection health, and recovery controls.

### Casters and production

Casters and production receive read-only broadcast-safe data: the public ledger
and a centralized team board designed to fit a 1920×1080 production window.
Possessing a broadcast role does not grant draft mutation controls.

### Overlay links

Only admins may issue, rotate, or revoke overlay credentials. The plaintext
credential appears in the generated URL and is shown only when issued; the
server stores only its hash. Credentials are room-specific, expiring, revocable,
and read-only. Production staff consume the links but cannot create credentials
unless they are separately authorized administrators.

## Responsive production board

The logical broadcast canvas is 1920×1080 and keeps the entire team board and
live ledger visible without scrolling.

At viewport widths of 375px and above, the complete board fits the screen by
scaling down. Users may zoom and pan with keyboard, pointer, pinch, or explicit
controls and can reset to fit. Below 375px, the production view uses a stacked,
scrolling mobile layout.

Mobile transaction entries use canonical organization tags to wrap cleanly,
while larger layouts may show full names.

## Roster transactions shown by the site

The site renders the same durable public ledger as Discord:

```text
[SOLAR] FF traded Crow to TC for The_Expert133
[LUNAR] EV claimed XGN Ninja
```

Only completed changes are public. Pending offers, rejections, private admin
reasons, and discipline are not. Claims, drops, uneven trades, reversals, and
complete draft-position swaps all require admin approval and database capacity
checks.

## Repository boundaries

- [`sal-database`](https://github.com/diese-tech/sal-database) owns schema,
  invariants, atomic functions, audit history, and durable events.
- `sal-site` owns room administration, captain interaction, audience views,
  production presentation, public web projections, and cross-repository E2E.
- [`lab-salbot`](https://github.com/diese-tech/lab-salbot) owns Discord command
  intake, transaction cards, public Discord delivery, role reconciliation, and
  private failure alerts.

## Canonical references

- [Site ADR-0001: Audience-specific draft views and production board](adr/0001-audience-specific-draft-views-and-production-board.md)
- [Database ADR-0001: Draft eligibility](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0001-season-scoped-captain-roster-draft-eligibility.md)
- [Database ADR-0002: Roster transactions](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0002-roster-transactions-and-public-bulletin.md)
- [Database ADR-0003: Draft lifecycle and recovery](https://github.com/diese-tech/sal-database/blob/main/docs/adr/0003-draft-room-lifecycle-authorization-and-failure-recovery.md)
- [SALBot ADR-009: Discord roster transactions](https://github.com/diese-tech/lab-salbot/blob/main/docs/adrs/ADR-009-roster-transactions-discord-workflow.md)
