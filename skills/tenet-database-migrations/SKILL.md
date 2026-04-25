---
name: tenet-database-migrations
description: "Audits database schema and migration safety: destructive migrations, missing indexes/constraints, rollback strategy, backup requirements, transaction use, long-lock operations, and data backfill risk."
when_to_use: "Database migration audit, schema review, migration safety, index check, rollback planning, data backfill, tenet database-migrations"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Database Migrations

Audits database evolution risk. This catches schema changes that can break production data, lock large tables, or leave the app unable to roll back safely.

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

## Output

- `.healthcheck/reports/database-migrations.json`

## Constraints

- Do not flag generated migration snapshots as problems unless they contain dangerous operations.
- Consider framework conventions; for example, Rails/Django generated down migrations can be acceptable if reversible.
- Prefer phased migration advice: expand, backfill, dual-read/write, contract.
