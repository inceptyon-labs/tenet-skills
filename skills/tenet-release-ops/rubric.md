# Tenet Release Operations — Rubric

## Scoring

`score = max(0, min(100, int(raw + 0.5)))`, where `raw = 100 - 5*critical - 2*major - 0.5*minor`.

## Finding Categories

| Check | Severity | Confidence |
|---|---|---|
| Production deploy bypasses CI/review | critical | native / heuristic |
| No rollback path for stateful production deploys | critical-major | heuristic |
| Required runtime config missing from deploy docs/config | major | native |
| No smoke test or release validation | major | native / heuristic |
| No immutable release artifact/version | major | native / heuristic |
| Critical-path changes lack flag/kill switch | major | heuristic |
| Runbook missing or incomplete | major-minor | heuristic |
| Flag cleanup/version automation docs missing | info | heuristic |

## Metrics

- `deployment_workflow_count`
- `has_rollback_doc`
- `has_smoke_test`
- `has_feature_flag_system`
- `runtime_config_gap_count`
- `has_runbook`
