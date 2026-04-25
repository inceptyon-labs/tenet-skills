---
name: tenet-debt
description: "Identifies technical debt: TODO/FIXME/HACK/XXX comments aged over 90 days, commented-out code blocks, deprecated API usage, stub implementations, and long-lived temporary feature flags."
when_to_use: "Tech debt audit, TODO scan, deprecated code, dead code, tenet debt"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Debt — Technical Debt Auditor

> *"Debt compounds in silence."*

Detects and ages technical debt markers across any language: TODO/FIXME/HACK/XXX comments, commented-out code blocks, deprecated API usage, stub implementations, and feature flags that outlived their "temporary" intent. All detection is grep-based with git blame aging, requiring no external toolchain dependencies.

## Purpose

Technical debt is invisible until it compounds into a crisis. This skill surfaces debt systematically by scanning for known debt markers, aging them via git blame, and classifying severity by how long the debt has festered. A TODO from last week is healthy engineering practice; a TODO from two years ago is a lie.

## Language Support Matrix

```yaml
support:
  native: [all]
  note: "All detection is grep-based and language-agnostic. Comment syntax detection covers all major languages. Git blame aging works on any file tracked by git."
```

## Toolchain Inputs

This skill does not consume `.healthcheck/toolchain/` files. It operates independently using `grep` and `git blame` directly on the repository.

## Comment Syntax Reference

The skill recognizes comment markers across languages:

| Pattern | Languages |
|---|---|
| `//` | JS, TS, Java, C, C++, C#, Go, Rust, Swift, Kotlin, Dart, Scala |
| `#` | Python, Ruby, Bash, YAML, TOML, Perl, R, Elixir, Terraform |
| `--` | SQL, Lua, Haskell, Elm |
| `/* ... */` | JS, TS, Java, C, C++, C#, Go, Rust, CSS, Swift, Kotlin |
| `{- ... -}` | Haskell |
| `<!-- ... -->` | HTML, XML, SVG, Vue, Svelte |
| `''' / """` | Python (docstring abuse for commenting-out) |
| `=begin / =end` | Ruby |

## Procedure

### Step 0: Ensure Git Repository

```bash
git rev-parse --git-dir >/dev/null 2>&1 || { echo "Not a git repository. Cannot age debt markers."; exit 1; }
```

If not a git repo, all findings default to `minor` severity since aging is impossible. Log a warning.

### Step 1: Scan for TODO/FIXME/HACK/XXX Markers

Search the entire repo (respecting `.gitignore`) for debt markers:

```bash
# Get the file list from git to respect .gitignore
git ls-files | xargs grep -n -i -E '\b(TODO|FIXME|HACK|XXX|KLUDGE|WORKAROUND)\b' 2>/dev/null
```

For each match, capture:
- File path (repo-relative)
- Line number
- The full line content
- The marker type (TODO, FIXME, HACK, XXX, KLUDGE, WORKAROUND)
- Any inline annotation (e.g., `TODO(username):`, `FIXME @jira-123`)

Filter out false positives:
- Skip lines inside `node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.venv/`, `venv/`
- Skip lines in lockfiles (`package-lock.json`, `yarn.lock`, `Gemfile.lock`, `poetry.lock`, `go.sum`, `Cargo.lock`)
- Skip lines in generated files (check for `// Code generated` header, `@generated`, `auto-generated`)

### Step 2: Age Each Marker via Git Blame

For each debt marker found, determine its age:

```bash
# For each file:line pair, extract the commit date
git blame -L <line>,<line> --porcelain <file> | grep '^author-time'
```

Convert the epoch timestamp to a date and compute days elapsed:

```bash
AUTHOR_TIME=$(git blame -L <line>,<line> --porcelain <file> | grep '^author-time' | awk '{print $2}')
NOW=$(date +%s)
DAYS_OLD=$(( (NOW - AUTHOR_TIME) / 86400 ))
```

Classify by age:
- **< 90 days** → `info` (healthy engineering practice, no penalty)
- **90-365 days** → `minor` (stale, should be addressed)
- **> 365 days** → `major` (chronic debt, likely forgotten)

Special escalation rules:
- `HACK` or `XXX` markers > 90 days → escalate one tier (minor->major, major->critical)
- Markers with a ticket reference (e.g., `FIXME @JIRA-123`) that is > 365 days → `major` (the ticket may itself be forgotten)
- Markers in critical paths (auth, payment, data validation files) > 180 days → escalate one tier

### Step 3: Detect Commented-Out Code Blocks

Scan for contiguous blocks of commented-out code (not documentation comments):

```bash
# Heuristic: a block of 5+ consecutive comment lines where >60% of lines
# contain code-like patterns (assignments, function calls, control flow)
```

Code-like patterns inside comments:
- Assignment: `= `, `+=`, `-=`, `:=`
- Function calls: `word(`, `word.word(`
- Control flow: `if `, `else`, `for `, `while `, `return `, `switch `
- Brackets/braces: `{`, `}`, `[`, `]`
- Semicolons at end of line: `;$`
- Import/require: `import `, `require(`, `from `, `use `, `include`

Algorithm:
1. Walk each file line by line
2. Track runs of consecutive comment lines (allowing up to 1 blank line gap)
3. For runs of 5+ lines, check if >60% match code-like patterns
4. If yes, flag as commented-out code

Severity for commented-out code:
- 5-15 lines → `minor`
- 16-50 lines → `major`
- 50+ lines → `major` (with a note suggesting extraction or deletion)

Age the block using git blame on the first line of the block.

### Step 4: Detect Deprecated API Usage

Scan for common deprecated API patterns:

**JavaScript/TypeScript:**
- `@deprecated` JSDoc tag in consumed code (not declarations)
- `arguments` keyword in non-legacy contexts
- `document.write(`
- `with (` statements
- `__proto__` direct access
- `new Buffer(` (deprecated since Node 6)
- `url.parse(` (deprecated in favor of `new URL()`)
- `require('domain')`, `require('sys')`

**Python:**
- `@deprecated` decorators
- `imp` module usage (use `importlib`)
- `optparse` (use `argparse`)
- `os.popen(` (use `subprocess`)
- `cgi` module (deprecated in 3.11)
- `unittest.makeSuite` (removed in 3.13)
- `asyncio.get_event_loop()` in scripts (use `asyncio.run()`)
- `typing.Dict`, `typing.List`, `typing.Optional` (use builtins since 3.9)

**Java:**
- `@Deprecated` annotations on consumed methods
- `Date()` constructor (use `java.time`)
- `StringBuffer` in non-threaded contexts (use `StringBuilder`)
- `Vector` (use `ArrayList`)
- `Hashtable` (use `HashMap`)

**Go:**
- `// Deprecated:` comment convention
- `ioutil` package (deprecated in Go 1.16)
- `io/ioutil.ReadAll` (use `io.ReadAll`)
- `io/ioutil.ReadFile` (use `os.ReadFile`)

**General:**
- `console.log` used as debugging (in production code, not test files) — classify as `info` only

Each deprecated API finding:
- `minor` if the deprecated API still works in current runtime versions
- `major` if the API is removed or scheduled for removal in the next major version

### Step 5: Detect Stub Implementations

Scan for stub/placeholder implementations:

```bash
git ls-files | xargs grep -n -E \
  'throw new Error\(.*(not implemented|TODO|FIXME|stub|placeholder)' \
  2>/dev/null

git ls-files | xargs grep -n -E \
  'raise NotImplementedError|raise NotImplemented' \
  2>/dev/null

git ls-files | xargs grep -n -E \
  'panic\("not implemented"\)|panic\("TODO"\)|unimplemented!\(\)' \
  2>/dev/null

git ls-files | xargs grep -n -E \
  'pass\s*#.*TODO|pass\s*#.*stub|pass\s*#.*implement' \
  2>/dev/null
```

Stub patterns per language:
- **JS/TS:** `throw new Error("not implemented")`, `throw new Error("TODO")`, `return undefined // TODO`
- **Python:** `raise NotImplementedError`, `pass # TODO`, `...  # placeholder`
- **Go:** `panic("not implemented")`, `panic("TODO")`, `return nil // stub`
- **Rust:** `unimplemented!()`, `todo!()`
- **Java:** `throw new UnsupportedOperationException()`
- **C#:** `throw new NotImplementedException()`

Filter: Skip test files (stubs in tests are normal mocking patterns).

Severity:
- Stub in test file → skip (not a finding)
- Stub in non-test file < 90 days old → `minor`
- Stub in non-test file > 90 days old → `major`
- Stub in critical path (auth, payment, validation) → `major` regardless of age

### Step 6: Detect Long-Lived Feature Flags

Scan for feature flag patterns that have been "temporary" for too long:

```bash
# Common feature flag patterns
git ls-files | xargs grep -n -i -E \
  '(feature_flag|featureFlag|FEATURE_|FF_|feature_toggle|isEnabled|is_enabled)\s*[=(]' \
  2>/dev/null

# Environment-variable-based flags
git ls-files | xargs grep -n -E \
  'process\.env\.(ENABLE_|DISABLE_|USE_NEW_|FEATURE_|FF_)|os\.environ\.get\(.*(ENABLE_|FEATURE_|FF_)' \
  2>/dev/null

# Config-file-based flags
git ls-files -z -- '*.json' '*.yaml' '*.yml' '*.toml' | xargs -0 grep -n -i -E \
  '"(feature|flag|toggle|experiment)"' \
  2>/dev/null
```

For each flag:
1. Use `git blame` to determine when the flag was introduced
2. Check if the flag is used in only one branch of a conditional (dead toggle — always on or always off)
3. Check for comments like `// temporary`, `// remove after`, `// experiment`

Severity:
- Flag < 90 days old → `info` (active experiment, no penalty)
- Flag 90-180 days with `// temporary` comment → `minor`
- Flag > 180 days → `minor`
- Flag > 365 days → `major` (this is permanent code pretending to be temporary)

### Step 6b: Cross-Reference Hardcoded Credentials as Debt

Hardcoded credentials are primarily a secrets issue, but they are also technical debt — someone took a shortcut that was never cleaned up. Scan for patterns that the secrets skill would catch, but classify them through a debt lens:

```bash
# Look for hardcoded API keys, tokens, or connection strings in source (not .env files)
git ls-files -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.go' '*.java' '*.rb' | \
  xargs grep -n -E "(api[_-]?key|apiKey|API_KEY|secret[_-]?key|secretKey)\s*[:=]\s*['\"][A-Za-z0-9]" 2>/dev/null
```

If found, emit as:
- `major` — "Hardcoded credential used instead of environment variable" (the debt dimension concerns itself with *why* the shortcut exists and *when* it should be fixed, not the security implication which the secrets skill handles)
- Use git blame to age these — if > 90 days, the shortcut has calcified into debt

This is intentional overlap with `tenet-secrets`. The secrets skill flags the security severity; the debt skill flags the engineering practice. The dashboard can deduplicate by file+line if desired.

### Step 7: Compute Score

Apply the standard scoring formula:

```
score = 100 - (5 * critical) - (2 * major) - (0.5 * minor)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding, not banker's rounding
```

Info findings do NOT affect the score.

### Step 8: Write Report

Write the dimension report to `.healthcheck/reports/debt.json`:

```json
{
  "key": "debt",
  "score": 78,
  "weight": 1.1,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Found 14 aged TODO/FIXME markers (3 over a year old), 2 commented-out code blocks totaling 34 lines, and 1 stub implementation in production code.",
  "metrics": {
    "total_markers": 22,
    "aged_markers_90d": 14,
    "aged_markers_365d": 3,
    "commented_out_blocks": 2,
    "commented_out_lines": 34,
    "deprecated_api_usages": 4,
    "stub_implementations": 1,
    "stale_feature_flags": 2,
    "median_marker_age_days": 142,
    "oldest_marker_age_days": 892
  },
  "findings": [ ... ]
}
```

Each finding follows the schema in `shared/schema.json` and includes a `fix_prompt` following the template in `shared/fix_prompt_template.md`.

## Confidence Tiers

| Detection Method | Confidence |
|---|---|
| TODO/FIXME/HACK/XXX grep match + git blame age | `deterministic` |
| Commented-out code block (heuristic ratio) | `heuristic` |
| Deprecated API usage (pattern match) | `native` |
| Stub implementation (pattern match) | `native` |
| Feature flag age (git blame) | `heuristic` |

## fix_prompt Examples

### Example 1: Old TODO Comment (major — over 365 days)

```
# Fix: Remove or resolve ancient TODO comment

## Context
A TODO comment has been sitting in the codebase for over 2 years. It either needs to be
implemented or removed if the feature was abandoned.

## Location
- File: src/services/userService.ts
- Line: 87
- Dimension: debt / major

## Current behavior
```typescript
// TODO: Add rate limiting to user creation endpoint (added 2023-01-15)
async function createUser(data: CreateUserDTO): Promise<User> {
```

## Required change
1. Determine if rate limiting is still desired for this endpoint
2. If YES: implement rate limiting using the project's existing middleware pattern (check `src/middleware/` for examples), then remove the TODO
3. If NO: delete the TODO comment entirely — dead intent is worse than no comment
4. If unsure: create a ticket/issue and replace the TODO with `// See TICKET-XXX` so there is a traceable link

## Constraints
- Do not change the function signature of `createUser`
- If adding rate limiting, use the same middleware pattern used elsewhere in the project
- Preserve existing test behavior

## Verification
- `grep -rn "TODO.*rate limit" src/services/userService.ts` should return no results
- `npm test` passes
- If rate limiting was added, test with rapid successive calls to verify it works
```

### Example 2: Commented-Out Code Block (minor — 12 lines)

```
# Fix: Remove commented-out code block

## Context
A 12-line block of commented-out code exists in the payment processing module. Commented-out
code provides no value — it adds confusion, bloats diffs, and is already preserved in git history.

## Location
- File: src/payments/processor.ts
- Line: 134
- Dimension: debt / minor

## Current behavior
```typescript
// function processRefund(orderId: string): Promise<void> {
//   const order = await getOrder(orderId);
//   if (order.status !== 'completed') {
//     throw new Error('Cannot refund incomplete order');
//   }
//   const refund = await stripe.refunds.create({
//     payment_intent: order.paymentIntentId,
//   });
//   await updateOrder(orderId, { status: 'refunded', refundId: refund.id });
//   await notifyCustomer(order.customerId, 'refund_processed');
//   logger.info(`Refund processed for order ${orderId}`);
// }
```

## Required change
1. Delete lines 134-145 entirely
2. If refund processing is planned, the code is preserved in git history at commit where it was commented out — reference that commit in a TODO or ticket instead
3. Check if any other code references `processRefund` — if so, those references also need cleanup

## Constraints
- Do not modify any active (non-commented) code
- If `processRefund` is referenced elsewhere, note it but do not remove those references without understanding the intent

## Verification
- `grep -c "processRefund" src/payments/processor.ts` should return 0
- `npm test` passes (the commented code was not executed, so tests should be unaffected)
```

### Example 3: Stub Implementation (major — in production code, 140 days old)

```
# Fix: Implement or remove stub in production code

## Context
A `NotImplementedError` stub has been sitting in the data export module for over 4 months.
Stub implementations in production code are time bombs — callers may assume the function works.

## Location
- File: src/export/csvExporter.ts
- Line: 23
- Dimension: debt / major

## Current behavior
```typescript
export function exportToCSV(data: ExportableData[], options: ExportOptions): string {
  throw new Error("not implemented — waiting on CSV library decision");
}
```

## Required change
1. Check if `exportToCSV` is called anywhere: `grep -rn "exportToCSV" src/`
2. If it IS called: implement the function. Use a CSV serialization approach consistent with the project (check for existing CSV dependencies in package.json, or use a simple manual approach for small datasets)
3. If it is NOT called: delete the function and its export. Dead stubs accumulate.
4. If implementation is blocked: replace the stub with a proper error that includes context, e.g., `throw new Error("CSV export is not yet available. Use JSON export instead: exportToJSON()")`

## Constraints
- Do not add new dependencies without checking the project's dependency policy
- Preserve the function signature `(data: ExportableData[], options: ExportOptions): string` if implementing
- Add a unit test for the implementation

## Verification
- `grep -rn "not implemented" src/export/csvExporter.ts` should return no results
- `npm test` passes
- If implemented: verify with a simple test case that the output is valid CSV
```

## Constraints

- **Pure grep + git blame:** No external toolchain tools required. This skill is self-contained.
- **Respect .gitignore:** Always use `git ls-files` as the file list source. Never scan `node_modules/`, `vendor/`, or other excluded directories.
- **Age is authoritative:** The git blame date is the ground truth for how old a debt marker is. Do not infer age from comment text like "added 2023-01-15" — always use blame.
- **No false positives from tests:** Stubs in test files are mocking patterns, not debt. Skip them.
- **No false positives from generated code:** Skip files with `@generated`, `// Code generated`, or similar headers.
- **Scoring is arithmetic, not judgment:** Apply the formula mechanically. No LLM discretion in scoring.
- **Every finding needs a fix_prompt:** Even `info`-level findings must include an actionable fix_prompt.
- **Batch git blame calls:** For performance, batch blame calls per file rather than per line. Use `git blame --porcelain <file>` to get all lines at once, then extract specific line dates.
- **Cap findings:** If a file has 50+ TODO markers, report the file-level aggregate rather than 50 individual findings. Note the count and age distribution.

## Output

- `.healthcheck/reports/debt.json` — the dimension report with all findings, metrics, and score
