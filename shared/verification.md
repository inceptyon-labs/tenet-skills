# Finding Verification — the refute pass

A grep match is a *candidate*, not a finding. The single biggest quality problem with
junior-model security/quality audits is confident false positives: the model sees a pattern,
assumes exploitability, and emits a `critical` that a maintainer disproves in ten seconds —
which trains the maintainer to ignore the whole report.

**Every finding at `major` or `critical` MUST pass this verification pass before it enters
the report.** `minor`/`info` findings should pass a lighter version (at least confirm the
line exists and is not a fixture).

---

## The protocol

For each candidate finding:

### 1. Read the actual code

Open the file at the candidate line and read enough surrounding context to understand the
data flow — not just the matched line. If you cannot open the file and see the pattern, the
finding does not exist. Do not emit findings from a grep count alone.

### 2. Capture evidence

Quote the exact offending line(s) into the finding's `snippet` field (redacted per the
dimension's rules — e.g. secrets are masked). If you cannot quote the specific line that is
wrong, you have not verified it — drop it.

### 3. Trace controllability (for injection / SSRF / traversal / IDOR / XSS)

The vulnerability only exists if untrusted input actually reaches the sink. Walk it back:

- Where does the value come from? (`req.body`, `req.query`, `req.params`, a header, a
  webhook payload, a DB row that was itself user-written, a file, an env var?)
- Env vars, hardcoded constants, and server-controlled values are **not** attacker-controlled
  — a `query("... " + process.env.TABLE)` is not SQL injection.
- Is there a sanitizer, validator, allowlist, parameterization, or type coercion **between**
  the source and the sink? If yes, the sink is likely safe.

### 4. Actively try to refute it

Ask, in order, "what would make this NOT a real finding?" and check each:

- Is it in a **test file, fixture, example, mock, or seed script**? → not production; drop
  unless the dimension's test-file rule says otherwise.
- Is it **inside a comment or a docstring**? → not executable; drop.
- Is it **dead code** (unexported, unreferenced, behind an unreachable flag, a branch a
  constant makes impossible)? → drop. Code that cannot run cannot have a bug. If the dead code
  is itself a problem, that is a `tenet-debt` finding, not this dimension's.
- Can the bad input **actually arrive here**? Is there an upstream validator, schema, type
  constraint, or DB constraint that already rejects it? → drop.
- Does a **framework or library guarantee** already neutralize it? (An ORM query builder
  parameterizes by default; React escapes JSX text by default; a validated DTO already ran.)
- Is the "user input" actually **developer-controlled** (a literal, an enum, a config value)?
- Would the **documented safe pattern** for this library actually match my "unsafe" pattern?
  (See `shared/security-calibration.md` for the flag / do-NOT-flag pairs.)

If the finding survives every refutation attempt, keep it. If any refutation holds, drop it
and note the reason in the worklog so you do not re-derive it.

### 5. Set confidence honestly

`confidence` describes **how the finding was detected**, not whether it is real. Every finding
in the report is real; the tier tells the reader what kind of evidence backs it.

- Toolchain-confirmed (semgrep, gitleaks, tflint, eslint) → `deterministic`.
- You read the code and traced controllability end to end → `native` (or `tree_sitter` if
  via AST query).
- The offending line is itself the defect and needs no data-flow trace (a hardcoded secret, an
  empty catch, an unpinned action) but was found by grep in a language without native support
  → `heuristic`.

`heuristic` is **not** a bucket for "pattern matched but I could not confirm it." A candidate you
could not confirm is dropped, not tagged.

---

## Calibration rule

There is no tie-breaker for "might be real." A candidate is in one of two states:

- **Confirmed**: you can state the concrete input or state, the line, the wrong behavior, and
  why it is wrong, with the code open in front of you. Keep it at the severity its impact
  earns per `shared/severity.md`.
- **Not confirmed**: anything else, including "looks suspicious", "probably", "could not trace
  the input", and "refuted". Drop it. Do not emit it as `info`, do not emit it one tier lower
  with a disclaimer, do not keep it "just in case".

Do not overthink confirmation. It means reading the line, its callers, and the guards between
input and sink. It does not mean inventing multi-step scenarios to make a candidate work. If
you find yourself building a story about how the bad input *might* arrive, stop; that candidate
is not confirmed.

Zero findings for a dimension is a legitimate, expected result on healthy code. Report the
checks you ran as `passed` and move on.

The goal is a report where every finding is defensible line-by-line. A precise report of 6
real issues is worth more than a noisy report of 30 where 24 are wrong.

---

## Evidence in the finding

Every verified `major`/`critical` finding's `description` should make the trace explicit so a
reviewer can confirm it without re-doing the work:

> "`req.query.file` (user-controlled) flows unmodified into `path.join(UPLOAD_DIR, file)` at
> line 42 with no `..`/absolute-path check, allowing read of arbitrary files via
> `?file=../../etc/passwd`."

Not:

> "Possible path traversal in file handler."
