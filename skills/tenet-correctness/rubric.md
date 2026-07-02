# Tenet Correctness — Rubric

Logic-bug finding types the `tenet-correctness` skill produces. Unlike pattern-based rubrics,
each of these requires **reading the code and stating a concrete failing input**. A finding with
no "input X → wrong output Y" scenario is not confirmed — demote to `info` or drop.

## Scoring Formula

```
score = 100 - (5 * critical + 2 * major + 0.5 * minor)
Floor 0, ceil 100, round to integer. Info findings do not affect score.
```

Severity is by **impact**, not by pattern: silent data/money corruption or wrong auth logic on a
critical path = critical; wrong result on a common input = major; edge-case-only or unverified =
minor/info.

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

### CORR-DEAD-001: Unreachable / Always-True / Always-False Logic

- **Severity:** major / minor
- **Description:** A condition that can never be true (or is always true), an early return that
  makes later code dead, a `switch` fallthrough, a constant condition.
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
  unsorted, empty array vs null, throws vs returns error), producing wrong downstream behavior.
- **Detection:** Read the function's actual returns against each call site's assumptions.

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
| Score | Computed from severity counts via the standard formula |
