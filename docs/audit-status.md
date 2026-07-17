# SAL Site Audit Status

**Repository:** `diese-tech/sal-site`  
**Audit baseline:** `8096b1498c5aac9aa4b84044fee7df4a045af538`  
**Remediation main:** `73824f977c7f3f298a194ea4b004b8fc58215b71`  
**Last refreshed:** 2026-07-17

This file tracks repository-specific SAL Site findings and their GitHub issues.
It does not replace the issue tracker, claim platform-wide authority, or record
comparison-system security details. The July 14 cross-repository audit is retained
only as a [historical snapshot](audit-production-readiness-2026-07-14.md).

## Repository boundary

- This repository owns the Next.js league site deployed on Vercel.
- `diese-tech/lab-salbot` owns the separately deployed Discord bot application.
- `diese-tech/sal-database` is the approved sole owner for shared Supabase
  migrations, generated types, contract releases, drift detection, and production
  database pushes. Creation and safe baseline adoption are tracked in
  [#172](https://github.com/diese-tech/sal-site/issues/172). The recovery gate has
  not passed and no `db-v1.0.0` release is claimed here.

## Audit-baseline verification

The following historical results were recorded from a clean checkout of the audit
baseline above. They explain why the linked remediation work was opened; they are
not claims about current `main`.

| Check | Result |
|---|---|
| ESLint | Failed: 4 errors and 17 warnings; remediation tracked in [#171](https://github.com/diese-tech/sal-site/issues/171) |
| TypeScript | Passed: `npx tsc --noEmit` |
| Unit tests | Passed: 177 passed; 26 skipped |
| Production build | Passed: Next.js 16.2.6 build completed |
| Dependency audit | 0 critical, 1 high, 1 moderate, 2 low; remediation tracked in [#174](https://github.com/diese-tech/sal-site/issues/174) |
| Whitespace | Passed: `git diff --check` |

## Remediation evidence on `main`

- [PR #180](https://github.com/diese-tech/sal-site/pull/180) removed the four lint
  errors and made lint a hard CI gate.
- [PR #181](https://github.com/diese-tech/sal-site/pull/181) removed all
  high/critical dependency findings. The production audit reports zero
  vulnerabilities.
- [PR #183](https://github.com/diese-tech/sal-site/pull/183) moved CI and runtime
  metadata to Node 24 and added hard dependency-audit and secret-scan jobs.
  [CI run 29559761957](https://github.com/diese-tech/sal-site/actions/runs/29559761957)
  and [Lighthouse run 29559761980](https://github.com/diese-tech/sal-site/actions/runs/29559761980)
  passed. E2E recorded 324 passed and 1 skipped.
- RLS is not closed: the successful integration job recorded 29 non-RLS tests
  passed and all 26 RLS tests skipped because database credentials were absent.
  The hard local-database and contract gates remain recovery-gated.

## Findings and work items

| Finding | Current risk or gap | Tracking |
|---|---|---|
| `SAL-OPS-01` | Backup retention, PITR, and a representative scratch restore remain unverified. This is a launch and database-consolidation gate. | [#156](https://github.com/diese-tech/sal-site/issues/156) |
| `SAL-DB-01` | The pre-v1 site and bot migration sequences cannot reproduce the shared database. Establish the sole database repository, then pin its immutable contract in the site. | [#172](https://github.com/diese-tech/sal-site/issues/172), [#175](https://github.com/diese-tech/sal-site/issues/175) |
| `SAL-OPS-02` | Approval decisions, audit writes, domain mutations, projections, and standings recalculation are not yet one recoverable, idempotent workflow. | [#176](https://github.com/diese-tech/sal-site/issues/176), [#178](https://github.com/diese-tech/sal-site/issues/178), [#179](https://github.com/diese-tech/sal-site/issues/179) |
| `SAL-CI-01` | Lint, dependency, secret-scan, and Node 24 gates are on `main`. Deterministic local RLS and database-contract checks remain blocked by the recovery/baseline sequence. | [#171](https://github.com/diese-tech/sal-site/issues/171), [#173](https://github.com/diese-tech/sal-site/issues/173), [#174](https://github.com/diese-tech/sal-site/issues/174) |
| `SAL-RUNTIME-01` | Node 24 runtime metadata and CI landed in [#183](https://github.com/diese-tech/sal-site/pull/183); keep the issue open only for its database-backed CI remainder. | [#173](https://github.com/diese-tech/sal-site/issues/173) |
| `SAL-GOV-01` | This repository-specific status, ownership, licensing, security-reporting, and dependency-update policy is supplied by [#182](https://github.com/diese-tech/sal-site/pull/182); remote protection is already verified. | [#177](https://github.com/diese-tech/sal-site/issues/177) |
| Historical `F-05` / `D-3` | The shared password administrator fallback remains enabled until OAuth administrator onboarding is confirmed. | [#155](https://github.com/diese-tech/sal-site/issues/155) |

## Release gates

Database baseline adoption and consumer-contract work must stop until
[#156](https://github.com/diese-tech/sal-site/issues/156) records a complete,
consistent restore drill. After that gate, work proceeds through
[#172](https://github.com/diese-tech/sal-site/issues/172) and only then
[#175](https://github.com/diese-tech/sal-site/issues/175). Transactional approval,
outbox, standings-idempotency, and historical reconciliation work remains ordered
through [#178](https://github.com/diese-tech/sal-site/issues/178),
[#176](https://github.com/diese-tech/sal-site/issues/176), and
[#179](https://github.com/diese-tech/sal-site/issues/179).

Issue state and acceptance evidence belong on the linked GitHub issue or pull
request; this page records the repository boundary and dependency order.
