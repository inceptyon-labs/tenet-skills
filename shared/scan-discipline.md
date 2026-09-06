# Scan Discipline

How to run a Tenet dimension scan without drowning in noise, running out of context, or
quietly giving up halfway. **Every dimension skill MUST follow this file.** It exists
because the model executing a dimension is chosen by configuration and may be a smaller one: it
will do exactly what the procedure operationalizes and nothing more. Vague instructions ("check for auth") get
hand-waved; mechanical instructions ("build this table, fill every row") get done.

---

## 1. Grep mechanics — never drown in vendored code

A bare `grep -rn PATTERN .` matches `node_modules/`, `dist/`, `build/`, `vendor/`,
`.git/`, minified bundles, and lockfiles. On any real repo this returns thousands of lines,
blows the context window before the scan is half done, and buries real findings. **Do not
do this.**

**Default to `git grep`** — it only searches tracked files, respects `.gitignore`, and is
fast:

```bash
git grep -nE "PATTERN" -- '*.ts' '*.tsx' '*.js'
```

When you must use plain `grep` (e.g. scanning untracked files), always exclude noise:

```bash
grep -rnE "PATTERN" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir={node_modules,dist,build,vendor,.git,.next,coverage,__pycache__,.venv,target} .
```

**Never** iterate `grep ... $(git ls-files)` — it breaks on filenames with spaces and blows
the shell argument limit on large repos. Use `git grep` instead, which walks tracked files
internally.

### Triage before you read

1. **Size the result first** with `-c` (count) or `| wc -l` before dumping matches. If a
   pattern returns 400 hits, it is too broad — tighten it or scope it to a subdirectory.
2. **Cap output** with `| head -n 50` when eyeballing. Note in your worklog if you capped so
   you remember to come back.
3. **Read context, not whole files.** Once grep gives you `file:line`, read that file with a
   window (`Read` with `offset`/`limit`, ~20 lines each side). Do not read entire 2000-line
   files to inspect one match.
4. **Prefer AST/toolchain signals over grep** whenever the toolchain produced them. Grep is
   the fallback, not the primary source. See each skill's Toolchain Inputs.

---

## 2. Work through the whole procedure — anti-laziness rules

A long procedure invites two failure modes. Guard against both explicitly:

- **Stopping early.** Finding several issues in Step 3 does not mean the scan is "done."
  **Complete every step in the procedure even if earlier steps already produced findings.**
  Skipped steps are gaps in coverage, not evidence of health.
- **Sampling instead of enumerating.** When a step says "for each route" / "for each catch
  block" / "for each file," it means *every* one, not a representative few. First produce the
  complete list, then process the list item by item, checking each off. If the list is large,
  say so in the report `notes` and process it in batches — never silently truncate.

Completing a step and finding **nothing** is the normal outcome on healthy code. A step is a
place to look, not a quota to fill. Never manufacture a candidate so that a step has output;
record "checked, none found" in the worklog and move on.

If you genuinely cannot cover something (repo too large, tool missing, timeout), that is a
**stated limitation**, not a silent gap. Record exactly what was and was not covered in the
report `notes` and mark affected `checks` as `skipped`. A honest "did not scan X" beats a
score that pretends X was clean.

---

## 2a. Report only issues that actually exist

A finding is a defect in **this codebase, on a path that can execute, with input the system can
actually receive**. Before a candidate goes in the worklog, it must pass this one-sentence test:

> "With input/state X, which this code can really get, line N does Y, and Y is wrong because Z."

If you cannot fill in X, N, Y, and Z from the code in front of you, it is not a finding. The
following are **not findings**, at any severity, including `info`:

- A bug that requires input an upstream validator, type, schema, framework, or database
  constraint already prevents from reaching this line.
- A bug in code that cannot run: unreferenced functions, branches behind a constant, dead
  feature flags, commented-out code. (Dead code itself belongs to `tenet-debt`, not to a
  bug-hunting dimension.)
- Behavior that is unusual but intended. Read the callers, the tests, and the docstring before
  deciding something is wrong. If a test asserts the behavior, it is intended until proven otherwise.
- "Could be a problem if someday…" hypotheticals about future refactors, scale the app does not
  have, or attackers with access the architecture does not grant.
- Style, naming, or "I would have written this differently."
- Anything you disproved while checking it. Do not keep a refuted candidate as `info`.

**Do not overthink it.** Verification is reading the code and its callers, not constructing
elaborate scenarios. If confirming a candidate needs more than a few minutes of speculation about
inputs the system might produce, the answer is that it is not confirmed. Drop it and keep moving.
A short report of issues that are all real is the goal. A long report padded with maybes trains
the reader to ignore the whole dimension.

---

## 3. Keep a worklog

Before scanning, create `.healthcheck/tmp/{dimension}-worklog.md`. Use it as scratch memory
so findings discovered in Step 3 are not lost by Step 14:

```markdown
# {dimension} worklog — {commit}

## Step checklist
- [ ] Step 1: load toolchain
- [ ] Step 2: enumerate entry points
- [ ] Step 3: injection scan
- ...

## Findings (append as discovered)
- [critical] SQL injection — src/db/users.ts:34 — string concat in query()
- [major] missing ownership check — src/api/orders.ts:88 — no userId scope

## Deferred / capped
- injection grep in src/legacy/ returned 120 hits — capped at 50, revisit
```

Append every candidate finding the moment you find it, with severity, `file:line`, and a
one-line reason. At report time, promote worklog entries that survive the verification pass
(see `shared/verification.md`) into the report `findings` array. Delete `.healthcheck/tmp/`
scratch files when the scan completes — they are not part of the report.

---

## 4. Group systemic findings

The same defect repeated across many files is **one systemic finding**, not N findings.
Emit a single finding that names the pattern, lists every `file:line` occurrence in the
`description` (or the primary location in `file`/`line` and the rest in the description), and
escalates severity per the systemic trigger in `shared/severity.md` (same pattern in 5+
files → escalate one tier). This keeps the report readable and the score honest — twenty
copies of one mistake should not zero out a dimension via twenty separate deductions, but it
should count for more than one.
