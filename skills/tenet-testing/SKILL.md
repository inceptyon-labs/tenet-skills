---
name: tenet-testing
description: "Audits test coverage, critical-path tests, flaky markers, and missing test categories."
when_to_use: "Test coverage audit, test quality, flaky tests, missing tests, tenet testing"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Testing — Test Coverage & Quality Auditor

> *"Untested code is broken code you haven't noticed yet."*

Evaluates the health of a project's test suite across six axes: coverage percentage, mutation testing evidence, test-to-source file ratio, critical-path test presence, flaky test markers, and missing test categories. Consumes coverage and mutation reports from the toolchain when available and falls back to structural analysis when not.

## Purpose

Test coverage percentages alone are misleading — a project can have 90% coverage while missing tests for authentication, payment processing, and data mutations. This skill evaluates not just how much is tested, but whether the right things are tested, whether the tests themselves are healthy (no committed `.only` or `.skip`), and whether the test strategy covers all necessary categories (unit, integration, E2E).

## Language Support Matrix

```yaml
support:
  native: [javascript, typescript, python, go, java, ruby, rust, c#, kotlin, swift]
  heuristic: [all others]
  note: "Native support means the skill understands the test framework conventions (file naming, test runner config, assertion patterns). Heuristic support falls back to generic file-pattern matching."
```

## Framework Recognition

| Language | Test Frameworks Recognized |
|---|---|
| JavaScript/TypeScript | Jest, Vitest, Mocha, AVA, Tap, Node test runner, Playwright, Cypress, Testing Library |
| Python | pytest, unittest, nose2, Robot Framework |
| Go | `testing` package, testify, gomega, ginkgo |
| Java | JUnit 4/5, TestNG, Mockito, AssertJ, Cucumber |
| Ruby | RSpec, Minitest, Cucumber |
| Rust | built-in `#[test]`, `#[cfg(test)]` |
| C# | xUnit, NUnit, MSTest |
| Kotlin | JUnit 5, Kotest, MockK |
| Swift | XCTest, Quick/Nimble |

## Toolchain Inputs

### Primary: `.healthcheck/toolchain/coverage.json`

If the toolchain produced a coverage report (parsed from lcov, cobertura, or Go cover), consume it:

```json
{
  "tool": "coverage",
  "format": "lcov",
  "source_path": "coverage/lcov.info",
  "summary": {
    "lines_total": 4820,
    "lines_covered": 3614,
    "line_coverage_pct": 74.98,
    "branches_total": 1240,
    "branches_covered": 812,
    "branch_coverage_pct": 65.48,
    "functions_total": 380,
    "functions_covered": 312,
    "function_coverage_pct": 82.10
  },
  "per_file": [ ... ]
}
```

If this file does not exist, the skill attempts to locate coverage reports directly:

```bash
# Search for coverage reports in common locations
find . -maxdepth 4 \( \
  -name "lcov.info" -o \
  -name "cobertura.xml" -o \
  -name "coverage.xml" -o \
  -name "jacoco.xml" -o \
  -name "coverage.json" -o \
  -name "cover.out" -o \
  -name ".coverage" -o \
  -name "coverage-final.json" \
\) -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null
```

If no coverage report exists at all, log that coverage data is unavailable and use structural analysis only. Do NOT set coverage-related findings to `critical` just because no report exists — the absence of a coverage report is itself a finding.

### Secondary: `.healthcheck/toolchain/mutation-testing.json`

If the toolchain discovered mutation testing output from Muter, Stryker, PIT, mutmut, Infection, or another supported provider, consume it as a test-quality signal:

```json
{
  "tool": "mutation-testing",
  "provider": "muter",
  "source_path": ".healthcheck/mutation/muter.json",
  "scope": "changed_files",
  "summary": {
    "mutation_score_pct": 74.2,
    "mutants_total": 132,
    "mutants_killed": 98,
    "mutants_survived": 28,
    "mutants_timed_out": 6,
    "mutants_equivalent": 0
  },
  "survivors_by_file": [
    { "file": "Sources/App/AuthService.swift", "survived": 8, "total": 21 }
  ]
}
```

Mutation testing is report ingestion only. This skill does **not** run Muter or any mutation engine; those runs belong in the target project's CI/local tooling because they are slow, language-specific, and often require simulator or build-system setup.

### Tertiary: `.healthcheck/toolchain/language-census.json`

Used to determine the primary language and calibrate framework expectations.

## Configuration

Read `.healthcheck.toml` and apply optional mutation settings:

```toml
[testing.mutation]
# off | informational | bonus
mode = "informational"
minimum_score = 70
excellent_score = 85
bonus_points = 2
scope = "changed_files"
report_paths = [
  ".healthcheck/mutation/mutation-testing.json",
  ".healthcheck/mutation/muter.json",
  "mutation-report.json"
]
```

Modes:
- `off` — ignore mutation testing reports entirely.
- `informational` — Phase 1 behavior. Parse and display mutation results, emit actionable `info` findings for weak surviving mutants, but do not alter the testing score.
- `bonus` — Phase 2 behavior. If a recent valid mutation report exists and `mutation_score_pct >= minimum_score`, add `bonus_points` to the testing score after normal finding deductions, capped at 100. Missing mutation data and low mutation scores never subtract points.

## Procedure

### Step 0: Detect Test Framework and Configuration

Identify the project's test infrastructure:

```bash
# JavaScript/TypeScript
[ -f jest.config.js ] || [ -f jest.config.ts ] || [ -f jest.config.mjs ] && echo "jest"
[ -f vitest.config.js ] || [ -f vitest.config.ts ] && echo "vitest"
[ -f .mocharc.yml ] || [ -f .mocharc.json ] || [ -f .mocharc.js ] && echo "mocha"
[ -f cypress.config.js ] || [ -f cypress.config.ts ] && echo "cypress"
[ -f playwright.config.js ] || [ -f playwright.config.ts ] && echo "playwright"
grep -q '"test"' package.json 2>/dev/null && echo "npm-test-script"

# Python
[ -f pytest.ini ] || [ -f pyproject.toml ] && grep -q "pytest" pyproject.toml 2>/dev/null && echo "pytest"
[ -f setup.cfg ] && grep -q "tool:pytest" setup.cfg 2>/dev/null && echo "pytest"
[ -f tox.ini ] && echo "tox"

# Go
# Go uses built-in testing — check for _test.go files
git ls-files | grep -q '_test\.go$' && echo "go-test"

# Java
[ -f pom.xml ] && grep -q "junit" pom.xml 2>/dev/null && echo "junit"
[ -f build.gradle ] || [ -f build.gradle.kts ] && echo "gradle-test"

# Ruby
[ -f .rspec ] || [ -d spec ] && echo "rspec"
```

Record detected frameworks in metrics.

### Step 1: Parse Coverage Data

If `.healthcheck/toolchain/coverage.json` exists, read it directly.

If not, attempt to parse coverage reports found on disk:

**lcov format:**
```bash
# Extract summary from lcov.info
grep -E '^(LF|LH|BRF|BRH):' coverage/lcov.info | awk -F: '{
  if ($1 == "LF") lines_total += $2
  if ($1 == "LH") lines_covered += $2
  if ($1 == "BRF") branches_total += $2
  if ($1 == "BRH") branches_covered += $2
}'
```

**Cobertura XML format:**
```bash
# Extract line-rate and branch-rate attributes from the root element
grep -oP '(line|branch)-rate="[0-9.]+"' coverage.xml
```

**Go cover.out format:**
```bash
go tool cover -func=cover.out | tail -1
```

Coverage findings:

| Coverage Level | Severity |
|---|---|
| No coverage report exists | `major` (one finding: "No test coverage data available") |
| Line coverage < 30% | `major` |
| Line coverage 30-50% | `minor` |
| Line coverage 50-70% | `info` (acceptable but improvable) |
| Line coverage 70-90% | no finding (healthy) |
| Line coverage > 90% | no finding (excellent) |
| Branch coverage < 40% when line coverage > 70% | `minor` (tests hit lines but miss branches) |

Per-file coverage analysis (if per-file data available):
- Files with 0% coverage in `src/` (non-test, non-config) → `minor` per file (cap at 10 findings)
- Critical-path files with < 50% coverage → `major` (see Step 3 for critical-path detection)

### Step 1b: Parse Mutation Testing Data

If `[testing.mutation].mode = "off"`, skip this step.

Read `.healthcheck/toolchain/mutation-testing.json` if present. If it does not exist, search the configured `report_paths` and common report names:

```bash
find . -maxdepth 5 \( \
  -name "mutation-testing.json" -o \
  -name "mutation-report.json" -o \
  -name "muter.json" -o \
  -name "muter-output.json" -o \
  -name "stryker.json" -o \
  -name "pitest.xml" \
\) -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null
```

Normalize recognized reports into these metrics:
- `mutation_available`
- `mutation_provider`
- `mutation_report_path`
- `mutation_scope`
- `mutation_score_pct`
- `mutation_rating`
- `mutation_mutants_total`
- `mutation_mutants_killed`
- `mutation_mutants_survived`
- `mutation_mutants_timed_out`
- `mutation_mutants_equivalent`
- `mutation_worst_files`
- `mutation_scoring_mode`
- `mutation_bonus_applied`

These exact `mutation_*` keys drive the dashboard's Mutation Testing panel. Do not emit only legacy placeholders such as `mutation_testing_configured` or `mutations_applied` without also filling the standardized fields above.

Rating bands:

| Mutation Score | Rating |
|---|---|
| >= `excellent_score` | `excellent` |
| >= `minimum_score` | `good` |
| 50 - (`minimum_score` - 0.01) | `weak` |
| < 50 | `poor` |

Findings:
- No mutation report found in `informational` or `bonus` mode → optional `info` finding: "Mutation testing is not configured". This is actionable, but do not emit it if the project has no meaningful test suite yet; the no-tests findings already cover the larger problem.
- Mutation report exists with surviving mutants → `info` finding: "Surviving mutants indicate weak assertions". Include the worst files and survivor counts.
- Mutation report is stale, malformed, or missing totals → `info` finding: "Mutation testing report cannot be trusted".

Do not emit `minor`, `major`, or `critical` findings for mutation score in Phase 1 or Phase 2. Mutation data is an informational signal plus an opt-in confidence bonus only.

### Step 2: Compute Test-to-Source File Ratio

Count test files and source files:

```bash
# Test file patterns per language
# JS/TS: *.test.ts, *.spec.ts, *.test.js, *.spec.js, __tests__/**
# Python: test_*.py, *_test.py, tests/**/*.py
# Go: *_test.go
# Java: *Test.java, *Tests.java, *Spec.java (in src/test/)
# Ruby: *_spec.rb (in spec/), *_test.rb (in test/)
# Rust: #[cfg(test)] modules, tests/ directory
# C#: *Tests.cs, *Test.cs (in *.Tests project)

TEST_FILES=$(git ls-files | grep -c -E \
  '\.(test|spec)\.(ts|tsx|js|jsx|mjs)$|__tests__/.*\.(ts|tsx|js|jsx)$|test_.*\.py$|.*_test\.py$|tests/.*\.py$|_test\.go$|Test\.java$|Tests\.java$|_spec\.rb$|_test\.rb$|Tests?\.cs$' \
  2>/dev/null || echo 0)

SOURCE_FILES=$(git ls-files | grep -c -E \
  '\.(ts|tsx|js|jsx|py|go|java|rb|rs|cs)$' \
  2>/dev/null || echo 0)

# Exclude test files from source count
SOURCE_FILES=$((SOURCE_FILES - TEST_FILES))
```

Compute ratio: `test_files / source_files`

| Ratio | Severity |
|---|---|
| 0 (no test files at all) | `critical` |
| Entire app/package directory (>10 source files) with zero test files | `critical` per directory — in monorepos, each app layer without any tests is its own critical finding |
| < 0.1 (fewer than 1 test file per 10 source files) | `critical` (near-zero coverage) |
| 0.1 - 0.2 | `major` |
| 0.2 - 0.5 | `minor` |
| 0.5 - 1.0 | no finding (healthy) |
| > 1.0 | no finding (thorough) |

### Step 3: Check for Critical-Path Tests

Identify critical-path modules and verify they have corresponding test files:

**Critical-path detection heuristics:**

```bash
# Authentication / Authorization
git ls-files | grep -i -E '(auth|login|session|jwt|token|oauth|saml|permission|rbac|acl)' | grep -v -E '(test|spec|__tests__|node_modules)'

# Payment / Billing
git ls-files | grep -i -E '(payment|billing|charge|invoice|subscription|stripe|paypal|checkout|refund)' | grep -v -E '(test|spec|__tests__|node_modules)'

# Data Mutation / Write Operations
git ls-files | grep -i -E '(migration|seed|import|export|delete|purge|mutation|write|update|create)' | grep -v -E '(test|spec|__tests__|node_modules)'

# Cryptography / Security
git ls-files | grep -i -E '(crypt|hash|encrypt|decrypt|sign|verify|secret|key|cert)' | grep -v -E '(test|spec|__tests__|node_modules)'
```

For each critical-path file found, check if a corresponding test file exists:
- `src/auth/middleware.ts` → look for `src/auth/middleware.test.ts`, `src/auth/__tests__/middleware.test.ts`, `test/auth/middleware.test.ts`, `tests/auth/middleware.test.ts`

| Condition | Severity |
|---|---|
| Critical-path file with no corresponding test file | `major` |
| Critical-path file with test file but < 50% coverage (if data available) | `minor` |
| Critical-path file with adequate tests | no finding |

Cap at 15 findings for critical-path gaps. If more exist, aggregate into a summary finding.

### Step 4: Detect Flaky Test Markers

Scan for committed skip/focus markers that indicate test health problems:

```bash
# Skip markers (tests that have been disabled)
git ls-files | xargs grep -n -E \
  '\b(test\.skip|it\.skip|describe\.skip|xit\b|xdescribe\b|xcontext\b|@skip|@pytest\.mark\.skip|@unittest\.skip|t\.Skip\()' \
  2>/dev/null

# Focus markers (accidentally committed .only — breaks CI for other tests)
git ls-files | xargs grep -n -E \
  '\b(test\.only|it\.only|describe\.only|fdescribe\b|fit\b|fcontext\b|@pytest\.mark\.only|\.only\()' \
  2>/dev/null

# Flaky markers (explicitly marked as flaky)
git ls-files | xargs grep -n -i -E \
  '(flaky|intermittent|unreliable|retry|@retry|@flaky|\.retries\()' \
  2>/dev/null

# Timeout overrides (may indicate slow or flaky tests)
git ls-files | xargs grep -n -E \
  '(jest\.setTimeout\(|timeout:\s*[0-9]{5,}|this\.timeout\([0-9]{5,}\))' \
  2>/dev/null
```

| Condition | Severity |
|---|---|
| Committed `.only` / `fit` / `fdescribe` | `major` (blocks other tests in CI) |
| Committed `.skip` / `xit` / `xdescribe` | `minor` per occurrence |
| `@skip` with a reason comment (e.g., `@skip("flaky on CI")`) | `minor` |
| `@skip` without a reason | `minor` (with note to add reason or fix) |
| 5+ skipped tests in a single file | `major` (systemic issue) |
| Explicit `@flaky` / `@retry` markers | `info` (acknowledged but not addressed) |
| Timeout overrides > 30 seconds | `info` |

Use `git blame` to age skip markers:
- `.skip` older than 90 days → escalate one tier (minor->major)
- `.only` committed for any duration → always `major`

### Step 5: Detect Missing Test Categories

Analyze the test directory structure to identify missing test categories:

```bash
# Check for integration tests
git ls-files | grep -i -E '(integration|e2e|end.to.end|acceptance|functional)' | head -20

# Check for E2E test tooling
[ -f cypress.config.js ] || [ -f cypress.config.ts ] || \
[ -f playwright.config.js ] || [ -f playwright.config.ts ] || \
[ -d e2e ] || [ -d tests/e2e ] || [ -d test/e2e ] && echo "e2e-present"

# Check test directory structure
ls -d test/ tests/ spec/ __tests__/ src/**/__tests__/ 2>/dev/null
```

Categorize existing tests:

| Category | Detection |
|---|---|
| Unit tests | Files matching `*.test.*`, `*.spec.*`, `test_*`, `*_test.*` NOT in integration/e2e dirs |
| Integration tests | Files in `integration/`, `__integration__/`, or containing `integration` in name |
| E2E tests | Files in `e2e/`, `end-to-end/`, Cypress/Playwright test directories |
| Smoke tests | Files containing `smoke` in name or directory |
| Performance tests | Files containing `perf`, `benchmark`, `load` in name or directory |

| Condition | Severity |
|---|---|
| No tests at all (no test files found) | `critical` |
| Unit tests exist but no integration tests (project has API routes or database access) | `major` — API/DB projects need integration tests to catch real failures |
| Unit tests exist but no E2E tests (project has a UI layer — JSX/TSX/Vue/Svelte) | `major` — UI projects need E2E to verify user-facing flows |
| No integration AND no E2E tests (project has both API and UI) | `critical` — project has no tests that verify components work together |
| No smoke tests (project has a deployment config — Dockerfile, k8s manifests, CI deploy step) | `info` |

### Step 6: Analyze Test Quality Signals

Additional quality signals from test file content:

```bash
# Tests with no assertions (empty test bodies)
git ls-files | xargs grep -l -E '\.(test|spec)\.(ts|tsx|js|jsx)$' | while read f; do
  # Look for test blocks with no expect/assert
  grep -c 'expect\|assert\|should\|toBe\|toEqual\|toMatch' "$f"
done

# Tests that only test happy path (no error/edge case testing)
# Heuristic: test files with 0 occurrences of "error", "throw", "reject", "invalid", "fail", "edge", "boundary"
```

| Condition | Severity |
|---|---|
| Test file with 0 assertions | `major` |
| Test file with only happy-path tests (heuristic) | `info` |

### Step 7: Compute Score

Apply the standard scoring formula:

```
score = 100 - (5 * critical) - (2 * major) - (0.5 * minor)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding, not banker's rounding
```

Info findings do NOT affect the score.

If `[testing.mutation].mode = "bonus"` and a valid mutation report has `mutation_score_pct >= minimum_score`, apply the configured bonus after the standard score calculation:

```
score = min(100, score + bonus_points)
```

Record the exact bonus in `metrics.mutation_bonus_applied`. Never subtract points for missing mutation data, a low mutation score, survived mutants, timeouts, or malformed reports during Phase 1 or Phase 2.

### Step 8: Write Report

Write the dimension report to `.healthcheck/reports/testing.json`:

```json
{
  "key": "testing",
  "score": 65,
  "weight": 1.1,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Line coverage at 52% with 0.3 test-to-source ratio. Authentication module has no tests. Found 3 committed .skip markers (oldest 6 months). No integration tests detected.",
  "metrics": {
    "coverage_available": true,
    "coverage_source": "lcov",
    "line_coverage_pct": 52.3,
    "branch_coverage_pct": 38.1,
    "function_coverage_pct": 61.4,
    "test_files": 23,
    "source_files": 78,
    "test_to_source_ratio": 0.29,
    "critical_path_files": 12,
    "critical_path_files_tested": 8,
    "skip_markers": 3,
    "only_markers": 0,
    "flaky_markers": 1,
    "test_categories_present": ["unit"],
    "test_categories_missing": ["integration", "e2e"],
    "frameworks_detected": ["jest", "testing-library"],
    "zero_coverage_files": 14,
    "mutation_available": true,
    "mutation_provider": "muter",
    "mutation_report_path": ".healthcheck/toolchain/mutation-testing.json",
    "mutation_scope": "changed_files",
    "mutation_scoring_mode": "informational",
    "mutation_score_pct": 74.2,
    "mutation_rating": "good",
    "mutation_mutants_total": 132,
    "mutation_mutants_killed": 98,
    "mutation_mutants_survived": 28,
    "mutation_mutants_timed_out": 6,
    "mutation_mutants_equivalent": 0,
    "mutation_bonus_applied": 0,
    "mutation_worst_files": [
      { "file": "Sources/App/AuthService.swift", "survived": 8, "total": 21 }
    ]
  },
  "findings": [ ... ]
}
```

Each finding follows the schema in `shared/schema.json` and includes a `fix_prompt` following the template in `shared/fix_prompt_template.md`.

## Confidence Tiers

| Detection Method | Confidence |
|---|---|
| Coverage percentage from lcov/cobertura/cover.out | `deterministic` |
| Mutation score from supported report artifact | `deterministic` |
| Mutation score from loosely parsed CLI text | `heuristic` |
| Test-to-source ratio (file counting) | `deterministic` |
| Critical-path file detection (filename heuristic) | `heuristic` |
| Skip/only/flaky marker detection (grep) | `deterministic` |
| Missing test category detection (directory structure) | `heuristic` |
| Test quality signals (assertion counting) | `heuristic` |

## fix_prompt Examples

### Example 1: Low Coverage (major — line coverage 28%)

```
# Fix: Increase test coverage from 28% to at least 50%

## Context
The project's line coverage is at 28%, well below a healthy threshold. The most impactful
approach is to add tests for the largest uncovered files first.

## Location
- File: (project-wide)
- Line: N/A
- Dimension: testing / major

## Current behavior
28% line coverage. The following high-value files have 0% coverage:
- src/services/orderService.ts (340 lines)
- src/services/userService.ts (280 lines)
- src/middleware/rateLimiter.ts (95 lines)

## Required change
1. Create test files for the three largest uncovered modules:
   - `src/services/__tests__/orderService.test.ts`
   - `src/services/__tests__/userService.test.ts`
   - `src/middleware/__tests__/rateLimiter.test.ts`
2. For each module, write tests covering:
   - The primary happy-path function (e.g., create, get, update)
   - At least one error case (invalid input, not found, permission denied)
   - Edge cases visible from the function signatures (empty arrays, null params)
3. Use the existing test patterns in the project (check existing test files for mocking and setup conventions)
4. Target at least 60% coverage for each new test file

## Constraints
- Use the project's existing test framework (check package.json scripts and config files)
- Follow existing test naming and directory conventions
- Do not mock external services differently from how existing tests mock them
- Do not add new test dependencies without justification

## Verification
- Run `npm test -- --coverage` and confirm line coverage is above 50%
- All new tests pass: `npm test`
- No existing tests are broken: compare test count before and after
```

### Example 2: Committed .only (major)

```
# Fix: Remove committed .only test focus marker

## Context
A `describe.only` block is committed to the test suite. This causes CI to silently skip all
other test files, giving a false green build while most tests never run.

## Location
- File: src/api/__tests__/routes.test.ts
- Line: 14
- Dimension: testing / major

## Current behavior
```typescript
describe.only('POST /api/orders', () => {
  it('should create an order', async () => {
    // ...
  });
});
```

The `.only` modifier causes the test runner to execute ONLY this describe block and skip
every other test in the suite. This has been committed for 12 days.

## Required change
1. Remove `.only` from line 14: change `describe.only(` to `describe(`
2. Run the full test suite to verify all tests still pass (some may have been broken while hidden by the `.only`)
3. Consider adding a lint rule to prevent `.only` from being committed:
   - ESLint: `eslint-plugin-jest` rule `jest/no-focused-tests`
   - Vitest: `eslint-plugin-vitest` rule `vitest/no-focused-tests`

## Constraints
- Only change the `.only` modifier — do not modify test logic
- If removing `.only` reveals other failing tests, note them but do not fix them in this change

## Verification
- `grep -rn "\.only(" src/api/__tests__/routes.test.ts` should return no results
- `npm test` runs the full suite (check that test count is higher than before)
- CI pipeline passes with all tests executing
```

### Example 3: No Integration Tests (minor)

```
# Fix: Add integration tests for API endpoints

## Context
The project has 45 unit test files but zero integration tests. The project exposes API
endpoints and connects to a database, making integration tests essential for verifying
that components work together correctly.

## Location
- File: (project-wide — no integration test directory exists)
- Line: N/A
- Dimension: testing / minor

## Current behavior
Test directory structure:
```
src/
  services/__tests__/    (12 unit test files)
  api/__tests__/         (8 unit test files, mocking all dependencies)
  utils/__tests__/       (5 unit test files)
```
No `integration/`, `e2e/`, or similar directories exist. All API tests mock the database
layer, so no test verifies actual database queries or API-to-database flow.

## Required change
1. Create an integration test directory: `tests/integration/`
2. Set up a test database configuration (check if the project uses Docker Compose — if so, add a test DB service; if not, use an in-memory database or test container)
3. Write integration tests for the 3 most critical API endpoints:
   - POST /api/users (user creation flow)
   - POST /api/orders (order creation with payment)
   - DELETE /api/users/:id (data deletion flow)
4. Each integration test should:
   - Set up test data in the database
   - Make an actual HTTP request to the endpoint
   - Verify the response AND the database state
   - Clean up test data after each test
5. Add a separate npm script: `"test:integration": "jest --config jest.integration.config.js"`
6. Ensure integration tests are excluded from the unit test run (separate config or directory-based exclusion)

## Constraints
- Do not modify existing unit tests
- Integration tests should be runnable independently (`npm run test:integration`)
- Use the project's existing ORM/database client for setup and teardown
- If the project has a CI pipeline, add integration tests as a separate CI step (they're slower)

## Verification
- `npm run test:integration` runs and passes
- Integration tests actually hit the database (check that test DB has data during the run)
- `npm test` (unit tests) still passes and does NOT run integration tests
- Test directory structure now includes `tests/integration/` with at least 3 test files
```

## Constraints

- **Coverage data is optional:** If no coverage report exists, degrade gracefully. Report the absence as a finding but do not penalize the score as if coverage were 0%.
- **Mutation data is optional:** Missing mutation reports do not lower the score. In `informational` mode, mutation results only appear in metrics, notes, and actionable `info` findings. In `bonus` mode, strong mutation results may raise the testing score slightly, but weak or missing results never lower it.
- **Do not run mutation tools:** This skill parses mutation reports only. Muter, Stryker, PIT, mutmut, and similar tools should be run by the target project's CI/local scripts.
- **Respect .gitignore:** Use `git ls-files` for all file listing. Never scan `node_modules/`, `vendor/`, etc.
- **Framework-aware file matching:** Use the detected framework to calibrate test file patterns. A Go project uses `_test.go`, not `*.test.go`.
- **Critical-path detection is heuristic:** Filename-based detection of auth/payment modules is imperfect. Set confidence to `heuristic` for these findings.
- **Cap per-file findings:** If there are 50 files with 0% coverage, report the top 10 by LOC and summarize the rest.
- **Scoring is arithmetic, not judgment:** Apply the formula mechanically.
- **Every finding needs a fix_prompt:** Even `info`-level findings must include an actionable fix_prompt.
- **Do not run tests:** This skill analyzes test infrastructure. It does NOT execute `npm test` or any test runner. Test execution is out of scope.
- **Do not generate test code:** fix_prompts should instruct on what to test, but this skill does not write test files.

## Output

- `.healthcheck/reports/testing.json` — the dimension report with all findings, metrics, and score
