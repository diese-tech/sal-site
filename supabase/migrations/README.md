# Pre-v1 migration evidence

This directory is not the canonical migration sequence for the shared SAL
database. The historical site sequence and the historical SALbot sequence are
interdependent and cannot reproduce the current production schema from an empty
database. Do not concatenate them, renumber them, or use them as a blank-database
bootstrap.

[`diese-tech/sal-database`](https://github.com/diese-tech/sal-database) is the
approved sole owner for Supabase configuration, active migrations, generated
types, contract releases, drift detection, and production pushes. Establishing
that repository and its canonical baseline is tracked in
[#172](https://github.com/diese-tech/sal-site/issues/172).

## Current gate

The initial `db-v1.0.0` release does not yet exist. Baseline capture and production
ledger adoption must not begin until
[#156](https://github.com/diese-tech/sal-site/issues/156) records a complete,
consistent restore drill. That gate protects the only shared production database
from an unrecoverable consolidation error.

Until both application consumers pin the verified v1 contract:

- retain these files unchanged as pre-v1 transition evidence;
- do not add new shared-schema migrations to this application repository;
- do not run production database pushes from this repository;
- scope every new schema change to an isolated `sal-database` issue and PR; and
- use the exported historical ledger plus this directory during reconciliation,
  without treating either as a reproducible baseline.

After both consumers pin v1, this directory can move to an explicitly archived
location. The immutable `sal-database` release and each consumer's verified lock
manifest will then define the shared schema contract.
