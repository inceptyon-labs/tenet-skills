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
wrong, you have not verified it — drop it or demote to `info`.

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

- Is it in a **test file, fixture, example, mock, or seed script**? → not production; demote
  or drop per the dimension's test-file rule.
- Is it **inside a comment or a docstring**? → not executable; drop.
- Is it **dead code** (unexported, unreferenced, behind an unreachable flag)? → demote.
- Does a **framework or library guarantee** already neutralize it? (An ORM query builder
  parameterizes by default; React escapes JSX text by default; a validated DTO already ran.)
- Is the "user input" actually **developer-controlled** (a literal, an enum, a config value)?
- Would the **documented safe pattern** for this library actually match my "unsafe" pattern?
  (See `shared/security-calibration.md` for the flag / do-NOT-flag pairs.)

If the finding survives every refutation attempt, keep it. If any refutation holds, drop it
or demote it and record why.

### 5. Set confidence honestly

- Toolchain-confirmed (semgrep, gitleaks, tflint, eslint) → `deterministic`.
- You read the code and traced controllability end to end → `native` (or `tree_sitter` if
  via AST query).
- Pattern matched and it looks right but you could not fully confirm controllability →
  `heuristic`, and prefer `major` over `critical` unless the sink is unambiguous.

---

## Calibration rule

When a finding sits on the boundary between "real" and "false positive," the tie-breaker
depends on severity and confidence:

- **High-confidence, high-impact** (traced controllability into a dangerous sink on a
  critical path): keep at full severity. Escalate per `shared/severity.md`.
- **Low-confidence pattern match** you could not trace: keep it, but as `heuristic` and one
  tier lower, and say "unverified — could not confirm the input is attacker-controlled" in
  the description. Do not inflate an unproven pattern to `critical`.
- **Refuted**: drop it. Do not emit a finding you have personally disproven "just in case."

The goal is a report where every `critical`/`major` is defensible line-by-line. A precise
report of 6 real issues is worth more than a noisy report of 30 where 24 are wrong.

---

## Evidence in the finding

Every verified `major`/`critical` finding's `description` should make the trace explicit so a
reviewer can confirm it without re-doing the work:

> "`req.query.file` (user-controlled) flows unmodified into `path.join(UPLOAD_DIR, file)` at
> line 42 with no `..`/absolute-path check, allowing read of arbitrary files via
> `?file=../../etc/passwd`."

Not:

> "Possible path traversal in file handler."
