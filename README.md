# Serpent Ascension League Draft Platform

Serpent Ascension League (SAL) is a persistent Smite 2 Conquest league platform centered around live snake drafts, stream-ready presentation, and social player identity.

The Card Lab (`/lab/cards`) and design editor (`/lab/editor`) are built and functional. The editor provides live visual configuration of all card and board components using mock data, with no backend required. The next implementation target is the production draft engine.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Open the Card Lab:

```text
http://localhost:3000/lab/cards
```

Open the design editor:

```text
http://localhost:3000/lab/editor
```

Optional production-build verification:

```bash
npm run build
```

## Product North Star

Build a Discord-native competitive esports draft experience for SAL.

SAL should feel like a premium live event board, not a spreadsheet, fantasy football clone, or trading card simulator.

## Confirmed Direction

- SAL is one league with multiple seasons.
- Future tournaments may exist, but they are not MVP.
- Drafts assign individual players to org/captain-led rosters.
- Orgs are selected by the league and assign captains to represent them.
- Captains are players, are not draftable, and usually count as a roster slot.
- Rosters are normally 6 to 8 players.
- Roles follow Smite 2 Conquest: Solo, Jungle, Mid, Carry/ADC, Support.
- Player identity persists across seasons.
- Org participation is season-based and interchangeable.
- Public draft presentation is a first-class product concern.

## Current State

`/lab/cards` — static component lab using mock data. Displays all card types with their states.

`/lab/editor` — live design editor with collapsible sections, inline controls, and real-time previews for:

- player profile cards (density, banner, avatar, radius, tags, etc.)
- draft player cards
- roster slot cards (height, pulse, ghost opacity, etc.)
- ghost queue cards (opacity, border style, role pills, etc.)
- org roster cards (header intensity, active glow, captain slot, etc.)
- mock draft board (row composition, view modes, stream canvas at 1920×1080 / 1280×720)
- buttons (style, intent, hover/press effects, shape)
- page theme (glow, borders, motion, background, corner style)

Config persists to `localStorage`. JSON export/import supported. No auth, database, or production draft state.

The next target is the production draft engine (Phase 3).

## Planned Stack

Likely production stack:

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- Neon Postgres
- Auth.js / NextAuth
- Discord OAuth eventually
- Vercel hosting

Realtime can begin with polling/SSE before introducing heavier WebSocket infrastructure.

## Documentation

See `docs/` for current product and architecture planning.
