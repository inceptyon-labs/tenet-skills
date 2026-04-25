# Tenet Database Migrations — Rubric

## Scoring

`score = max(0, min(100, int(raw + 0.5)))`, where `raw = 100 - 5*critical - 2*major - 0.5*minor`.

## Finding Categories

| Check | Severity | Confidence |
|---|---|---|
| Destructive data operation without backup/rollout plan | critical | native / heuristic |
| Default admin credentials or privilege seed | critical | native |
| Long-lock migration on production table | major | native / heuristic |
| Irreversible migration lacks rollback/runbook | major | heuristic |
| Missing FK/index/unique constraint likely to affect production | major-minor | native |
| Large backfill in one transaction | major | native / heuristic |
| Incomplete rollback/down migration | minor | native |

## Metrics

- `migration_file_count`
- `destructive_operation_count`
- `rollback_coverage`
- `long_lock_risk_count`
- `missing_index_count`
- `frameworks_detected`
