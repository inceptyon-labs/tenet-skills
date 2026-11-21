# Tenet Privacy & Data — Rubric

Every finding is a **flow** (a personal field reaches a sink) or a **gap** (the project does
something with personal data and the code that should complete it is missing). Field names, and
missing policies or documents, are never findings.

## Scoring

`score = max(0, min(100, int(raw + 0.5)))`, where `raw = 100 - 5*critical - 2*major - 0.5*minor`.
Info findings do not affect the score.

## Field Categories

| Category | Examples |
|---|---|
| credential | passwords, tokens, API keys, session secrets |
| sensitive | government ID, payment card or bank number, health, biometric, precise location, children's data, ethnicity, religion |
| contact | email, phone, postal address, full name, date of birth, free text the user writes |
| identifier | user ID, device ID, IP address, username |

## Finding Categories

### Flows

| ID | Finding | Severity | Confidence |
|---|---|---|---|
| PRIV-LOG-001 | Credential or sensitive field, whole request body, or auth header written to logs | critical | native / heuristic |
| PRIV-LOG-002 | Contact field written to logs | major | native / heuristic |
| PRIV-3P-001 | Credential or sensitive field sent to an error reporter, analytics tool or other third party | critical | native / heuristic |
| PRIV-3P-002 | Contact field sent to an error reporter or analytics tool (`identify`, `setUser`, event properties, `sendDefaultPii`, unmasked session replay) | major | native / heuristic |
| PRIV-3P-003 | A vendor receives personal fields beyond what its job needs | major | native / heuristic |
| PRIV-3P-004 | Identifier sent to a third party with event data and no opt-out in the code | minor | native / heuristic |
| PRIV-URL-001 | Personal values in URL query strings | minor | native / heuristic |

### Gaps (operated store or vendor backend)

| ID | Finding | Severity | Confidence |
|---|---|---|---|
| PRIV-DEL-001 | Accounts can be created and no code path deletes them | major | native / heuristic |
| PRIV-DEL-002 | Account deletion leaves the user's rows, files or tokens behind | major | native / heuristic |
| PRIV-DEL-003 | Soft delete that nothing ever purges | minor | heuristic |
| PRIV-EXP-001 | Short-lived token or code with no expiry, or an expiry the reading code never checks | minor | native / heuristic |
| PRIV-ACC-001 | Accounts in an operated store with no way for a user to get a copy of their data | info | heuristic |

### Gaps (consent and device permissions)

| ID | Finding | Severity | Confidence |
|---|---|---|---|
| PRIV-CONS-001 | Analytics or reporting SDK ignores the project's own consent or opt-out setting | major | native / heuristic |
| PRIV-IOS-001 | Protected iOS/macOS API used with no matching purpose string | major | native / heuristic |
| PRIV-IOS-002 | Advertising identifier or attribution SDK used with no tracking authorization request | major | heuristic |
| PRIV-IOS-003 | Required-reason API or tracking SDK with no `PrivacyInfo.xcprivacy` | minor | heuristic |
| PRIV-AND-001 | Dangerous Android permission declared that no code or plugin uses | minor | heuristic |

## Not Findings

- A personal field with no flow to a sink.
- A missing privacy policy, retention document or data map.
- Missing deletion, expiry or export for data that lives only on the user's device.
- A log or analytics call carrying only an opaque internal ID.
- A value hashed, masked or truncated before it reaches the sink.
- A vendor receiving exactly what it needs to do its job.
- Tokens in client storage and personal data in LLM prompts (`tenet-security` owns these).

## Metrics

- `residency` (array of `operated-store`, `vendor-backend`, `device`)
- `pii_field_count`
- `sensitive_field_count`
- `log_calls_reviewed`
- `analytics_calls_reviewed`
- `third_party_sinks`
- `has_deletion_flow`
- `user_linked_tables`
- `user_linked_tables_not_deleted`
- `has_export_flow`
- `has_consent_gate`
- `suppressed_count`

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/privacy-data.json` | Valid JSON, matches schema, every finding has `fix_prompt` |
| Each flow finding | Names the field, its category, the sink and the line; snippet has values redacted |
| Each gap finding | Names what the project does and exactly what is missing or uncovered |
| `notes` | States the residency classification and which steps were skipped because of it |
