# Tenet Infrastructure & Cloud — Rubric

## Scoring

`score = max(0, min(100, int(raw + 0.5)))`, where `raw = 100 - 5*critical - 2*major - 0.5*minor`.

## Finding Categories

| Check | Severity | Confidence |
|---|---|---|
| Public database/cache/admin exposure | critical | deterministic / native |
| IAM admin or wildcard action/resource in production role | critical-major | deterministic / native |
| Secrets embedded in IaC | critical | deterministic / heuristic |
| Production datastore lacks encryption/backup/deletion protection | major | native |
| Kubernetes privileged/host access | critical-major | deterministic / native |
| Missing resource limits/probes/network policy | major-minor | native |
| Critical infrastructure documented as manual setup only | major | heuristic |

## Metrics

- `iac_file_count`
- `public_exposure_count`
- `iam_wildcard_count`
- `unencrypted_resource_count`
- `kubernetes_manifest_count`
- `toolchain_findings_imported`
