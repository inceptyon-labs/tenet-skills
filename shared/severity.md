# Tenet Severity Definitions

All skills MUST use these exact severity levels. No other severity values are permitted.

## critical

Security vulnerability, data loss risk, hardcoded secret in VCS, or guaranteed production outage. **Fix immediately.**

Examples:
- SQL injection via unsanitized user input
- Hardcoded AWS secret key in committed source
- Missing authentication on admin endpoints
- Unencrypted PII storage violating compliance

## major

Significant design flaw, systemic issue, vulnerable dependency, or feature-breaking bug. **Fix this sprint.**

Examples:
- Known CVE in a direct dependency with a published exploit
- N+1 query pattern causing O(n) database calls per request
- God class with 15+ distinct responsibilities
- Empty catch blocks swallowing critical errors

## minor

Code smell, complexity hotspot, or quality issue. **Fix when touching that area.**

Examples:
- Function with cyclomatic complexity of 12
- TODO comment older than 90 days
- Missing JSDoc on exported public API
- Inconsistent error response shape across endpoints

## info

Observation or suggestion that still requires action or a conscious decision. **Not required, but worth considering.**

Examples:
- Opportunity to extract a reusable utility
- Alternative library with better maintenance status
- Missing optional accessibility enhancement
- Suggestion to add structured logging

**IMPORTANT: Info findings must still be actionable.** Every info finding should describe something the developer *could* change. Do NOT emit info findings for positive observations ("this pattern is good", "well-implemented"). Positive observations belong in the `dimension.notes` field, not as findings. The findings array is exclusively for things that need attention.

---

## Scoring Formula

All skills apply this formula consistently:

1. Start at **100**
2. Subtract: `5 × critical + 2 × major + 0.5 × minor`
3. Floor at **0**, ceil at **100**, round to integer
4. If dimension is not applicable: `score: null`, `applicable: false`

Info findings do NOT affect the score.

### Rounding

Use standard arithmetic rounding: values at exactly 0.5 round UP.

```
round(92.5) → 93   (not 92)
round(92.4) → 92
round(92.6) → 93
```

In Python, use `int(score + 0.5)` or `math.floor(score + 0.5)` rather than the built-in `round()`, which uses banker's rounding (0.5 rounds to even). The dashboard expects consistent rounding behavior across all skills.

### Severity calibration guidance

Err toward the harsher severity when a finding sits on the boundary. The scoring formula already accounts for the weight difference — a single `major` that should have been `critical` costs the project only 3 points of accuracy, but a `minor` that should have been `major` hides a real issue behind a nearly-invisible 0.5-point deduction. When in doubt, escalate.

Specific escalation triggers:
- An issue affecting an **entire app layer or package** (not just one file) → escalate one tier
- An issue in a **critical path** (auth, payment, data mutation) → escalate one tier
- An issue that is **systemic** (same pattern in 5+ files) → escalate one tier
- Multiple escalation triggers can stack (e.g., systemic + critical path = escalate two tiers, capped at critical)
