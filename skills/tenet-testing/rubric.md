# Tenet Testing — Rubric

## Scoring Formula

```
score = 100 - (5 * critical) - (2 * major) - (0.5 * minor)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding, not banker's rounding
```

Info findings do NOT affect the score.

## Finding Categories

### 1. Coverage Percentage

**Source:** `.healthcheck/toolchain/coverage.json` or direct parsing of lcov/cobertura/cover.out.

| Condition | Severity |
|---|---|
| No coverage report exists at all | `major` |
| Line coverage < 30% | `major` |
| Line coverage 30-50% | `minor` |
| Line coverage 50-70% | `info` |
| Line coverage 70-90% | no finding |
| Line coverage > 90% | no finding |
| Branch coverage < 40% when line coverage > 70% | `minor` |

Per-file coverage (if per-file data available):

| Condition | Severity |
|---|---|
| Source file with 0% coverage (non-test, non-config) | `minor` (cap at 10 findings) |
| Critical-path file with < 50% coverage | `major` |

**Confidence:** `deterministic` (when parsed from a coverage report)

### 2. Test-to-Source File Ratio

**Source:** `git ls-files` with language-specific test file patterns.

| Ratio | Severity |
|---|---|
| 0 (no test files at all) | `critical` |
| < 0.2 (fewer than 1 test file per 5 source files) | `major` |
| 0.2 - 0.5 | `minor` |
| 0.5 - 1.0 | no finding |
| > 1.0 | no finding |

Test file patterns by language:
- **JS/TS:** `*.test.{ts,tsx,js,jsx,mjs}`, `*.spec.{ts,tsx,js,jsx,mjs}`, `__tests__/**`
- **Python:** `test_*.py`, `*_test.py`, `tests/**/*.py`
- **Go:** `*_test.go`
- **Java:** `*Test.java`, `*Tests.java`, `*Spec.java`
- **Ruby:** `*_spec.rb`, `*_test.rb`
- **Rust:** `tests/` directory, `#[cfg(test)]` modules
- **C#:** `*Tests.cs`, `*Test.cs`

**Confidence:** `deterministic`

### 3. Critical-Path Test Presence

**Source:** Filename heuristic matching for auth, payment, data mutation, and cryptography modules.

Critical-path categories:
- **Authentication/Authorization:** files matching `auth`, `login`, `session`, `jwt`, `token`, `oauth`, `permission`, `rbac`, `acl`
- **Payment/Billing:** files matching `payment`, `billing`, `charge`, `invoice`, `subscription`, `stripe`, `paypal`, `checkout`, `refund`
- **Data Mutation:** files matching `migration`, `seed`, `import`, `export`, `delete`, `purge`, `mutation`
- **Cryptography:** files matching `crypt`, `hash`, `encrypt`, `decrypt`, `sign`, `verify`, `secret`, `key`

| Condition | Severity |
|---|---|
| Critical-path file with no corresponding test file | `major` |
| Critical-path file with test file but < 50% coverage | `minor` |
| Critical-path file with adequate tests | no finding |

Cap at 15 findings. Aggregate beyond that into a summary finding.

**Confidence:** `heuristic`

### 4. Flaky Test Markers

**Source:** `grep` for skip/focus/flaky patterns across test files.

#### Focus markers (committed .only)

| Condition | Severity |
|---|---|
| `.only`, `fit`, `fdescribe`, `fcontext` committed in test file | `major` |

Always `major` regardless of age.

#### Skip markers

| Condition | Severity |
|---|---|
| `.skip`, `xit`, `xdescribe`, `xcontext`, `@skip`, `@pytest.mark.skip`, `t.Skip()` | `minor` |
| `.skip` without a reason comment | `minor` |
| `.skip` older than 90 days (via git blame) | escalate to `major` |
| 5+ skipped tests in a single file | `major` (systemic issue) |

#### Flaky/retry markers

| Condition | Severity |
|---|---|
| `@flaky`, `@retry`, `.retries()` markers | `info` |
| Timeout overrides > 30 seconds | `info` |

**Confidence:** `deterministic`

### 5. Missing Test Categories

**Source:** Directory structure analysis and framework config detection.

Test categories:
- **Unit:** Standard test files not in integration/e2e directories
- **Integration:** Files in `integration/` directory or containing `integration` in name
- **E2E:** Files in `e2e/`, `end-to-end/` directories; Cypress/Playwright test files
- **Smoke:** Files containing `smoke` in name or directory
- **Performance:** Files containing `perf`, `benchmark`, `load` in name or directory

| Condition | Severity |
|---|---|
| No tests at all | `critical` |
| Has unit tests but no integration tests (project has >10 source files) | `minor` |
| Has unit tests but no E2E tests (project has UI layer: JSX/TSX/Vue/Svelte) | `minor` |
| No integration OR E2E tests (project has API routes or DB access) | `major` |
| No smoke tests (project has deployment config) | `info` |

**Confidence:** `heuristic`

### 6. Test Quality Signals

| Condition | Severity |
|---|---|
| Test file with 0 assertions (empty test bodies) | `major` |
| Test file with only happy-path tests (no error/edge keywords) | `info` |

**Confidence:** `heuristic`

## Metrics Tracked

| Metric | Description |
|---|---|
| `coverage_available` | Whether a coverage report was found |
| `coverage_source` | Format of coverage report (lcov, cobertura, cover.out, none) |
| `line_coverage_pct` | Line coverage percentage (null if unavailable) |
| `branch_coverage_pct` | Branch coverage percentage (null if unavailable) |
| `function_coverage_pct` | Function coverage percentage (null if unavailable) |
| `test_files` | Count of test files |
| `source_files` | Count of non-test source files |
| `test_to_source_ratio` | Ratio of test files to source files |
| `critical_path_files` | Count of critical-path files detected |
| `critical_path_files_tested` | Count of critical-path files with corresponding tests |
| `skip_markers` | Count of skip markers in test files |
| `only_markers` | Count of .only focus markers in test files |
| `flaky_markers` | Count of explicit flaky/retry markers |
| `test_categories_present` | List of test categories detected (unit, integration, e2e, smoke, perf) |
| `test_categories_missing` | List of expected but absent test categories |
| `frameworks_detected` | List of test frameworks found (jest, vitest, pytest, etc.) |
| `zero_coverage_files` | Count of source files with 0% coverage |

## Output

`.healthcheck/reports/testing.json` conforming to the findings schema in `shared/schema.json`.

Every finding includes a `fix_prompt` following `shared/fix_prompt_template.md`.
