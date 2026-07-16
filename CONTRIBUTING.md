# Contributing

## PR conventions

- **One issue per PR.** If you're closing multiple issues, open multiple PRs. Agents work them sequentially.
- **Migrations get their own PR.** Never bundle a migration with application code unless the migration is meaningless without that code. See [`supabase/migrations/README.md`](supabase/migrations/README.md) for how to write and apply one.
- **Security fixes get their own PR** so they can be reviewed and reverted independently.
- **Title format:** `type(scope): summary (#issue)`, where `type` is `feat`/`fix`/`refactor`/`docs`/`chore` and `scope` is e.g. `draft`, `auth`, `standings`, `migrations`.
- **Reference the issue** in the PR body with `Closes #N` — exactly one per PR.

These exist because bundled PRs (see #147) make `git bisect` ambiguous and reviews shallow.
