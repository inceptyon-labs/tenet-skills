---
name: tenet-database-migrations
description: "Audits migration safety: destructive changes, indexes, rollbacks, transactions, locks, and backfills."
when_to_use: "tenet database-migrations, tenet-database-migrations dimension, Tenet database migration safety audit. Run via /tenet-skills:tenet-orchestrator or directly with /tenet-skills:tenet-database-migrations."
model: sonnet
disable-model-invocation: true
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Database Migrations

Audits database evolution risk. This catches schema changes that can break production data, lock large tables, or leave the app unable to roll back safely.

## Calibration — read first

Follow `shared/scan-discipline.md` (complete every step, enumerate rather than sample, and §2a:
report only issues that actually exist), `shared/verification.md` (every finding is confirmed
against the code before it ships; unconfirmed candidates are dropped, not demoted), and
`shared/severity.md` (severity is confirmed impact, never a hedge for doubt).

A finding must exist in this codebase on a path that can run. Do not report hypotheticals, dead
code, style preferences, or anything an upstream check already prevents. Zero findings for a step
is the normal result on healthy code; do not fill a step to show you looked. Do not overthink it:
read the code and its context, decide, move on.

## Language Support Matrix

```yaml
support:
  native: [sql, typescript, javascript, python, go, ruby]
  heuristic: [java, csharp, php]
  config-only: [yaml, json]
```

## Procedure

### Step 0: Detect Applicability

Applicable when the repo contains migrations or schema files:
- `migrations/`, `db/migrate/`, `prisma/schema.prisma`, `drizzle`, `knex`, `typeorm`, `sequelize`, Alembic, Django migrations, Rails migrations, Flyway, Liquibase

If no database schema/migration files exist, write `score: null`, `applicable: false`.

### Step 1: Destructive Operations

Scan migrations for:
- `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, destructive `ALTER TYPE`, `DELETE FROM` without `WHERE`
- column type narrowing, `NOT NULL` additions without defaults/backfills

Severity:
- `critical`: destructive production data operation with no backup/rename/dual-write plan
- `major`: potentially locking/destructive migration with no phased rollout note
- `minor`: destructive operation appears limited to test/dev schemas

### Step 2: Indexes, Constraints, and Query Shape

Check schemas and migrations for:
- Foreign keys without indexes on high-use relations
- Unique constraints missing for natural keys used in lookups
- Nullable columns used as required app fields
- Missing `ON DELETE` behavior for dependent rows

Severity:
- `major`: likely production query or integrity issue
- `minor`: localized or low-confidence gap

### Step 3: Transaction and Lock Safety

Look for migration frameworks and whether migrations run in transactions. Flag long-lock operations:
- `CREATE INDEX` without `CONCURRENTLY` on Postgres large tables
- adding columns with volatile defaults
- large backfills in a single transaction

Severity:
- `major`: long lock or large backfill can cause outage
- `minor`: transaction behavior unclear

### Step 4: Rollback and Backup

Check down migrations, rollback files, backup notes, and release runbooks.

Severity:
- `major`: irreversible migration lacks backup/rollback/runbook
- `minor`: rollback exists but is incomplete or untested
- `info`: backup policy exists but not linked from migration docs

### Step 5: Seed and Fixture Safety

Flag production migrations that insert fake/default users, reset passwords, or seed broad permissions.

Severity:
- `critical`: default admin credentials or production privilege grants
- `major`: seed data mutates production behavior unexpectedly

### Step 6: Compile and Score

Every finding uses:
- `dimension: "database-migrations"`
- `confidence: "native"` for parsed SQL/framework migrations, `heuristic` for grep-only checks
- fix_prompts following `shared/fix_prompt_template.md`
- Every `fix_prompt` Location section MUST include `- File:`, `- Line:`, and `- Dimension:` entries
- Use `Line: N/A` in the `fix_prompt` and top-level `line: null` for schema-level or migration-policy gaps without an exact source line

## Output

- `.healthcheck/reports/database-migrations.json`

## Constraints

- Do not flag generated migration snapshots as problems unless they contain dangerous operations.
- Consider framework conventions; for example, Rails/Django generated down migrations can be acceptable if reversible.
- Prefer phased migration advice: expand, backfill, dual-read/write, contract.
