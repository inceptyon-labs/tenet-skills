---
name: tenet-privacy-data
description: "Audits PII handling, consent, retention, deletion/export flows, redaction, and analytics exposure."
when_to_use: "Privacy audit, PII scan, data retention, GDPR/CCPA readiness, sensitive data logging, tenet privacy-data"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Privacy & Data

Audits whether the codebase treats personal and regulated data deliberately. This skill focuses on source-visible privacy risks: PII collected without clear handling, sensitive fields logged or sent to analytics, missing deletion/export paths, weak retention boundaries, and unsafe data sharing with third parties.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python, go]
  heuristic: [java, ruby, php, csharp, kotlin, swift]
  config-only: [yaml, json, terraform, sql]
```

## Procedure

### Step 0: Detect Applicability

This dimension is applicable when any source, schema, config, API, or database file suggests user data handling:
- Auth/user/account/profile/customer/member/contact tables or models
- Fields matching `email`, `phone`, `address`, `name`, `dob`, `ssn`, `tax_id`, `passport`, `ip_address`, `device_id`, `location`, `payment`, `card`, `health`
- Analytics or third-party SDKs such as Segment, Amplitude, Mixpanel, PostHog, Sentry, Datadog RUM, Intercom, Stripe

If none are found, write `score: null`, `applicable: false`, and note that no PII-handling surface was detected.

### Step 1: Data Inventory Signals

Scan model/schema files, migrations, API DTOs, and validation schemas for sensitive fields.

Severity:
- `major`: sensitive fields exist but no privacy policy, retention note, or deletion/export path is visible
- `minor`: PII exists with partial documentation but no clear field-level inventory
- `info`: inventory exists but misses newly detected fields

### Step 2: Logging and Error Reporting

Search production code for logs/errors/traces containing sensitive names:

```bash
git ls-files | xargs grep -n -i -E "log|logger|console|print|captureException|setUser|track|identify" 2>/dev/null
```

Flag when log payloads include `email`, `phone`, `token`, `password`, `ssn`, `address`, `card`, `authorization`, or full request/response bodies.

Severity:
- `critical`: passwords, auth tokens, payment cards, SSNs, health data, or full request bodies are logged
- `major`: emails, phone numbers, addresses, precise locations, or user profiles are logged without redaction
- `minor`: low-risk identifiers logged without retention/redaction policy

### Step 3: Retention and Deletion

Check for retention jobs, TTLs, data lifecycle settings, account deletion endpoints, and anonymization flows.

Patterns:
- `deleteAccount`, `destroyUser`, `anonymize`, `retention`, `expires_at`, `ttl`, `ON DELETE`, scheduled purge jobs
- S3 lifecycle rules, Postgres partition retention, Redis TTLs

Severity:
- `major`: user records or events appear indefinitely retained with no deletion/anonymization path
- `minor`: deletion exists but does not cover related records such as events, uploads, tokens, or audit logs
- `info`: retention policy exists but is not documented in README/docs

### Step 4: Export and Access

Look for data export/access flows and admin-only reads of PII.

Severity:
- `major`: users can create accounts or submit PII but no export/access endpoint or documented manual process exists
- `minor`: export exists but omits key related data
- `major`: admin endpoints expose PII without authorization checks or audit logging

### Step 5: Third-Party Sharing

Scan analytics, telemetry, and payment/customer support integrations for PII sent in event payloads.

Severity:
- `critical`: secrets, payment cards, passwords, or auth tokens are sent to third-party analytics/error tools
- `major`: emails, phone numbers, addresses, or names are sent without hashing, consent, or documented purpose
- `minor`: stable user identifiers sent without documented retention or deletion handling

### Step 6: Compile and Score

Use the shared severity formula:

```text
score = max(0, min(100, int((100 - 5*critical - 2*major - 0.5*minor) + 0.5)))
```

Every finding MUST include:
- `dimension: "privacy-data"`
- `file` and a 1-based `line` when there is a precise source location
- `line: null` and `Line: N/A` in the fix_prompt for inventory/project-level gaps
- `confidence`: `native` for language-aware review, `heuristic` for grep/config-only checks
- `fix_prompt` following `shared/fix_prompt_template.md`
- Every `fix_prompt` Location section MUST include `- File:`, `- Line:`, and `- Dimension:` entries

## Output

- `.healthcheck/reports/privacy-data.json`

## Constraints

- Do not claim legal compliance or non-compliance; report engineering evidence and risk.
- Do not include real PII values in snippets or fix_prompts. Redact values but keep field names.
- Prefer concrete code/config evidence over generic privacy advice.
- If the project is a library with no data storage or user event surface, mark this dimension not applicable.
