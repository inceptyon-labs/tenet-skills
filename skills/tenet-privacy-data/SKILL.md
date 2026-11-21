---
name: tenet-privacy-data
description: "Audits where personal data goes: inventories PII fields, traces them into logs, error reporters, analytics and third parties, and checks deletion coverage, expiry, consent gates and mobile permission declarations."
when_to_use: "tenet privacy-data, tenet-privacy-data dimension, Tenet privacy and PII audit. Run via /tenet-skills:tenet-orchestrator or directly with /tenet-skills:tenet-privacy-data."
model: opus
disable-model-invocation: true
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Privacy & Data

> Follows personal data from the place it is stored to every place it leaves.

## Purpose

This dimension answers three questions from the code: what personal data does this project hold,
where does it go that the user would not expect, and can it be removed. It reports flows it can
show (this field reaches that log line, that analytics call, that vendor) and gaps it can show
(the delete path skips these tables, this permission is used with no declaration). It does not
report the absence of policy documents.

## Calibration — read first

Follow `shared/scan-discipline.md` (complete every step, enumerate rather than sample, and §2a:
report only issues that actually exist), `shared/verification.md` (every finding is confirmed
against the code before it ships; unconfirmed candidates are dropped, not demoted), and
`shared/severity.md` (severity is confirmed impact, never a hedge for doubt).

A privacy finding is one of two things, and both must be shown from the code:

> **Flow:** "Field F (category C) reaches sink S at line N, in a form that identifies the person."
>
> **Gap:** "The project does X with personal data (creates accounts, declares a permission, offers
> an opt-out), and the code that should complete it (delete these rows, declare this purpose,
> honor that setting) is missing or does not cover Y."

These are **not** findings, at any severity:

- A field name that looks personal with no flow to a sink. An `email` column is an inventory row.
- A missing privacy policy, retention document or data map. This dimension reads code.
- A missing export or deletion feature in an app that stores data only on the user's device.
- A log or analytics call that carries only an opaque internal ID.
- Anything in tests, fixtures, seed scripts or examples.
- A sink that receives a value already hashed, masked or truncated before the call.
- A call into a reporter or analytics SDK that the project never initializes. Find the `init` or
  `configure` call before reporting what is sent to it.

**Reachable** here means the platform or a caller can run it: a route handler, a view, an app or
scene delegate, a module the entry point imports, an exported function a tracked file calls. An
exported function nothing references is dead code under `shared/verification.md` and is dropped.

Zero findings is the normal result for a small local-first app. Do not fill a step to show you
looked.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python, swift, dart]
  heuristic: [go, java, kotlin, ruby, php, csharp, rust]
  config-only: [sql, prisma, plist, xml, yaml, json, terraform]
```

## Procedure

Keep a worklog at `.healthcheck/tmp/privacy-data-worklog.md` (`shared/scan-discipline.md` §3).

### Step 0: Applicability

Not applicable (`score: null`, `applicable: false`) when the project is a library, CLI or build
tool that stores no user records, sends no telemetry and requests no device permissions. Check
before deciding:

```bash
git grep -lPi "@Model\b|NSManagedObject|pgTable\(|sqliteTable\(|mysqlTable\(|models\.Model\b|\(BaseModel\)|@Entity\b|@JsonSerializable|CKRecord\(|createTable|CREATE TABLE" -- '*.swift' '*.ts' '*.tsx' '*.js' '*.py' '*.kt' '*.java' '*.dart' '*.sql' '*.prisma' | head -40
git grep -lPi "sentry|bugsnag|crashlytics|posthog|mixpanel|amplitude|segment|firebase_analytics|FirebaseAnalytics|gtag\(|plausible|datadog|logrocket|fullstory|intercom|revenuecat" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.swift' '*.dart' '*.kt' '*.java' '*.json' '*.yaml' '*.resolved' 'Podfile' '*.gradle' | head -40
git ls-files -- '*Info.plist' '*PrivacyInfo.xcprivacy' '*AndroidManifest.xml' '*.entitlements'
```

All three empty means not applicable.

### Step 1: Where the data lives

Classify the project before judging anything, and write the answer in the worklog. Later steps
depend on it.

| Residency | Evidence | What applies |
|---|---|---|
| **Operated store** | The project runs its own database or API (Postgres, D1, SQLite on a server, an ORM with migrations) | Every step |
| **Vendor backend** | Accounts or records live in Firebase, Supabase, CloudKit, Appwrite or similar | Every step; deletion is checked against the vendor SDK calls |
| **Device only** | SwiftData, Core Data, SQLite, files or preferences on the user's device, no account, no sync | Steps 2, 3 and 6 only. Skip deletion and expiry (Steps 4 and 5). |

A project can be more than one (a mobile app plus its API). Apply each part's rules to that part.

### Step 2: Inventory personal fields

Enumerate the fields, do not sample. List the schema-bearing files from Step 0, then search them:

```bash
git grep -nPi "\b\w*(e_?mail|phone|mobile|first_?name|last_?name|full_?name|display_?name|address|street|postal|zip_?code|birth|dob|ssn|tax_?id|passport|national_?id|ip_?addr|device_?id|latitude|longitude|location|card_?number|iban|account_?number|health|diagnos|medical|gender|ethnic|religio|password|biometric)\w*" -- '*.sql' '*.prisma' '*schema*' '*model*' '*Model*' '*migration*' '*entit*' ':!*.test.*' ':!*.spec.*' | head -200
```

Read each hit and record one worklog row per real field: `table.field | category | file:line`.
Categories:

- **credential**: passwords, tokens, API keys, session secrets
- **sensitive**: government ID, payment card or bank number, health, biometric, precise location,
  data about children, ethnicity, religion
- **contact**: email, phone, postal address, full name, date of birth
- **identifier**: user ID, device ID, IP address, username

Add free-text fields the user fills in (notes, messages, uploads): they hold whatever the user
typed, so treat them as **contact** unless the app's purpose makes them **sensitive**.

Some personal values are never stored and only pass through a request: a card number sent on to
a processor, a password before hashing. Add them to the inventory too, from the request schemas
and handler parameters:

```bash
git grep -nPi "\b(card_?number|cvc|cvv|pan|password|passcode|ssn|passport|date_?of_?birth)\b" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.go' '*.swift' '*.dart' '*.kt' '*.rb' ':!*.test.*' ':!*.spec.*' | head -100
```

The inventory itself is never a finding. It is what Step 3 traces.

### Step 3: Trace fields into sinks

For each sink class, list the call sites, then read each one and decide whether an inventoried
field reaches it. A whole object counts when it contains inventoried fields: logging `user`,
`req.body` or a full row is logging everything in it.

**a. Logs.** Log calls that mention a personal name or a whole object on the same line:

```bash
git grep -nPi "(console\.(log|info|warn|error|debug)|logger\.\w+|\blog\.\w+|logging\.\w+|\bprint\(|NSLog\(|os_log\(|debugPrint\(|Log\.[dievw]\().*(e_?mail|phone|password|passwd|token|secret|ssn|address|card|authorization|cookie|body|headers|\buser\b|\bprofile\b|payload|JSON\.stringify|\.description)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.go' '*.swift' '*.dart' '*.kt' '*.java' '*.rb' ':!*.test.*' ':!*.spec.*' ':!*_test.*' | head -150
```

Then the request loggers, which can dump every body and header without naming a field:

```bash
git grep -nP "morgan\(|pino-?http|pinoHttp|requestLogger|logRequests|app\.use\(\s*logger|httpLogger|LoggingMiddleware|log_request|RequestLoggingMiddleware" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.go' '*.rb'
```

Read the logger's configuration: does it log bodies, `Authorization` or `Cookie` headers, or query
strings? A redaction list that covers them refutes the candidate.

**b. Error reporters and analytics.** Identity and event calls, plus the settings that widen
what is collected:

```bash
git grep -nPi "\b(setUser|identify|setUserId|setUserProperties|people\.set|alias|setContext|setExtra|setTag|logEvent|capture|track(Event)?)\s*\(" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.swift' '*.dart' '*.kt' '*.java' ':!*.test.*' ':!*.spec.*' | head -150
git grep -nP "sendDefaultPii|send_default_pii|attachScreenshot|attachViewHierarchy|maskAllText|maskAllInputs|replaysSessionSampleRate|replaysOnErrorSampleRate|session_recording|disable_session_recording|autocapture|capture_pageview" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.swift' '*.dart' '*.kt'
```

Read each call's arguments. Email, phone or name passed to `identify`/`setUser`, PII as event
properties, `sendDefaultPii: true`, and session replay with masking turned off are flows.

**c. Other third parties.** Find outbound calls and SDK clients (email, SMS, support, payments,
webhooks to partners), then read what each sends:

```bash
git grep -nPi "(sendgrid|mailgun|postmark|resend|twilio|slack|discord|zendesk|intercom|hubspot|mailchimp|zapier|webhook)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.go' '*.swift' '*.dart' '*.kt' ':!*.test.*' ':!*.spec.*' | head -80
```

A vendor receiving the data it needs to do its job (the email address to an email provider) is
expected, not a finding. A vendor receiving more than that is a flow: a full user record posted to
a chat webhook, a support widget booted with fields it does not display.

**d. URLs.** Personal values placed in a query string end up in server logs, proxies and browser
history:

```bash
git grep -nP "[?&](email|phone|name|token|ssn|dob|address)=" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.swift' '*.dart' '*.kt' ':!*.test.*' ':!*.spec.*'
```

Each flow that survives is a candidate. Record it with the field, its category, the sink and the
line.

### Step 4: Deletion coverage (operated store and vendor backend only)

If the project lets people create accounts, find the path that deletes one:

```bash
git grep -nPi "(delete|destroy|remove|purge|erase|close|anonymi[sz]e)[_-]?(my[_-]?)?(account|user|profile)|accountDeletion|\.delete\(\s*['\"\`]/(api/)?(me|account|users?)\b|auth\(\)\.currentUser\??\.delete|deleteUser\(" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.go' '*.swift' '*.dart' '*.kt' '*.rb' ':!*.test.*' ':!*.spec.*'
```

Then enumerate everything tied to a user, so the path can be checked against it:

```bash
git grep -nPi "\b(user|owner|account|member|author|created_by)_?id\b|references\(\s*\(\)\s*=>\s*users|ForeignKey\(\s*['\"]?User|belongs_to :user" -- '*.sql' '*.prisma' '*schema*' '*model*' '*Model*' '*migration*' '*entit*' | head -150
```

Build the table in the worklog: one row per user-linked table, collection or storage bucket, and
for each, how the delete path removes it (explicit delete, `ON DELETE CASCADE`, vendor rule, or
nothing). Uploaded files, sessions, refresh tokens and rows in other services count.

- No delete path at all, and accounts can be created: one finding.
- A delete path that leaves rows marked "nothing": one finding listing them.
- A soft delete (`deleted_at`, `is_deleted`) with nothing that ever purges the row: one finding.
  Search for the purge job before reporting it.

While the route list is open, note whether any route or job gives a user a copy of their own data
(an export, a download, a "my data" endpoint). Record it as `has_export_flow`; its absence is the
`info` row in Step 7.

### Step 5: Expiry of short-lived data (operated store and vendor backend only)

Some records are only meant to live briefly. Check that each one can expire:

```bash
git grep -nPi "(reset|verif\w*|magic|invite|otp|one_?time|session|refresh)[_-]?(token|code|link|key)s?\b" -- '*.sql' '*.prisma' '*schema*' '*model*' '*Model*' '*migration*' '*entit*' | head -80
```

For each such table: is there an expiry column that the reading code checks, and does anything
delete expired rows? A reset token that is never checked for age is a finding. Do not report the
absence of a retention policy for ordinary user data.

### Step 6: Consent gates and device permissions

**a. A setting that does not gate.** Only when the code has a consent or opt-out mechanism:

```bash
git grep -nPi "consent|cookie[_-]?banner|opt[_-]?(out|in)|do[_-]?not[_-]?track|(analytics|tracking|telemetry|crash\w*)[_-]?(enabled|allowed|opt)|ATTrackingManager|requestTrackingAuthorization" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.swift' '*.dart' '*.kt' ':!*.test.*' ':!*.spec.*' | head -80
```

For each analytics or reporting SDK from Step 3b, confirm its initialization and its calls sit
behind that setting. An SDK that starts before the choice is read, or keeps sending after
opt-out, is a finding. No consent mechanism in the code means nothing to check here. Hold each SDK
to the setting that names it: an "analytics" toggle gates analytics, not crash reporting, unless
its label or the docs say it covers both.

**b. iOS and macOS.** List the protected APIs the app uses and the purposes it declares:

```bash
git grep -nP "CLLocationManager|AVCaptureDevice|PHPhotoLibrary|PHPickerViewController|CNContactStore|EKEventStore|HKHealthStore|CMMotionManager|SFSpeechRecognizer|CBCentralManager|NFCNDEFReaderSession|LAContext|ATTrackingManager|ASIdentifierManager" -- '*.swift' '*.m' '*.mm'
git grep -nP "NS\w+UsageDescription" -- '*.plist' '*.pbxproj' '*.xcconfig' '*.yml'
git ls-files -- '*PrivacyInfo.xcprivacy'
```

- A protected API in use with no matching `NS…UsageDescription` (in `Info.plist`, or as
  `INFOPLIST_KEY_…` in the project file). The feature cannot work: for camera, microphone,
  photos, contacts and calendars the system terminates the app on first access; for location it
  ignores the authorization request. Finding.
- `ASIdentifierManager` or an ad or attribution SDK in use with no
  `requestTrackingAuthorization` call: finding.
- The app ships a tracking SDK, or uses a required-reason API (`UserDefaults`, file timestamps,
  system boot time, disk space), and has no `PrivacyInfo.xcprivacy`: finding.

**c. Android and Flutter.** Compare what is declared with what is used:

```bash
git grep -nP "uses-permission" -- '*AndroidManifest.xml'
git grep -nP "geolocator|location:|image_picker|camera:|contacts|permission_handler|health:|speech_to_text|local_auth" -- '*pubspec.yaml'
```

A dangerous permission (location, camera, microphone, contacts, body sensors) declared in the
manifest that no code or plugin uses is a finding: the store listing will say the app collects
something it does not. For Flutter, run the iOS checks in (b) against `ios/Runner/Info.plist` for
each plugin above.

### Step 7: Verify, score and write

Run every candidate through `shared/verification.md`. For a flow, open the sink and confirm the
value arrives unmasked. For a gap, confirm the missing piece is missing everywhere, not just in
the file you read first. Group the same flow repeated across files into one finding
(`shared/scan-discipline.md` §4).

| Confirmed finding | Severity |
|---|---|
| A **credential** or **sensitive** field, or whole request bodies or auth headers, written to logs or sent to a reporter, analytics tool or other third party | critical |
| A **contact** field written to logs or sent to a reporter or analytics tool | major |
| A third party receiving personal fields beyond what its job needs | major |
| Accounts can be created and nothing deletes them | major |
| Deletion leaves a user's rows, files or tokens behind | major |
| An analytics or reporting SDK that ignores the project's own consent or opt-out setting | major |
| A protected iOS API used with no purpose string; ad or attribution tracking with no tracking prompt | major |
| An **identifier** sent to a third party alongside event data, with no opt-out in the code | minor |
| Personal values in URL query strings | minor |
| A short-lived token or code that never expires, or a soft delete that is never purged | minor |
| Required-reason API or tracking SDK with no privacy manifest; unused dangerous Android permission | minor |
| Accounts in an operated store with no way for a user to get a copy of their data | info |

The table already reflects how sensitive each path is. Do not add the critical-path escalation from
`shared/severity.md` on top of it; the systemic escalation (same flow in 5+ files) still applies.

```text
score = max(0, min(100, int((100 - 5*critical - 2*major - 0.5*minor) + 0.5)))
```

Apply suppressions (`shared/suppressions.md`). Write `.healthcheck/reports/privacy-data.json`:

```json
{
  "key": "privacy-data",
  "score": 91,
  "weight": 1.3,
  "skill_version": "1.1.0",
  "applicable": true,
  "notes": "Operated store (Postgres via Drizzle) plus an iOS client. Inventoried 14 personal fields in 5 tables. Traced 31 log calls, 9 analytics calls and 4 vendor integrations. Found 1 major (email passed to analytics identify) and 2 minor (invite tokens never expire; no privacy manifest). Deletion path covers all 5 user-linked tables.",
  "metrics": {
    "residency": ["operated-store", "device"],
    "pii_field_count": 14,
    "sensitive_field_count": 1,
    "log_calls_reviewed": 31,
    "analytics_calls_reviewed": 9,
    "third_party_sinks": 4,
    "has_deletion_flow": true,
    "user_linked_tables": 5,
    "user_linked_tables_not_deleted": 0,
    "has_export_flow": false,
    "has_consent_gate": false,
    "suppressed_count": 0
  },
  "checks": [
    { "name": "Personal field inventory", "status": "info", "count": 14, "description": "14 fields in 5 tables; 1 sensitive, 6 contact, 7 identifier" },
    { "name": "Logs", "status": "passed", "count": 0, "description": "31 log calls and the request logger read; no personal field reaches a log" },
    { "name": "Error reporters and analytics", "status": "failed", "count": 1, "description": "identify() receives the user's email" },
    { "name": "Other third parties", "status": "passed", "count": 0 },
    { "name": "URLs", "status": "passed", "count": 0 },
    { "name": "Deletion coverage", "status": "passed", "count": 0, "description": "Delete path removes all 5 user-linked tables" },
    { "name": "Expiry of short-lived data", "status": "failed", "count": 1 },
    { "name": "Consent gates", "status": "skipped", "description": "No consent mechanism in the code" },
    { "name": "Device permissions and manifests", "status": "failed", "count": 1 },
    { "name": "Data export", "status": "info", "description": "No route or job gives a user a copy of their data" }
  ],
  "findings": [ ... ]
}
```

Set `skill_version` to `1.1.0`. Mark a check `skipped` when the residency in Step 1
rules it out, and say why in its `description`. Delete `.healthcheck/tmp/privacy-data-*` when done.

Every finding MUST include:

- `dimension: "privacy-data"`
- `file` and a 1-based `line` for the sink (flows) or the incomplete code (gaps); `line: null`
  and `Line: N/A` in the fix_prompt only when no single location exists (no delete path at all)
- `snippet` with the offending line, values redacted
- `confidence`: `native` when the flow or gap was confirmed by reading code in a native-support
  language, `heuristic` otherwise (including gaps established from config files alone),
  `deterministic` for a toolchain import
- `fix_prompt` following `shared/fix_prompt_template.md`, with `- File:`, `- Line:` and
  `- Dimension:` in its Location section

## Constraints

- NEVER report a field as a finding. Report where it goes.
- NEVER report a missing policy, document or data map.
- NEVER apply Steps 4 and 5 to data that lives only on the user's device.
- NEVER claim legal compliance or non-compliance. Report engineering evidence.
- NEVER put a real personal value in a snippet or fix_prompt. Keep the field name, redact the value.
- NEVER re-report what another dimension owns: tokens or passwords stored in `UserDefaults`,
  `SharedPreferences` or `localStorage`, and personal data placed in LLM prompts, belong to
  `tenet-security`; hardcoded credentials belong to `tenet-secrets`; missing structured logging
  belongs to `tenet-observability`. A credential written to a log is this dimension's.
- ALWAYS state the residency classification and what was skipped because of it in `notes`.

## fix_prompt Example

```
# Fix: user email is sent to analytics on every sign-in

## Context
`identifyUser` passes the full user row to `analytics.identify`, so the email address and display
name are stored by the analytics vendor for every account. The dashboard only groups events by
user, which needs the internal ID alone.

## Location
- File: client/src/lib/analytics.ts
- Line: 18
- Dimension: privacy-data / major

## Current behavior
```typescript
analytics.identify(user.id, { email: user.email, name: user.displayName, plan: user.plan });
```

## Required change
```typescript
analytics.identify(user.id, { plan: user.plan });
```

## Constraints
- Keep `user.id` as the distinct ID so existing event history stays attached
- Do not add a hash of the email as a replacement trait

## Verification
- `git grep -nP "identify\(.*(email|name)" -- '*.ts' '*.tsx'` returns nothing
- Sign in locally and confirm the identify request body carries only `plan`
```

## Edge Cases

- **The project is the vendor.** An analytics or logging product stores other people's personal
  data by design. Judge its own telemetry about its operators, not its core function.
- **Admin tools.** An admin screen that shows user records is expected. An admin export or log of
  them is a flow like any other.
- **Monorepo.** Classify residency per package and apply the steps per package.
- **Generated clients** (OpenAPI, GraphQL codegen): trace through to the call that supplies the
  values, and report there.
