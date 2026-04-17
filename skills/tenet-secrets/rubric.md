# Tenet Secrets — Rubric

Every finding type the `tenet-secrets` skill can produce, organized by category.

## Scoring Formula

```
score = 100 - (5 * critical + 2 * major + 0.5 * minor)
Floor 0, ceil 100, round to integer. Info findings do not affect score.
```

**Cardinal Rule:** Any hardcoded production-looking secret is ALWAYS critical severity. No exceptions.

---

## Cloud Provider Credentials

### SEC-AWS-001: Hardcoded AWS Access Key ID

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** An AWS access key ID (prefix `AKIA`) is hardcoded in source code. This grants programmatic access to AWS services and must be rotated immediately.
- **Detection:** Gitleaks rule `aws-access-key-id`, or regex `AKIA[0-9A-Z]{16}`.
- **Example fix_prompt:**
  ```
  # Fix: Hardcoded AWS access key in S3 client

  ## Context
  An AWS access key ID is hardcoded in the S3 client initialization.

  ## Location
  - File: src/services/s3.ts
  - Line: 8
  - Dimension: secrets / critical

  ## Current behavior
  `accessKeyId: 'AKIA****REDACTED'`

  ## Required change
  1. Rotate the AWS key in IAM console immediately
  2. Remove hardcoded key; use AWS SDK default credential chain
  3. Set credentials via environment variables or IAM role

  ## Constraints
  - Do not change S3 operation logic

  ## Verification
  - Run: `grep -rn "AKIA" src/` — zero results
  - Confirm old key deactivated in IAM
  ```

### SEC-AWS-002: Hardcoded AWS Secret Access Key

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** An AWS secret access key is hardcoded in source code. Combined with the access key ID, this provides full programmatic access.
- **Detection:** Gitleaks rule `aws-secret-access-key`, or regex pattern for 40-char base64 string in AWS context.

### SEC-GCP-001: Hardcoded GCP Service Account Key

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A Google Cloud service account key (JSON) is committed to the repository.
- **Detection:** Gitleaks rule `gcp-service-account`, or JSON file with `"type": "service_account"`.

### SEC-AZURE-001: Hardcoded Azure Storage Key

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** An Azure storage account key or connection string with embedded credentials is committed.
- **Detection:** Gitleaks rule for Azure patterns, or regex for `AccountKey=` in connection strings.

---

## Platform Tokens

### SEC-GH-001: Hardcoded GitHub Token

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A GitHub personal access token, app token, or OAuth token is committed. These grant access to repositories, organizations, and GitHub APIs.
- **Detection:** Gitleaks rule `github-pat`, or regex `ghp_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{82}`, `gho_`, `ghs_`, `ghr_` prefixes.
- **Example fix_prompt:**
  ```
  # Fix: GitHub PAT hardcoded in CI helper script

  ## Context
  A GitHub personal access token is hardcoded in a script used for CI operations.

  ## Location
  - File: scripts/deploy.sh
  - Line: 12
  - Dimension: secrets / critical

  ## Current behavior
  `GITHUB_TOKEN="ghp_****REDACTED"`

  ## Required change
  1. Revoke the token at https://github.com/settings/tokens immediately
  2. Replace hardcoded value with environment variable: `GITHUB_TOKEN="${GITHUB_TOKEN:?GITHUB_TOKEN not set}"`
  3. Set the token in CI secrets (e.g., GitHub Actions secrets)

  ## Constraints
  - Do not change script logic, only credential sourcing

  ## Verification
  - Run: `grep -rn "ghp_\|github_pat_" .` — zero results
  - Confirm the old token is revoked on GitHub
  ```

### SEC-SLACK-001: Hardcoded Slack Token

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A Slack bot, user, or app token (prefix `xoxb-`, `xoxp-`, `xoxa-`, `xoxr-`, `xoxs-`) is committed.
- **Detection:** Gitleaks rule `slack-*-token`, or regex `xox[baprs]-[A-Za-z0-9\-]{10,}`.

### SEC-STRIPE-001: Hardcoded Stripe Live Key

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A Stripe live secret key (`sk_live_`) or restricted key (`rk_live_`) is committed, granting access to live payment processing.
- **Detection:** Gitleaks rule `stripe-api-key`, or regex `(sk_live|rk_live)_[A-Za-z0-9]{20,}`.

### SEC-SG-001: Hardcoded SendGrid API Key

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A SendGrid API key is committed, allowing unauthorized email sending.
- **Detection:** Gitleaks rule `sendgrid-api-key`, or regex `SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}`.

### SEC-TWILIO-001: Hardcoded Twilio Auth Token

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A Twilio auth token or API key SID is committed, allowing unauthorized SMS/voice API usage.
- **Detection:** Gitleaks rule `twilio-api-key`, or regex `SK[0-9a-fA-F]{32}`.

---

## Generic Secrets

### SEC-APIKEY-001: Hardcoded API Key

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A generic API key or secret token is hardcoded in source code. The key value does not match known placeholder patterns and appears to be a real credential.
- **Detection:** Gitleaks generic rules, or regex for `api_key`, `api_secret`, `api_token` assignments with 20+ character values.

### SEC-BEARER-001: Hardcoded Bearer Token

- **Severity:** critical
- **Confidence:** heuristic
- **Description:** A Bearer authentication token is hardcoded in source code, likely granting access to a protected API.
- **Detection:** Regex `Bearer\s+[A-Za-z0-9_\-\.]{20,}` in non-test files.

### SEC-JWT-001: Hardcoded JWT Secret

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A JWT signing secret is hardcoded in source code. Anyone with access to the repository can forge valid JWTs.
- **Detection:** Gitleaks rule `jwt-*`, or regex for `jwt_secret`, `JWT_SECRET`, `jwt_key` assignments.

---

## Database Credentials

### SEC-DB-001: Database Connection String with Password

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A database connection string containing an embedded password is committed. This grants direct database access to anyone with repo access.
- **Detection:** Gitleaks rule `*-connection-string`, or regex for `postgres://`, `mysql://`, `mongodb://` with `user:password@` format.
- **Example fix_prompt:**
  ```
  # Fix: Database password in connection string

  ## Context
  A PostgreSQL connection string with embedded password is hardcoded in the database configuration.

  ## Location
  - File: src/config/database.ts
  - Line: 5
  - Dimension: secrets / critical

  ## Current behavior
  `const DATABASE_URL = "postgres://admin:****REDACTED@db.example.com:5432/myapp";`

  ## Required change
  1. Rotate the database password immediately
  2. Replace with environment variable: `const DATABASE_URL = process.env.DATABASE_URL;`
  3. Add validation: throw if DATABASE_URL is not set at startup
  4. Add `DATABASE_URL=postgres://user:password@localhost:5432/myapp` to `.env.example`

  ## Constraints
  - Do not change ORM/query configuration
  - Ensure the app fails fast at startup if DATABASE_URL is missing

  ## Verification
  - Run: `grep -rn "postgres://.*:.*@" src/` — zero results with real credentials
  - Run: `npm test`
  ```

### SEC-DB-002: Redis Connection with Password

- **Severity:** critical
- **Confidence:** deterministic or heuristic
- **Description:** A Redis connection URL with embedded password is committed.
- **Detection:** Regex `redis://:[^@]+@`.

---

## Private Keys

### SEC-KEY-001: Private Key File Committed

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic (grep)
- **Description:** A PEM-encoded private key (RSA, EC, DSA, or OpenSSH) is committed to version control. This key must be considered compromised and replaced.
- **Detection:** Gitleaks rule `private-key`, or regex `-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----`.

### SEC-KEY-002: PKCS12/PFX File Committed

- **Severity:** critical
- **Confidence:** heuristic
- **Description:** A PKCS12/PFX certificate bundle (which may contain private keys) is committed.
- **Detection:** File extension `.p12`, `.pfx` in `git ls-files`.

---

## Environment Files

### SEC-ENV-001: .env File Committed with Secrets

- **Severity:** critical
- **Confidence:** heuristic
- **Description:** A `.env` file containing real secrets is tracked by git. Secrets persist in git history even after the file is removed.
- **Detection:** `git ls-files` includes `.env`, `.env.local`, `.env.production`, `.env.staging`.

### SEC-ENV-002: .env Not in .gitignore

- **Severity:** major
- **Confidence:** heuristic
- **Description:** The `.gitignore` file does not include `.env`, creating a risk that secrets will be accidentally committed in the future.
- **Detection:** `.gitignore` exists but does not contain a line matching `.env`.
- **Example fix_prompt:**
  ```
  # Fix: .env not in .gitignore

  ## Context
  The .gitignore file does not exclude .env files, risking accidental commit of secrets.

  ## Location
  - File: .gitignore
  - Line: N/A
  - Dimension: secrets / major

  ## Current behavior
  `.gitignore` has no entry for `.env` files.

  ## Required change
  Add the following lines to `.gitignore`:
  ```
  # Environment files with secrets
  .env
  .env.local
  .env.*.local
  .env.production
  .env.staging
  ```

  ## Constraints
  - Do NOT gitignore `.env.example` or `.env.template` — those are safe to commit

  ## Verification
  - Run: `grep "\.env" .gitignore` — should show the new entries
  - Run: `git ls-files | grep "^\.env"` — should only show .env.example if anything
  ```

### SEC-ENV-003: .env.development Committed

- **Severity:** minor
- **Confidence:** heuristic
- **Description:** A `.env.development` or `.env.test` file is committed. While these typically contain non-production values, they may leak internal URLs, service names, or development credentials.
- **Detection:** `git ls-files` includes `.env.development`, `.env.test`.

### SEC-ENV-004: .env.example with Placeholder Values

- **Severity:** info
- **Confidence:** heuristic
- **Description:** A `.env.example` file is committed with placeholder values. This is the expected pattern — noted for completeness.
- **Detection:** `git ls-files` includes `.env.example`, `.env.template`, `.env.sample`.

---

## Git History

### SEC-HIST-001: Secret Found in Git History

- **Severity:** critical
- **Confidence:** deterministic (gitleaks) or heuristic
- **Description:** A secret was previously committed and later removed, but still exists in git history. The secret must be rotated — `git filter-branch` or BFG alone is not sufficient.
- **Detection:** Gitleaks `--log-opts="--all"` mode finds secrets not present in HEAD.

---

## Weak Secret Generation

### SEC-RAND-001: Math.random() for Security Tokens (JavaScript/TypeScript)

- **Severity:** major
- **Confidence:** heuristic
- **Description:** `Math.random()` is used to generate security-sensitive values (tokens, session IDs, nonces, password reset codes). `Math.random()` is not cryptographically secure and its output can be predicted.
- **Detection:** `Math.random()` in files that also reference tokens, sessions, secrets, or reset codes.
- **Example fix_prompt:**
  ```
  # Fix: Math.random() used for session token

  ## Context
  Session tokens are generated using Math.random(), which is predictable.

  ## Location
  - File: src/auth/session.ts
  - Line: 23
  - Dimension: secrets / major

  ## Current behavior
  `const token = Math.random().toString(36).substring(2);`

  ## Required change
  Use crypto.randomBytes: `const token = randomBytes(32).toString('hex');`
  Add import: `import { randomBytes } from 'crypto';`

  ## Constraints
  - Ensure token column can hold 64-char hex string

  ## Verification
  - Run: `grep -rn "Math.random" src/auth/` — zero results
  - Run: `npm test`
  ```

### SEC-RAND-002: random.random() for Security Tokens (Python)

- **Severity:** major
- **Confidence:** heuristic
- **Description:** Python's `random` module (which is not cryptographically secure) is used for security-sensitive value generation. Use `secrets` module instead.
- **Detection:** `random.choice`, `random.randint`, `random.random` in security context.

### SEC-RAND-003: math/rand for Security Tokens (Go)

- **Severity:** major
- **Confidence:** heuristic
- **Description:** Go's `math/rand` package is used for security-sensitive value generation. Use `crypto/rand` instead.
- **Detection:** `math/rand` import in files that generate tokens, keys, or nonces.

---

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/secrets.json` | Valid JSON, matches schema, all findings have `fix_prompt` |
| Each finding | Has `dimension`, `severity`, `title`, `description`, `fix_prompt`, `file`, `line` |
| Score | Computed correctly from severity counts using the standard formula |
| Confidence field | Present on every finding, matches detection method |
| Secret values | NEVER appear unredacted in any finding field |
| Gitleaks dependency | Skill fails with actionable error if gitleaks.json is missing |
