---
name: tenet-correctness
description: "Tenet correctness dimension: finds confirmed logic bugs (off-by-one, inverted conditions, wrong-variable copy-paste, unawaited async, races, null paths) on reachable critical paths."
when_to_use: "tenet correctness, tenet-correctness dimension, Tenet logic-bug audit. Run via /tenet-skills:tenet-orchestrator or directly with /tenet-skills:tenet-correctness."
disable-model-invocation: true
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Correctness

> Reads the code asking one question the other dimensions never ask: *does this actually do what it means to do?*

## Purpose

The other Tenet dimensions check **shape and hygiene** — `tenet-complexity` measures how tangled
code is, `tenet-errors` checks that errors are handled, `tenet-solid` checks design. None of
them read a function and ask whether its logic is *correct*. This dimension is the code review:
it traces real data through the highest-risk code paths and looks for the bugs that ship —
off-by-one errors, inverted conditions, the wrong variable used after a copy-paste, an `await`
that's missing so the wrong value returns, a check that runs after the action it was supposed to
guard.

Correctness bugs cannot be found by grep, and they cannot be found by skimming. This skill works
by **selecting a bounded set of high-risk code and reading it deliberately**, tracing concrete
inputs. A single run does not attempt to read the whole repo — it spends its attention where a
bug hurts most. Coverage accumulates across runs: each run records what it reviewed, and the next
one spends its budget on code that is new, changed, or not yet read (Step 2).

Two passes reach past the review set, because some bugs cannot be seen one function at a time: the
invariant pass (Step 3b) checks every write to a money value or status field against the rules it
must obey, and the variant sweep (Step 5b) takes each confirmed bug and looks for the same mistake
everywhere else.

## What counts as a bug here — read first

A correctness finding is code that, **given input or state this system can actually receive,
produces a wrong result, a crash, or corrupted data**. Every one must be stated as:

> "With input X, line N does Y. Y is wrong because Z."

Filled in from the code in front of you, not from a story about what might happen. If you cannot
fill it in, there is no finding. Specifically, these are **not** correctness bugs and must not be
reported at any severity, including `info`:

- Code that cannot execute: unreferenced functions, branches behind constants, dead flags.
- Input that an upstream validator, schema, type, or DB constraint already stops.
- Unusual behavior that the callers, tests, or docstring show is intended.
- Hypotheticals about future changes, scale the app does not have, or callers that do not exist.
- Anything you refuted while checking it.

**Zero findings is a normal result.** Most well-tested functions you read will be correct. The
checklist in Step 3 is a set of lenses to read through, not a quota; do not produce one candidate
per lens to show you looked. **Do not overthink it.** Read the function, read its callers, decide.
If confirming a candidate requires more than a few minutes of speculation, it is not confirmed.
Drop it and move on.

There are two opposite failure modes and both cost the same: **skimming** (declaring a function
fine without tracing an input through it) and **inventing** (dressing a suspicion up as a bug to
have something to report). These protocols guard both:

- **`shared/scan-discipline.md`** — grep hygiene, the worklog, read every file in the selected
  set, systemic grouping, and §2a "report only issues that actually exist".
- **`shared/entry-points.md`** — the entry-point inventory feeds path selection (Step 2).
- **`shared/verification.md`** — every bug must be traced to a concrete failing input and
  survive a refutation pass before it ships (Step 5). Candidates from the invariant pass
  (Step 3b), the variant sweep (Step 5b) and the previous run's report get no shortcut.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python]
  tree_sitter: [go, rust, java, ruby, swift, kotlin, dart]
  heuristic: [php, csharp, cpp, c]
  skip: [markdown, css, json, yaml]
  note: "This skill reads code in any language. Native means idiom-aware tracing (async/await, Promises, nil handling); others are read carefully but with less idiom awareness."
```

## Toolchain Inputs

| File | Used For |
|------|----------|
| `.healthcheck/toolchain/language-census.json` | Scope + language mix (required) |
| `.healthcheck/toolchain/semgrep.json` | Import correctness-adjacent rules (e.g. `==` vs `is`, unreachable code) if present; set `confidence: deterministic` |
| `.healthcheck/toolchain/eslint.json` | Import `no-unsafe-optional-chaining`, `no-fallthrough`, `no-self-compare`, `require-await`, `no-constant-condition`, etc. |

This dimension is primarily **read-based** — the toolchain is a supplement, not the driver.

## Procedure

### Step 1: Applicability

If the repo has no application source code (docs/config/assets only), set `applicable: false`,
`score: null`, and stop. Otherwise proceed.

### Step 2: Select the Review Set (bounded — do NOT read everything)

You have limited attention. Spend it where bugs are most likely and most costly. Build the
review set from the union of:

1. **Critical paths** — anything touching auth, sessions, payments/billing, purchases and
   entitlements, money/quantity math, data mutation (writes/deletes/migrations), sync and merge,
   access control, and permission checks. Find them:
   ```bash
   git grep -ciE "password|login|session|token|auth|permission|role|charge|payment|invoice|price|refund|balance|checkout|order|transfer|purchase|entitlement|subscription|receipt|credit|quota|migrat" \
     -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.svelte' '*.vue' '*.py' '*.go' '*.rs' '*.java' '*.kt' '*.swift' '*.dart' '*.rb' '*.php' '*.cs' \
     ':!*.test.*' ':!*.spec.*' ':!*_test.*' ':!**/__tests__/**' ':!**/test/**' ':!**/tests/**' \
     | sort -t: -k2 -rn | head -40
   ```
   Output is `file:hits`, densest first. These are substring matches (`order` also hits
   `border`), so a file with one or two hits is usually noise; the top of the list is the signal.
   The keyword list is a starting point, not the definition: add the repo's own domain words
   (the nouns in its README and schema, plus `sync`/`merge` logic where the app has it) before
   trusting the result.
2. **Churn hotspots** — the source files changed most often are where bugs cluster:
   ```bash
   git log --since="6 months ago" --name-only --pretty=format: 2>/dev/null \
     | grep -E '\.(ts|tsx|js|jsx|mjs|svelte|vue|py|go|rs|java|kt|swift|dart|rb|php|cs)$' \
     | grep -vE '(\.test\.|\.spec\.|_test\.|/__tests__/|/tests?/)' \
     | sort | uniq -c | sort -rn | head -30
   ```
3. **Entry-point handlers** — from `shared/entry-points.md`, the functions that process external
   input.
4. **Complex functions** — if `.healthcheck/reports/complexity.json` exists, its high-complexity
   functions (branchy code hides logic bugs).

**Use what earlier runs already covered.** Two files from the previous run may be on disk; read
them before they are overwritten:

- `.healthcheck/reports/correctness.json` — its unsuppressed `findings` are carried forward as
  candidates. Each one is re-verified in Step 5 against the current code. A finding nobody fixed
  must not vanish from the report because this run looked elsewhere.
- `.healthcheck/state/correctness-coverage.json` — maps each file to the commit it was last
  reviewed at. A file is **covered** when it has not changed since that commit:
  ```bash
  mkdir -p .healthcheck/tmp
  jq -r '.files | to_entries[] | "\(.value) \(.key)"' .healthcheck/state/correctness-coverage.json 2>/dev/null \
    | while read -r sha f; do
        if [ -f "$f" ] && git diff --quiet "$sha" -- "$f" 2>/dev/null; then echo "$f"; fi
      done > .healthcheck/tmp/correctness-covered.txt
  ```
  No coverage file, or a commit git no longer knows, means not covered.

**Fill the budget in this order**, cutting from the bottom when it runs out:

1. Critical-path units that are not covered (never reviewed, or changed since).
2. Entry-point handlers that are not covered.
3. Churn hotspots and high-complexity functions that are not covered.
4. Any other source file that is not covered, largest first. This tier is what walks the rest of
   the repo over successive runs.
5. Covered critical-path units, oldest review first, only if budget remains.

For a unit that changed since its last review, also read its callers: a change that is correct in
isolation can break an assumption a caller still holds (Step 4).

Cap the set to a reviewable size (roughly 25–40 functions/files for a normal run; scale with
repo size). **Record in `notes` exactly which files/paths were reviewed and which were not** —
a single run does not claim whole-repo coverage, so state the scope honestly. When tiers 1–4 are
empty, every source file has been reviewed at its current content: say so in `notes`.

### Step 3: Read Each Selected Unit Deliberately

For every function in the review set, actually read it, trace one realistic input through it,
and read it through the lenses below. Append candidates to `.healthcheck/tmp/correctness-worklog.md`
as you find them, each with its one-sentence "input X → line N does Y → wrong because Z". A
function that passes every lens gets a one-line "read, OK" entry in the worklog and nothing else.

**a. Trace one concrete input end-to-end.** Pick a realistic input (and an empty one, and a
boundary one) and mentally execute the function. Does the returned/written value match the
function's stated intent (name, doc, caller expectation)?

**b. Boundary & off-by-one.** Empty collection, single element, max/last index, zero, negative,
exactly-at-limit. Look for `<=` where `<` is meant (and vice versa), `length` vs `length - 1`,
slice/substring bounds, pagination offsets, inclusive/exclusive range mismatches.

**c. Inverted / wrong conditions.** `if (!user)` vs `if (user)`, `&&` where `||` is meant,
negation errors, a guard that returns/throws on the *valid* case, De Morgan mistakes, an early
return that fires on the wrong branch.

**d. Wrong variable / copy-paste.** After a duplicated block, is the second copy still using the
first block's variable (`a.x` used where `b.x` was meant)? Loop body referencing the wrong index
or the outer loop's variable. Same value assigned to two fields.

**e. Async ordering & missing await.** A missing `await` so a Promise (not its value) is used,
returned, or truthiness-checked. Work done *after* the response is sent. `await` inside a loop
that should be parallel, or `Promise.all` where order matters. `forEach` with an async callback
(fires and forgets). Return value read before the async write completes.

**f. Race conditions & TOCTOU.** Check-then-act on shared/persistent state (check balance →
charge; check exists → create) with no transaction/lock/atomic op — two concurrent calls
double-spend or double-create. Non-atomic read-modify-write on a counter.

**g. Null / undefined / optional paths.** A value that can be `null`/`undefined`/absent used
without a guard; optional chaining that short-circuits to `undefined` then flows into math or a
required arg; a default that masks a real missing value; `JSON.parse` of possibly-empty input.

**h. Type coercion & comparison.** JS `==` surprises, `NaN` comparisons, `0`/`""`/`false`
falsy-collision in a truthiness check that should be an explicit `=== undefined`, Python `is`
vs `==`, integer division truncation, float money math (should be integer cents/decimal).

**i. Error handling that changes the result.** A `catch` that returns a default the caller can't
distinguish from success (see `tenet-errors`, but here focus on *correctness* impact: does
swallowing produce a *wrong answer* silently?).

**j. State & mutation bugs.** Mutating a shared/default argument, mutating an array while
iterating it, a cache never invalidated, a memoization key that misses an input, stale closure
capturing an old value.

**k. Time, timezone, locale, money, units.** Naive date math across DST, mixing local and UTC,
floating money, off-by-one in date ranges, locale-dependent parsing. A value crossing a boundary
in the wrong unit: cents passed where dollars are expected, seconds where milliseconds are, a
0-based index where the callee counts from 1.

**l. Partial failure and repeats.** Two writes that must move together with no transaction
between them: if the second fails, what state is left, and does anything repair it? A handler
that can run twice for one event (client retry, double-submit, queue or webhook redelivery, a job
retried after a crash halfway): does the second run repeat a side effect (a second charge, a
second email, a counter incremented twice)?

### Step 3b: Invariant Pass (money and state)

The lenses above look at one function at a time. Some bugs exist only across functions: each one
reads fine, and together they let a refund exceed its charge. For the values whose corruption
costs the most in this repo (balances, credits, stock or quantity, the status of an order,
subscription or entitlement; pick at most five):

1. **Write the invariants** in the worklog, one line each, taken from what the code, schema and
   tests show is intended: "a refund never exceeds the captured amount", "stock never goes
   negative", "an order is fulfilled at most once", "status only moves forward".
2. **Enumerate every site that writes the value, repo-wide**, not only inside the review set
   (`git grep` the column, field, setter or model method). This is an enumeration step under
   `shared/scan-discipline.md` §2: build the full list, then check each entry off.
3. **Test each write site against each invariant.** Can a request this system really receive break
   it: a second call, two concurrent calls, a zero, negative or oversized amount, a call out of
   order (refund before capture, cancel after fulfil), a failure between two writes?

A write site that breaks an invariant is a candidate like any other. It needs its
"input X → line N does Y → wrong because Z" sentence and goes through Steps 4 and 5. If the repo
has no money values or stateful entities, record "no stateful values" in the worklog and move on.

### Step 4: Cross-Reference Callers

For any suspected bug, read the call sites (`git grep` the function name). A bug is only real if
a caller can actually trigger the bad path with reachable input. This also catches
**contract mismatches** — a caller assuming the function returns a sorted array, an empty array
vs null, or throws vs returns an error.

### Step 5: Verify & Refute (MANDATORY)

Per `shared/verification.md`, for every candidate:
- State the **concrete failing input → wrong output/crash** in one sentence. If you cannot, it is
  not a bug. Drop it. Do not keep it as `info`.
- Try to refute: is there an upstream guard, a validator, a type constraint, a DB constraint, or
  a framework guarantee that prevents the bad input from reaching this line? Is the path dead?
  Does a test assert this behavior on purpose? Any yes → drop.
- Quote the offending line(s) into `snippet`.
- For a `critical`, write the trace hop by hop in the worklog: each step from the entry point to
  the wrong outcome as `file:line`. A hop you cannot cite means the candidate is not confirmed.
  Then re-read the function from its first line as if the worklog entry did not exist and try to
  make it produce the right answer for input X. If it does, drop the candidate.
- Findings carried forward from the previous report (Step 2) are candidates, not findings.
  Re-read the line: still wrong keeps it, fixed or gone drops it.

Only bugs with a stated failing scenario that survive refutation ship, at any severity.

### Step 5b: Variant Sweep

A confirmed bug usually has siblings outside the review set: the same copy-pasted block, the same
helper misused by another caller. For each distinct root cause among the confirmed findings:

1. **State the root cause as the rule the code broke**, in one line: "callers treat `findUser()`
   as non-null, but it returns null for soft-deleted users".
2. **Search for it repo-wide.** Start with a `git grep` pattern that matches the known instance.
   If it does not hit the known line, the pattern is wrong; fix it before going further. Then
   widen one element at a time (other callers of the helper, the same idiom with other variable
   names). Size each result before reading it (`shared/scan-discipline.md` §1).
3. **Verify every hit on its own** through Steps 4 and 5. A hit is a candidate. Similar code
   elsewhere often has the guard the original lacked.
4. **Fold confirmed variants into the original finding**, listing every `file:line`
   (`shared/scan-discipline.md` §4). Five or more files triggers the systemic escalation in
   `shared/severity.md`.

One sweep per root cause. A confirmed variant does not start another sweep.

### Step 6: Score & Write Report

Severity mapping (all rows assume a confirmed bug; unconfirmed candidates were dropped in Step 5):

| Impact | Severity |
|---|---|
| Silent data corruption, money/quantity error, auth/permission logic wrong, double-spend/double-write on a critical path | critical |
| Incorrect result on a common/expected input path; crash on realistic input; race on shared state | major |
| Wrong result only on a rare but reachable edge case, or in a non-critical path | minor |
| (not used for bugs) A confirmed contract mismatch the current callers happen to tolerate, worth a conscious decision | info |

Apply escalation from `shared/severity.md` (critical path, systemic across 5+ files). Then the
standard formula:

```
score = 100 - (5 * critical + 2 * major + 0.5 * minor)
score = max(0, min(100, int(score + 0.5)))
```

Apply suppressions (`shared/suppressions.md`). Write `.healthcheck/reports/correctness.json`, with
`skill_version` set to `1.1.0`:

```json
{
  "key": "correctness",
  "score": 78,
  "weight": 1.3,
  "skill_version": "1.1.0",
  "applicable": true,
  "notes": "Reviewed 31 functions across auth (8), billing (6), order mutation (9), and top churn files (8). Did NOT review the admin UI or reporting modules. Found 1 critical double-charge race in checkout, 1 major off-by-one in pagination, and 4 minor null-path bugs. Checked 3 invariants on order status and balance across 14 write sites. 1 variant sweep found 2 more sites of the pagination bug. 2 findings carried forward from the previous run, 1 now fixed.",
  "metrics": {
    "units_reviewed": 31,
    "critical_paths_covered": ["auth", "billing", "orders"],
    "not_reviewed": ["admin-ui", "reporting"],
    "churn_hotspots_reviewed": 8,
    "invariants_checked": 3,
    "write_sites_checked": 14,
    "variant_sweeps": 1,
    "variants_confirmed": 2,
    "carried_forward": 2,
    "carried_forward_fixed": 1,
    "source_files_covered": 58,
    "source_files_total": 212,
    "suppressed_count": 0,
    "confidence_breakdown": { "native": 5, "heuristic": 1 }
  },
  "checks": [
    { "name": "Critical-path trace (auth)", "status": "passed", "description": "Traced login/session flows; no logic error found" },
    { "name": "Critical-path trace (billing)", "status": "failed", "count": 1, "description": "Double-charge race in checkout" },
    { "name": "Boundary/off-by-one review", "status": "failed", "count": 1 },
    { "name": "Null/undefined path review", "status": "failed", "count": 4 },
    { "name": "Invariant pass (order status, balance)", "status": "passed", "count": 0, "description": "14 write sites checked against 3 invariants" },
    { "name": "Variant sweep", "status": "failed", "count": 2, "description": "Pagination off-by-one repeated in 2 other list endpoints" }
  ],
  "findings": [ ... ]
}
```

Then update `.healthcheck/state/correctness-coverage.json` so the next run can rotate. Set every
file reviewed in this run to the current commit and keep the entries for files this run did not
touch:

```json
{ "files": { "src/orders/checkout.ts": "a1b2c3d", "src/auth/session.ts": "9f8e7d6" } }
```

Only list a file here if every function in it was read in Step 3. A file opened to check one
caller is not covered. If the working tree has uncommitted changes to a reviewed file, leave it
out so the next run reads it again.

Delete `.healthcheck/tmp/correctness-*` scratch files when done.

## Confidence Tiers

| Tier | When Used |
|------|-----------|
| `deterministic` | Imported from semgrep/eslint correctness rule |
| `native` | Traced the logic in a native-support language with a concrete failing input |
| `tree_sitter` | AST-assisted read in a tree_sitter language |
| `heuristic` | Traced with a concrete failing input in a heuristic-support language (less idiom awareness) |

Confidence describes how the bug was found. It never means "not sure it is a bug"; those are dropped.

## Constraints

- NEVER emit a finding at any severity without a concrete "input X → wrong output Y" scenario in
  the description and the offending line in `snippet`.
- NEVER report a bug on a path that cannot execute or with input that cannot arrive. Code that
  can never run has no correctness bugs (dead code belongs to `tenet-debt`).
- NEVER pad the report. Zero findings is a valid result; state what was reviewed in `notes` and
  mark the checks `passed`.
- NEVER claim whole-repo coverage for a single run. Always list what was reviewed and what was not
  in `notes`. Whole-repo coverage is claimed only when the coverage file shows every source file
  reviewed at its current content.
- NEVER drop a previous run's finding without re-reading its line. Unfixed bugs carry forward.
- NEVER report a variant-sweep hit or an invariant violation that has not been through Steps 4
  and 5 on its own. A matching pattern is a candidate.
- NEVER re-report issues owned by other dimensions as correctness: pure error-handling gaps →
  `tenet-errors`; security-exploitable logic (IDOR, injection) → `tenet-security`; slow-but-correct
  code → `tenet-performance`. This dimension is for code that produces the *wrong answer*. (If a
  logic bug is *also* a security hole, the security skill owns it — cross-reference, don't double-count.)
- NEVER flag intended behavior as a bug because it's unusual — read the callers and docs first.
- ALWAYS read call sites before confirming (Step 4).
- Group systemic bugs (same mistake in 5+ places) into one finding; escalate per severity.md.
- Every finding MUST include a `fix_prompt` per `shared/fix_prompt_template.md`.

## fix_prompt Examples

### Example 1: Missing await returns a Promise instead of the value

```
# Fix: getBalance returns a Promise, so the overdraft check never runs

## Context
`withdraw` calls `getBalance(userId)` without awaiting it. `balance` is a Promise, which is
always truthy, so `balance < amount` is `Promise < number` → coerces to `NaN < amount` → always
false. The overdraft guard never triggers and any withdrawal succeeds regardless of balance.

## Location
- File: src/banking/withdraw.ts
- Line: 12
- Dimension: correctness / critical

## Current behavior
```typescript
async function withdraw(userId: string, amount: number) {
  const balance = getBalance(userId);      // missing await
  if (balance < amount) throw new Error('Insufficient funds');
  return debit(userId, amount);
}
```

## Required change
```typescript
const balance = await getBalance(userId);
if (balance < amount) throw new Error('Insufficient funds');
```

## Constraints
- Do not change the function signature or the error message
- Audit sibling calls to getBalance for the same missing await

## Verification
- Add a test: balance 50, withdraw 100 → expect it to throw, not succeed
- Run: `npm test -- --grep "withdraw"`
- `git grep -nE "getBalance\(" src/ | grep -v await` should return nothing
```

### Example 2: Check-then-act race allows double charge

```
# Fix: Concurrent checkout calls can charge a cart twice

## Context
`checkout` reads the order status, and if it is still `pending`, charges the card and marks it
`paid`. Two requests for the same order (double-click, retry) both read `pending` before either
writes `paid`, so the card is charged twice. The read and the write are not atomic.

## Location
- File: src/orders/checkout.ts
- Line: 20
- Dimension: correctness / critical

## Current behavior
```typescript
const order = await db.orders.findById(id);
if (order.status !== 'pending') return order;   // guard
await chargeCard(order);                          // side effect
await db.orders.update(id, { status: 'paid' });
```

## Required change
Make the status transition atomic so only one caller wins the guard. Use a conditional update
(or a transaction with row lock):
```typescript
const claimed = await db.orders.update(
  { id, status: 'pending' },          // only matches if still pending
  { status: 'charging' }
);
if (claimed.count === 0) return db.orders.findById(id);  // someone else claimed it
await chargeCard(claimed.row);
await db.orders.update({ id }, { status: 'paid' });
```

## Constraints
- The claim must be a single atomic conditional write, not a read-then-write
- On charge failure, reset status so the order isn't stuck in `charging`
- Preserve idempotency for the legitimate retry case

## Verification
- Add a concurrency test: fire two checkouts for one order → exactly one chargeCard call
- Run: `npm test -- --grep "checkout"`
```

## Edge Cases

- **Generated code** (codegen, protobuf, migrations authored by a tool): note it and lower
  severity — the source of truth is the generator, not the output.
- **Intentional loose typing / prototypes / spikes**: if a file is clearly a prototype (README
  says so, `experimental/` dir), note context and prefer `minor`.
- **Monorepo**: select the review set per package; a bug in one package's logic is that package's.
- **Tests as documentation**: if a test asserts the "buggy" behavior on purpose, re-read — it may
  be intended. Cross-check the test's intent before flagging.
