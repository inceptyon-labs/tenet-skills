---
name: tenet-security
description: "Audits security vulnerabilities including injection, auth, validation, crypto, SSRF, CORS, and CSRF."
when_to_use: "Security audit, vulnerability scan, injection check, auth review, OWASP check, tenet security"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Security

> Scans the codebase for security vulnerabilities across injection, authentication, authorization, cryptography, and configuration domains.

## Purpose

This skill evaluates the security posture of the codebase by combining deterministic toolchain signals (semgrep, tflint) with targeted pattern matching for dangerous APIs, insecure defaults, missing validation, and unsafe cryptographic practices. Every finding includes a self-contained `fix_prompt` following the template in `shared/fix_prompt_template.md`.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python]
  tree_sitter: [go, rust, java, ruby]
  heuristic: [terraform, kotlin, swift, php, csharp, cpp, c, shell]
  config-only: [yaml, json, dockerfile]
  skip: [markdown, css]
```

## Toolchain Inputs

| File | Required | Notes |
|---|---|---|
| `.healthcheck/toolchain/semgrep.json` | No (degrade gracefully) | Primary signal for injection, auth, crypto findings |
| `.healthcheck/toolchain/tflint.json` | No (only if terraform present) | IaC security misconfigurations |
| `.healthcheck/toolchain/language-census.json` | Yes | Determines which language-specific scans to run |

If `semgrep.json` is missing, log a warning and proceed with grep-based analysis only. Set `confidence: "heuristic"` on all findings produced without semgrep backing.

If `tflint.json` is missing and terraform files exist in the census, log that terraform security checks are limited to heuristic patterns.

## Procedure

### Step 1: Load Toolchain Data

```bash
# Read semgrep findings if available
SEMGREP=".healthcheck/toolchain/semgrep.json"
if [ -f "$SEMGREP" ]; then
  SEMGREP_FINDINGS=$(jq '.findings' "$SEMGREP")
else
  echo "WARN: semgrep.json not found — proceeding with heuristic-only security scan"
  SEMGREP_FINDINGS="[]"
fi

# Read tflint findings if available
TFLINT=".healthcheck/toolchain/tflint.json"
if [ -f "$TFLINT" ]; then
  TFLINT_FINDINGS=$(jq '.findings' "$TFLINT")
else
  TFLINT_FINDINGS="[]"
fi

# Read language census
CENSUS=".healthcheck/toolchain/language-census.json"
if [ ! -f "$CENSUS" ]; then
  echo "ERROR: language-census.json is missing — cannot determine scan scope"
  exit 1
fi
```

### Step 2: Ingest Semgrep Findings

For each semgrep finding with `category: "security"`:
1. Map the semgrep severity to Tenet severity:
   - `error` → `critical`
   - `warning` → `major`
   - `info` → `minor`
2. Map the semgrep `rule_id` to a Tenet finding type (see Rubric below)
3. Generate a `fix_prompt` from the finding details
4. Set `confidence: "deterministic"`

### Step 3: Scan for Injection Risks

Grep for dangerous patterns. For each match, verify it is not inside a test file, comment, or known-safe wrapper before emitting a finding.

#### SQL Injection

```bash
# String concatenation in SQL queries
grep -rnE "(query|execute|raw)\s*\(\s*['\`\"].*\+.*\$" --include="*.ts" --include="*.js" --include="*.py" .
grep -rnE "f['\"].*SELECT.*\{" --include="*.py" .
grep -rnE "format!.*SELECT.*\{" --include="*.rs" .
```

Look for:
- String concatenation in SQL: `query("SELECT * FROM " + table)`, `db.raw(\`...${userInput}\`)`
- Template literals with user input in SQL context
- Python f-strings or `.format()` in SQL
- Rust `format!` macros in SQL
- Any ORM `.raw()` or `.execute()` with interpolated strings

**Exclude safe patterns:** Parameterized queries (`$1`, `?`, `:param`), query builders, migrations, seed files.

#### Command Injection

```bash
# Direct shell execution with user input
grep -rnE "(exec|execSync|spawn|child_process|subprocess|os\.system|os\.popen|Runtime\.exec)" --include="*.ts" --include="*.js" --include="*.py" --include="*.java" .
grep -rnE "eval\s*\(" --include="*.ts" --include="*.js" --include="*.py" .
```

Look for:
- `child_process.exec()` with string arguments (not array)
- `subprocess.call(shell=True)` in Python
- `os.system()`, `os.popen()` in Python
- `eval()` with non-literal arguments in JS/TS/Python
- `new Function()` with dynamic input in JS/TS
- `Runtime.getRuntime().exec()` in Java with concatenated strings

#### XSS (Cross-Site Scripting)

```bash
# Dangerous HTML rendering
grep -rnE "dangerouslySetInnerHTML|v-html|innerHTML\s*=" --include="*.tsx" --include="*.jsx" --include="*.vue" --include="*.ts" --include="*.js" .
grep -rnE "\|safe|\|raw|mark_safe|SafeString" --include="*.py" --include="*.html" .
```

Look for:
- `dangerouslySetInnerHTML` in React without sanitization
- `v-html` in Vue templates
- Direct `innerHTML` assignment
- Django `|safe` filter, `mark_safe()` on user input
- Jinja2 `|safe` or `|raw` filters
- Missing output encoding in server-rendered HTML

### Step 4: Scan for Auth/Authz Gaps

Look for:
- Route handlers without auth middleware
- Admin endpoints accessible without role checks
- JWT verification skips (`verify: false`, `algorithms: ['none']`)
- Session configuration issues (missing `secure`, `httpOnly`, `sameSite`)
- Missing CSRF tokens on state-changing endpoints
- Password hashing with weak algorithms (MD5, SHA1, plain bcrypt cost < 10)

```bash
# JWT misconfig
grep -rnE "verify\s*:\s*false|algorithms\s*:\s*\[.*none" --include="*.ts" --include="*.js" --include="*.py" .
# Session config issues
grep -rnE "secure\s*:\s*false|httpOnly\s*:\s*false" --include="*.ts" --include="*.js" .
# Missing auth on routes — check for route definitions without preceding auth middleware
```

For route handler analysis:
1. Identify the framework (Express, Fastify, Django, Flask, Gin, etc.)
2. List all route definitions
3. Check for auth middleware at the app/router level or per-route
4. Flag any non-GET routes without auth middleware as `major`
5. Flag admin/management routes without role-based checks as `critical`

### Step 5: Scan for Insecure Defaults

```bash
# CORS wildcard
grep -rnE "cors\(\s*\{?\s*origin\s*:\s*['\"]?\*|Access-Control-Allow-Origin.*\*" --include="*.ts" --include="*.js" --include="*.py" .
# Debug mode in production configs
grep -rnE "DEBUG\s*=\s*True|debug\s*:\s*true" --include="*.py" --include="*.ts" --include="*.js" --include="*.json" .
# Default credentials
grep -rnE "(password|passwd|secret)\s*[:=]\s*['\"]?(admin|password|123456|default|changeme)" --include="*.ts" --include="*.js" --include="*.py" --include="*.yaml" --include="*.json" .
```

Look for:
- `cors({ origin: '*' })` or `Access-Control-Allow-Origin: *` on credentialed endpoints
- Debug mode enabled in production configuration
- Default passwords or credentials in config files
- Permissive CSP (`unsafe-inline`, `unsafe-eval`, `*`)
- Missing rate limiting on auth endpoints
- HTTP instead of HTTPS in production URLs
- `allowJs: true` combined with `noImplicitAny: false` in tsconfig

### Step 6: Scan for Unsafe Deserialization

```bash
# Unsafe deserialization
grep -rnE "pickle\.loads?|yaml\.load\(|yaml\.unsafe_load|Marshal\.load|unserialize\(|JSON\.parse.*\beval\b|ObjectInputStream" --include="*.py" --include="*.rb" --include="*.php" --include="*.java" .
```

Look for:
- Python `pickle.load()` / `pickle.loads()` on untrusted data
- `yaml.load()` without `Loader=SafeLoader` in Python
- `yaml.unsafe_load()` in Python
- Ruby `Marshal.load` on untrusted data
- PHP `unserialize()` on user input
- Java `ObjectInputStream.readObject()` without type filtering

### Step 7: Scan for Missing Input Validation

Look for:
- API endpoints that read `req.body`, `req.params`, `req.query` without validation (no zod, joi, yup, class-validator, or manual checks)
- File upload endpoints without file type / size validation
- Numeric inputs used without `parseInt` / `Number()` guards
- URL parameters used directly in database queries or file paths

For framework-aware analysis:
1. Identify validation libraries in use (from `package.json`, `requirements.txt`, etc.)
2. Check each route handler for validation middleware or inline validation
3. Flag endpoints that consume user input without any validation layer

### Step 8: Scan for Open Redirects

```bash
# Redirect with user-controlled URL
grep -rnE "redirect\(.*req\.(query|params|body)|res\.redirect\(.*req\.|Location.*req\." --include="*.ts" --include="*.js" .
grep -rnE "redirect\(.*request\.(GET|POST|args)" --include="*.py" .
```

Look for:
- `res.redirect(req.query.url)` without allowlist validation
- `Location` header set from user input
- Django/Flask redirect with user-controlled `next` parameter
- Meta refresh tags with dynamic URLs

### Step 9: Scan for Unsafe Crypto

```bash
# Weak hashing for auth/secrets
grep -rnE "createHash\(['\"]md5|createHash\(['\"]sha1|hashlib\.md5|hashlib\.sha1|MessageDigest\.getInstance\(['\"]MD5|MessageDigest\.getInstance\(['\"]SHA-1" --include="*.ts" --include="*.js" --include="*.py" --include="*.java" .
# ECB mode
grep -rnE "ECB|AES/ECB|mode=ECB|DES" --include="*.ts" --include="*.js" --include="*.py" --include="*.java" --include="*.go" .
# Hardcoded IVs
grep -rnE "iv\s*[:=]\s*['\"][0-9a-fA-F]{16,}|iv\s*[:=]\s*Buffer\.from\(" --include="*.ts" --include="*.js" .
# Weak random for security
grep -rnE "Math\.random|random\.random\(\)|rand\(\)" --include="*.ts" --include="*.js" --include="*.py" .
```

Flag:
- MD5/SHA1 used for password hashing or token generation → `critical`
- MD5/SHA1 used for checksums/cache keys → `info` (not security-sensitive)
- ECB block cipher mode → `major`
- Hardcoded initialization vectors → `major`
- DES or 3DES → `major`
- `Math.random()` used for security tokens/IDs → `major`
- `Math.random()` used for UI/non-security purposes → skip

### Step 10: Scan for SSRF

```bash
# Server-side requests with user input
grep -rnE "(fetch|axios|got|request|urllib|http\.get|http\.request|HttpClient)\s*\(.*req\.(query|params|body)" --include="*.ts" --include="*.js" --include="*.py" .
```

Look for:
- HTTP client calls where the URL or hostname comes from user input
- Missing URL validation / allowlist for outgoing requests
- Internal service URLs constructable from user input

### Step 11: Scan for CSRF

Look for:
- State-changing endpoints (POST/PUT/DELETE/PATCH) without CSRF middleware
- Cookie-based auth without `sameSite` attribute
- Missing CSRF token in forms
- REST APIs relying on cookies without CSRF protection

### Step 12: IaC Security (Terraform)

If terraform files are present in the census:

```bash
# Overly permissive IAM
grep -rnE 'effect\s*=\s*"Allow".*actions\s*=\s*\["\*"\]|"Action":\s*"\*"' --include="*.tf" .
# Public S3 buckets
grep -rnE 'acl\s*=\s*"public-read|block_public_acls\s*=\s*false' --include="*.tf" .
# Unencrypted storage
grep -rnE 'encrypted\s*=\s*false|storage_encrypted\s*=\s*false' --include="*.tf" .
# Security groups with 0.0.0.0/0
grep -rnE 'cidr_blocks\s*=\s*\["0\.0\.0\.0/0"\]' --include="*.tf" .
```

Combine with tflint findings for comprehensive IaC coverage.

### Step 13: Scan for Unsafe Install & Lifecycle Scripts

Repositories that tell users to pipe remote content into a shell, or that run arbitrary
commands during package installation, hand every consumer a remote-code-execution path.
These are supply-chain trust signals — flag them even when the rest of the codebase is clean.

```bash
# Pipe-to-shell install instructions in docs
grep -rnE "(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(ba)?sh\b" --include="*.md" --include="*.mdx" --include="*.rst" .
# Package manager lifecycle hooks that shell out or fetch remote content
grep -rnE "\"(pre|post)?install\"\s*:\s*\"[^\"]*(curl|wget|node -e|sh |bash |sudo )" package.json
# Install/setup shell scripts requiring elevated privileges
grep -rnE "\bsudo\b|chmod\s+\+x|chown\s+root" --include="install.sh" --include="setup.sh" .
# Python install scripts that execute a shell or escalate
grep -rnE "os\.system|subprocess[^)]*shell\s*=\s*True|sudo" --include="setup.py" --include="install.py" .
```

Look for and flag:
- **Pipe-to-shell installers** — `curl ... | bash`, `wget -O- ... | sh` in README/docs or scripts. The user executes unreviewed remote code, often as root → `major`.
- **Lifecycle hooks running arbitrary commands** — `preinstall`/`install`/`postinstall`/`prepare` entries in `package.json` (or the equivalent in other ecosystems) that invoke a shell, `node -e`, or download-and-execute remote content. These run automatically on `npm install` → `major`.
- **Install/setup scripts requiring elevated privileges** — `sudo`, `chmod +x` on downloaded artifacts, or writes to system paths inside `install.sh`/`setup.sh`/`setup.py` → `minor` (escalate to `major` if combined with a remote download).

**Exclude safe patterns:**
- Lifecycle hooks that only run local, in-repo build steps (`tsc`, `husky install`, `node ./scripts/build.js`) with no shell pipe or remote fetch.
- Documented `curl`/`wget` used to *download* a file the user then inspects, not piped straight into a shell.
- Scripts under test fixtures, examples, or vendored third-party directories.

### Step 14: Score Calculation

Apply the standard scoring formula from `shared/severity.md`:

```
score = 100 - (5 * critical_count + 2 * major_count + 0.5 * minor_count)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding, not banker's rounding
```

Info findings do NOT affect the score.

### Step 15: Write Report

Write the dimension report to `.healthcheck/reports/security.json`:

```json
{
  "key": "security",
  "score": 75,
  "weight": 1.5,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Found 1 critical SQL injection, 3 major auth gaps, and 5 minor input validation issues across 47 TypeScript files. Semgrep corroborated 4 of 9 findings.",
  "metrics": {
    "files_scanned": 47,
    "toolchain_signals": ["semgrep"],
    "confidence_breakdown": {
      "deterministic": 4,
      "native": 3,
      "heuristic": 2
    },
    "category_breakdown": {
      "injection": 1,
      "auth": 3,
      "crypto": 2,
      "validation": 5,
      "config": 1
    }
  },
  "findings": [ ... ]
}
```

## Finding Severity Guide

| Category | Pattern | Default Severity |
|---|---|---|
| SQL injection (confirmed) | User input in raw SQL | critical |
| Command injection (confirmed) | User input in exec/eval | critical |
| XSS (confirmed) | User input in dangerouslySetInnerHTML | critical |
| Missing auth on admin route | No middleware on /admin/* | critical |
| JWT alg:none accepted | `algorithms: ['none']` | critical |
| Overly permissive IAM | `Action: *` with `Effect: Allow` | critical |
| CORS wildcard on credentialed endpoint | `origin: '*'` with `credentials: true` | critical |
| Open redirect (confirmed) | User input in redirect URL | major |
| CORS wildcard (non-credentialed) | `origin: '*'` on public API | major |
| Missing CSRF on state-changing endpoint | POST/PUT/DELETE without CSRF | major |
| Unsafe deserialization | `pickle.load`, `yaml.load` | major |
| ECB cipher mode | AES-ECB usage | major |
| Hardcoded IV | Static initialization vector | major |
| Math.random for security | Token/ID generation | major |
| Missing input validation | No zod/joi on route handler | major |
| Weak hashing for auth | MD5/SHA1 for passwords | critical |
| Weak hashing for checksums | MD5/SHA1 for cache keys | info |
| Missing rate limiting on auth | No rate limiter on /login | major |
| SSRF potential | User-controlled URL in fetch | major |
| Debug mode in production config | `DEBUG=True` in production | major |
| Default credentials in config | `password: admin` | critical |
| HTTP in production URL | Non-HTTPS in prod config | minor |
| Permissive CSP | `unsafe-inline`, `unsafe-eval` | minor |
| Missing security headers | No helmet/HSTS/X-Frame | minor |
| Public S3 bucket | `acl = "public-read"` | critical |
| Security group 0.0.0.0/0 on sensitive port | Inbound from anywhere | critical |
| Unencrypted storage | `encrypted = false` | major |
| Pipe-to-shell installer | `curl ... \| bash` in docs/scripts | major |
| Package lifecycle hook runs arbitrary command | `postinstall` shells out / fetches remote | major |
| Install script requires elevated privileges | `sudo` / `chmod +x` in `install.sh` | minor |

## Confidence Tiers per Detection Method

| Method | Confidence |
|---|---|
| Semgrep match | `deterministic` |
| tflint match | `deterministic` |
| AST-based (native/tree_sitter) | `native` or `tree_sitter` |
| Grep pattern match | `heuristic` |

## Output

- `.healthcheck/reports/security.json` — dimension report with all findings

## Constraints

- NEVER flag test files (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`) at the same severity as production code. Demote test-only findings by one severity level.
- NEVER flag code inside comments as a finding.
- NEVER flag known-safe wrappers (e.g., parameterized query functions, sanitizer libraries) as vulnerable.
- ALWAYS verify that `Math.random` / `random.random` is used in a security-sensitive context before flagging.
- ALWAYS check if `dangerouslySetInnerHTML` input passes through DOMPurify or similar sanitizer before flagging.
- ALWAYS include the exact file path and line number in findings.
- Scoring math is pure arithmetic — no LLM judgment in the formula.
- Every finding MUST include a `fix_prompt` following the template in `shared/fix_prompt_template.md`.
- Grep-based findings MUST have `confidence: "heuristic"`.
- If semgrep and grep both detect the same issue, use the semgrep finding (higher confidence) and drop the duplicate.

## fix_prompt Examples

### Example 1: SQL Injection

```
# Fix: SQL injection in user lookup query

## Context
The `findUserByEmail` function builds a SQL query using string concatenation with user-supplied input, allowing SQL injection.

## Location
- File: src/db/users.ts
- Line: 34
- Dimension: security / critical

## Current behavior
```typescript
async function findUserByEmail(email: string) {
  const result = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
  return result.rows[0];
}
```

## Required change
1. Replace the template literal with a parameterized query
2. Use `$1` placeholder and pass `email` as a parameter array element

Replace:
```typescript
const result = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

With:
```typescript
const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
```

## Constraints
- Do not change the function signature
- Do not change the return type
- Preserve existing test behavior

## Verification
- Run: `npm test -- --grep "findUserByEmail"`
- Run: `grep -rn "template literal.*query\|query.*\\\`" src/db/` and confirm zero results
- Verify the function still returns correct results with a valid email
```

### Example 2: eval() Usage

```
# Fix: Command injection via eval() in config parser

## Context
The configuration parser uses `eval()` to process user-submitted configuration strings, allowing arbitrary code execution.

## Location
- File: src/config/parser.js
- Line: 18
- Dimension: security / critical

## Current behavior
```javascript
function parseConfig(input) {
  const config = eval('(' + input + ')');
  return config;
}
```

## Required change
1. Replace `eval()` with `JSON.parse()` for JSON input
2. If the input format requires more than JSON, use a safe parser library (e.g., `json5` or `hjson`)
3. Add input validation before parsing

Replace:
```javascript
const config = eval('(' + input + ')');
```

With:
```javascript
let config;
try {
  config = JSON.parse(input);
} catch (err) {
  throw new Error(`Invalid configuration format: ${err.message}`);
}
```

## Constraints
- Do not change the function signature
- Ensure all existing callers that pass valid JSON still work
- If any callers pass non-JSON (e.g., JS objects with unquoted keys), migrate those call sites to valid JSON

## Verification
- Run: `npm test`
- Run: `grep -rn "eval(" src/` and confirm zero results outside of test files
- Test with a sample config string to confirm parsing still works
```

### Example 3: CORS Wildcard

```
# Fix: CORS wildcard allows any origin on authenticated API

## Context
The Express CORS configuration uses `origin: '*'` while also enabling `credentials: true`, allowing any website to make authenticated cross-origin requests and steal user data.

## Location
- File: src/server.ts
- Line: 12
- Dimension: security / critical

## Current behavior
```typescript
app.use(cors({
  origin: '*',
  credentials: true,
}));
```

## Required change
1. Replace the wildcard origin with an explicit allowlist of trusted origins
2. Read allowed origins from an environment variable for flexibility
3. Keep `credentials: true` only for the allowlisted origins

Replace:
```typescript
app.use(cors({
  origin: '*',
  credentials: true,
}));
```

With:
```typescript
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

## Constraints
- Do not remove `credentials: true` if the frontend relies on cookie-based auth
- Ensure the `CORS_ALLOWED_ORIGINS` env var is documented and set in deployment configs
- Do not break local development — `http://localhost:3000` is the fallback

## Verification
- Run: `npm test`
- Run: `grep -rn "origin.*\*" src/` and confirm zero results
- Test: `curl -H "Origin: https://evil.com" -I http://localhost:3000/api/me` should NOT return `Access-Control-Allow-Origin: https://evil.com`
- Test: `curl -H "Origin: http://localhost:3000" -I http://localhost:3000/api/me` should return `Access-Control-Allow-Origin: http://localhost:3000`
```

### Example 4: Pipe-to-Shell Installer

```
# Fix: README instructs users to pipe a remote script straight into a shell

## Context
The installation instructions tell users to run `curl https://example.com/install.sh | sudo bash`. This executes unreviewed remote code with root privileges; a compromise of the host (or a MITM) silently runs arbitrary commands on every user's machine.

## Location
- File: README.md
- Line: 42
- Dimension: security / major

## Current behavior
```bash
curl -fsSL https://get.example.com/install.sh | sudo bash
```

## Required change
1. Have users download the script first, then run it after inspection:
   ```bash
   curl -fsSL https://get.example.com/install.sh -o install.sh
   # Review install.sh, then:
   sh install.sh
   ```
2. Publish a checksum (and ideally a signature) so users can verify the script before running:
   ```bash
   curl -fsSL https://get.example.com/install.sh -o install.sh
   echo "<sha256>  install.sh" | sha256sum -c
   sh install.sh
   ```
3. Where possible, distribute via a package manager (Homebrew, apt, npm) instead of a curl-pipe installer, and avoid requiring `sudo` unless strictly necessary.

## Constraints
- Do not silently drop the install path users rely on — keep a working one-liner alternative documented as "quick (unverified) install" if you must.
- Prefer removing the `sudo` requirement; only escalate for steps that genuinely need it.

## Verification
- `grep -nE "(curl|wget).*\| *(sudo )?(ba)?sh" README.md` returns no piped-to-shell instructions
- The documented install flow downloads, verifies, then executes as separate steps
```
