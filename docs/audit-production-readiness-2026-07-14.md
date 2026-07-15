# SAL Platform Production Readiness Audit

**Date:** 2026-07-14
**Scope:** `diese-tech/sal-site` @ `7679160` and `diese-tech/lab-salbot` @ `18a622a`, plus the shared production Supabase project (read-only inspection).
**Status: This is the authoritative audit source for the SAL platform.** It supersedes all prior audit documents (sal-site's 2026-05-23 audits are archived under `docs/archive/`). This document is maintained identically in both repositories — update both copies together.

Findings are tracked as GitHub issues in each repository; every issue references its finding ID (F-xx) below.

---

## 1. Executive Verdict

### Conditionally ready.

The platform core is solid: every admin API route is authorized (verified by exhaustive sweep), sessions are HMAC-signed with timing-safe verification, OAuth state is validated, the database carries real uniqueness/season constraints, and CI runs lint/typecheck/unit/integration/e2e/build plus a service-role-leak check. The remaining risk concentrates in a small number of cheap-to-fix correctness gaps and one unverified operational question (backups).

- **Highest-risk issue:** standings are never recalculated by *any* match-completion path — only a manual admin button — while the UI claims otherwise (F-01).
- **Highest-confidence issue:** same finding; proven by direct code trace and independently flagged twice.
- **Largest unresolved design question:** which pipeline owns player statistics (F-07).
- **Shortest credible launch path:** ~2–4 days (Phase 0 decisions + five small fixes + backup verification + smoke test). No redesign required.
- **Do NOT let these delay launch:** durable bot workflow state, monorepo restructuring, `apps/web`, ForgeLens, broad test expansion, RLS refactors, framework changes.

---

## 2. Verified Architecture (implemented vs. otherwise)

**Implemented and running**
- **sal-site** — Next.js 16.2.6 / React 19.2.6 on Vercel. Public league pages; admin panel (12 of 13 pages guarded; login exempt by design); ~30 API routes; Discord OAuth admin login + password fallback; player claim/registration via Supabase SSR; captain-token draft rooms; god-draft with Realtime; admin match reports → `match_reports`/`player_match_stats`; CSV import; audit to `admin_audit_log`. All mutations server-side via service-role key.
- **lab-salbot/apps/bot** — discord.js 14.26 on Railway (single instance). 8 slash commands (7 functional + `/help`); `pending_actions` approval pipeline with atomic claim (fixed 2026-07-14, PR #21); proof threads; division sync; Realtime god-draft recaps.
- **Shared Supabase project** — 28 tables, RLS everywhere (public-read on league tables, deny-by-default elsewhere), atomic RPCs, `divisions_id_check ∈ (solar,lunar,terra)`, single-active-season partial unique index, `matches.season_id NOT NULL`, unique `players.ign` / `orgs.name` / `orgs.tag`.

**Partial:** proof-thread counters (in-memory); site match-report stat pipeline (writes work, output displayed nowhere).
**Stubs / documented only:** `/update-ign` (registered command, empty handler), `lab-salbot/apps/web`, `services/forgelens`.
**Cannot verify statically:** Supabase backup/PITR config; Railway deploy-overlap semantics; replica identity on `god_draft_sessions`.

---

## 3. Key Decisions (Phase 0)

| ID | Decision | Direction |
|---|---|---|
| D-1 | Migration ownership | **sal-site `supabase/migrations/` is the single sequence** for the shared project. Bot migrations fold in post-season; until then, a written apply-runbook + parity check before every launch-window change. Evidence: proven drift — bot's `division_role_mappings` migration (authored 2026-07-08) was absent from production until 2026-07-13, silently breaking `/division-role-config` and role sync. |
| D-2 | Statistics pipeline | **Bot pipeline is authoritative for the season** (`pending_stat_records → player_stats → players.stats`; feeds all public stat display). Site's `player_match_stats` is dormant; note in admin docs that match-report stat entry does not feed player pages. Unify post-season (F-07). |
| D-3 | Password admin fallback | Once all real admins are onboarded via Discord OAuth into `admin_users`, **unset `ADMIN_PASSWORD` in Vercel** (route degrades to 503 by design). Keep code as documented break-glass. |
| D-4 | **LLM usage routing (owner's direction, 2026-07-14)** | Split OpenRouter usage by purpose with per-use-case handlers/routers instead of one global model config. Rationale (owner): "Gemini Flash probably doesn't need to be a mini-RAG chatbot" — `/rules` ruleset Q&A is plain-text retrieval over a bounded document and should route to a cheap or free text model; multimodal models (e.g., Gemini Flash) should be reserved for image parsing (the ForgeLens screenshot-OCR pipeline, Phase 4). Current state: a single `OPENROUTER_MODEL` env var (default `google/gemini-2.0-flash-001`) serves the one implemented LLM call site (`/rules`, `apps/bot/src/lib/openrouter.ts`). Classification: **post-season / ForgeLens-phase improvement** — not launch-relevant (one call site today; cost exposure is trivial at SAL volume). When ForgeLens lands, implement a model-router in the OpenRouter client keyed by task type (`rules-qa`, `image-extract`, …), each with its own model + fallback. Tracked as a lab-salbot issue (F-15). |

---

## 4. Findings Register

Severity: P0 catastrophic · P1 league-state correctness · P2 recoverable/operator burden · P3 quality.

| ID | Sev | Repo | Finding | Classification |
|---|---|---|---|---|
| F-01 | P1 | sal-site | **Standings never auto-recalculate; UI claims they do.** Only trigger is the Admin → Standings button. `match-reports/[id]/submit/route.ts:6` imports `recalculateAndPersistStandings` and never calls it; `api/admin/matches` doesn't call it; bot approval doesn't touch standings. `AdminMatchesClient.tsx:225` says "Saving a completed match will immediately recalculate standings" — false. Fix: wire the call into both completion routes + correct the copy. | Must fix before season (S) |
| F-02 | P1 | both | **No duplicate/staleness guard on official results.** `/report-result` creates a second approvable `pending_actions` row for the same match; `completeMatch`/`rescheduleMatch` (`packages/db/queries/matches.ts`) update unconditionally — no `status='scheduled'` precondition — so a late approval silently overwrites corrected results. Fix: partial unique index on pending match results (sal-site migration, per D-1) + status precondition in the bot's `completeMatch`/`rescheduleMatch` + friendly duplicate error in `/report-result`. | Must fix before season (S) |
| F-03 | P1 | sal-site | **Production serves mock league data on Supabase failure.** `fetchLeagueData` returns `MOCK_LEAGUE_DATA` when env is missing *and on query errors* (`league-data.ts:226,247,253,291,306,327,333`). An outage renders fabricated standings with no operator signal. Fix: gate mock to non-production; render explicit "data unavailable" state. | Must fix before season (S) |
| F-04 | P1 | both | **Split, manually-applied migrations already drifted in production** (see D-1 evidence). Fix now: decision recorded (D-1) + apply-runbook + parity check. Consolidation post-season. | Decision now; consolidation post-season |
| F-05 | P2 | sal-site | **Shared-password super-admin fallback**: timing-safe and rate-limited, but the limiter is per-instance in-memory (Vercel) and audit rows attribute to `"password-admin"` (non-attributable). Mitigation: D-3 (unset at launch). | Operational mitigation |
| F-06 | P2 | lab-salbot | **In-memory bot workflow state + no process handlers.** Preview tokens, proof counters, recap-dedupe set are memory-only; no `SIGTERM`/`unhandledRejection` handlers (Node ≥15 exits on unhandled rejection). No data-corruption path found; losses are re-doable/cosmetic. Fix: ~10 lines of process handlers. Durable state: **rejected pre-season** (complexity ≫ benefit at usage frequency). | Stabilization week (XS) |
| F-07 | P2 | both | **Two divergent stat pipelines** (see D-2). Bot pipeline feeds everything public; site match-report stats go to a table nothing reads. | Decision now (D-2); unify post-season |
| F-08 | P2 | lab-salbot | **Test posture allowed an outage-severity bug to ship**: the PostgREST `count` misuse broke every approval button in production (fixed + regression-tested in PR #21, 2026-07-14). `--passWithNoTests` on bot/forgelens. Smallest high-value additions: precondition tests once F-02 lands + `channels.ts` mapping test. No coverage targets. | Strongly recommended (S) |
| F-09 | P1? | ops | **Backup/PITR unverified.** All league state + both audit trails live in one Supabase project. Verify plan/backups in dashboard + one restore drill to a scratch project. | **Launch blocker until verified** (XS–S) |
| F-10 | P2 | lab-salbot | **`/update-ign` is registered with an empty handler** — invoking it shows "This interaction failed." Fix: unregister from `deploy-commands.ts` or 3-line "not yet available" reply. | Must fix before season (XS) |
| F-11 | P3 | sal-site | Anonymous `registrations` INSERT is unthrottled cross-instance (per-instance limiter). Approval gate contains it. Monitor only. | No action |
| F-12 | P3 | sal-site | Supabase advisor smalls: 5 functions with mutable `search_path` (pin, pattern exists in migration 019); public bucket listing on `match-screenshots` (evidence is public by design — accept). | Stabilization week (XS) |
| F-13 | P3 | lab-salbot | Possible dual-instance window during Railway deploys (duplicate receipt/recap posts; approvals protected by atomic claim). Verify Railway restart policy; no code pending verification. | Verify only |
| F-14 | P3 | lab-salbot | Startup validates only 5 env vars; channel IDs fail lazily at first use (now at least user-visible via `UserFacingError`). Extend startup validation with warnings. | Stabilization week (XS) |
| F-15 | P3 | lab-salbot | **Single-model LLM configuration** — one `OPENROUTER_MODEL` serves all (currently one) LLM call sites; `/rules` uses a multimodal-capable model for plain-text ruleset Q&A. Owner direction recorded as D-4: per-use-case model routing (cheap/free text model for rules retrieval; multimodal reserved for image parsing when ForgeLens lands). | Post-season / with ForgeLens (S–M) |

### Verified strengths (no action — do not "fix")
- Authorization: all `/api/admin/*` routes guarded (sweep-verified); admin pages guarded; captain flows token/identity-gated; god-draft actions actor-checked (`requireSessionActor`).
- Sessions/OAuth: HMAC-SHA256 cookies, timing-safe comparisons, state validation, httpOnly/lax/secure.
- Identity: immutable Discord ID authoritative everywhere post-bootstrap; username matching is one-time, exact-match, conflict-refusing.
- DB integrity: unique ign/org constraints, single-active-season index, `season_id NOT NULL`, atomic RPCs, INSERT-only dual audit trails.
- Registration approval creates/links the player record (verified — the old concern is fixed).
- CI (site): lint, typecheck, secret-leak grep, unit, integration, e2e, build, lighthouse.

---

## 5. Minimum Viable Launch Plan

**Phase 0 — Decisions (½ day, done in this document):** D-1, D-2, D-3 recorded above. D-4 recorded (post-season).

**Phase 1 — Critical corrections (1–1.5 days):** F-01, F-02, F-03, F-10 + minimal tests (F-08).

**Phase 2 — Deployment & recovery (½–1 day):** F-09 backup verification + restore drill; migration parity check; Vercel env review (no `E2E_TEST_MODE`; `ADMIN_PASSWORD` unset after onboarding); Railway deploy-mode verification (F-13); one live end-to-end approval verification.

**Phase 3 — Stabilization (post-launch week):** F-06, F-14, F-12; recap-dedupe restart check.

### Proposed PR sequence
1. sal-site: wire standings recalc into completion paths + fix dialog copy (F-01).
2. sal-site: migration `022` partial unique index on pending match results (F-02a).
3. lab-salbot: status preconditions in `completeMatch`/`rescheduleMatch` + duplicate-friendly error + tests (F-02b, after 2).
4. sal-site: production-gate mock data (F-03).
5. lab-salbot: unregister `/update-ign` (F-10).
6. lab-salbot: process-level handlers (F-06, stabilization).

---

## 6. Go/No-Go Checklist

- [ ] All 12 required Vercel env vars set (everything except `ADMIN_PASSWORD` — see next item); `E2E_TEST_MODE` absent from production env
- [ ] All real admins in `admin_users` via OAuth; `ADMIN_PASSWORD` deliberately **unset** in Vercel once onboarding is confirmed (D-3) — do not carry it forward from a previous env just because it's "one of the 13"
- [ ] Migration parity: repo sequence matches `supabase_migrations.schema_migrations` in prod
- [ ] Backups verified + one restore drill completed (F-09)
- [ ] Claim → registration → approval → player-row verified live
- [ ] `/division-role-config list` shows all three mappings; bot role above division roles
- [ ] `/report-result` → approve → standings → public page verified end-to-end once
- [ ] Duplicate submission behaves per F-02 fix
- [ ] Bot restart mid-preview handled (re-run preview works)
- [ ] Vercel instant-rollback tested once; Railway redeploy tested once
- [ ] `DISCORD_ERROR_WEBHOOK_URL` firing
- [ ] Runbooks linked in the admin Discord channel

## 7. Operator Smoke Test (~90 min)

1 Player Discord login · 2 claim existing profile · 3 new registration · 4 approve → player row exists · 5 CSV import 3 players · 6 assign to org · 7 `/division-sync preview` (one good row, one duplicate username, one non-member) · 8 `apply` → roles + audit rows · 9 duplicate reported as conflict · 10 non-member reported · 11 drop bot role below a division role → apply → friendly failure · 12 restore hierarchy → retry succeeds · 13 create match · 14 captain `/report-result` · 15 upload 2 screenshots, watch counter · 16 Approve → receipt ✅, thread archived, DM, audit · 17 standings recalc → `/standings` correct · 18 public site refresh · 19 second Approve press → "already processed" · 20 score correction per runbook (incl. `winner_org_id` note) · 21 bot restart → `/help` works, preview re-run works · 22 site redeploy → sessions survive · 23 backup timestamp verified · 24 restore drill to scratch project.

## 8. Unknowns Requiring Runtime Verification

| ID | Unknown | Blocks launch? |
|---|---|---|
| U-1 | Approval buttons verified live once post-fix (PR #21) | Yes (one click) |
| U-2 | Supabase backup/PITR configuration | Yes |
| U-3 | Railway deploy overlap behavior | No |
| U-4 | `god_draft_sessions` replica identity (recap dedupe after restart) | No |
| U-5 | Vercel prod env values (`E2E_TEST_MODE` absent, etc.) | Yes (checklist) |
| U-6 | Dependency advisories (Next 16.2.6 / React 19.2.6 / discord.js 14.26.4) — run `npm audit`/`pnpm audit`; no claims made without it | No |
| U-7 | Season rollover procedure (players/orgs/standings have no season dimension) | No — post-season design item |

## 9. Improvements Explicitly NOT Recommended (pre-season)

Durable bot workflow storage · website approval queue · splitting the Supabase project · generated-DB-types adoption · Redis rate limiting · queues/event buses/microservices · multi-guild support · framework upgrades · coverage mandates · building `apps/web` or ForgeLens before the season.
