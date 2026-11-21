# Tenet Correctness — Rubric

Logic-bug finding types the `tenet-correctness` skill produces. Unlike pattern-based rubrics,
each of these requires **reading the code and stating a concrete failing input the system can
actually receive**. A finding with no "input X → wrong output Y" scenario is not a finding; drop it.

## Scoring Formula

```
score = 100 - (5 * critical + 2 * major + 0.5 * minor)
Floor 0, ceil 100, round to integer. Info findings do not affect score.
```

Severity is by **impact**, not by pattern: silent data/money corruption or wrong auth logic on a
critical path = critical; wrong result on a common input = major; wrong result only on a rare but
reachable edge case = minor. Unverified candidates are not reported at any severity.

---

## Control Flow

### CORR-COND-001: Inverted or Wrong Condition

- **Severity:** critical (auth/money/mutation path) / major / minor
- **Description:** A condition is negated wrongly, uses `&&` where `||` is meant (or vice versa),
  or a guard returns/throws on the valid case. The function takes the wrong branch for real input.
- **Detection:** Read the branch; construct an input that should take path A but takes path B.

### CORR-BOUND-001: Off-by-One / Boundary Error

- **Severity:** major / minor
- **Description:** `<=` vs `<`, `length` vs `length - 1`, inclusive/exclusive range mismatch,
  slice/substring/pagination bounds, empty/single/last-element mishandling.
- **Detection:** Trace empty, single-element, and last-index inputs.

### CORR-DEAD-001: Guard That Never Fires / Always-True / Always-False Logic

- **Severity:** major / minor
- **Description:** A condition that is always true or always false **so that an intended check
  never runs on real input** (a validation that can't fail, an early return that skips work the
  caller relies on, an accidental `switch` fallthrough). The finding is the missing behavior, not
  the dead branch. Unreachable code by itself is `tenet-debt`, not a correctness bug; do not
  report it here.
- **Detection:** Read; semgrep/eslint `no-constant-condition`/`no-fallthrough` if present.

---

## Data Flow

### CORR-COPY-001: Wrong Variable / Copy-Paste Error

- **Severity:** critical / major
- **Description:** After a duplicated block, the copy still references the original's variable, or
  a loop body uses the wrong index/entity. Two fields assigned the same value.
- **Detection:** Read duplicated blocks side by side; check each reference belongs to its block.

### CORR-NULL-001: Unguarded Null / Undefined / Optional Path

- **Severity:** major / minor
- **Description:** A value that can be null/undefined/absent is used without a guard, or optional
  chaining short-circuits to `undefined` that then flows into math or a required argument.
- **Detection:** Trace the nullable source to the use site.

### CORR-TYPE-001: Type Coercion / Comparison Error

- **Severity:** major / minor
- **Description:** JS `==` surprises, `NaN` comparison, falsy-collision (`0`/`""`/`false`) in a
  truthiness check that needed `=== undefined`, Python `is` vs `==`, integer-division truncation,
  floating-point money math.
- **Detection:** Read comparisons and arithmetic on user/domain values.

### CORR-CONTRACT-001: Caller/Callee Contract Mismatch

- **Severity:** major / minor
- **Description:** A caller assumes a return shape the function does not guarantee (sorted vs
  unsorted, empty array vs null, throws vs returns error), or passes a value in the wrong unit
  (cents vs dollars, seconds vs milliseconds, 0-based vs 1-based), producing wrong downstream
  behavior.
- **Detection:** Read the function's actual returns and parameter units against each call site's
  assumptions.

---

## Concurrency & Async

### CORR-AWAIT-001: Missing / Misplaced await

- **Severity:** critical / major
- **Description:** A missing `await` uses/returns/tests a Promise instead of its value; work runs
  after the response is sent; `forEach` with an async callback fires-and-forgets; ordering assumed
  that isn't guaranteed.
- **Detection:** Trace async calls; eslint `require-await`/`no-floating-promises` if present.

### CORR-RACE-001: Race Condition / TOCTOU

- **Severity:** critical / major
- **Description:** Check-then-act on shared or persistent state without a transaction/lock/atomic
  op (check balance→charge, check exists→create), so concurrent calls double-spend or double-write.
  Non-atomic read-modify-write on a counter.
- **Detection:** Find guard-then-side-effect sequences on shared state; confirm no atomicity.

### CORR-ATOMIC-001: Partial Failure Between Writes

- **Severity:** critical (money/auth/mutation path) / major
- **Description:** Two or more writes that must succeed or fail together run without a
  transaction or compensation. When a later one fails, the earlier one stays, leaving state that
  no code path repairs (charge captured but order not marked paid, row deleted but file kept).
- **Detection:** For each multi-write sequence, fail the second write and read what is left.

### CORR-IDEMP-001: Repeated Execution Duplicates a Side Effect

- **Severity:** critical (money/auth/mutation path) / major
- **Description:** A handler that can run more than once for one event (client retry,
  double-submit, queue or webhook redelivery, job retried after a crash) repeats a side effect:
  a second charge, a second email, a counter incremented twice.
- **Detection:** Confirm the handler really can be re-entered for the same event, then look for an
  idempotency key, dedupe check or conditional write. None present = finding.

---

## Invariants

### CORR-INVARIANT-001: Cross-Function Invariant Violation

- **Severity:** critical (money/entitlement/auth state) / major
- **Description:** A rule a value must always obey (a refund never exceeds the captured amount,
  stock never goes negative, status only moves forward, an order is fulfilled at most once) is
  broken by one of its write sites, even though each function reads correctly in isolation.
- **Detection:** Step 3b. Write the invariants, enumerate every write site repo-wide, test each
  site against each invariant with a request the system can really receive.

---

## State & Time

### CORR-STATE-001: State / Mutation Bug

- **Severity:** major / minor
- **Description:** Mutating a shared default argument, mutating a collection while iterating it, a
  cache never invalidated, a memo key missing an input, a stale closure capturing an old value.
- **Detection:** Read for in-place mutation of shared/captured state.

### CORR-TIME-001: Date / Timezone / Locale / Money Error

- **Severity:** major / minor
- **Description:** Naive date math across DST, mixing local and UTC, floating money instead of
  integer cents/decimal, off-by-one in date ranges, locale-dependent parsing.
- **Detection:** Read date/time and currency arithmetic.

---

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/correctness.json` | Valid JSON, matches schema, every finding has `fix_prompt` |
| Each finding | Has a concrete failing-input scenario in the description, `snippet`, `confidence` |
| `notes` | States which paths/files were reviewed AND which were not |
| `.healthcheck/state/correctness-coverage.json` | Valid JSON; lists only files read in full this run or carried from earlier runs |
| Carried-forward findings | Each re-read against current code; none dropped unread, none kept unverified |
| Score | Computed from severity counts via the standard formula |
