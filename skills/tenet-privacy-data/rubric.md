# Tenet Privacy & Data — Rubric

## Scoring

`score = max(0, min(100, int(raw + 0.5)))`, where `raw = 100 - 5*critical - 2*major - 0.5*minor`.

## Finding Categories

| Check | Severity | Confidence |
|---|---|---|
| Passwords, tokens, SSNs, payment cards, or health data logged | critical | native / heuristic |
| Sensitive data sent to analytics/error tooling | critical-major | native / heuristic |
| PII stored with no deletion/anonymization path | major | heuristic |
| No visible retention controls for user/event data | major | heuristic |
| User-facing product with no export/access path | major | heuristic |
| Admin PII reads without authorization/audit evidence | major | native / heuristic |
| Partial deletion/export coverage | minor | native / heuristic |
| Missing field-level inventory or retention docs | minor-info | heuristic |

## Metrics

- `pii_field_count`
- `sensitive_log_findings`
- `third_party_sinks`
- `has_deletion_flow`
- `has_export_flow`
- `has_retention_policy`
- `languages_analyzed`
