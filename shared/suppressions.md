# Suppressions & Baseline

A finding a developer has consciously accepted must stop re-appearing as `critical` on every
run — otherwise the report trains its reader to ignore it. Tenet supports two suppression
mechanisms. **Every dimension skill MUST honor both** before finalizing its findings.

A suppression never deletes a finding. It **demotes it to `info`** (so it no longer affects
the score) and records the stated reason. This keeps an audit trail — a suppressed risk is
still visible, just not counted.

---

## 1. Inline suppression comments

A developer can accept a specific finding at a specific line with a comment on, or on the
line directly above, the flagged code:

```ts
// tenet-ignore: SEC-CRYPTO-004 Math.random is fine here — non-security retry jitter
const delay = base * (1 + Math.random());

const apiKey = "pk_live_..."; // tenet-ignore: SEC-SECRET publishable key, safe by design
```

Format: `tenet-ignore: <RULE-ID-or-dimension> <free-text reason>`

- The rule ID matches the finding's rubric ID (`SEC-CRYPTO-004`) or the dimension key
  (`security`, `secrets`) to suppress any finding of that dimension on that line.
- The reason is **required**. A bare `tenet-ignore:` with no reason is itself worth an `info`
  finding ("suppression without justification").

Recognize the comment in every language's syntax (`//`, `#`, `--`, `/* */`, `<!-- -->`).

When a candidate finding lands on (or directly below) a matching `tenet-ignore` comment:
demote it to `info`, set its `description` to include `Suppressed: <reason>`, and do not let
it affect the score.

---

## 2. Config-level suppressions

`.healthcheck.toml` may carry a `[suppressions]` section for findings that are not tied to a
single line (whole files, path globs, or a rule everywhere):

```toml
[suppressions]
# rule = "reason"  — suppress a rule everywhere
"SEC-DEFAULT-005" = "internal LAN-only tool, HTTP is intentional"

# Per-path suppression: rule applied to a glob
[[suppressions.paths]]
rule = "secrets"
path = "config/dev-keys.ts"
reason = "quota-capped throwaway dev keys, rotated monthly"

[[suppressions.paths]]
rule = "SEC-VAL-001"
path = "src/internal/**"
reason = "internal admin API behind VPN, validated at gateway"
```

Load `[suppressions]` from `.healthcheck.toml` at the start of the scan. For each candidate
finding, check whether a rule-level or path-glob suppression matches. If so, demote to `info`
with the stated reason.

---

## Reporting suppressed findings

A suppressed finding is emitted (never dropped) with all three of these set, so the dashboard
renders it as a distinct **accepted risk** rather than an ordinary info note:

- `severity: "info"` — so it does not affect the score (info never does).
- `suppressed: true` — the explicit flag the dashboard keys its "Accepted risk" badge on.
- `suppressed_reason: "<the developer's reason>"` — the justification from the `tenet-ignore`
  comment or `[suppressions]` entry. Also prefix the `description` with `Suppressed: <reason>`
  so the reason survives for any consumer that ignores the flag.

Also add `metrics.suppressed_count` to the dimension report. Never suppress a finding silently —
a demoted finding must still appear in the report with `suppressed: true` and its reason.

---

## What is safe to *not* flag at full severity in the first place

Some patterns look like findings but are safe by design. These are handled by calibration
(`shared/security-calibration.md`) and the secrets publishable-key allowlist, not by
suppression — the point is to not raise the false positive at all. Suppressions are for
genuine findings a developer has knowingly accepted, not for detector false positives.
