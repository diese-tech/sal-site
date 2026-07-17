# Contributing

## PR conventions

- **One issue per PR.** If you're closing multiple issues, open multiple PRs. Agents work them sequentially.
- **Database changes belong in `diese-tech/sal-database` and get their own PR.**
  Do not add or push a shared-database migration from this application repository.
  The designated database repository and recovery-gated v1 baseline are tracked
  in [#172](https://github.com/diese-tech/sal-site/issues/172). See
  [`supabase/migrations/README.md`](supabase/migrations/README.md) for the status
  of the pre-v1 files retained here.
- **Security fixes get their own PR** so they can be reviewed and reverted independently.
- **Title format:** `type(scope): summary (#issue)`, where `type` is `feat`/`fix`/`refactor`/`docs`/`chore` and `scope` is e.g. `draft`, `auth`, `standings`, `migrations`.
- **Reference the issue** in the PR body with `Closes #N` — exactly one per PR.

These exist because bundled PRs (see #147) make `git bisect` ambiguous and reviews shallow.
