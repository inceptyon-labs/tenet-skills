---
name: tenet-complexity
description: "Measures function/file complexity, nesting, length, and maintainability thresholds."
when_to_use: "Complexity audit, cyclomatic complexity, function length, nesting depth, tenet complexity"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Complexity — Code Complexity Audit

> Measures structural complexity across all code in the repository. Functions that are too complex, too deeply nested, or too long are flagged with severity proportional to the violation.

## Purpose

This skill evaluates the structural complexity of the codebase by measuring five metrics per function and per file:

1. **Cyclomatic complexity** — number of linearly independent paths through a function
2. **Cognitive complexity** — how hard a function is for a human to understand (weighted nesting, recursion, breaks in linear flow)
3. **Max nesting depth** — deepest level of nested control structures within a function
4. **File length** — total lines of code per file
5. **Function length** — total lines per function or method

High complexity correlates with bugs, difficulty onboarding new developers, and resistance to safe refactoring. This dimension provides the quantitative foundation for technical debt decisions.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python]
  tree_sitter: [go, rust, java, kotlin, swift, c, cpp]
  heuristic: [ruby, php, shell, lua, elixir, scala, dart, all others]
  note: >
    Native support uses toolchain output (eslint, radon, gocyclo) for
    deterministic metrics. Tree-sitter support parses AST for accurate
    function boundary detection. Heuristic support counts branching
    keywords and uses indentation to estimate nesting depth.
```

## Toolchain Inputs

This skill consumes pre-computed output from the deterministic toolchain layer:

| File | When Available | What It Provides |
|---|---|---|
| `.healthcheck/toolchain/eslint.json` | JS/TS projects with eslint configured | Per-function cyclomatic complexity via `complexity` rule |
| `.healthcheck/toolchain/radon.json` | Python projects with radon installed | Per-function cyclomatic complexity grades (A-F) and raw scores |
| `.healthcheck/toolchain/gocyclo.json` | Go projects with gocyclo installed | Per-function cyclomatic complexity scores |
| `.healthcheck/toolchain/language-census.json` | Always | Language breakdown for routing analysis strategy |

If a toolchain file is missing for a given language, the skill falls back to heuristic analysis for that language.

## Rubric

### Cyclomatic Complexity per Function

| Threshold | Severity | Rationale |
|---|---|---|
| 10-14 | minor | Approaching the maintainability limit; consider refactoring when touching this function |
| 15-19 | major | Difficult to test exhaustively; should be decomposed this sprint |
| >= 20 | critical | Untestable; high defect probability; refactor immediately |

### Cognitive Complexity per Function

| Threshold | Severity | Rationale |
|---|---|---|
| 15-24 | minor | Harder than necessary to reason about |
| 25-39 | major | Significant mental overhead; decompose into named helpers |
| >= 40 | critical | Nearly impossible to hold in working memory |

### Max Nesting Depth per Function

| Threshold | Severity | Rationale |
|---|---|---|
| 4 | minor | Consider early returns or guard clauses |
| 5 | major | Refactor: extract nested logic into helper functions |
| >= 6 | critical | Deeply nested code is a reliability risk; flatten immediately |

### File Length

| Threshold | Severity | Rationale |
|---|---|---|
| 500-999 lines | minor | File is growing large; consider splitting by responsibility |
| >= 1000 lines | major | File is a maintenance burden; split into focused modules |

### Function Length

| Threshold | Severity | Rationale |
|---|---|---|
| 50-99 lines | minor | Function is doing too much; extract sub-steps |
| >= 100 lines | major | Function is a mini-program; decompose into composable units |

### Info-Level Observations

The following do NOT affect the score but are reported as `info`:
- Functions with complexity 8-9 (approaching threshold)
- Files with 400-499 lines (approaching threshold)
- Functions with 40-49 lines (approaching threshold)
- Opportunities to replace complex conditionals with lookup tables or polymorphism

## Procedure

### Step 1: Read Toolchain Data and Language Census

```
Read .healthcheck/toolchain/language-census.json
Read .healthcheck/toolchain/eslint.json (if exists)
Read .healthcheck/toolchain/radon.json (if exists)
Read .healthcheck/toolchain/gocyclo.json (if exists)
```

Determine which languages are present and which toolchain outputs are available.

### Step 2: Consume Toolchain Metrics (Deterministic Path)

For each available toolchain file, extract per-function complexity data:

**eslint.json (JS/TS):**
- Look for findings with rule `complexity` — the message contains the cyclomatic complexity value
- Look for findings with rule `max-depth` — nesting depth violations
- Look for findings with rule `max-lines-per-function` — function length violations
- Confidence: `deterministic`

**radon.json (Python):**
- Each entry contains `complexity` (integer), `name` (function/method), `lineno`, `col_offset`, `type` (function/method/class)
- Map radon grades: A(1-5), B(6-10), C(11-15), D(16-20), E(21-25), F(26+)
- Confidence: `deterministic`

**gocyclo.json (Go):**
- Each entry contains `Complexity` (integer), `Function`, `File`, `Line`
- Confidence: `deterministic`

### Step 3: Heuristic Analysis (Fallback Path)

For languages without toolchain output, perform heuristic complexity analysis:

**3a. Identify functions and their boundaries:**

Use language-appropriate patterns to find function definitions:
- JS/TS: `function`, `=>`, method definitions in classes
- Python: `def`
- Go: `func`
- Rust: `fn`
- Java/Kotlin: method declarations within class bodies
- Ruby: `def`/`end`
- PHP: `function`
- Shell: `function` or `name()`

Track opening/closing braces (or indentation for Python/Ruby) to determine function boundaries.

**3b. Count cyclomatic complexity by counting branching keywords:**

```
Branching keywords per language:

JS/TS/Java/Go/Rust/C/C++:
  if, else if, else, case, for, while, do, catch, &&, ||, ?:, ??

Python:
  if, elif, else, for, while, except, and, or, assert, with

Ruby:
  if, elsif, else, unless, case, when, for, while, until, rescue, &&, ||

Shell:
  if, elif, else, case, for, while, until, ||, &&
```

Formula: `cyclomatic = 1 + count(branching_keywords_within_function_body)`

Confidence: `heuristic`

**3c. Measure nesting depth:**

Track indentation levels or brace depth within each function. Record the maximum depth reached.

**3d. Measure function and file length:**

Count lines between function boundaries (excluding blank lines and comment-only lines for function length). Count total file lines for file length.

### Step 4: Compute Cognitive Complexity

Cognitive complexity adds weight for nested control flow:

```
For each control structure (if/for/while/switch/try):
  +1 base
  +1 per nesting level it appears at

For each break in linear flow:
  +1 for else, elif, catch, finally
  +1 for each boolean operator sequence (a && b || c = +2)

For each recursion:
  +1 per recursive call detected
```

This is computed for all languages regardless of toolchain availability, since no standard tool emits cognitive complexity for most languages.

### Step 5: Classify Findings

For each function and file, apply the rubric thresholds and emit findings.

Each finding MUST include:
- `dimension`: `"complexity"`
- `severity`: per rubric above
- `title`: e.g., "Cyclomatic complexity 23 in processOrder()"
- `description`: 2-4 sentences explaining the risk
- `file`: repo-relative path
- `line`: line number of function definition
- `snippet`: first 500 chars of the function (or the function signature + first few lines)
- `fix_prompt`: self-contained prompt following the template in `shared/fix_prompt_template.md`
- `confidence`: one of `deterministic`, `native`, `tree_sitter`, `heuristic`

### Step 6: Compute Score

Apply the standard scoring formula:

```
score = 100 - (5 × critical_count + 2 × major_count + 0.5 × minor_count)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding, not banker's rounding
```

Info findings do NOT affect the score.

### Step 7: Compute Dimension Metrics

Collect aggregate metrics for the dimension summary:

```json
{
  "total_functions_analyzed": 342,
  "functions_exceeding_cyclomatic_10": 18,
  "functions_exceeding_cyclomatic_15": 5,
  "functions_exceeding_cyclomatic_20": 1,
  "avg_cyclomatic_complexity": 4.2,
  "max_cyclomatic_complexity": 23,
  "max_cyclomatic_function": "processOrder",
  "max_cyclomatic_file": "src/orders/processor.ts",
  "avg_cognitive_complexity": 6.8,
  "max_cognitive_complexity": 47,
  "max_nesting_depth": 7,
  "files_over_500_lines": 3,
  "files_over_1000_lines": 1,
  "functions_over_50_lines": 12,
  "functions_over_100_lines": 2,
  "confidence_breakdown": {
    "deterministic": 280,
    "heuristic": 62
  }
}
```

### Step 8: Write Report

Write the dimension report to `.healthcheck/reports/complexity.json`:

```json
{
  "key": "complexity",
  "score": 72,
  "weight": 1.1,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Analyzed 342 functions across 47 files. 1 critical finding (processOrder has cyclomatic complexity 23), 5 major findings. Hotspot: src/orders/processor.ts.",
  "metrics": { ... },
  "findings": [ ... ]
}
```

## Output

- `.healthcheck/reports/complexity.json` — the dimension report with all findings, score, and metrics

## Constraints

- **Toolchain-first:** ALWAYS prefer toolchain data over heuristic analysis. Only fall back to heuristics when no toolchain output exists for a language.
- **No double-counting:** If eslint reports cyclomatic complexity for a function AND the heuristic also finds it, use only the deterministic result.
- **Confidence tagging:** Every finding MUST include a `confidence` field reflecting how it was detected.
- **Scoring math is pure:** The score formula is arithmetic only — no LLM judgment in the number.
- **Respect .gitignore:** Only analyze files tracked by git (`git ls-files`).
- **Exclude generated code:** Skip files matching common generated patterns: `*.generated.*`, `*.min.js`, `*.bundle.js`, `dist/`, `build/`, `vendor/`, `node_modules/`, `__pycache__/`.
- **Exclude test files from file-length checks:** Test files (`*.test.*`, `*.spec.*`, `*_test.*`, `test_*.*`) are still checked for function complexity but are exempt from file-length findings (test files are naturally longer).
- **Max findings cap:** Emit at most 50 findings. If more exist, keep all critical, then major, then minor, then info, sorted by severity descending then complexity value descending. Add an info finding noting how many were omitted.

## fix_prompt Examples

### Example 1: High Cyclomatic Complexity

```
# Fix: Reduce cyclomatic complexity in processOrder()

## Context
The function `processOrder` in `src/orders/processor.ts` has cyclomatic complexity 23 (critical threshold is 20). It contains deeply interleaved conditionals for order validation, payment processing, inventory checks, and notification dispatch.

## Location
- File: src/orders/processor.ts
- Line: 45
- Dimension: complexity / critical

## Current behavior
```typescript
async function processOrder(order: Order): Promise<Result> {
  if (order.status === 'pending') {
    if (order.items.length > 0) {
      for (const item of order.items) {
        if (item.type === 'physical') {
          if (inventory.check(item.sku)) {
            // ... 15 more branches for payment, shipping, notifications
          } else if (item.backorderAllowed) {
            // ...
          } else {
            // ...
          }
        } else if (item.type === 'digital') {
          // ...
        } else if (item.type === 'subscription') {
          // ...
        }
      }
    }
  }
  // ... continues for 180 lines
}
```

## Required change
1. Extract order validation into a standalone `validateOrder(order)` function that returns early on invalid states
2. Extract per-item processing into `processPhysicalItem()`, `processDigitalItem()`, `processSubscriptionItem()` — use a strategy map keyed by `item.type`
3. Extract payment handling into `processPayment(order, validatedItems)`
4. Extract notification dispatch into `notifyOrderComplete(order, result)`
5. Rewrite `processOrder()` as a pipeline: validate → process items → payment → notify

## Constraints
- Do not change the `processOrder()` function signature or return type
- Preserve existing test behavior — all tests in `src/orders/__tests__/processor.test.ts` must still pass
- Each extracted function should have cyclomatic complexity < 10
- Keep the new functions in the same file or create a `src/orders/processor/` directory with an index re-export

## Verification
- Run: `npx eslint --rule '{"complexity": ["error", 10]}' src/orders/processor.ts`
- Run: `npm test -- --testPathPattern=orders`
- Confirm no function exceeds cyclomatic complexity 10
```

### Example 2: Deeply Nested Function

```
# Fix: Flatten deeply nested function parseConfig()

## Context
The function `parseConfig` in `src/config/parser.py` has a maximum nesting depth of 7. It validates configuration fields inside nested try/except blocks inside nested for loops inside conditionals, making the control flow nearly impossible to follow.

## Location
- File: src/config/parser.py
- Line: 23
- Dimension: complexity / critical

## Current behavior
```python
def parse_config(raw: dict) -> Config:
    if raw:
        for section in raw.get("sections", []):
            if section.get("enabled"):
                for key, value in section.items():
                    if key != "enabled":
                        try:
                            if isinstance(value, dict):
                                for sub_key in value:
                                    if sub_key.startswith("_"):
                                        # depth 7 here
                                        ...
```

## Required change
1. Replace the outer `if raw` guard with an early return: `if not raw: return Config.empty()`
2. Extract section processing into `_process_section(section) -> list[Setting]` with its own early return for disabled sections
3. Extract value parsing into `_parse_value(key, value) -> Setting` that handles the type dispatch
4. Replace the nested sub-key loop with a dict comprehension or a dedicated `_parse_nested_dict()` helper
5. Target: no function exceeds nesting depth 3

## Constraints
- Preserve the public API: `parse_config(raw: dict) -> Config` signature must not change
- All existing tests in `tests/test_config.py` must pass
- Keep private helpers in the same module (prefix with `_`)
- Handle the same edge cases (None values, missing keys, nested dicts with underscore-prefixed keys)

## Verification
- Run: `python -m pytest tests/test_config.py -v`
- Manually inspect that no function in `src/config/parser.py` has more than 3 levels of indentation inside the function body
- Run: `radon cc src/config/parser.py -s` and confirm all functions are grade A or B
```

### Example 3: Overly Long File

```
# Fix: Split oversized file utils.ts (1,247 lines)

## Context
The file `src/shared/utils.ts` is 1,247 lines long (major threshold is 1,000). It contains unrelated utilities: string helpers, date formatting, HTTP request wrappers, validation functions, and logging helpers — all in one file with no cohesive theme.

## Location
- File: src/shared/utils.ts
- Line: 1
- Dimension: complexity / major

## Current behavior
The file exports 43 functions spanning five unrelated domains:
- String manipulation (lines 1-180): `capitalize`, `slugify`, `truncate`, `escapeHtml`, etc.
- Date formatting (lines 182-340): `formatDate`, `parseISO`, `relativeTime`, etc.
- HTTP helpers (lines 342-620): `fetchJSON`, `retryFetch`, `buildURL`, etc.
- Validation (lines 622-890): `isEmail`, `isURL`, `isUUID`, `validateSchema`, etc.
- Logging (lines 892-1247): `createLogger`, `formatLogEntry`, `withContext`, etc.

## Required change
1. Create `src/shared/string-utils.ts` — move all string functions
2. Create `src/shared/date-utils.ts` — move all date functions
3. Create `src/shared/http-utils.ts` — move all HTTP functions
4. Create `src/shared/validation-utils.ts` — move all validation functions
5. Create `src/shared/logging.ts` — move all logging functions
6. Update `src/shared/utils.ts` to re-export from the new modules for backward compatibility:
   ```typescript
   export * from './string-utils';
   export * from './date-utils';
   export * from './http-utils';
   export * from './validation-utils';
   export * from './logging';
   ```
7. Each new file should be under 300 lines

## Constraints
- The barrel re-export in `utils.ts` ensures all existing import paths continue to work
- Do not rename any exported functions
- Preserve JSDoc comments on all exports
- Internal cross-references between utilities (e.g., `formatLogEntry` calls `formatDate`) must use explicit imports from the new modules

## Verification
- Run: `npx tsc --noEmit` to confirm no type errors
- Run: `npm test` to confirm all tests pass
- Run: `wc -l src/shared/*.ts` and confirm no file exceeds 500 lines
- Run: `grep -r "from.*shared/utils" src/` to confirm existing imports still resolve
```

## Confidence Tiers

| Tier | Source | When Used |
|---|---|---|
| `deterministic` | eslint, radon, gocyclo toolchain output | Toolchain ran successfully and produced findings for the file |
| `native` | Skill's own AST parsing for JS/TS/Python | Toolchain unavailable but language has first-class parsing support |
| `tree_sitter` | Tree-sitter grammar parsing | Go, Rust, Java, Kotlin, Swift, C, C++ without toolchain output |
| `heuristic` | Keyword counting and indentation analysis | All other languages or when no better method is available |

When reporting findings, always use the highest-confidence method available. Never report a heuristic finding for a file that has deterministic toolchain coverage.
