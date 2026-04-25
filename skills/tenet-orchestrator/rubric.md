# Tenet Orchestrator — Rubric

This skill does not produce its own findings. It aggregates findings from specialist skills.

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/final-report.json` | Valid JSON, matches report schema |
| Final report findings | Every finding has a `fix_prompt` with `## Location`, `- File:`, `- Line:`, and `- Dimension:` entries matching the top-level finding fields |
| `.healthcheck/reports/previous-report.json` | Prior run preserved for delta |
| Summary table | Printed to stdout with all dimensions |
| Dashboard upload | POST succeeds or payload saved for retry |

## Scoring

The orchestrator computes the composite score as:

```
composite = sum(score_i × weight_i) / sum(weight_i)  for all applicable dimensions
```

## fix_prompts

All findings and fix_prompts come from specialist skills. The orchestrator does not invent findings, but it must reject or structurally normalize malformed `fix_prompt`s before upload so every final finding satisfies `shared/fix_prompt_template.md`.
