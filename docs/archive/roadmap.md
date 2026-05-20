# Roadmap

## Phase 0 — Planning ✓

Complete.

Established product identity, component architecture, draft flow, visual direction.

## Phase 1 — Card Lab ✓

Complete.

Routes: `/lab/cards`, `/lab/editor`

Delivered:

- full card component system (player profile, draft pool, roster slots, ghost queue, org roster)
- live design editor with collapsible sections, real-time previews, localStorage persistence
- mock draft board with row composition, view modes (spectator/captain/caster)
- 1920×1080 and 1280×720 stream canvas preview mode
- JSON config export/import

No backend. No auth. No production draft state.

## Phase 2 — Mock Draft Board

Partially started within the editor. Remaining goals:

- snake order visualization
- roster slot draft animation
- mobile spectator behavior

Still powered by mock data.

## Phase 3 — Draft Engine

Goals:

- draft state machine
- snake logic
- timers
- admin controls
- reconnect handling
- captain permissions

## Phase 4 — Persistence + Auth

Goals:

- Neon database
- Prisma schema
- Auth.js
- Discord OAuth
- persistent player profiles
- seasons and history

## Phase 5 — Intake + Admin Tools

Goals:

- player registration
- Google Form fallback/embed
- CSV import
- vetting dashboard
- player approval flow

## Phase 6 — Stream + Broadcast Features

Goals:

- OBS/browser source widgets
- recent picks ticker
- caster overlays
- public clean board mode

## Non-Goals (Current)

Do not build yet:

- tournament systems
- fantasy scoring
- social feeds
- messaging systems
- advanced stat dashboards
- monetization systems
