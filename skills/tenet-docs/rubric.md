# Tenet Docs — Rubric

## Scoring Formula

```
score = 100 - (5 * critical) - (2 * major) - (0.5 * minor)
Floor 0, ceil 100, round to integer.
Info findings do NOT affect the score.
```

## Finding Rules

### README Presence and Completeness

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| DOCS-R001 | No README file found in project root | critical | deterministic |
| DOCS-R002 | README missing overview / introduction (no H1 or substantive opening paragraph) | major | heuristic |
| DOCS-R003 | README missing setup / installation section | major | heuristic |
| DOCS-R004 | README missing usage section | major | heuristic |
| DOCS-R005 | README missing deployment section | minor | heuristic |
| DOCS-R006 | README missing contributing section | minor | heuristic |
| DOCS-R007 | README not modified in >180 days while project has recent commits | info | deterministic |
| DOCS-R008 | markdownlint heading increment violation (MD001) in README | minor | deterministic |
| DOCS-R009 | markdownlint fenced code without language (MD040) in README | minor | deterministic |
| DOCS-R010 | markdownlint multiple H1 headings (MD025) in README | minor | deterministic |
| DOCS-R011 | Other markdownlint violations in README | info | deterministic |

### Inline Documentation Coverage

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| DOCS-I001 | Public API inline doc coverage below 30% | major | native (TS/JS/Python), heuristic (others) |
| DOCS-I002 | Public API inline doc coverage 30-79% (below threshold) | minor | native (TS/JS/Python), heuristic (others) |
| DOCS-I003 | Single file has >5 undocumented public symbols | minor | native (TS/JS/Python), heuristic (others) |
| DOCS-I004 | Public API inline doc coverage above 95% | info | native (TS/JS/Python), heuristic (others) |

### ADR / Decision Log Presence

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| DOCS-A001 | No ADR directory or architecture docs (project has >50 source files) | major | deterministic |
| DOCS-A002 | No ADR directory or architecture docs (project has 10-50 source files) | minor | deterministic |
| DOCS-A003 | ADR directory exists but is empty | minor | deterministic |

### Changelog Presence

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| DOCS-C001 | Versioned project has no changelog | minor | deterministic |
| DOCS-C002 | Non-versioned project has no changelog | info | deterministic |
| DOCS-C003 | Changelog not updated in >90 days while project has recent commits | info | deterministic |

## Severity Justifications

| Severity | Rationale |
|---|---|
| critical | A missing README is the equivalent of a locked front door with no key. No one can onboard. |
| major | Missing core README sections (setup, usage) or severely undocumented public APIs create real friction for every new contributor and consumer. Missing ADRs in large projects lead to repeated architectural debates. |
| minor | Missing secondary README sections (deployment, contributing), moderate doc coverage gaps, and empty ADR directories are quality issues to address when working in that area. |
| info | Stale docs, formatting lint, and positive reinforcement observations. No score impact. |

## Confidence Tiers

| Tier | When Used |
|---|---|
| deterministic | File existence checks, git log dates, markdownlint output |
| native | JSDoc detection in TS/JS, docstring detection in Python |
| heuristic | Comment detection in Go, Rust, Java, and other languages via regex |

## Metrics Emitted

| Metric | Type | Description |
|---|---|---|
| `readme_present` | boolean | Whether a README file exists |
| `readme_sections_found` | string[] | Section keys matched in the README |
| `readme_sections_missing` | string[] | Section keys not found in the README |
| `inline_doc_coverage_pct` | integer | Percentage of public symbols with docs |
| `total_public_symbols` | integer | Count of exported/public symbols scanned |
| `documented_public_symbols` | integer | Count of symbols with doc comments |
| `adr_present` | boolean | Whether an ADR directory or equivalent exists |
| `source_file_count` | integer | Total non-test, non-generated source files |
| `changelog_present` | boolean | Whether a changelog file exists |
| `markdownlint_findings` | integer | Count of markdownlint violations on doc files |

## Output Schema

Written to `.healthcheck/reports/docs.json` conforming to the dimension object in `shared/schema.json`.
