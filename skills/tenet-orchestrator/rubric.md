# Tenet Orchestrator — Rubric

This skill does not produce its own findings. It aggregates findings from specialist skills.

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/final-report.json` | Valid JSON, matches report schema |
| `.healthcheck/reports/previous-report.json` | Prior run preserved for delta |
| Summary table | Printed to stdout with all dimensions |
| Dashboard upload | POST succeeds or payload saved for retry |

## Scoring

The orchestrator computes the composite score as:

```
composite = sum(score_i × weight_i) / sum(weight_i)  for all applicable dimensions
```

## No fix_prompts

All findings and fix_prompts come from specialist skills.
