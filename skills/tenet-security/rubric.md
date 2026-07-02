# Tenet Security — Rubric

Every finding type the `tenet-security` skill can produce, organized by category.

## Scoring Formula

```
score = 100 - (5 * critical + 2 * major + 0.5 * minor)
Floor 0, ceil 100, round to integer. Info findings do not affect score.
```

---

## Injection Risks

### SEC-INJ-001: SQL Injection via String Concatenation

- **Severity:** critical
- **Confidence:** deterministic (semgrep) or heuristic (grep)
- **Description:** User input is interpolated directly into a SQL query string, allowing an attacker to manipulate query logic, exfiltrate data, or destroy tables.
- **Detection:** Semgrep rule `*sql-injection*`, or grep for template literals / string concat in `query()`, `execute()`, `raw()`, `db.query()`.
- **Example fix_prompt:**
  ```
  # Fix: SQL injection in user lookup

  ## Context
  The function builds a SQL query with string concatenation from user input.

  ## Location
  - File: src/db/users.ts
  - Line: 34
  - Dimension: security / critical

  ## Current behavior
  `db.query(\`SELECT * FROM users WHERE email = '${email}'\`)`

  ## Required change
  Use parameterized query: `db.query('SELECT * FROM users WHERE email = $1', [email])`

  ## Constraints
  - Do not change the function signature or return type

  ## Verification
  - Run: `npm test`
  - Run: `grep -rn "\\$\{.*\}" src/db/` to confirm no remaining interpolated queries
  ```

### SEC-INJ-002: Command Injection via exec/eval

- **Severity:** critical
- **Confidence:** deterministic (semgrep) or heuristic (grep)
- **Description:** User input reaches a shell execution or eval call, allowing arbitrary command/code execution on the server.
- **Detection:** Semgrep rule `*command-injection*`, or grep for `eval()`, `exec()`, `execSync()`, `child_process`, `subprocess.call(shell=True)`, `os.system()`.
- **Example fix_prompt:**
  ```
  # Fix: Command injection via child_process.exec

  ## Context
  User-supplied filename is passed directly to a shell command.

  ## Location
  - File: src/utils/files.ts
  - Line: 22
  - Dimension: security / critical

  ## Current behavior
  `exec(\`convert ${filename} output.png\`)`

  ## Required change
  Use `execFile` with argument array: `execFile('convert', [filename, 'output.png'])`

  ## Constraints
  - Validate filename against an allowlist pattern before passing to execFile

  ## Verification
  - Run: `npm test`
  - Run: `grep -rn "exec(" src/` and verify no string-interpolated shell calls remain
  ```

### SEC-INJ-003: XSS via Unsafe HTML Rendering

- **Severity:** critical
- **Confidence:** deterministic (semgrep) or heuristic (grep)
- **Description:** User-controlled content is rendered as raw HTML without sanitization, enabling cross-site scripting attacks.
- **Detection:** `dangerouslySetInnerHTML`, `v-html`, `innerHTML =`, Django `|safe`, Jinja2 `|raw` without prior sanitization.
- **Do NOT flag:** DOMPurify/sanitizer-wrapped HTML, auto-escaped JSX text, static literals (see `shared/security-calibration.md`).

### SEC-INJ-004: NoSQL / Object Injection

- **Severity:** major
- **Confidence:** heuristic
- **Description:** A request object (`req.body`/`req.query`) is passed directly into a document-store query filter, allowing operator injection (e.g. `{ "$gt": "" }`) to bypass authentication or match unintended documents.
- **Detection:** `.find/findOne/update/delete(req.body|req.query...)`, `$where`, user-controlled `$regex`.

---

## Broken Access Control

The highest-frequency real-world API vulnerability class. These are **not** grep-shaped —
they require the entry-point inventory (`shared/entry-points.md`) and reading each handler.

### SEC-AUTHZ-IDOR: Missing Ownership Check (IDOR / BOLA)

- **Severity:** critical
- **Confidence:** native (must read the handler and its query)
- **Description:** An authenticated route reads or mutates a record *by id* but the query is not scoped to the caller's user id. Any logged-in user can access another user's object by supplying its id. Parameterization does NOT fix this — the query is injection-safe but still missing the ownership predicate.
- **Detection:** For each by-id route in the inventory, confirm the query includes an ownership predicate (`AND user_id = $caller`, `where: { id, userId }`). Absence is the finding.
- **Do NOT flag:** queries already scoped to the caller, or admin routes with an explicit role gate that legitimately span users.

### SEC-AUTHZ-TENANT: Multi-Tenant Isolation Gap

- **Severity:** critical
- **Confidence:** native
- **Description:** In a multi-tenant application, a query on a tenant-scoped table omits the tenant predicate, leaking or letting one tenant mutate another tenant's data.
- **Detection:** Detect tenancy first (a `tenant_id`/`org_id`/`league_id`/`account_id` column on domain tables). Then flag any query on a tenanted table lacking that scope. Global/reference tables are exempt.

### SEC-AUTHZ-BFLA: Missing Function-Level Authorization

- **Severity:** critical
- **Confidence:** native or heuristic
- **Description:** A privileged or administrative action is reachable by any authenticated user because it has no role/permission check.
- **Detection:** Admin/management routes in the inventory with no role-checking middleware or guard.

### SEC-AUTHZ-MASS: Mass Assignment

- **Severity:** major (critical if a privilege field is assignable)
- **Confidence:** heuristic or native
- **Description:** A create/update spreads the entire request body into a model, letting a client set fields it should not control (`role`, `isAdmin`, `ownerId`, `verified`).
- **Detection:** `.create/update/save({ ...req.body })`, `Model(**request.json)`. Check whether the model exposes a privilege field.
- **Example fix_prompt:**
  ```
  # Fix: XSS via dangerouslySetInnerHTML

  ## Context
  User-generated content is rendered unsanitized via dangerouslySetInnerHTML.

  ## Location
  - File: src/components/Comment.tsx
  - Line: 15
  - Dimension: security / critical

  ## Current behavior
  `<div dangerouslySetInnerHTML={{ __html: comment.body }} />`

  ## Required change
  1. Install DOMPurify: `npm install dompurify @types/dompurify`
  2. Sanitize before rendering: `<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.body) }} />`

  ## Constraints
  - Preserve any intentional HTML formatting (bold, links) — DOMPurify allows safe tags by default

  ## Verification
  - Run: `npm test`
  - Confirm `DOMPurify.sanitize` wraps every `dangerouslySetInnerHTML` usage
  ```

---

## Authentication & Authorization

### SEC-AUTH-001: Missing Authentication on Route

- **Severity:** major (standard route), critical (admin route)
- **Confidence:** native or heuristic
- **Description:** A route handler processes requests without any authentication middleware, allowing unauthenticated access.
- **Detection:** Route definition analysis — check for auth middleware at app, router, or per-route level.

### SEC-AUTH-002: Missing Authorization / Role Check

- **Severity:** critical
- **Confidence:** native or heuristic
- **Description:** An authenticated route lacks role-based access control, allowing any logged-in user to access admin or privileged functionality.
- **Detection:** Admin/management routes without role-checking middleware.

### SEC-AUTH-003: JWT Algorithm None Accepted

- **Severity:** critical
- **Confidence:** deterministic (semgrep) or heuristic (grep)
- **Description:** JWT verification accepts the `none` algorithm, allowing token forgery without a secret key.
- **Detection:** `algorithms: ['none']` or `verify: false` in JWT config.

### SEC-AUTH-004: Weak Session Configuration

- **Severity:** major
- **Confidence:** heuristic
- **Description:** Session cookies are missing `secure`, `httpOnly`, or `sameSite` attributes, increasing session hijacking risk.
- **Detection:** Grep for session config objects missing these attributes.

### SEC-AUTH-005: Weak Password Hashing

- **Severity:** critical (MD5/SHA1), major (bcrypt cost < 10)
- **Confidence:** deterministic or heuristic
- **Description:** Passwords are hashed with a weak or fast algorithm, making brute-force attacks feasible.
- **Detection:** `createHash('md5')`, `hashlib.md5`, bcrypt rounds < 10.

### SEC-AUTH-006: Missing Rate Limiting on Auth Endpoints

- **Severity:** major
- **Confidence:** heuristic
- **Description:** Login, registration, or password reset endpoints lack rate limiting, enabling brute-force and credential stuffing attacks.
- **Detection:** Auth route definitions without rate limiter middleware.

### SEC-AUTH-007: Timing-Unsafe Secret Comparison

- **Severity:** major
- **Confidence:** heuristic or native
- **Description:** A token, HMAC, signature, or reset code is compared with `===`/`==`/`.equals()`, leaking length/prefix information through timing and enabling secret recovery. Security comparisons must be constant-time.
- **Detection:** `token/secret/signature/hmac/digest === ...`. Safe: `crypto.timingSafeEqual`, `hmac.compare_digest`, `MessageDigest.isEqual`.

### SEC-AUTH-008: Webhook Signature Not Verified

- **Severity:** major
- **Confidence:** native
- **Description:** A webhook receiver acts on the request payload without verifying the provider's signature (e.g. Stripe `Stripe-Signature`, GitHub `X-Hub-Signature-256`). An attacker can forge events (fake payments, fake CI results).
- **Detection:** Webhook routes in the inventory that read `req.body` without a preceding `constructEvent`/HMAC verification against the raw body.

---

## CSRF

### SEC-CSRF-001: Missing CSRF Protection on State-Changing Endpoint

- **Severity:** major
- **Confidence:** heuristic
- **Description:** A POST/PUT/DELETE/PATCH endpoint using cookie-based auth has no CSRF token validation, allowing cross-site request forgery.
- **Detection:** State-changing routes without CSRF middleware in cookie-auth applications.

### SEC-CSRF-002: Missing SameSite Cookie Attribute

- **Severity:** minor
- **Confidence:** heuristic
- **Description:** Authentication cookies lack the `sameSite` attribute, providing weaker CSRF protection on older browsers.
- **Detection:** Cookie configuration without `sameSite: 'strict'` or `sameSite: 'lax'`.

---

## CORS

### SEC-CORS-001: CORS Wildcard with Credentials

- **Severity:** critical
- **Confidence:** heuristic
- **Description:** CORS is configured with `origin: '*'` and `credentials: true`, allowing any website to make authenticated requests.
- **Detection:** `cors({ origin: '*', credentials: true })` or equivalent header combination.

### SEC-CORS-002: CORS Wildcard on Public API

- **Severity:** major
- **Confidence:** heuristic
- **Description:** CORS allows all origins on an API that may contain sensitive data, even if credentials are not explicitly enabled.
- **Detection:** `cors({ origin: '*' })` or `Access-Control-Allow-Origin: *`.

### SEC-CORS-003: CORS Origin Reflection

- **Severity:** major
- **Confidence:** heuristic
- **Description:** The CORS handler reflects the request `Origin` header without validation, effectively allowing any origin.
- **Detection:** `origin: req.headers.origin` or similar reflection without allowlist check.

---

## Deserialization

### SEC-DESER-001: Unsafe Python Pickle

- **Severity:** major
- **Confidence:** deterministic or heuristic
- **Description:** `pickle.load()` or `pickle.loads()` is used on potentially untrusted data, allowing arbitrary code execution during deserialization.
- **Detection:** `pickle.load`, `pickle.loads` calls.

### SEC-DESER-002: Unsafe YAML Load

- **Severity:** major
- **Confidence:** deterministic or heuristic
- **Description:** `yaml.load()` without `Loader=SafeLoader` allows arbitrary Python object instantiation.
- **Detection:** `yaml.load(` without `SafeLoader`, `yaml.unsafe_load`.

### SEC-DESER-003: Unsafe Java Deserialization

- **Severity:** major
- **Confidence:** deterministic or heuristic
- **Description:** `ObjectInputStream.readObject()` without type filtering allows arbitrary class instantiation.
- **Detection:** `ObjectInputStream` usage without `ObjectInputFilter`.

### SEC-DESER-004: Unsafe PHP Unserialize

- **Severity:** major
- **Confidence:** heuristic
- **Description:** `unserialize()` on user-controlled input enables object injection attacks.
- **Detection:** `unserialize()` with request data.

### SEC-DESER-005: Unsafe Ruby Marshal

- **Severity:** major
- **Confidence:** heuristic
- **Description:** `Marshal.load` on untrusted data allows arbitrary object instantiation.
- **Detection:** `Marshal.load` with external input.

### SEC-DESER-006: Prototype Pollution

- **Severity:** major
- **Confidence:** heuristic
- **Description:** An attacker-controlled object is deep-merged/assigned into a target without guarding `__proto__`/`constructor`/`prototype`, corrupting `Object.prototype` and enabling DoS, property injection, or (with a gadget) RCE.
- **Detection:** `merge/extend/defaultsDeep/set(target, req.body)` or recursive assign from `JSON.parse` of user input without key filtering.

---

## Parsing & Extraction

### SEC-PARSE-001: ReDoS (Catastrophic Regex Backtracking)

- **Severity:** minor–major (by endpoint criticality)
- **Confidence:** heuristic
- **Description:** A regular expression built from user input, or a static pattern with catastrophic backtracking (nested quantifiers) evaluated against user input, lets an attacker hang the event loop / worker with a crafted string.
- **Detection:** `new RegExp(userInput)`, `re.compile(user)`, or patterns like `(a+)+`, `(.*a){n}` applied to request data.

### SEC-PARSE-002: Zip-Slip / Tar Path Traversal

- **Severity:** major
- **Confidence:** heuristic or native
- **Description:** Archive entries are extracted to a destination using the entry's own name without validating it stays under the target directory, so a `../` entry writes outside it (overwriting configs, code, or SSH keys).
- **Detection:** Extraction loops (`zipEntry`, `tarfile.extractall`, `unzipper`) that join `entry.name`/`entry.path` to a base without a `path.resolve` prefix check.

---

## Input Validation

### SEC-VAL-001: Missing Request Body Validation

- **Severity:** major
- **Confidence:** heuristic
- **Description:** An API endpoint reads from `req.body` without any schema validation (zod, joi, yup, class-validator, etc.), accepting arbitrary input shapes.
- **Detection:** Route handlers accessing `req.body` without preceding validation middleware.

### SEC-VAL-002: Missing File Upload Validation

- **Severity:** major
- **Confidence:** heuristic
- **Description:** A file upload endpoint lacks file type or size validation, potentially allowing malicious file uploads.
- **Detection:** Multer/formidable/busboy usage without `fileFilter` or `limits`.

### SEC-VAL-003: Path Traversal via User Input

- **Severity:** critical
- **Confidence:** deterministic or heuristic
- **Description:** User input is used to construct file paths without sanitization, allowing directory traversal (`../`).
- **Detection:** `path.join(base, req.params.file)` or similar without `path.resolve` + prefix check.

---

## Open Redirects

### SEC-REDIR-001: Open Redirect via User Input

- **Severity:** major
- **Confidence:** heuristic
- **Description:** A redirect target is derived from user input without URL validation, enabling phishing via trusted-domain open redirect.
- **Detection:** `res.redirect(req.query.url)`, Django `redirect(request.GET['next'])` without allowlist.

---

## Cryptography

### SEC-CRYPTO-001: MD5/SHA1 for Password Hashing

- **Severity:** critical
- **Confidence:** deterministic or heuristic
- **Description:** MD5 or SHA1 is used to hash passwords or authentication tokens. These are fast hash functions vulnerable to brute-force.
- **Detection:** `createHash('md5')`, `hashlib.sha1` in auth context.

### SEC-CRYPTO-002: ECB Block Cipher Mode

- **Severity:** major
- **Confidence:** heuristic
- **Description:** ECB mode encrypts identical plaintext blocks to identical ciphertext blocks, leaking patterns in the data.
- **Detection:** `AES/ECB`, `mode=ECB`, `DES` references.

### SEC-CRYPTO-003: Hardcoded Initialization Vector

- **Severity:** major
- **Confidence:** heuristic
- **Description:** A static/hardcoded IV is used for encryption, negating the purpose of the IV and enabling cryptanalysis.
- **Detection:** `iv =` assigned to a literal hex string or `Buffer.from('...')`.

### SEC-CRYPTO-004: Weak Random for Security Tokens

- **Severity:** major
- **Confidence:** heuristic
- **Description:** `Math.random()` or `random.random()` is used to generate security-sensitive tokens. These are not cryptographically secure PRNGs.
- **Detection:** `Math.random()` or `random.random()` in token/session/ID generation context.

### SEC-CRYPTO-005: DES / 3DES Usage

- **Severity:** major
- **Confidence:** heuristic
- **Description:** DES or 3DES is used for encryption. Both are considered broken or deprecated.
- **Detection:** `DES`, `3DES`, `DESede` references in crypto context.

### SEC-CRYPTO-006: MD5/SHA1 for Non-Auth Checksums

- **Severity:** info
- **Confidence:** heuristic
- **Description:** MD5 or SHA1 is used for checksums or cache keys, not for security purposes. Not a vulnerability but worth noting.
- **Detection:** `md5`/`sha1` in checksum/cache/etag context.

---

## SSRF

### SEC-SSRF-001: Server-Side Request Forgery

- **Severity:** major
- **Confidence:** heuristic
- **Description:** An HTTP client call uses a URL derived from user input without validation, potentially allowing access to internal services or cloud metadata endpoints.
- **Detection:** `fetch(req.query.url)`, `axios.get(userUrl)`, `urllib.request.urlopen(user_url)`.

---

## Infrastructure as Code

### SEC-IAC-001: Overly Permissive IAM Policy

- **Severity:** critical
- **Confidence:** deterministic (tflint) or heuristic
- **Description:** An IAM policy grants `Action: *` or `Resource: *` with `Effect: Allow`, violating least-privilege.
- **Detection:** Terraform `aws_iam_policy_document` with wildcard actions.

### SEC-IAC-002: Public S3 Bucket

- **Severity:** critical
- **Confidence:** deterministic (tflint) or heuristic
- **Description:** An S3 bucket has `acl = "public-read"` or public access block disabled, exposing data to the internet.
- **Detection:** Terraform `aws_s3_bucket` with `acl = "public-read"` or `block_public_acls = false`.

### SEC-IAC-003: Security Group Open to World

- **Severity:** critical
- **Confidence:** deterministic (tflint) or heuristic
- **Description:** A security group allows inbound traffic from `0.0.0.0/0` on a sensitive port (SSH, DB, etc.).
- **Detection:** `cidr_blocks = ["0.0.0.0/0"]` on ports 22, 3306, 5432, 27017, etc.

### SEC-IAC-004: Unencrypted Storage

- **Severity:** major
- **Confidence:** deterministic (tflint) or heuristic
- **Description:** A storage resource (RDS, EBS, S3) has encryption explicitly disabled or not configured.
- **Detection:** `encrypted = false`, `storage_encrypted = false`, missing `server_side_encryption_configuration`.

---

## Insecure Defaults

### SEC-DEFAULT-001: Debug Mode in Production Config

- **Severity:** major
- **Confidence:** heuristic
- **Description:** Debug mode is enabled in a configuration file that appears to be for production, exposing stack traces and internal state.
- **Detection:** `DEBUG=True` or `debug: true` in production-named config files.

### SEC-DEFAULT-002: Default Credentials in Config

- **Severity:** critical
- **Confidence:** heuristic
- **Description:** Default passwords like `admin`, `password`, `changeme` appear in configuration files.
- **Detection:** `password: admin`, `secret: changeme`, etc.

### SEC-DEFAULT-003: Permissive Content Security Policy

- **Severity:** minor
- **Confidence:** heuristic
- **Description:** CSP includes `unsafe-inline`, `unsafe-eval`, or wildcard source directives, weakening XSS protections.
- **Detection:** CSP header or meta tag with `unsafe-inline`, `unsafe-eval`, `*`.

### SEC-DEFAULT-004: Missing Security Headers

- **Severity:** minor
- **Confidence:** heuristic
- **Description:** Common security headers (HSTS, X-Frame-Options, X-Content-Type-Options) are not set.
- **Detection:** Absence of helmet middleware or manual header configuration.

### SEC-DEFAULT-005: HTTP in Production URLs

- **Severity:** minor
- **Confidence:** heuristic
- **Description:** Non-HTTPS URLs appear in production configuration, risking data interception.
- **Detection:** `http://` in production config files (excluding localhost).

---

## Install & Lifecycle Scripts

### SEC-INSTALL-001: Pipe-to-Shell Installer

- **Severity:** major
- **Confidence:** heuristic
- **Description:** Documentation or a script instructs users to pipe remote content directly into a shell (`curl ... | bash`, `wget -O- ... | sh`), executing unreviewed remote code — often as root.
- **Detection:** Grep README/docs/scripts for `(curl|wget) ... | (sudo )?(ba)?sh`.

### SEC-INSTALL-002: Lifecycle Hook Runs Arbitrary Command

- **Severity:** major
- **Confidence:** heuristic
- **Description:** A package manifest `preinstall`/`install`/`postinstall`/`prepare` hook invokes a shell, `node -e`, or downloads and executes remote content. These run automatically on dependency install, giving the package RCE on every consumer's machine.
- **Detection:** `package.json` lifecycle scripts containing `curl`, `wget`, `node -e`, `sh `, `bash `, or `sudo`. Exclude hooks that only run local in-repo build steps.

### SEC-INSTALL-003: Install Script Requires Elevated Privileges

- **Severity:** minor (major if combined with a remote download)
- **Confidence:** heuristic
- **Description:** An `install.sh`/`setup.sh`/`setup.py` uses `sudo`, `chmod +x` on downloaded artifacts, or writes to system paths, escalating a routine install into a privileged operation.
- **Detection:** Grep install/setup scripts for `sudo`, `chmod +x`, `chown root`, `os.system`, or `subprocess(..., shell=True)`.

---

## Platform-Specific

Run the playbook matching the detected stack. Without these, desktop/mobile repos score
falsely high because the generic web checks find nothing.

### SEC-TAURI-001: Overly Broad Capability / Allowlist

- **Severity:** major (critical for `shell: { all: true }` reachable from remote content)
- **Confidence:** heuristic
- **Description:** Tauri `allowlist`/capabilities grant broad `shell`, `fs`, or `http` scopes, `dangerousRemoteDomainIpcAccess` is enabled, or the updater has no `pubkey`, widening the sandbox-escape surface.
- **Detection:** `tauri.conf.json` allowlist/capability scopes; `#[tauri::command]`s that act on a path/command argument without validation.

### SEC-ELECTRON-001: Insecure Renderer Configuration

- **Severity:** critical (`nodeIntegration:true` / `contextIsolation:false` / `webSecurity:false`), major (unvalidated IPC, `shell.openExternal` on user input)
- **Confidence:** heuristic
- **Description:** Renderer security is disabled or IPC channels act on renderer-supplied input, letting a compromised page reach Node/OS.
- **Detection:** `webPreferences` flags; `ipcMain.on/handle` channels; `shell.openExternal`.

### SEC-MOBILE-001: Insecure Storage / Transport (Flutter, iOS)

- **Severity:** major (secrets in `SharedPreferences`/`UserDefaults`, cleartext HTTP, ATS disabled), critical (hardcoded secret, TLS validation disabled)
- **Confidence:** heuristic
- **Description:** Secrets/tokens stored in non-secure stores instead of Keychain/`flutter_secure_storage`, cleartext `http://` to app APIs, disabled TLS validation, or ATS `NSAllowsArbitraryLoads`.
- **Detection:** Flutter `.dart` and iOS `.swift`/`Info.plist` playbook greps in the skill.

### SEC-LLM-001: Prompt / Tool Injection into Execution

- **Severity:** major (critical when the injected instruction can drive tool execution or code exec)
- **Confidence:** native
- **Description:** Untrusted content (web page, email, file, DB row) is concatenated into a prompt that then drives tool calls or code execution with no gate, letting the content hijack the agent.
- **Detection:** Trace untrusted sources into prompt construction where the model output triggers a tool/exec.

### SEC-LLM-002: Unmetered Model Spend

- **Severity:** minor
- **Confidence:** heuristic
- **Description:** User-triggered model calls in a loop with no budget/rate/quota cap allow cost-exhaustion. (Surface, don't over-flag — some projects cap spend deliberately at the key.)
- **Detection:** Model calls inside request-triggered loops without a cap.

---

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/security.json` | Valid JSON, matches schema, all findings have `fix_prompt` |
| Each finding | Has `dimension`, `severity`, `title`, `description`, `fix_prompt`, `file`, `line` |
| Score | Computed correctly from severity counts using the standard formula |
| Confidence field | Present on every finding, matches detection method |
