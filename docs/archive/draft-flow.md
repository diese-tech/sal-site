# Draft Flow

## League Setup

1. Admin creates a season.
2. Admin creates/selects participating orgs.
3. Admin assigns captains.
4. Player applications are vetted.
5. Approved players are imported into SAL.
6. Draft order is generated.
7. Draft room opens.

## Player Intake

Initial intake flow:

Google Form -> Google Sheets -> Admin Vetting -> SAL Import

MVP import method:

- CSV upload from vetted sheet
- manual player additions supported

Future:

- Google Sheets sync
- native SAL registration

## Draft Room Layout

### Left Sidebar

- captain org card
- current roster
- active pick state
- timer state

### Center Layer

Player pool overlay.

Behind the overlay:

Responsive draft board.

### Right Sidebar

- recent picks
- draft state
- captain queue preview

## Draft Board

Responsive card-grid layout.

Preferred row balancing:

- 4-4 for 8 teams
- 5-4 or 4-5 for 9 teams
- visually weighted center rows

The board should resemble an esports event presentation rather than a fantasy sports spreadsheet.

## Snake Draft Rules

- round 1 drafts top-to-bottom
- round 2 drafts bottom-to-top
- alternates every round
- captains are usually locked roster members
- roster size normally 6 to 8

## Pick Flow

1. Captain selects player.
2. Player card enters pending confirmation state.
3. Pending slot pulses/highlights.
4. Captain confirms draft.
5. Player animates from pool to roster slot.
6. Player removed from available pool.
7. Draft advances.

## Ghost Queue System

Captains may queue players privately.

Queued players appear:

- semi-transparent
- ghosted in future roster slots
- visible only to that captain

Ghost cards disappear if the player is drafted elsewhere.

## Timer Rules

### Normal Expiration

- captain loses current pick
- draft advances

### Disconnect Recovery

If captain disconnects during active draft state:

1. Draft pauses.
2. Alert displayed to admins and captains.
3. Timer pauses.
4. Captain attempts reconnection.
5. Admin may resume, skip, or override.

Disconnect handling should prioritize reliability and admin control over full automation.
