# Tenet security fixtures

Deliberately vulnerable code used to **measure** the `tenet-security` skill instead of
guessing whether prompt changes help. Every fixture file is either a planted vulnerability
(`// PLANT <RULE-ID>`) or a safe look-alike decoy (`// DECOY <label>`) that must NOT be
flagged. The ground truth lives in `security-recall/EXPECTED.json`.

> These files are intentionally insecure and non-compiling (no `node_modules`). Never import
> them. TypeScript "cannot find module" diagnostics on them are expected.

## What it measures

- **Recall** — of the 23 planted vulnerabilities across 12 classes (injection, access control,
  auth, crypto, SSRF, validation, config, deserialization, parsing, platform), how many did the
  skill catch at the expected severity?
- **Precision** — of the 12 safe decoys (parameterized queries, Drizzle `sql` tagged templates,
  DOMPurify-wrapped HTML, `execFile` array form, `Math.random` jitter, sha1 cache key,
  ownership-scoped query, publishable Stripe key, allowlisted SSRF, XPC listener with a Team-ID
  code-signing requirement, Host-checked loopback server without a token, same-user
  subprocess), how many did it wrongly
  flag? Each decoy targets a specific false-positive trap from `shared/security-calibration.md`.

## How to run

1. Copy the fixture into a scratch dir and treat it as a project root (so `git grep` and paths
   resolve), or run the skill with `security-recall/` as the working directory.

   ```bash
   rm -rf /tmp/tenet-fixture && cp -r evals/fixtures/security-recall /tmp/tenet-fixture
   cd /tmp/tenet-fixture && git init -q && git add -A && git commit -qm fixtures
   ```

2. Run `tenet-security` against it with the model you want to benchmark (the point is to run it
   with a **Sonnet-class** model, since that is what executes the skill in practice). Have it
   write `.healthcheck/reports/security.json` (and `secrets.json` if also benchmarking the
   publishable-key path).

3. Score:

   ```bash
   python3 evals/score-fixtures.py \
     --expected evals/fixtures/security-recall/EXPECTED.json \
     --report   /tmp/tenet-fixture/.healthcheck/reports/security.json \
     --secrets  /tmp/tenet-fixture/.healthcheck/reports/secrets.json
   ```

   Output is per-class recall, overall recall, overall precision, and the exact list of missed
   plants and decoy false positives. Exit code is non-zero if recall < 80% or any decoy was
   flagged — so it can gate CI or a before/after prompt comparison.

## Using it to tune prompts

Run it once to get a baseline, change a skill/shared doc, run it again, and diff the two score
outputs. A missed plant points at a detection gap (add/clarify a step); a decoy false positive
points at a calibration gap (add a flag/do-NOT-flag pair). This is especially important because
the skills are executed by Sonnet-class models, where wording changes swing results hard — the
fixtures turn "I think this prompt is better" into a number.

## Recorded runs

| Date | Prompts | Model | Recall | Decoy FPs | Findings | Notes |
|---|---|---|---|---|---|---|
| 2026-09-05 | pre-calibration (commit 8906156) | sonnet | 20/20 | 0 | 14 crit / 7 major / 1 info | The `info` was the SHA-1 cache-key decoy, emitted under the old "info at most" rule |
| 2026-09-05 | calibration rewrite (drop unconfirmed, no escalate-on-doubt) | sonnet | 20/20 | 0 | 13 crit / 8 major / 0 info | Decoy no longer emitted at all |
| 2026-09-05 | calibration rewrite | fable | 20/20 | 0 | 13 crit / 8 major / 0 info | Identical to Sonnet on this fixture; it is too easy to separate the tiers |

The fixture is saturated: every run scores 100/100. It proves the calibration change did not cost
recall, but it cannot rank models. Next step for measuring the judge tier is a harder fixture with
bugs that need cross-file tracing (a guard in one file that is bypassed via another route, a
tenant filter present on the list endpoint but missing on the detail endpoint).

## Extending

Add a planted file with a `// PLANT <RULE-ID>` comment and an entry in `expected_findings`, or a
decoy with a `// DECOY` comment and an entry in `decoys` (set `allowed_max_severity` to the
highest severity that is acceptable, or `null` for "must not appear at all"). The scorer keys on
`file` + severity, so line numbers don't need to stay in sync.
