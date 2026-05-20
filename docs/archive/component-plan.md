# Component Plan

## Philosophy

SAL should be built component-first.

The initial implementation target is a reusable visual system using mock data.

Do not begin with backend systems.

## Routes

`/lab/cards` — static component showcase, all card types with mock data.

`/lab/editor` — live design editor. Controls sit beside the component they affect. Config persists to localStorage with JSON export/import. Sections are collapsible. Stream canvas preview at 1920×1080 and 1280×720.

Purpose:

- experiment rapidly without editing CSS or TSX
- establish and validate visual language
- test component states
- validate stream readability
- validate responsive layouts

## Core Components

### PlayerProfileCard

Large profile card.

Used for:

- player profiles
- free agency
- roster pages

Contains:

- Discord avatar
- banner image
- IGN
- Discord username
- primary role
- secondary roles
- timezone
- player tags
- org/free agent badge

## DraftPlayerCard

Compact version for draft pool.

Used for:

- captain draft overlay
- searchable player pool

Contains:

- avatar
- banner
- role pills
- timezone
- queue icon
- note icon
- draft button state

## RosterSlotCard

Ultra-compact card.

Used inside org draft cards.

Contains:

- pick number
- avatar
- IGN
- role

States:

- empty
- drafted
- queued ghost
- active selection

## GhostQueueCard

Semi-transparent future roster placeholder.

Visible only to owning captain.

Should:

- appear translucent
- sit in future roster slot
- disappear if drafted elsewhere

Editor-configurable: card opacity, hover opacity, border style (dashed/solid/none), avatar size, radius, padding, role pills, position badge, subtext visibility.

## OrgRosterCard

Primary board card.

Contains:

- org logo
- org name
- captain locked slot
- roster slots
- active drafting state

States:

- inactive
- active/on-the-clock
- completed roster

## RecentPickWidget

Displays:

- last drafted players
- org
- pick number
- round

## DraftTopBanner

Displays:

- current round
- active org
- timer
- draft state

## Responsive Board

Board should NOT use naive equal grids.

Implemented as centered flex rows via `getBoardRows(teamCount, layoutPreset)`:

- balanced 6: [3, 3]
- balanced 7: [4, 3]
- balanced 8: [4, 4]
- balanced 9: [5, 4]
- balanced 10: [5, 5]
- 4-4 preset: rows of 4
- 5-4 preset: [5, remainder]
- 4-5 preset: [4, remainder]

Each row is `justify-center` flex, so shorter rows appear centered rather than left-aligned. The board should feel intentionally composed, not like a wrapping grid.

## Future Stream Components

Eventually support browser-source widgets:

- recent picks ticker
- active pick overlay
- caster-only clean board
- draft alert widgets
