# Continuous integration

The site uses Node.js 24 LTS in local runtime metadata, GitHub Actions, and the
Lighthouse workflow. Pull requests must keep lint, typecheck, unit, build,
Playwright E2E, and Lighthouse checks green; RLS integration currently reports
an advisory signal. CI also blocks high- or critical-severity dependency
advisories and scans Git history for credentials.

## Current database signal

The existing RLS integration job remains advisory. It uses the configured
non-production `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
skips when those values are unavailable, and retains `continue-on-error`.
Making a live, IP-allowlisted project a required check would create a flaky
external gate and would fail forks or Dependabot pull requests that cannot read
repository secrets. Production database credentials must never be supplied to
this job.

## Recovery-gated follow-up

CI deliberately does **not** derive a local database from either application's
current migration folder. An ephemeral local Supabase reset, database lint,
RLS assertions, generated-type verification, and database-contract drift check
can be added only after all of the following are true:

1. the restore drill in [#156](https://github.com/diese-tech/sal-site/issues/156)
   has passed;
2. the canonical baseline tracked by
   [#172](https://github.com/diese-tech/sal-site/issues/172) has been reconciled
   and released by `diese-tech/sal-database`; and
3. the site has pinned and vendored that immutable contract under
   [#175](https://github.com/diese-tech/sal-site/issues/175).

Until then, adding an active local baseline or contract check here could bless
known schema drift. This gate is intentional and must not be bypassed by
copying either legacy migration sequence into CI. Removing
`continue-on-error` is part of that follow-up, after the suite runs against the
ephemeral canonical database instead of an external allowlisted project.
