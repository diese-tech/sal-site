# Claude implementation handoff: SAL admin ticket queue view

## Assignment

Work only in `diese-tech/sal-site` on this feature branch.

This branch was created from `origin/main` at `533da74` (`feat: isolate league views by season roster (#187)`) on 2026-07-18. Rebase or merge the latest `origin/main` before implementation if the branch has moved.

Use test-driven development for normalization, filtering, and sorting logic. Run the repository's React/Next.js review and browser verification when available.

## Goal

Create a dedicated `/admin/tickets` operations queue that reduces clutter and gives SAL administrators one responsive place to inspect current review work. This PR is the view and read-model foundation only. It must not introduce database migrations, Discord behavior, OpenRouter behavior, or new mutation workflows.

The page should normalize and display existing work from these current tables and workflows:

- `pending_actions`
- `pending_stat_records`
- `registrations`
- `match_reports`

It must also establish typed, non-functional category support for future `bug_report`, `ruling`, and `scout_review` tickets without showing fake production records. Those future backends will arrive in separate database and integration PRs.

## Current repository context

- Admin navigation: `src/components/admin/AdminLayoutClient.tsx`
- Admin shell: `src/app/admin/layout.tsx`
- Current overview: `src/app/admin/page.tsx`
- Existing registration workflow: `src/app/admin/registrations/page.tsx` and `src/components/admin/AdminRegistrationsClient.tsx`
- Existing match-report workflow: `src/app/admin/match-report/page.tsx` and `src/components/admin/MatchReportClient.tsx`
- Generated database contract: `src/types/database.types.ts`
- Server Supabase access: `src/lib/supabase-server.ts`
- Admin session API: `src/lib/admin-auth.ts`

The current authorization model exposes only `super_admin` and `admin`. Do not implement the planned Owner/Admin/Moderator/Division Commissioner RBAC in this branch. Design the view around an explicit `TicketViewerCapabilities` type so the later RBAC PR can supply capabilities without rewriting the page.

## Required implementation

### 1. Add a normalized read model

Create narrowly scoped types, for example under `src/types/admin-ticket.ts`, with:

- Stable ticket ID and source record ID
- Category: current `operation`, `stat_review`, `registration`, `match_report`; reserved future `bug_report`, `ruling`, `scout_review`
- Normalized status such as `open`, `needs_info`, `claimed`, `resolved`, `denied`, `cancelled`
- Priority: `urgent`, `high`, `normal`, `low`
- Created and updated timestamps plus an optional SLA deadline
- Optional season, division, match, claimant, and source-link metadata
- Public-safe title and summary
- Privacy marker such as anonymous or identity-restricted, without exposing hidden identity data
- Evidence/source links and a normalized timeline
- Viewer capabilities separate from the raw Discord or admin role

Add pure helpers for source normalization, filtering, search, status counts, and sorting. Treat JSON payloads as `unknown` and validate or narrow them before display. Do not add unchecked manual row casts or render arbitrary JSON as trusted HTML.

### 2. Add a server-only ticket reader

Add a server-only data adapter, for example `src/lib/admin-tickets.ts`, that reads the existing four sources with the existing server Supabase client and returns normalized tickets.

Requirements:

- Authenticate the page with `requireAdmin()`.
- Use generated database types.
- Do not expose service-role credentials or raw private records to the browser.
- Select only fields required by the view.
- Fetch independent sources concurrently.
- Handle an unavailable optional source without crashing the entire queue. Show a visible source-health warning to administrators and log the server-side error without sensitive values.
- Do not change ticket status or mutate any table in this PR.

### 3. Build `/admin/tickets`

Build a responsive queue with the existing SAL admin visual language.

Desktop:

- Compact queue list and selected-ticket detail panel
- Summary counts for Open, Urgent, Needs Info, and Resolved
- Filters for status, category, priority, season, division, and assignment where data exists
- Search over ticket ID, public-safe title, match reference, and public-safe summary
- Sort urgent and SLA-bound work first, then oldest unresolved work
- URL-backed filter and selected-ticket state when practical so a Discord embed can deep-link to a ticket later

Mobile:

- Single-column queue
- Selecting a ticket opens a full-width detail view with a clear Back to Queue action
- No horizontal overflow

Ticket detail should provide:

- Type, status, priority, age, and stable ticket identifier
- Related season, division, and match information
- Public-safe facts and evidence/source links
- Timeline and existing review metadata
- Clear handling location: link to `/admin/registrations` or `/admin/match-report` when that is the existing workflow; label bot-owned pending action/stat decisions as managed through the Discord review workflow
- Honest empty and unsupported states

Do not add fake Approve, Deny, Claim, Needs Info, Reply, or Resolve buttons. If an action is not backed by an existing safe endpoint, show the read-only state and the correct existing workflow link. Later PRs will add atomic ticket actions.

### 4. Declutter navigation without deleting workflows

Add an `Operations` navigation group with `Tickets` as the first item. Keep the current Registration and Match Report routes intact because they still own their mutation workflows. You may move their navigation links under Operations if it improves clarity, but do not remove or duplicate their underlying pages.

Add a small unresolved-ticket count badge only if it can be supplied server-side without turning the entire admin layout into fragile client fetching. Otherwise omit the badge and leave a typed extension point.

### 5. Privacy and copy rules

- Never reveal hidden reporter or requester identities in list summaries, search indexes, browser logs, or serialized client props.
- Anonymous tickets must be labeled `Anonymous` without implying administrators can reveal the user.
- Raw private deliberation and individual ruling votes are out of scope.
- Avoid em dashes in user-facing copy.
- Use clear terms: Ticket, Ruling, Bug Report, Scout Review, Stat Review, Registration, Match Report.

### 6. Tests

Add focused tests for:

- Normalization of each current source
- Unknown or malformed JSON payload handling
- Status and category mapping
- Urgent and SLA sorting, including deterministic tie breaking
- Combined filters and search
- Anonymous and identity-restricted serialization
- Empty-source and partial-source-failure behavior
- Authenticated page smoke behavior and mobile-safe rendering where the existing Playwright setup makes this practical

Do not add a new dependency solely for these tests.

## Scope boundaries

Do not modify:

- `supabase/**`
- `src/types/database.types.ts`
- SALbot
- OpenRouter or OCR integrations
- Existing approval or denial mutation behavior
- Discord notifications or outbox behavior
- The planned RBAC schema
- Bug-report, ruling, scout, or precedent database schemas

Do not move existing workflows into the new page. This PR builds the unified read surface and safe navigation links only.

## Success criteria

1. Implementation remains based on current `origin/main`.
2. `/admin/tickets` requires a valid admin session.
3. Existing pending actions, pending stat records, registrations, and match reports appear through one normalized queue when data exists.
4. No private identity or arbitrary unvalidated JSON is exposed to client search or rendering.
5. Filters, search, selection, empty states, loading and error states, and responsive layouts work with keyboard and screen-reader labels.
6. Existing Registration and Match Report mutations continue to work unchanged from their original pages.
7. No schema, generated database type, bot, AI, or deployment files change.
8. The implementation passes:

   - `npm ci`
   - `npm run lint`
   - `npm run test`
   - `npm run build`
   - `npm run check:db-contract`
   - `git diff --check`

9. The PR description includes desktop and mobile screenshots, the normalized source mapping, tests run, and a clear list of future integration points.
10. There are no unrelated refactors or formatting changes.

## Deliverable

Open a focused PR against `main` after implementation. In the PR description, explicitly state that the queue begins as read-only and that atomic ticket actions, new ticket schemas, RBAC, Discord notifications, and AI integrations will be delivered separately.
