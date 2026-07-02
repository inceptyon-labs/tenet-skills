---
name: tenet-secrets
description: "Scans committed files and history for hardcoded tokens, keys, passwords, and private secrets."
when_to_use: "Secret scan, credential leak, API key check, token exposure, tenet secrets"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Secrets

> Detects hardcoded secrets, committed credential files, and weak secret generation patterns across the codebase and git history.

## Purpose

This skill scans for hardcoded secrets that should never appear in version control. It combines deterministic toolchain output (gitleaks, trufflehog, trivy) with targeted regex scanning for common secret formats. The cardinal rule: **any hardcoded production-looking PRIVATE secret is ALWAYS critical severity** regardless of context — but publishable-by-design keys (Firebase web config, Stripe `pk_`, etc.) are NOT secrets and must not be flagged as critical.

## How to run this audit — read first

This skill is executed by a Sonnet-class model. Follow these shared protocols:

- **`shared/scan-discipline.md`** — grep hygiene (all scans below use `git grep`, which walks
  tracked files safely — never iterate `$(git ls-files)`), triage, and the worklog.
- **`shared/verification.md`** — before emitting a `critical`, confirm the match is a real
  private secret (not a placeholder, fixture, example, or publishable key) and mask its value.
- **`shared/security-calibration.md`** — the publishable / private key distinction (see the
  "Publishable / public-by-design keys" pairs). Do not flag public keys as critical.
- **`shared/suppressions.md`** — honor `tenet-ignore` comments and `[suppressions]` config.

## Language Support Matrix

```yaml
support:
  native: [all]
  note: "Secrets can appear in any text file. This skill scans all committed files regardless of language."
```

## Toolchain Inputs

| File | Required | Notes |
|---|---|---|
| `.healthcheck/toolchain/gitleaks.json` | **Yes** (fail if missing) | Primary signal — most comprehensive secret detection |
| `.healthcheck/toolchain/trufflehog.json` | No (secondary signal) | Complements gitleaks with entropy-based detection |
| `.healthcheck/toolchain/trivy.json` | No (secondary signal) | Catches secrets in container images and IaC |
| `.healthcheck/toolchain/language-census.json` | Yes | Determines repo scope |

**If `gitleaks.json` is missing, the skill MUST fail with an actionable error:**

```
ERROR: gitleaks.json not found at .healthcheck/toolchain/gitleaks.json
gitleaks is a required tool for the secrets dimension.
Run the toolchain first: /tenet-skills:tenet-toolchain
If gitleaks is not installed: brew install gitleaks (macOS) or see https://github.com/gitleaks/gitleaks#installing
```

Do NOT proceed with heuristic-only scanning when gitleaks is missing. The false-positive rate without gitleaks is too high to produce reliable scores.

## Procedure

### Step 1: Validate Required Toolchain

```bash
GITLEAKS=".healthcheck/toolchain/gitleaks.json"
if [ ! -f "$GITLEAKS" ]; then
  echo "ERROR: gitleaks.json is required for the secrets dimension but was not found."
  echo "Ensure tenet-toolchain ran successfully with gitleaks installed."
  exit 1
fi

GITLEAKS_FINDINGS=$(jq '.findings // []' "$GITLEAKS")
GITLEAKS_COUNT=$(echo "$GITLEAKS_FINDINGS" | jq 'length')
echo "Loaded $GITLEAKS_COUNT findings from gitleaks"
```

### Step 2: Load Secondary Toolchain Signals

```bash
# TruffleHog (optional)
TRUFFLEHOG=".healthcheck/toolchain/trufflehog.json"
if [ -f "$TRUFFLEHOG" ]; then
  TRUFFLEHOG_FINDINGS=$(jq '.findings // []' "$TRUFFLEHOG")
  echo "Loaded $(echo "$TRUFFLEHOG_FINDINGS" | jq 'length') findings from trufflehog"
else
  TRUFFLEHOG_FINDINGS="[]"
  echo "INFO: trufflehog.json not found — skipping as secondary signal"
fi

# Trivy (optional — secrets subset)
TRIVY=".healthcheck/toolchain/trivy.json"
if [ -f "$TRIVY" ]; then
  TRIVY_SECRETS=$(jq '[.findings[] | select(.category == "secrets")] // []' "$TRIVY" 2>/dev/null || echo "[]")
  echo "Loaded $(echo "$TRIVY_SECRETS" | jq 'length') secret findings from trivy"
else
  TRIVY_SECRETS="[]"
  echo "INFO: trivy.json not found — skipping as secondary signal"
fi

# Language census
CENSUS=".healthcheck/toolchain/language-census.json"
if [ ! -f "$CENSUS" ]; then
  echo "ERROR: language-census.json is missing — cannot determine repo scope"
  exit 1
fi
```

### Step 3: Ingest Gitleaks Findings

For each gitleaks finding:
1. Map the gitleaks `RuleID` to a Tenet finding type (see Rubric below)
2. Determine severity:
   - **All confirmed secrets** → `critical` (this is the cardinal rule)
   - **Possible false positives** (e.g., example values, placeholder strings) → review context, demote to `major` only if clearly not a real secret
3. Deduplicate: if the same file+line appears in both gitleaks and trufflehog, prefer gitleaks and enrich with trufflehog metadata
4. Set `confidence: "deterministic"`
5. Generate a `fix_prompt` for each finding

### Step 4: Ingest TruffleHog Findings

For each trufflehog finding NOT already covered by gitleaks:
1. Map to a Tenet finding type
2. Set severity to `critical` for confirmed secrets
3. Set `confidence: "deterministic"`
4. Generate a `fix_prompt`

### Step 5: Ingest Trivy Secret Findings

For each trivy secret finding NOT already covered by gitleaks or trufflehog:
1. Map to a Tenet finding type
2. Set severity to `critical` for confirmed secrets
3. Set `confidence: "deterministic"`
4. Generate a `fix_prompt`

### Step 6: Regex Scan for Common Secret Formats

Even with gitleaks, some patterns benefit from explicit scanning. Search all committed files (`git ls-files`) for:

#### AWS Keys

```bash
# AWS Access Key ID (starts with AKIA)
git grep -nE "AKIA[0-9A-Z]{16}"# AWS Secret Access Key (40-char base64)
git grep -nE "(aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*['\"]?[A-Za-z0-9/+=]{40}"```

#### GitHub Tokens

```bash
# GitHub personal access tokens (classic and fine-grained)
git grep -nE "(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}|gho_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36})"```

#### Generic API Keys and Tokens

```bash
# API keys in assignment or config
git grep -nE "(api[_-]?key|api[_-]?secret|api[_-]?token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{20,}"# Bearer tokens hardcoded
git grep -nE "Bearer\s+[A-Za-z0-9_\-\.]{20,}"```

#### Database Connection Strings with Passwords

```bash
# PostgreSQL / MySQL / MongoDB connection strings
git grep -nE "(postgres|mysql|mongodb)://[^:]+:[^@]+@"# Redis with password
git grep -nE "redis://:[^@]+@"```

#### Private Keys

```bash
# PEM-encoded private keys
git grep -lE "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"```

#### JWT Secrets

```bash
# JWT secret in config
git grep -nE "(jwt[_-]?secret|JWT_SECRET|jwt[_-]?key)\s*[:=]\s*['\"][^'\"]{8,}"```

#### Slack/Stripe/SendGrid/Twilio Tokens

```bash
# Slack
git grep -nE "xox[baprs]-[A-Za-z0-9\-]{10,}"# Stripe
git grep -nE "(sk_live|rk_live)_[A-Za-z0-9]{20,}"# SendGrid
git grep -nE "SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}"# Twilio
git grep -nE "SK[0-9a-fA-F]{32}"```

For each regex match:
1. Check if it was already found by gitleaks/trufflehog — skip if so
2. Verify it is NOT in a test fixture, example, documentation, or placeholder (`CHANGEME`, `xxx`, `your-key-here`, `<api-key>`, `TODO`)
3. Check the file extension — some matches in `.md` or comment blocks may be examples
4. **Check the publishable-key allowlist (below)** — publishable/public keys are safe by
   design and must NOT be flagged as critical
5. Set `confidence: "heuristic"` for grep-only findings
6. Severity is `critical` for anything that looks like a real PRIVATE secret

#### Publishable / public-by-design keys — do NOT flag as critical

Some keys are meant to ship in client-side code. Flagging them critical every run is a false
positive that trains the reader to ignore the report. These are safe (skip, or `info` at most):

- **Firebase web config** — `apiKey`, `authDomain`, `projectId`, etc. (security is in Firebase
  rules, not the key)
- **Stripe publishable key** — `pk_live_…` / `pk_test_…` (flag the SECRET `sk_live_…`)
- **Supabase `anon` public key** (flag the `service_role` key)
- **Mapbox `pk.…`, Google Maps browser key, Sentry public DSN, PostHog/Segment/Amplitude
  public write keys**

Still flag the private counterparts as critical: `sk_live_…`, Supabase `service_role`,
Firebase Admin SDK service-account JSON / private key, any `*_SECRET`, any `*_PRIVATE_KEY`.
When unsure whether a public-looking key is truly publishable, emit `minor` with a note to
confirm — never `critical`. See `shared/security-calibration.md`.

### Step 7: Check .gitignore for .env

```bash
# Check if .env is gitignored
if ! grep -qE "^\.env$|^\.env\." .gitignore 2>/dev/null; then
  echo "WARN: .env not in .gitignore"
fi

# Check if .env files are actually committed
git ls-files | grep -E "^\.env$|^\.env\.|\.env\.local|\.env\.production|\.env\.staging"
```

If `.env` files are committed to git:
- `.env` with real secrets → `critical`
- `.env.example` or `.env.template` with placeholder values → `info`
- `.env.test` or `.env.development` with non-secret values → `minor`
- `.env.production` or `.env.staging` with any values → `critical`
- `.env` not in `.gitignore` (even if no .env file committed yet) → `major`

### Step 8: Scan Git History (Conditional)

Only scan git history if the repo is small enough to complete in reasonable time:

```bash
# Count total commits
COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "0")

if [ "$COMMIT_COUNT" -lt 500 ]; then
  # Scan for secrets that were committed and then removed
  # Use gitleaks in git-log mode if available
  if command -v gitleaks &>/dev/null; then
    gitleaks detect --source=. --log-opts="--all" --report-format=json --report-path=- 2>/dev/null
  fi
fi
```

For secrets found only in git history (not in current HEAD):
- Severity: `critical` (secrets in history are still exploitable until rotated)
- The `fix_prompt` must include rotation instructions AND history cleanup guidance

### Step 9: Detect Weak Secret Generation

```bash
# Math.random used for tokens/secrets/IDs
git grep -nE "Math\.random\(\)" -- '*.ts' '*.js' '*.tsx' '*.jsx'
# Python random for tokens
git grep -nE "random\.(choice|randint|random|sample)\(" -- '*.py'
# Go math/rand for tokens
git grep -nE "math/rand" -- '*.go'
```

For each match:
1. Check if the random value is used for security purposes (token generation, session IDs, password reset codes, API keys, nonces)
2. Skip if used for UI, testing, shuffling, or non-security purposes
3. Severity: `major` for security-context usage, skip for non-security usage
4. Set `confidence: "heuristic"`

### Step 10: Verify & Apply Suppressions

Per `shared/verification.md`, confirm each candidate secret before it enters the report: open
the file, confirm it is a real private secret (not a placeholder/fixture/example/publishable
key), and **mask the value** (first 4 chars + `****`). Then per `shared/suppressions.md`, demote
any finding matched by a `tenet-ignore` comment or `[suppressions]` config to `info` with the
stated reason, and track `metrics.suppressed_count`. Never suppress silently.

### Step 11: Score Calculation

Apply the standard scoring formula from `shared/severity.md`:

```
score = 100 - (5 * critical_count + 2 * major_count + 0.5 * minor_count)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding, not banker's rounding
```

Info findings do NOT affect the score.

**Note:** Because every confirmed hardcoded secret is `critical`, even a single real secret drops the score by 5 points. Three confirmed secrets puts the score at 85 or lower. This is intentional — secrets in VCS are among the highest-risk findings.

### Step 12: Write Report

Write the dimension report to `.healthcheck/reports/secrets.json`:

```json
{
  "key": "secrets",
  "score": 85,
  "weight": 1.5,
  "skill_version": "1.1.0",
  "applicable": true,
  "notes": "Found 3 critical hardcoded secrets (2 AWS keys, 1 database password), 1 major .gitignore gap, and 1 minor .env.development commit. Gitleaks detected 2 of 3 secrets; regex scan found 1 additional.",
  "metrics": {
    "files_scanned": 124,
    "toolchain_signals": ["gitleaks", "trufflehog"],
    "confidence_breakdown": {
      "deterministic": 2,
      "heuristic": 3
    },
    "category_breakdown": {
      "aws_keys": 2,
      "db_passwords": 1,
      "env_files": 1,
      "weak_random": 1
    },
    "git_history_scanned": true,
    "history_only_secrets": 0
  },
  "findings": [ ... ]
}
```

## Finding Severity Guide

| Category | Pattern | Severity |
|---|---|---|
| Hardcoded AWS key (AKIA...) | Any committed file | critical |
| Hardcoded AWS secret | Any committed file | critical |
| GitHub personal access token | Any committed file | critical |
| Stripe live secret key | Any committed file | critical |
| Generic API key (production-looking) | Any committed file | critical |
| Database connection string with password | Any committed file | critical |
| Private key (PEM) | Any committed file | critical |
| JWT secret in code/config | Any committed file | critical |
| Slack bot/user token | Any committed file | critical |
| SendGrid API key | Any committed file | critical |
| Twilio auth token | Any committed file | critical |
| Bearer token hardcoded | Any committed file | critical |
| Secret in git history (removed from HEAD) | Git log | critical |
| `.env.production` or `.env.staging` committed | Git tracked files | critical |
| `.env` committed with real secrets | Git tracked files | critical |
| Default credential in config | `password: admin` | critical |
| `.env` not in `.gitignore` | .gitignore check | major |
| `Math.random()` for security tokens | Token/session/nonce generation | major |
| `random.random()` for security purposes | Python token generation | major |
| `math/rand` for security purposes | Go token generation | major |
| `.env.development` committed | Git tracked files | minor |
| `.env.test` committed with non-secrets | Git tracked files | minor |
| `.env.example` with placeholder values | Git tracked files | info |

## Confidence Tiers per Detection Method

| Method | Confidence |
|---|---|
| Gitleaks match | `deterministic` |
| TruffleHog match | `deterministic` |
| Trivy match | `deterministic` |
| Regex pattern match | `heuristic` |
| Git history scan | `deterministic` (gitleaks) or `heuristic` (grep) |

## Output

- `.healthcheck/reports/secrets.json` — dimension report with all findings

## Constraints

- **Gitleaks is REQUIRED.** Do not produce a report without gitleaks output. Fail with an actionable error message.
- **Cardinal rule:** Any hardcoded production-looking PRIVATE secret is ALWAYS `critical`. No exceptions, no demotions.
- **Publishable keys are not secrets.** Firebase web config, Stripe `pk_`, Supabase `anon`, Mapbox `pk.`, public DSNs, and browser map keys are safe by design — never flag them critical (see `shared/security-calibration.md`). Flag their private counterparts.
- ALWAYS honor `tenet-ignore` comments and `[suppressions]` config (Step 10).
- NEVER include the actual secret value in the finding `description`, `title`, or `fix_prompt`. Redact to first 4 characters + `****` (e.g., `AKIA****`, `ghp_X****`). The `snippet` field may show surrounding code but MUST mask the secret value.
- NEVER flag known test/example values: `AKIAIOSFODNN7EXAMPLE` (AWS docs example), `your-api-key-here`, `CHANGEME`, `xxx`, `TODO`, `<token>`.
- ALWAYS check if a secret-looking string is in a test fixture or documentation before flagging.
- ALWAYS verify .env files are actually committed (present in `git ls-files`) before flagging — unstaged .env files are not findings.
- Scoring math is pure arithmetic — no LLM judgment in the formula.
- Every finding MUST include a `fix_prompt` following the template in `shared/fix_prompt_template.md`.
- Grep-based findings MUST have `confidence: "heuristic"`.
- If gitleaks and regex both detect the same secret, keep the gitleaks finding (higher confidence) and drop the duplicate.
- Git history scanning is best-effort — skip if repo has > 500 commits to avoid timeout.
- The `fix_prompt` for every secret finding MUST include rotation instructions, not just removal.

## fix_prompt Examples

### Example 1: Hardcoded AWS Key

```
# Fix: Hardcoded AWS access key in configuration module

## Context
An AWS access key ID and secret access key are hardcoded in the S3 client configuration. These credentials are committed to version control and must be rotated immediately.

## Location
- File: src/services/s3.ts
- Line: 8
- Dimension: secrets / critical

## Current behavior
```typescript
const s3 = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'AKIA****REDACTED',
    secretAccessKey: 'wJal****REDACTED',
  },
});
```

## Required change
1. **Rotate the compromised credentials immediately** — the existing key must be deactivated in the AWS IAM console since it has been committed to git history
2. Remove the hardcoded credentials from the source file
3. Use environment variables or AWS SDK default credential chain:

Replace the credentials block with:
```typescript
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  // Credentials resolved via AWS SDK default chain:
  // env vars (AWS_ACCESS_KEY_ID), ~/.aws/credentials, IAM role, etc.
});
```

4. Add the environment variables to `.env.example` with placeholder values
5. Ensure `.env` is in `.gitignore`

## Constraints
- Do not change any S3 operation logic — only the client initialization
- The AWS SDK default credential chain will resolve credentials automatically in most deployment environments (EC2, ECS, Lambda)
- If the application requires explicit credentials in development, use `.env` with `dotenv`

## Verification
- Run: `grep -rn "AKIA" src/` — should return zero results
- Run: `grep -rn "aws_secret_access_key\|secretAccessKey" src/` — should return zero hardcoded values
- Confirm the old AWS key has been deactivated in IAM console
- Run: `npm test` to verify S3 operations still work with env-based credentials
```

### Example 2: Committed .env File

```
# Fix: .env file with database credentials committed to git

## Context
A `.env` file containing database credentials and API keys is tracked by git. Even if the file is later removed, the secrets persist in git history and must be rotated.

## Location
- File: .env
- Line: 1
- Dimension: secrets / critical

## Current behavior
The file `.env` is tracked by git (`git ls-files` includes it) and contains:
```
DATABASE_URL=postgres://admin:****REDACTED@prod-db.example.com:5432/myapp
API_SECRET=****REDACTED
```

## Required change
1. **Rotate all secrets in the .env file immediately** — database password, API secret, and any other credentials
2. Remove `.env` from git tracking (without deleting the local file):
   ```bash
   git rm --cached .env
   ```
3. Add `.env` to `.gitignore`:
   ```
   # Environment files
   .env
   .env.local
   .env.production
   .env.staging
   ```
4. Create `.env.example` with placeholder values (this IS safe to commit):
   ```
   DATABASE_URL=postgres://user:password@localhost:5432/myapp
   API_SECRET=your-api-secret-here
   ```
5. Commit the .gitignore update and .env removal

## Constraints
- Do NOT delete the local `.env` file — only remove it from git tracking
- Do NOT use `git filter-branch` or `BFG` to rewrite history unless the team is prepared for a force-push (mention this as an optional step)
- Ensure all team members and CI/CD pipelines have the new credentials before the old ones are rotated

## Verification
- Run: `git ls-files | grep "^\.env$"` — should return nothing
- Run: `grep -q "^\.env$" .gitignore` — should succeed
- Confirm `.env.example` exists with placeholder values
- Confirm the old database password has been changed
- Run: `npm test` (or equivalent) to confirm app works with new credentials
```

### Example 3: Math.random for Token Generation

```
# Fix: Math.random() used for password reset token generation

## Context
Password reset tokens are generated using `Math.random()`, which is not a cryptographically secure PRNG. An attacker who knows the approximate time of token generation can predict the token value and take over accounts.

## Location
- File: src/auth/reset-password.ts
- Line: 14
- Dimension: secrets / major

## Current behavior
```typescript
function generateResetToken(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}
```

## Required change
Replace `Math.random()` with `crypto.randomBytes()` from Node.js built-in crypto module:

```typescript
import { randomBytes } from 'crypto';

function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}
```

This produces a 64-character hex string (256 bits of entropy) using a cryptographically secure random number generator.

## Constraints
- Do not change the function signature or how the token is stored/consumed
- If existing tokens in the database have a max-length column, ensure 64 hex chars fit (most token columns are varchar(255))
- Do not invalidate existing outstanding reset tokens — they will expire naturally

## Verification
- Run: `npm test -- --grep "reset"`
- Run: `grep -rn "Math.random" src/auth/` — should return zero results
- Verify token format: `node -e "const { randomBytes } = require('crypto'); console.log(randomBytes(32).toString('hex'))"` should print a 64-char hex string
```
