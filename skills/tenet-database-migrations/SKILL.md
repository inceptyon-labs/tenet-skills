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

Also applicable when an app keeps a local database on the user's device (SwiftData, Core Data,
Room, sqflite, Drift, GRDB). Those have migrations too, and a bad one loses user data with no
server-side backup.

```bash
git ls-files -- '*migrations/*' '*migrate/*' '*.prisma' '*drizzle*' '*alembic*' '*.sql' '*.xcdatamodeld/*' | head -60
git grep -lP "VersionedSchema|SchemaMigrationPlan|ModelContainer\(|NSPersistentContainer\(|NSPersistentCloudKitContainer\(|@Database\(|RoomDatabase|onUpgrade\s*[:(]|openDatabase\(|schemaVersion|MigrationStrategy" -- '*.swift' '*.kt' '*.java' '*.dart'
```

If both are empty, write `score: null`, `applicable: false`.

**Identify the engine** (Postgres, MySQL, SQLite, D1, a device store) from the driver, the
connection string and the migration dialect, and record it in `notes`. Several checks below apply
to one engine only.

**Project scale.** Classify the project per `shared/project-scale.md` before scoring anything. Findings
marked *(scaled)* below are `info` at `solo` scale and keep the listed severity at `team` scale.


### Step 1: Destructive Operations

```bash
git grep -nPi "\b(DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)|TRUNCATE\b|ALTER\s+TABLE\s+\S+\s+DROP\b|ALTER\s+COLUMN\s+\S+\s+(TYPE|SET\s+NOT\s+NULL)|DELETE\s+FROM\s+[\w.\"]+\s*;|dropTable|dropColumn|removeColumn|remove_column|drop_table|DeleteModel|RemoveField)" -- '*.sql' '*migration*' '*migrate*' '*alembic*' '*drizzle*'
```

For each hit, check whether the application code still reads what is being removed
(`git grep` the table or column name outside the migrations). A drop of something the code no
longer references, after an earlier release stopped using it, is the correct last step of a phased
change and is not a finding.

Scan migrations for:
- `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, destructive `ALTER TYPE`, `DELETE FROM` without `WHERE`
- column type narrowing, `NOT NULL` additions without defaults/backfills

Severity:
- `critical`: a migration removes or narrows data the current code still reads or writes
- `major`: destructive or type-narrowing migration with no phased rollout note *(scaled)*
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
- `CREATE INDEX` without `CONCURRENTLY` on a Postgres table the repo shows is high-volume (events, logs, messages, or a table the docs size). Postgres only: SQLite, D1 and MySQL have no `CONCURRENTLY`, so never raise this for them
- adding columns with volatile defaults
- large backfills in a single transaction

Severity:
- `major`: long lock or large backfill can cause outage
- `minor`: transaction behavior unclear

### Step 4: Rollback and Backup

Check down migrations, rollback files, backup notes, and release runbooks.

Severity:
- `major`: irreversible migration lacks backup/rollback/runbook *(scaled)*
- `minor`: rollback exists but is incomplete or untested
- `info`: backup policy exists but not linked from migration docs

### Step 5: Seed and Fixture Safety

Flag production migrations that insert fake/default users, reset passwords, or seed broad permissions.

Severity:
- `critical`: default admin credentials or production privilege grants
- `major`: seed data mutates production behavior unexpectedly

### Step 5b: On-Device Stores (SwiftData, Core Data, Room, sqflite, Drift)

Skip when Step 0 found no device store. A failed migration here cannot be fixed from a server:
the user's only copy is the one being migrated.

```bash
git grep -nP "fallbackToDestructiveMigration|destroyPersistentStore|removeItem\(at:|deleteDatabase\(|recreateAll|deleteTable\(|ModelContainer\(|NSPersistentContainer\(|NSPersistentCloudKitContainer\(|cloudKitDatabase" -- '*.swift' '*.kt' '*.java' '*.dart'
git grep -nP "@Attribute\(\.unique\)|@Attribute\(originalName|VersionedSchema|SchemaMigrationPlan|MigrationStage\." -- '*.swift'
git grep -nP "version:\s*\d+|schemaVersion|onUpgrade|onCreate|@Database\(|addMigrations\(" -- '*.dart' '*.kt' '*.java'
```

Read each hit and report only these:

- **Destructive fallback.** The store is deleted and recreated when it fails to open or migrate:
  Room's `fallbackToDestructiveMigration()`, a `catch` that removes the store file and builds a
  fresh `ModelContainer` or persistent container, Drift or sqflite code that drops and recreates
  tables in `onUpgrade`. Every user loses their data on the next schema change that fails.
- **Version raised with no upgrade path.** sqflite or Drift `version`/`schemaVersion` above 1 with
  no `onUpgrade` covering the step from the previous version; a Room `version` bump with no
  matching `Migration` and no auto-migration. Existing installs keep the old tables and crash on
  the first query for a new column.
- **SwiftData change that is not a lightweight migration**, with no `SchemaMigrationPlan`:
  a property renamed without `@Attribute(originalName:)`, a type changed, or an optional made
  required with no default. Confirm from `git log -p` on the model file that the shipped schema
  differs. The container fails to load for existing users.
- **CloudKit-synced SwiftData or Core Data model that CloudKit cannot hold**: a unique constraint
  (`@Attribute(.unique)`), a non-optional property with no default, or a non-optional
  relationship, in a model whose container is configured for CloudKit. Sync fails for that model.

Severity:
- `critical`: destructive fallback on a store holding data the user created and cannot get back
- `major`: destructive fallback on a store that is a rebuildable cache of server data; a version
  raised with no upgrade path; a non-lightweight SwiftData change with no migration plan; a model
  CloudKit cannot hold
- `minor`: `fatalError` as the only handling when the container fails to load

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
