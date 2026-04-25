# Tenet Complexity — Rubric

## Scoring Formula

```
score = 100 - (5 × critical + 2 × major + 0.5 × minor)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding, not banker's rounding
```

Info findings do NOT affect the score.

## Finding Thresholds

### Cyclomatic Complexity per Function

| Range | Severity | Score Impact |
|---|---|---|
| 1-9 | (pass) | 0 |
| 10-14 | minor | -0.5 each |
| 15-19 | major | -2 each |
| >= 20 | critical | -5 each |

### Cognitive Complexity per Function

| Range | Severity | Score Impact |
|---|---|---|
| 1-14 | (pass) | 0 |
| 15-24 | minor | -0.5 each |
| 25-39 | major | -2 each |
| >= 40 | critical | -5 each |

### Max Nesting Depth per Function

| Depth | Severity | Score Impact |
|---|---|---|
| 1-3 | (pass) | 0 |
| 4 | minor | -0.5 each |
| 5 | major | -2 each |
| >= 6 | critical | -5 each |

### File Length

| Lines | Severity | Score Impact |
|---|---|---|
| 1-499 | (pass) | 0 |
| 500-999 | minor | -0.5 each |
| >= 1000 | major | -2 each |

Note: Test files (`*.test.*`, `*.spec.*`, `*_test.*`, `test_*.*`) are exempt from file-length findings.

### Function Length

| Lines | Severity | Score Impact |
|---|---|---|
| 1-49 | (pass) | 0 |
| 50-99 | minor | -0.5 each |
| >= 100 | major | -2 each |

### Info Observations (no score impact)

| Condition | Reported As |
|---|---|
| Cyclomatic complexity 8-9 | info: approaching complexity threshold |
| File length 400-499 lines | info: approaching file length threshold |
| Function length 40-49 lines | info: approaching function length threshold |
| Complex conditional replaceable with lookup | info: simplification opportunity |

## Deduplication Rules

- If both cyclomatic and cognitive complexity exceed thresholds for the same function, emit both findings but only count the higher severity once toward the score.
- If a function exceeds both nesting depth and cyclomatic complexity thresholds, emit both findings; both count toward the score (they measure different things).
- If toolchain output and heuristic analysis both cover the same function, use only the toolchain result.

## Confidence Mapping

| Detection Method | Confidence Tag |
|---|---|
| eslint `complexity` rule | `deterministic` |
| radon cyclomatic output | `deterministic` |
| gocyclo output | `deterministic` |
| Skill's own JS/TS/Python parsing | `native` |
| Tree-sitter AST for Go/Rust/Java/etc. | `tree_sitter` |
| Keyword counting fallback | `heuristic` |

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/complexity.json` | Valid JSON, matches dimension schema, score 0-100 integer |
| All findings | Each has `dimension`, `severity`, `title`, `description`, `file`, `line`, `fix_prompt`, `confidence` |
| Metrics object | Contains `total_functions_analyzed`, `avg_cyclomatic_complexity`, `max_cyclomatic_complexity` at minimum |

## Edge Cases

- **Empty repository or no source files:** Set `score: null`, `applicable: false`.
- **Only generated/vendored code:** Set `score: null`, `applicable: false`, note in `notes`.
- **Mixed toolchain/heuristic coverage:** Report both, tag confidence accordingly, prefer deterministic when overlapping.
- **Findings cap exceeded (>50):** Keep all critical, then major, then minor, then info. Add an info finding noting omitted count.
