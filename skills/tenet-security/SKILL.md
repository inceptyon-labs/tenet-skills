---
name: tenet-security
description: "Audits security vulnerabilities including injection, broken access control (IDOR, tenant isolation), auth, validation, crypto, SSRF, CORS, CSRF, and platform-specific risks."
when_to_use: "Security audit, vulnerability scan, injection check, auth review, IDOR, OWASP check, tenet security"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Security

> Scans the codebase for security vulnerabilities across injection, broken access control, authentication, cryptography, and configuration domains — and verifies each finding before reporting it.

## Purpose

This skill evaluates the security posture of the codebase by combining deterministic
toolchain signals (semgrep, tflint) with **flow-aware analysis**: it builds a complete
inventory of the application's entry points, traces whether untrusted input reaches dangerous
sinks, and refutes each candidate before emitting it. Grep finds pattern-shaped bugs; the
highest-impact real-world vulnerabilities (missing ownership checks, tenant leaks, broken
authorization) are not pattern-shaped, so this skill enumerates and reads handlers rather than
relying on grep alone. Every finding includes a self-contained `fix_prompt`.

## How to run this audit — read first

This skill is executed by a Sonnet-class model. Follow these shared protocols exactly; they
are what turn a shallow grep pass into a real audit:

- **`shared/scan-discipline.md`** — grep hygiene (use `git grep`, exclude vendored code,
  triage before reading), anti-laziness rules (complete every step, enumerate don't sample),
  the worklog, and systemic-finding grouping. **Every grep command below is illustrative** —
  run it under these hygiene rules, never as a bare `grep -rn PATTERN .`.
- **`shared/entry-points.md`** — how to build the entry-point/route inventory that drives the
  access-control and validation checks (Steps 3, 5, 6, 8).
- **`shared/verification.md`** — the mandatory refute pass every `major`/`critical` must
  survive (Step 16). No finding ships from a grep count alone.
- **`shared/security-calibration.md`** — flag / do-NOT-flag pairs per vulnerability class.
  Check candidates against these to kill false positives.
- **`shared/suppressions.md`** — honor `tenet-ignore` comments and `[suppressions]` config
  (Step 17).

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python]
  tree_sitter: [go, rust, java, ruby, swift, kotlin]
  heuristic: [dart, terraform, php, csharp, cpp, c, shell]
  config-only: [yaml, json, dockerfile]
  skip: [markdown, css]
platform_playbooks: [tauri, electron, flutter, ios-swift, llm-app]
```

## Toolchain Inputs

| File | Required | Notes |
|---|---|---|
| `.healthcheck/toolchain/semgrep.json` | No (degrade gracefully) | Primary signal for injection, auth, crypto findings |
| `.healthcheck/toolchain/tflint.json` | No (only if terraform present) | IaC security misconfigurations |
| `.healthcheck/toolchain/language-census.json` | Yes | Determines which language-specific scans and playbooks to run |

If `semgrep.json` is missing, log a warning and proceed with grep + read analysis only. Set
`confidence: "heuristic"` on findings produced without semgrep backing (unless you fully
traced the flow by reading code, in which case `native` is honest).

If `tflint.json` is missing and terraform files exist, note that terraform checks are limited
to heuristic patterns.

## Procedure

### Step 1: Load Toolchain Data, Suppressions, and Start the Worklog

```bash
SEMGREP=".healthcheck/toolchain/semgrep.json"
[ -f "$SEMGREP" ] && SEMGREP_FINDINGS=$(jq '.findings' "$SEMGREP") || { echo "WARN: semgrep.json not found — heuristic-only"; SEMGREP_FINDINGS="[]"; }

TFLINT=".healthcheck/toolchain/tflint.json"
[ -f "$TFLINT" ] && TFLINT_FINDINGS=$(jq '.findings' "$TFLINT") || TFLINT_FINDINGS="[]"

CENSUS=".healthcheck/toolchain/language-census.json"
[ -f "$CENSUS" ] || { echo "ERROR: language-census.json missing — cannot scope scan"; exit 1; }

mkdir -p .healthcheck/tmp
```

Create `.healthcheck/tmp/security-worklog.md` per `shared/scan-discipline.md` and load
`[suppressions]` from `.healthcheck.toml` (see `shared/suppressions.md`). Append every
candidate finding to the worklog as you go.

### Step 2: Ingest Semgrep Findings

For each semgrep finding with `category: "security"`:
1. Map severity: `error` → `critical`, `warning` → `major`, `info` → `minor`.
2. Map `rule_id` to a Tenet finding type (see Rubric).
3. Set `confidence: "deterministic"` and generate a `fix_prompt`.

### Step 3: Build the Entry-Point Inventory

**This is the most important step. Do not skip or sample it.** Follow `shared/entry-points.md`
to enumerate every HTTP route, server action, resolver, queue/event consumer, cron job, and
webhook receiver, using the recipe for the detected framework (Express, Hono, tRPC, Next.js,
SvelteKit, FastAPI, Flask, Django, Go, etc.).

Write the complete table to `.healthcheck/tmp/entry-points.md` with a row per entry point and
columns: `method | path | file:line | auth? | role/authz? | ownership/tenant scope? | input validation? | mutates data?`.

Fill in **every cell** by reading each handler. This table drives Steps 5, 6, and 8. Emit a
`checks` entry summarizing coverage (e.g. "Audited 34 routes; 3 missing auth, 2 missing
ownership scope, 5 missing validation").

### Step 4: Injection

Run these under `git grep` hygiene; verify each match against `shared/security-calibration.md`
before treating it as a finding.

```bash
# SQL — string concat / interpolation in query context
git grep -nE "(query|execute|raw)\s*\(\s*[\`'\"].*(\+|\$\{)" -- '*.ts' '*.js' '*.py'
git grep -nE "f[\"'].*(SELECT|INSERT|UPDATE|DELETE).*\{" -- '*.py'
git grep -nE "format!.*(SELECT|INSERT|UPDATE|DELETE)" -- '*.rs'
# Command / eval
git grep -nE "(child_process|exec|execSync|spawn|os\.system|os\.popen|subprocess|Runtime\.exec)" -- '*.ts' '*.js' '*.py' '*.java'
git grep -nE "\beval\s*\(|new Function\s*\(" -- '*.ts' '*.js' '*.py'
# XSS
git grep -nE "dangerouslySetInnerHTML|v-html|innerHTML\s*=|insertAdjacentHTML" -- '*.tsx' '*.jsx' '*.vue' '*.ts' '*.js'
git grep -nE "\|safe|\|raw|mark_safe|SafeString" -- '*.py' '*.html'
# NoSQL / object injection (Mongo, etc.)
git grep -nE "\.(find|findOne|update|delete)(One|Many)?\s*\(\s*(req\.(body|query|params))" -- '*.ts' '*.js'
git grep -nE "\$where|\$regex" -- '*.ts' '*.js'
```

Classes: **SQL injection** (concat/interpolation, f-strings, `.raw()` — but NOT parameterized
queries or the `sql`...`` tagged template, per calibration), **command injection** (shell
strings, `shell=True`, `eval`/`new Function` on non-literal input — but NOT `execFile`/array
form), **XSS** (raw HTML from user input without a sanitizer), **NoSQL/object injection**
(passing `req.body`/`req.query` objects straight into a query filter → operator injection).

### Step 5: Broken Access Control

Drive this from the entry-point table (Step 3). For **every** authenticated route:

- **Missing authentication** — a mutating route with no auth gate that isn't public-by-design
  → `major` (`critical` for admin/privileged).
- **Missing authorization (BOLA/BFLA)** — a privileged/admin action with no role or permission
  check → `critical`.
- **IDOR — missing ownership check** — a route that reads or mutates a record *by id* where
  the query is **not scoped to the caller's user id**. Parameterization does not fix this.
  Confirm the query has an ownership predicate (`AND user_id = $caller`, `where: { ..., userId }`).
  → `critical`. See `SEC-AUTHZ-IDOR` and the calibration pair.
- **Multi-tenant isolation** — first detect whether the app is multi-tenant (a
  `tenant_id`/`org_id`/`league_id`/`account_id` column on domain tables in the schema, Drizzle
  models, or Prisma schema). If so, any query on a tenanted table missing the tenant predicate
  is a cross-tenant data leak → `critical`. See `SEC-AUTHZ-TENANT`.
- **Mass assignment** — a create/update that spreads the whole request body into a model,
  allowing a client to set fields it shouldn't (`role`, `isAdmin`, `ownerId`):
  ```bash
  git grep -nE "\.(create|update|save|insert)\s*\(\s*(\{?\s*\.\.\.)?req\.body" -- '*.ts' '*.js'
  git grep -nE "(create|update)\([^)]*\*\*(request|req)\.(json|data|POST)" -- '*.py'
  ```
  → `major` (`critical` if a privilege field is assignable).

### Step 6: Input Validation & Path Traversal

For each entry point with `input validation? = no` in the table:
- Reads `req.body`/`query`/`params` (or framework equivalent) with no schema (zod, joi, yup,
  pydantic, class-validator) and no manual checks → **missing validation** (`major`).
- File-upload endpoint with no type/size limit (`multer`/`formidable`/`busboy` without
  `fileFilter`/`limits`) → `major`.

**Path traversal** — user input used to build a filesystem path or key:
```bash
git grep -nE "(readFile|writeFile|createReadStream|sendFile|path\.join|open|fs\.)" -- '*.ts' '*.js' '*.py' | git grep -nE "req\.(params|query|body)"
```
Flag `path.join(base, req.params.file)` / `open(user_path)` without a `path.resolve` +
prefix/allowlist check or `..`/absolute-path rejection → `critical`. (`SEC-VAL-003`)

### Step 7: Authentication Mechanics

```bash
git grep -nE "algorithms?\s*:\s*\[?\s*['\"]?none|verify\s*:\s*false|verify=False" -- '*.ts' '*.js' '*.py'   # JWT alg none / verify off
git grep -nE "httpOnly\s*:\s*false|secure\s*:\s*false|sameSite\s*:\s*['\"]?none" -- '*.ts' '*.js'          # weak session cookie
git grep -nE "createHash\(['\"](md5|sha1)|hashlib\.(md5|sha1)|MessageDigest\.getInstance\(['\"](MD5|SHA-1)" -- '*.ts' '*.js' '*.py' '*.java'  # weak password hash
git grep -nE "bcrypt.*(genSalt|hash)\(\s*[0-9]\b" -- '*.ts' '*.js'   # bcrypt cost < 10
```
Also flag: no rate limiting on `/login`, `/register`, `/reset` (no limiter middleware on auth
routes) → `major`. **Timing-unsafe secret comparison** — a token/HMAC/signature compared with
`===`/`==`/`.equals()` instead of `crypto.timingSafeEqual`/`hmac.compare_digest` → `major`
(`SEC-AUTH-007`):
```bash
git grep -nE "(token|secret|signature|hmac|digest|hash)\s*={2,3}\s*" -- '*.ts' '*.js'
```

### Step 8: CSRF

From the entry-point table: cookie-authenticated state-changing routes (POST/PUT/PATCH/DELETE)
with no CSRF token/double-submit/origin check, and auth cookies without `SameSite`.
Token-in-header APIs (Authorization: Bearer) are generally exempt. → `major` / `minor`.

### Step 9: SSRF & Open Redirect

```bash
git grep -nE "(fetch|axios|got|request|urllib|http\.(get|request)|HttpClient|requests\.(get|post))\s*\(.*req\.(query|params|body)" -- '*.ts' '*.js' '*.py'
git grep -nE "(redirect|Location)\s*\(?.*req\.(query|params|body)" -- '*.ts' '*.js'
git grep -nE "redirect\(.*request\.(GET|POST|args)" -- '*.py'
```
SSRF: user-controlled URL fetched server-side without an allowlist → `major` (`critical` if it
can reach cloud metadata `169.254.169.254` or internal services). Open redirect: redirect
target from user input without allowlist → `major`.

### Step 10: Cryptography

```bash
git grep -nE "ECB|AES/ECB|mode=ECB|\bDES\b|DESede|3DES" -- '*.ts' '*.js' '*.py' '*.java' '*.go'
git grep -nE "iv\s*[:=]\s*(['\"][0-9a-fA-F]{16,}|Buffer\.from\()" -- '*.ts' '*.js'   # hardcoded IV
git grep -nE "Math\.random|random\.random\(\)|\brand\(\)" -- '*.ts' '*.js' '*.py'      # weak PRNG
```
ECB mode → `major`; DES/3DES → `major`; hardcoded IV → `major`; `Math.random()`/`random.random()`
for a **security** value (token/id/nonce) → `major` (skip for jitter/shuffle — see
calibration). MD5/SHA1 for passwords/tokens → `critical`; for checksums/cache keys → `info`.

### Step 11: Unsafe Deserialization, ReDoS, Zip-Slip, Prototype Pollution

```bash
git grep -nE "pickle\.loads?|yaml\.load\(|yaml\.unsafe_load|Marshal\.load|unserialize\(|ObjectInputStream" -- '*.py' '*.rb' '*.php' '*.java'
git grep -nE "(new RegExp\(|re\.compile\().*(req\.|request\.|input)" -- '*.ts' '*.js' '*.py'   # user-supplied regex → ReDoS
git grep -nE "(entry\.(path|name)|zipEntry|extractall|tarfile)" -- '*.ts' '*.js' '*.py'         # archive extraction → zip-slip
git grep -nE "(merge|extend|defaultsDeep|set)\s*\(.*(req\.body|JSON\.parse)" -- '*.ts' '*.js'   # prototype pollution
```
- **Unsafe deserialization** — pickle/`yaml.load`/`Marshal.load`/PHP `unserialize`/Java
  `ObjectInputStream` on untrusted data → `major` (RCE class).
- **ReDoS** — a regex built from user input, or a known catastrophic-backtracking pattern on
  user input → `minor`/`major` depending on the endpoint.
- **Zip-slip / tar traversal** — extracting archive entries to a path without validating the
  entry name stays under the target dir → `major`.
- **Prototype pollution** — deep-merging attacker-controlled objects into a target without
  guarding `__proto__`/`constructor` → `major`.

### Step 12: Insecure Defaults, CORS, Headers, Webhooks

```bash
git grep -nE "cors\(\s*\{?\s*origin\s*:\s*['\"]?\*|Access-Control-Allow-Origin.*\*" -- '*.ts' '*.js' '*.py'
git grep -nE "origin\s*:\s*(req\.headers\.origin|true)" -- '*.ts' '*.js'   # origin reflection
git grep -nE "DEBUG\s*=\s*True|debug\s*:\s*true" -- '*.py' '*.ts' '*.js' '*.json'
git grep -nE "(password|passwd|secret)\s*[:=]\s*['\"]?(admin|password|123456|default|changeme)" -- '*.ts' '*.js' '*.py' '*.yaml' '*.json'
```
Flag: CORS `origin:'*'` with `credentials:true` → `critical`; CORS wildcard/origin-reflection
otherwise → `major`; debug mode in prod config → `major`; default creds → `critical`;
permissive CSP (`unsafe-inline`/`unsafe-eval`/`*`) → `minor`; missing security headers
(no helmet/HSTS/X-Frame-Options) → `minor`; HTTP in prod URLs → `minor`. **Webhook receiver
that trusts the payload without verifying the provider signature** (Stripe/GitHub/etc.) →
`major` (`SEC-WEBHOOK`).

### Step 13: IaC Security (Terraform)

If terraform files are present:
```bash
git grep -nE 'effect\s*=\s*"Allow".*actions\s*=\s*\["\*"\]|"Action":\s*"\*"' -- '*.tf'
git grep -nE 'acl\s*=\s*"public-read|block_public_acls\s*=\s*false' -- '*.tf'
git grep -nE 'encrypted\s*=\s*false|storage_encrypted\s*=\s*false' -- '*.tf'
git grep -nE 'cidr_blocks\s*=\s*\["0\.0\.0\.0/0"\]' -- '*.tf'
```
Combine with tflint findings. Wildcard IAM → `critical`; public bucket → `critical`; SG open to
0.0.0.0/0 on a sensitive port → `critical`; unencrypted storage → `major`.

### Step 14: Unsafe Install & Lifecycle Scripts

```bash
git grep -nE "(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(ba)?sh\b" -- '*.md' '*.mdx' '*.rst'
git grep -nE "\"(pre|post)?install\"\s*:\s*\"[^\"]*(curl|wget|node -e|sh |bash |sudo )" -- 'package.json'
git grep -nE "\bsudo\b|chmod\s+\+x|chown\s+root" -- 'install.sh' 'setup.sh'
git grep -nE "os\.system|subprocess[^)]*shell\s*=\s*True|sudo" -- 'setup.py' 'install.py'
```
Pipe-to-shell installers → `major`; lifecycle hooks running arbitrary/remote commands →
`major`; install scripts requiring elevated privileges → `minor` (escalate to `major` with a
remote download). Exclude local build-only hooks (`tsc`, `husky install`) and documented
download-then-inspect flows.

### Step 15: Platform Playbooks

Run the playbook(s) matching the stack detected in the census. Each targets risks that the
generic web checks miss — without these, a Tauri/Flutter/Swift repo scores falsely high.

**Tauri (Rust + web):**
```bash
git grep -nE "\"(shell|fs|http|all)\"\s*:\s*(true|\{)|\"scope\"|dangerousRemoteDomainIpcAccess|withGlobalTauri" -- 'tauri.conf.json' 'src-tauri/**/*.json'
git grep -nE "#\[tauri::command\]|invoke_handler" -- 'src-tauri/**/*.rs'
```
Flag: overly broad `allowlist`/capability scopes (`shell: { all: true }`, `fs` scope `**`),
`dangerousRemoteDomainIpcAccess`, missing updater `pubkey`, `#[tauri::command]`s that take a
path/command and act on it without validation → `major`.

**Electron:**
```bash
git grep -nE "nodeIntegration\s*:\s*true|contextIsolation\s*:\s*false|webSecurity\s*:\s*false|enableRemoteModule\s*:\s*true|allowRunningInsecureContent" -- '*.ts' '*.js'
git grep -nE "shell\.openExternal\(|ipcMain\.(on|handle)\(" -- '*.ts' '*.js'
```
Flag: `nodeIntegration:true` / `contextIsolation:false` / `webSecurity:false` → `critical`;
`shell.openExternal` on user input → `major`; unvalidated IPC channels acting on renderer
input → `major`; loading remote content into a privileged window → `major`.

**Flutter / Dart:**
```bash
git grep -nE "SharedPreferences|http://|NSAllowsArbitraryLoads|badCertificateCallback|allowBadCertificates" -- '*.dart'
git grep -nE "(apiKey|secret|token|password)\s*=\s*['\"][^'\"]{12,}" -- '*.dart'
```
Flag: secrets/tokens in source or `shared_preferences` (use `flutter_secure_storage`) →
`major`/`critical`; cleartext `http://` to app APIs → `major`; disabled TLS validation
(`badCertificateCallback => true`) → `critical`; no certificate pinning on sensitive APIs →
`minor`.

**iOS / Swift:**
```bash
git grep -nE "NSAllowsArbitraryLoads|NSExceptionAllowsInsecureHTTPLoads" -- '*.plist' 'Info.plist'
git grep -nE "UserDefaults.*(token|password|secret|key)|kSecAttrAccessible" -- '*.swift'
git grep -nE "(apiKey|secret|token)\s*=\s*\"[^\"]{12,}\"" -- '*.swift'
```
Flag: ATS disabled (`NSAllowsArbitraryLoads = true`) → `major`; secrets/tokens in
`UserDefaults` instead of Keychain → `major`; hardcoded secrets → `critical`; overly permissive
Keychain accessibility (`kSecAttrAccessibleAlways`) → `minor`; CloudKit public-DB write scopes
on user data → `major`.

**LLM apps (agent/MCP/tool-use surface — check when the census shows `@anthropic-ai`,
`openai`, `langchain`, tool/function definitions):**
- Prompt/tool-injection: untrusted content (web page, email, file, DB row) concatenated into a
  prompt that then drives **tool execution or code exec** without a gate → `major`/`critical`.
- Unmetered spend: model calls in a user-triggered loop with no cap/budget/rate limit →
  `minor` (Jason caps LLM spend deliberately — surface, don't over-flag).
- Secrets in prompts/logs: API keys or PII interpolated into prompts or logged → `major`.

### Step 16: Verification Pass (MANDATORY)

Before anything enters the report, run every candidate `major`/`critical` finding through
`shared/verification.md`: read the actual code, capture the exact offending line into
`snippet`, trace that untrusted input truly reaches the sink, and actively try to refute it
using the pairs in `shared/security-calibration.md`. Drop or demote anything you cannot
confirm. Set `confidence` honestly. A report where every critical is defensible line-by-line
is the goal.

### Step 17: Apply Suppressions

Per `shared/suppressions.md`: for each surviving finding, check `tenet-ignore` comments at/above
the line and `[suppressions]` in `.healthcheck.toml`. Matching findings are demoted to `info`
with `Suppressed: <reason>` in the description and do not affect the score. Track
`metrics.suppressed_count`.

### Step 18: Score Calculation

```
score = 100 - (5 * critical_count + 2 * major_count + 0.5 * minor_count)
score = max(0, min(100, int(score + 0.5)))
```
Info findings (including suppressed) do NOT affect the score. Apply severity escalation
triggers from `shared/severity.md` (critical path, systemic, whole-layer) during Steps 5–15.

### Step 19: Write Report

Write to `.healthcheck/reports/security.json`:

```json
{
  "key": "security",
  "score": 75,
  "weight": 1.5,
  "skill_version": "1.1.0",
  "applicable": true,
  "notes": "Audited 34 entry points and 47 TS files. Found 1 critical IDOR (orders route unscoped), 1 SQL injection, 3 major auth gaps, and 5 minor validation issues. Semgrep corroborated 4 findings. 2 findings suppressed by config.",
  "metrics": {
    "files_scanned": 47,
    "entry_points_audited": 34,
    "toolchain_signals": ["semgrep"],
    "suppressed_count": 2,
    "confidence_breakdown": { "deterministic": 4, "native": 3, "heuristic": 2 },
    "category_breakdown": { "injection": 1, "access_control": 2, "auth": 3, "crypto": 2, "validation": 5, "config": 1 }
  },
  "checks": [
    { "name": "Entry-point auth coverage", "status": "failed", "count": 3, "description": "3 of 34 routes missing auth" },
    { "name": "Ownership/tenant scoping", "status": "failed", "count": 2, "description": "2 routes fetch records by id without owner scope" }
  ],
  "findings": [ ... ]
}
```

Then delete `.healthcheck/tmp/security-*.md` and `.healthcheck/tmp/entry-points.md` scratch files.

## Finding Severity Guide

| Category | Pattern | Default Severity |
|---|---|---|
| SQL injection (confirmed) | User input in raw SQL | critical |
| Command injection (confirmed) | User input in exec/eval shell string | critical |
| XSS (confirmed) | User input in raw HTML, no sanitizer | critical |
| NoSQL / object injection | `req.body` object into query filter | major |
| Missing auth on admin route | No auth on privileged endpoint | critical |
| Missing auth on standard mutation | No auth on POST/PUT/DELETE | major |
| Missing authorization (BOLA/BFLA) | No role check on privileged action | critical |
| IDOR — missing ownership check | Record by id, not scoped to caller | critical |
| Multi-tenant isolation gap | Tenanted table query missing tenant scope | critical |
| Mass assignment | Whole req.body spread into model | major (critical if privilege field) |
| Path traversal | User input in filesystem path | critical |
| Missing input validation | No schema on route input | major |
| Missing file-upload validation | No type/size limit | major |
| JWT alg:none / verify:false | Token forgery | critical |
| Weak password hashing (MD5/SHA1) | Fast hash for passwords | critical |
| bcrypt cost < 10 | Weak work factor | major |
| Missing rate limiting on auth | No limiter on /login | major |
| Timing-unsafe secret compare | `===` on token/HMAC | major |
| Missing CSRF on state change | Cookie auth, no CSRF | major |
| SSRF | User-controlled server-side URL | major (critical if metadata reachable) |
| Open redirect | User input in redirect target | major |
| Unsafe deserialization | pickle/yaml.load/Marshal/unserialize | major |
| ReDoS | User-controlled/catastrophic regex | minor–major |
| Zip-slip / tar traversal | Unvalidated archive entry path | major |
| Prototype pollution | Deep merge of attacker object | major |
| ECB / DES / hardcoded IV | Broken crypto primitive | major |
| Math.random for security | Token/ID/nonce generation | major |
| CORS wildcard + credentials | `origin:'*'` + `credentials:true` | critical |
| CORS wildcard / origin reflection | Any origin allowed | major |
| Webhook signature not verified | Trusts unverified payload | major |
| Debug mode in prod | `DEBUG=True` | major |
| Default credentials | `password: admin` | critical |
| Permissive CSP / missing headers / HTTP in prod | Config hardening gaps | minor |
| Overly permissive IAM / public bucket / SG 0.0.0.0/0 | IaC exposure | critical |
| Unencrypted storage | `encrypted = false` | major |
| Tauri broad allowlist / Electron nodeIntegration | Desktop sandbox escape | major–critical |
| Flutter/Swift secret in storage / TLS disabled | Mobile data exposure | major–critical |
| Prompt/tool injection into exec | LLM agent RCE path | major–critical |
| Pipe-to-shell installer / lifecycle RCE | Supply-chain trust | major |

## Confidence Tiers per Detection Method

| Method | Confidence |
|---|---|
| Semgrep / tflint match | `deterministic` |
| Read the code and traced flow end-to-end | `native` |
| AST query (tree_sitter langs) | `tree_sitter` |
| Grep pattern match, flow not fully traced | `heuristic` |

## Constraints

- ALWAYS complete every step (see `shared/scan-discipline.md`) — under-scanning yields a
  falsely high score. Enumerate entry points fully; do not sample.
- NEVER emit a `major`/`critical` finding without running it through the Step 16 verification
  pass and quoting the offending line into `snippet`.
- NEVER flag test files (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`, fixtures, seeds) at the
  same severity as production — demote one level or drop.
- NEVER flag code inside comments; NEVER flag parameterized queries, the `sql`...`` tagged
  template, DOMPurify-wrapped HTML, `execFile`/array-form exec, or non-security `Math.random`
  (see `shared/security-calibration.md`).
- ALWAYS honor `tenet-ignore` comments and `[suppressions]` config (Step 17).
- Remember parameterization does NOT fix IDOR — check for the ownership predicate separately.
- Group systemic findings (same pattern 5+ files) into one finding and escalate per severity.md.
- Scoring math is pure arithmetic — no LLM judgment in the formula.
- Every finding MUST include a `fix_prompt` following `shared/fix_prompt_template.md`.
- If semgrep and grep detect the same issue, keep the semgrep finding and drop the duplicate.

## fix_prompt Examples

### Example 1: SQL Injection

```
# Fix: SQL injection in user lookup query

## Context
The `findUserByEmail` function builds a SQL query using string concatenation with
user-supplied input, allowing SQL injection.

## Location
- File: src/db/users.ts
- Line: 34
- Dimension: security / critical

## Current behavior
```typescript
const result = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

## Required change
Replace the template literal with a parameterized query using a `$1` placeholder:
```typescript
const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
```

## Constraints
- Do not change the function signature or return type
- Preserve existing test behavior

## Verification
- Run: `npm test -- --grep "findUserByEmail"`
- Run: `git grep -nE "query\(\s*\`" src/db/` and confirm zero interpolated queries
```

### Example 2: IDOR — Missing Ownership Check

```
# Fix: Any authenticated user can read any order (IDOR)

## Context
The `GET /orders/:id` handler is authenticated but fetches the order by id only — it never
checks the order belongs to the requesting user. Any logged-in user can read any other
user's order by guessing or enumerating ids. The query is parameterized, so this is not SQL
injection — it is a missing authorization (ownership) check.

## Location
- File: src/api/orders.ts
- Line: 88
- Dimension: security / critical

## Current behavior
```typescript
router.get('/orders/:id', requireAuth, async (req, res) => {
  const order = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  res.json({ data: order.rows[0] });
});
```

## Required change
Scope the query to the authenticated user (and/or their tenant), and return 404 (not 403) so
you don't leak which ids exist:
```typescript
const order = await db.query(
  'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
  [req.params.id, req.user.id]
);
if (!order.rows[0]) return res.status(404).json({ error: 'Not found' });
res.json({ data: order.rows[0] });
```

## Constraints
- Apply the same ownership predicate to every by-id read/update/delete on this resource
- If admins legitimately need cross-user access, gate that behind an explicit role check —
  do not remove the ownership predicate for regular users
- Preserve the response shape

## Verification
- Run: `npm test -- --grep "orders"`
- Manually: log in as user A, request an order id owned by user B → expect 404
- Audit siblings: `git grep -nE "WHERE id = \\$1" src/api/` and confirm each has an owner scope
```

### Example 3: CORS Wildcard with Credentials

```
# Fix: CORS wildcard allows any origin on authenticated API

## Context
The Express CORS config uses `origin: '*'` with `credentials: true`, letting any website make
authenticated cross-origin requests and steal user data.

## Location
- File: src/server.ts
- Line: 12
- Dimension: security / critical

## Current behavior
```typescript
app.use(cors({ origin: '*', credentials: true }));
```

## Required change
Replace the wildcard with an env-driven allowlist:
```typescript
const ALLOWED = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED.includes(origin)),
  credentials: true,
}));
```

## Constraints
- Keep `credentials: true` only for allowlisted origins
- Document `CORS_ALLOWED_ORIGINS` and set it in deployment configs
- Keep `http://localhost:3000` as the dev fallback

## Verification
- `curl -H "Origin: https://evil.com" -I http://localhost:3000/api/me` must NOT return
  `Access-Control-Allow-Origin: https://evil.com`
- `curl -H "Origin: http://localhost:3000" -I http://localhost:3000/api/me` must return it
```
