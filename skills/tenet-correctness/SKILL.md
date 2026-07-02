---
name: tenet-correctness
description: "Hunts logic and correctness bugs: off-by-one, inverted conditions, wrong-variable copy-paste, unawaited async, race conditions, null paths, and boundary errors on critical paths."
when_to_use: "Code review, logic bug hunt, correctness audit, does this actually work, find bugs, tenet correctness"
model: sonnet
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
inputs. It does not attempt to read the whole repo — it spends its attention where a bug hurts
most.

## How to run this audit — read first

Executed by a Sonnet-class model. The failure mode here is *shallow reading* — glancing at a
function and declaring it fine. These protocols force depth over breadth:

- **`shared/scan-discipline.md`** — grep hygiene, the worklog, anti-laziness (read every file in
  the selected set, do not sample within it), systemic grouping.
- **`shared/entry-points.md`** — the entry-point inventory feeds path selection (Step 2).
- **`shared/verification.md`** — every bug must be traced to a concrete failing input and
  survive a refutation pass before it ships (Step 5). This is what separates a real bug from
  "this looks suspicious."

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

1. **Critical paths** — anything touching auth, sessions, payments/billing, money/quantity math,
   data mutation (writes/deletes/migrations), access control, and permission checks. Find them:
   ```bash
   git grep -lnE "password|login|session|token|auth|permission|role|charge|payment|invoice|price|refund|balance|checkout|order|transfer" -- '*.ts' '*.js' '*.py' '*.go' '*.rs' '*.java' '*.swift' '*.dart'
   ```
2. **Churn hotspots** — the files changed most often are where bugs cluster:
   ```bash
   git log --since="6 months ago" --name-only --pretty=format: 2>/dev/null \
     | grep -vE '^$' | sort | uniq -c | sort -rn | head -30
   ```
3. **Entry-point handlers** — from `shared/entry-points.md`, the functions that process external
   input.
4. **Complex functions** — if `.healthcheck/reports/complexity.json` exists, its high-complexity
   functions (branchy code hides logic bugs).

Cap the set to a reviewable size (roughly 25–40 functions/files for a normal run; scale with
repo size). **Record in `notes` exactly which files/paths were reviewed and which were not** —
this dimension explicitly does not claim whole-repo coverage, so state the scope honestly.

### Step 3: Read Each Selected Unit Deliberately

For every function in the review set, actually read it and run these checks. Append candidates
to `.healthcheck/tmp/correctness-worklog.md` as you find them.

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

**k. Time, timezone, locale, money.** Naive date math across DST, mixing local and UTC, floating
money, off-by-one in date ranges, locale-dependent parsing.

### Step 4: Cross-Reference Callers

For any suspected bug, read the call sites (`git grep` the function name). A bug is only real if
a caller can actually trigger the bad path with reachable input. This also catches
**contract mismatches** — a caller assuming the function returns a sorted array, an empty array
vs null, or throws vs returns an error.

### Step 5: Verify & Refute (MANDATORY)

Per `shared/verification.md`, for every candidate:
- State the **concrete failing input → wrong output/crash** in one sentence. If you cannot, it is
  not a confirmed bug — demote to `info` ("suspicious, unverified") or drop.
- Try to refute: is there an upstream guard, a validator, a type constraint, a DB constraint, or
  a framework guarantee that prevents the bad input from reaching this line? Is the path dead?
- Quote the offending line(s) into `snippet`.

Only bugs with a stated failing scenario that survive refutation ship at `major`/`critical`.

### Step 6: Score & Write Report

Severity mapping:

| Impact | Severity |
|---|---|
| Silent data corruption, money/quantity error, auth/permission logic wrong, double-spend/double-write on a critical path | critical |
| Incorrect result on a common/expected input path; crash on realistic input; race on shared state | major |
| Bug only on an unusual edge case; wrong result in a non-critical path; unverified-but-plausible | minor |
| Suspicious pattern you could not confirm reaches a bad state | info |

Apply escalation from `shared/severity.md` (critical path, systemic across 5+ files). Then the
standard formula:

```
score = 100 - (5 * critical + 2 * major + 0.5 * minor)
score = max(0, min(100, int(score + 0.5)))
```

Apply suppressions (`shared/suppressions.md`). Write `.healthcheck/reports/correctness.json`:

```json
{
  "key": "correctness",
  "score": 78,
  "weight": 1.3,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Reviewed 31 functions across auth (8), billing (6), order mutation (9), and top churn files (8). Did NOT review the admin UI or reporting modules. Found 1 critical double-charge race in checkout, 1 major off-by-one in pagination, and 4 minor null-path bugs.",
  "metrics": {
    "units_reviewed": 31,
    "critical_paths_covered": ["auth", "billing", "orders"],
    "not_reviewed": ["admin-ui", "reporting"],
    "churn_hotspots_reviewed": 8,
    "suppressed_count": 0,
    "confidence_breakdown": { "native": 5, "heuristic": 1 }
  },
  "checks": [
    { "name": "Critical-path trace (auth)", "status": "passed", "description": "Traced login/session flows; no logic error found" },
    { "name": "Critical-path trace (billing)", "status": "failed", "count": 1, "description": "Double-charge race in checkout" },
    { "name": "Boundary/off-by-one review", "status": "failed", "count": 1 },
    { "name": "Null/undefined path review", "status": "failed", "count": 4 }
  ],
  "findings": [ ... ]
}
```

Delete `.healthcheck/tmp/correctness-*.md` scratch files when done.

## Confidence Tiers

| Tier | When Used |
|------|-----------|
| `deterministic` | Imported from semgrep/eslint correctness rule |
| `native` | Traced the logic in a native-support language with a concrete failing input |
| `tree_sitter` | AST-assisted read in a tree_sitter language |
| `heuristic` | Suspicious pattern, failing input not fully confirmed |

## Constraints

- NEVER emit a `major`/`critical` without a concrete "input X → wrong output Y" scenario in the
  `failure_scenario`/description and the offending line in `snippet`.
- NEVER claim whole-repo coverage. Always list what was reviewed and what was not in `notes`.
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
