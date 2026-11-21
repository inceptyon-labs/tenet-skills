---
name: tenet-security
description: "Audits security vulnerabilities including injection, broken access control (IDOR, tenant isolation), auth, validation, crypto, SSRF, CORS, CSRF, and platform-specific risks."
when_to_use: "tenet security, tenet-security dimension, Tenet security vulnerability audit. Run via /tenet-skills:tenet-orchestrator or directly with /tenet-skills:tenet-security."
model: opus
disable-model-invocation: true
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

The model running this skill is set by the orchestrator (`[models].judge` in `.healthcheck.toml`).
Whatever the model, follow these shared protocols exactly; they are what turn a shallow grep
pass into a real audit, and they are also what keep it from inventing findings to fill the report:

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
platform_playbooks: [tauri, electron, flutter, ios-swift, macos-app, llm-app]
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
git grep -nP "(query|execute|raw)\s*\(\s*[\`'\"].*(\+|\$\{)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py'
git grep -nP "f[\"'].*(SELECT|INSERT|UPDATE|DELETE).*\{" -- '*.py'
git grep -nP "format!.*(SELECT|INSERT|UPDATE|DELETE)" -- '*.rs'
# Command / eval
git grep -nP "(child_process|exec|execSync|spawn|os\.system|os\.popen|subprocess|Runtime\.exec)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.java'
git grep -nP "\beval\s*\(|new Function\s*\(" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py'
# XSS
git grep -nP "dangerouslySetInnerHTML|v-html|innerHTML\s*=|insertAdjacentHTML" -- '*.tsx' '*.jsx' '*.vue' '*.ts' '*.js'
git grep -nP "\|safe|\|raw|mark_safe|SafeString" -- '*.py' '*.html'
# NoSQL / object injection (Mongo, etc.)
git grep -nP "\.(find|findOne|update|delete)(One|Many)?\s*\(\s*(req\.(body|query|params))" -- '*.ts' '*.tsx' '*.js' '*.jsx'
git grep -nP "\$where|\$regex" -- '*.ts' '*.tsx' '*.js' '*.jsx'
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
  git grep -nP "\.(create|update|save|insert)\s*\(\s*(\{?\s*\.\.\.)?req\.body" -- '*.ts' '*.tsx' '*.js' '*.jsx'
  git grep -nP "(create|update)\([^)]*\*\*(request|req)\.(json|data|POST)" -- '*.py'
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
git grep -nP "(readFile|writeFile|createReadStream|sendFile|path\.join|open|fs\.)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' | git grep -nP "req\.(params|query|body)"
```
Flag `path.join(base, req.params.file)` / `open(user_path)` without a `path.resolve` +
prefix/allowlist check or `..`/absolute-path rejection → `critical`. (`SEC-VAL-003`)

### Step 7: Authentication Mechanics

```bash
git grep -nP "algorithms?\s*:\s*\[?\s*['\"]?none|verify\s*:\s*false|verify=False" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py'   # JWT alg none / verify off
git grep -nP "httpOnly\s*:\s*false|secure\s*:\s*false|sameSite\s*:\s*['\"]?none" -- '*.ts' '*.tsx' '*.js' '*.jsx'          # weak session cookie
git grep -nP "createHash\(['\"](md5|sha1)|hashlib\.(md5|sha1)|MessageDigest\.getInstance\(['\"](MD5|SHA-1)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.java'  # weak password hash
git grep -nP "bcrypt.*(genSalt|hash)\(\s*[0-9]\b" -- '*.ts' '*.tsx' '*.js' '*.jsx'   # bcrypt cost < 10
```
Also flag: no rate limiting on `/login`, `/register`, `/reset` (no limiter middleware on auth
routes) → `major`. **Timing-unsafe secret comparison** — a token/HMAC/signature compared with
`===`/`==`/`.equals()` instead of `crypto.timingSafeEqual`/`hmac.compare_digest` → `major`
(`SEC-AUTH-007`):
```bash
git grep -nP "(token|secret|signature|hmac|digest|hash)\s*={2,3}\s*" -- '*.ts' '*.tsx' '*.js' '*.jsx'
```

### Step 8: CSRF

From the entry-point table: cookie-authenticated state-changing routes (POST/PUT/PATCH/DELETE)
with no CSRF token/double-submit/origin check, and auth cookies without `SameSite`.
Token-in-header APIs (Authorization: Bearer) are generally exempt. → `major` / `minor`.

### Step 9: SSRF & Open Redirect

```bash
git grep -nP "(fetch|axios|got|request|urllib|http\.(get|request)|HttpClient|requests\.(get|post))\s*\(.*req\.(query|params|body)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py'
git grep -nP "(redirect|Location)\s*\(?.*req\.(query|params|body)" -- '*.ts' '*.tsx' '*.js' '*.jsx'
git grep -nP "redirect\(.*request\.(GET|POST|args)" -- '*.py'
```
SSRF: user-controlled URL fetched server-side without an allowlist → `major` (`critical` if it
can reach cloud metadata `169.254.169.254` or internal services). Open redirect: redirect
target from user input without allowlist → `major`.

### Step 10: Cryptography

```bash
git grep -nP "ECB|AES/ECB|mode=ECB|\bDES\b|DESede|3DES" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.java' '*.go'
git grep -nP "iv\s*[:=]\s*(['\"][0-9a-fA-F]{16,}|Buffer\.from\()" -- '*.ts' '*.tsx' '*.js' '*.jsx'   # hardcoded IV
git grep -nP "Math\.random|random\.random\(\)|\brand\(\)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py'      # weak PRNG
```
ECB mode → `major`; DES/3DES → `major`; hardcoded IV → `major`; `Math.random()`/`random.random()`
for a **security** value (token/id/nonce) → `major` (skip for jitter/shuffle — see
calibration). MD5/SHA1 for passwords/tokens → `critical`; for checksums/cache keys → `info`.

### Step 11: Unsafe Deserialization, ReDoS, Zip-Slip, Prototype Pollution

```bash
git grep -nP "pickle\.loads?|yaml\.load\(|yaml\.unsafe_load|Marshal\.load|unserialize\(|ObjectInputStream" -- '*.py' '*.rb' '*.php' '*.java'
git grep -nP "(new RegExp\(|re\.compile\().*(req\.|request\.|input)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py'   # user-supplied regex → ReDoS
git grep -nP "(entry\.(path|name)|zipEntry|extractall|tarfile)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py'         # archive extraction → zip-slip
git grep -nP "(merge|extend|defaultsDeep|set)\s*\(.*(req\.body|JSON\.parse)" -- '*.ts' '*.tsx' '*.js' '*.jsx'   # prototype pollution
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
git grep -nP "cors\(\s*\{?\s*origin\s*:\s*['\"]?\*|Access-Control-Allow-Origin.*\*" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py'
git grep -nP "origin\s*:\s*(req\.headers\.origin|true)" -- '*.ts' '*.tsx' '*.js' '*.jsx'   # origin reflection
git grep -nP "DEBUG\s*=\s*True|debug\s*:\s*true" -- '*.py' '*.ts' '*.tsx' '*.js' '*.jsx' '*.json'
git grep -nP "(password|passwd|secret)\s*[:=]\s*['\"]?(admin|password|123456|default|changeme)" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.yaml' '*.json'
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
git grep -nP 'effect\s*=\s*"Allow".*actions\s*=\s*\["\*"\]|"Action":\s*"\*"' -- '*.tf'
git grep -nP 'acl\s*=\s*"public-read|block_public_acls\s*=\s*false' -- '*.tf'
git grep -nP 'encrypted\s*=\s*false|storage_encrypted\s*=\s*false' -- '*.tf'
git grep -nP 'cidr_blocks\s*=\s*\["0\.0\.0\.0/0"\]' -- '*.tf'
```
Combine with tflint findings. Wildcard IAM → `critical`; public bucket → `critical`; SG open to
0.0.0.0/0 on a sensitive port → `critical`; unencrypted storage → `major`.

### Step 14: Unsafe Install & Lifecycle Scripts

```bash
git grep -nP "(curl|wget)\s+[^|]*\|\s*(sudo\s+)?(ba)?sh\b" -- '*.md' '*.mdx' '*.rst'
git grep -nP "\"(pre|post)?install\"\s*:\s*\"[^\"]*(curl|wget|node -e|sh |bash |sudo )" -- 'package.json'
git grep -nP "\bsudo\b|chmod\s+\+x|chown\s+root" -- 'install.sh' 'setup.sh'
git grep -nP "os\.system|subprocess[^)]*shell\s*=\s*True|sudo" -- 'setup.py' 'install.py'
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
git grep -nP "\"(shell|fs|http|all)\"\s*:\s*(true|\{)|\"scope\"|dangerousRemoteDomainIpcAccess|withGlobalTauri" -- 'tauri.conf.json' 'src-tauri/**/*.json'
git grep -nP "#\[tauri::command\]|invoke_handler" -- 'src-tauri/**/*.rs'
```
Flag: overly broad `allowlist`/capability scopes (`shell: { all: true }`, `fs` scope `**`),
`dangerousRemoteDomainIpcAccess`, missing updater `pubkey`, `#[tauri::command]`s that take a
path/command and act on it without validation → `major`.

**Electron:**
```bash
git grep -nP "nodeIntegration\s*:\s*true|contextIsolation\s*:\s*false|webSecurity\s*:\s*false|enableRemoteModule\s*:\s*true|allowRunningInsecureContent" -- '*.ts' '*.tsx' '*.js' '*.jsx'
git grep -nP "shell\.openExternal\(|ipcMain\.(on|handle)\(" -- '*.ts' '*.tsx' '*.js' '*.jsx'
```
Flag: `nodeIntegration:true` / `contextIsolation:false` / `webSecurity:false` → `critical`;
`shell.openExternal` on user input → `major`; unvalidated IPC channels acting on renderer
input → `major`; loading remote content into a privileged window → `major`.

**Flutter / Dart:**
```bash
git grep -nP "SharedPreferences|http://|NSAllowsArbitraryLoads|badCertificateCallback|allowBadCertificates" -- '*.dart'
git grep -nP "(apiKey|secret|token|password)\s*=\s*['\"][^'\"]{12,}" -- '*.dart'
```
Flag: secrets/tokens in source or `shared_preferences` (use `flutter_secure_storage`) →
`major`/`critical`; cleartext `http://` to app APIs → `major`; disabled TLS validation
(`badCertificateCallback => true`) → `critical`; no certificate pinning on sensitive APIs →
`minor`.

**iOS / Swift:**
```bash
git grep -nP "NSAllowsArbitraryLoads|NSExceptionAllowsInsecureHTTPLoads" -- '*.plist' 'Info.plist'
git grep -nP "UserDefaults.*(token|password|secret|key)|kSecAttrAccessible" -- '*.swift'
git grep -nP "(apiKey|secret|token)\s*=\s*\"[^\"]{12,}\"" -- '*.swift'
```
Flag: ATS disabled (`NSAllowsArbitraryLoads = true`) → `major`; secrets/tokens in
`UserDefaults` instead of Keychain → `major`; hardcoded secrets → `critical`; overly permissive
Keychain accessibility (`kSecAttrAccessibleAlways`) → `minor`; CloudKit public-DB write scopes
on user data → `major`.

**macOS app (Swift/AppKit/SwiftUI desktop).** Run when the census shows Swift and any of:
`Package.swift` with `.macOS(`, `MACOSX_DEPLOYMENT_TARGET`, `NSXPCListener`, `SMAppService`,
`SMJobBless`, Sparkle, a `LaunchDaemons`/`LaunchAgents` plist, or a `.entitlements` file. Also run
the iOS/Swift greps above for storage and transport. The local attack surface matters more than
the network surface here, so for every candidate, first name the **boundary it crosses**:
user → root (privileged helper), web page → app (localhost server, URL scheme), another local
app → app (XPC, injected code inheriting this app's TCC grants or helper trust), network → app
(updates). Code acting as the same user on the user's own files crosses no boundary, so it is
not a security finding. See `shared/security-calibration.md` § macOS.

1. **Privileged helper / XPC client validation** (`SEC-MACOS-001`):
   ```bash
   git grep -nP "NSXPCListener|shouldAcceptNewConnection|setCodeSigningRequirement|setConnectionCodeSigningRequirement|SecCodeCopyGuestWithAttributes|kSecGuestAttribute(Pid|Audit)|SMAuthorizedClients|SMPrivilegedExecutables" -- '*.swift' '*.m' '*.plist'
   git grep -nP "AuthorizationExecuteWithPrivileges|with administrator privileges" -- '*.swift' '*.m' '*.applescript'
   ```
   Read every `shouldAcceptNewConnection`. Flag: returns `true` with no code-signing check of the
   peer → `critical` when the listener runs as root, `major` otherwise. Peer checked by **PID**
   (`processIdentifier`, `kSecGuestAttributePid`) instead of audit token or
   `setCodeSigningRequirement` → `major` (PID-reuse race). Requirement string without the Team ID
   (`certificate leaf[subject.OU] = "<TEAM>"`), e.g. `identifier "com.x"` alone → `major`.
   `SMAuthorizedClients` only governs install, not who connects, so it is not a connection check.
   Then list each method on the exported protocol. A helper method that takes a raw path,
   command, URL or plist from the client and acts on it as root without the helper itself
   enforcing an allowlist → `critical` (the helper is the trust boundary, so checks done only in
   the app don't count). If the helper has an allowlist that links or races can bypass, report
   it once under `SEC-MACOS-002`. Cite the line where the unsafe action happens (`return true`
   with no check before it; the `chown`/`moveItem` call), not the guard. `AuthorizationExecuteWithPrivileges` → `major` (deprecated, no caller
   validation). AppleScript `do shell script … with administrator privileges` with an
   interpolated path or argument → `critical`.

2. **Filesystem operations in a privileged context** (`SEC-MACOS-002`). Applies to code in the
   helper/daemon target or in any process running as root:
   ```bash
   git grep -nP "removeItem|moveItem|copyItem|replaceItem|trashItem|createSymbolicLink|setAttributes|\b(l|f)?chown\(|\b(l|f)?chmod\(|\bunlink\(|\brename\(" -- '*Helper*/*.swift' '*Daemon*/*.swift'
   git grep -nP "resolvingSymlinksInPath|standardizedFileURL|st_nlink|O_NOFOLLOW|openat|unlinkat|renameatx_np|fstatat|AT_SYMLINK_NOFOLLOW" -- '*.swift'
   ```
   Root acting **by path** on anything under a directory a less-privileged user can write
   (`/tmp`, `/private/var/tmp`, `/Library/Caches`, `/Users/*`, shared app-support dirs) can be
   redirected by a planted symlink, a planted **hardlink**, or a swap between check and use.
   Flag → `critical`:
   - The only guard is a lexical or symlink check (`resolvingSymlinksInPath() == path`,
     `standardizedFileURL`, a `..` reject). A hardlink is not a symlink and passes it. Any
     unprivileged user can hardlink a root-owned file it cannot read, such as `/etc/sudoers`,
     into `/private/tmp`; macOS has no `protected_hardlinks`.
   - `chown`/`lchown`/`setAttributes(.ownerAccountID)` on a path to give a file to the user. If
     the inode is shared with a system file, the user now owns the system file.
   - Check-then-act by path (`fileExists`/`attributesOfItem`, then `removeItem`/`moveItem`).
   Sound pattern (do NOT flag): `lstat` and refuse regular files with `st_nlink > 1`, open parents
   with an `O_NOFOLLOW` component walk, act on the leaf with `unlinkat`/`renameatx_np`/`fchown`
   relative to the pinned descriptor, and never transfer ownership of a root-owned inode.
   The helper target often calls into a shared module, so follow every call from the exported
   methods instead of trusting the grep's path filter. The same patterns in a process running as
   the user are not findings.

3. **Localhost servers** (`SEC-MACOS-003`):
   ```bash
   git grep -nP "NWListener|requiredLocalEndpoint|requiredInterfaceType|GCDWebServer|Swifter|HttpServer|FlyingFox|Telegraph|Vapor|\bbind\(|INADDR_ANY|0\.0\.0\.0" -- '*.swift' '*.m'
   git grep -nP "\"[Hh]ost\"|\"[Oo]rigin\"|Access-Control-Allow-Origin" -- '*.swift'
   ```
   A web page in any browser on the machine can reach `127.0.0.1`. Flag: a server meant to be
   local that binds all interfaces → `major`. `NWListener(using:on:)` with no
   `requiredLocalEndpoint` or `requiredInterfaceType = .loopback` binds every interface. No
   `Host` header allowlist (`127.0.0.1`, `::1`, `localhost`), so DNS rebinding works → `major`
   when any endpoint mutates state, deletes or runs things; `minor` for read-only. State-changing
   endpoints that accept simple cross-origin requests (form/`text/plain` POST, GET with side
   effects) with no `Origin` check, or with `Access-Control-Allow-Origin: *` → `major`. A loopback
   server with `Host`/`Origin` validation but no bearer token → `info`; any native process running
   as the user already has the user's privileges.

4. **Custom URL schemes and Apple Events** (`SEC-MACOS-004`):
   ```bash
   git grep -nP "CFBundleURLSchemes" -- '*.plist'
   git grep -nP "kAEGetURL|onOpenURL|application\(_ [a-z]+: NSApplication, open urls|handleGetURLEvent|NSAppleScript\(source:" -- '*.swift'
   ```
   Any web page can launch `scheme://…`. Flag: a handler that deletes, moves, executes, installs,
   changes settings or opens a path taken from the URL without a user confirmation step →
   `major`. A handler that only selects a screen or tab is not a finding. `NSAppleScript(source:)`
   with an interpolated string from outside the app → `major` (script injection).

5. **Updates and downloaded installs** (`SEC-MACOS-005`):
   ```bash
   git grep -nP "SUFeedURL|SUPublicEDKey|SUPublicDSAKeyFile|SPUStandardUpdaterController|SUUpdater" -- '*.plist' '*.swift' '*.xcconfig'
   git grep -nP "hdiutil|installer\s+-pkg|ditto|SecStaticCodeCheckValidity|SecRequirementCreateWithString|codesign\s+--verify|spctl" -- '*.swift' '*.sh'
   ```
   Flag: Sparkle `SUFeedURL` over `http://` → `major` (`critical` if there is also no
   `SUPublicEDKey`); Sparkle 2 with no `SUPublicEDKey` → `major`. A custom updater or app
   installer that downloads a DMG/zip/pkg and installs it without verifying the code signature
   against a requirement that pins the **expected Team ID** → `major` (`critical` when the
   install runs as root or uses `installer -pkg`). A signature check without a Team ID pin
   accepts any developer's signed app. Checksums from the same server as the download add
   nothing.

6. **Hardened runtime and injection entitlements** (`SEC-MACOS-006`):
   ```bash
   git grep -nP "disable-library-validation|allow-dyld-environment-variables|allow-unsigned-executable-memory|get-task-allow|com\.apple\.security\.app-sandbox" -- '*.entitlements' '*.plist'
   git grep -nP "ENABLE_HARDENED_RUNTIME|--options[= ]runtime|codesign " -- '*.pbxproj' '*.xcconfig' '*.sh' 'Makefile' '*.yml'
   ```
   Code injected into an app inherits its TCC grants (Full Disk Access, Accessibility, Automation)
   and satisfies any helper's code-signing requirement for that app. Flag in a release build:
   `disable-library-validation` or `allow-dyld-environment-variables` → `major`, `critical` when
   a root helper trusts this app's signature. `get-task-allow` in release entitlements → `major`.
   Release signing script missing `--options runtime` → `major`. The flag is often on a
   continuation line below `codesign \`, so read the whole invocation before flagging. Skip
   debug-only entitlement files and scripts that are clearly dev-only (ad-hoc `--sign -`).

7. **Subprocesses from a privileged process** (`SEC-MACOS-007`):
   ```bash
   git grep -nP "Process\(\)|executableURL|launchPath|posix_spawn|\.environment\s*=|DYLD_" -- '*.swift'
   ```
   Flag: a root process executing a binary at a path a user can write (Homebrew prefix,
   `~/`, `/usr/local/bin` when user-owned) or resolved through `PATH` → `critical`; a root process
   passing its inherited environment with `DYLD_*` or `PATH` to children → `major`. Command
   strings via `/bin/sh -c` with interpolation are Step 4 command injection. A user-context app
   running user-installed tools with argv arrays crosses no boundary: not a finding.

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
using the pairs in `shared/security-calibration.md`. Drop anything you cannot confirm; an
unconfirmed candidate is not reported at a lower severity. Set `confidence` honestly. A report where every critical is defensible line-by-line
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
| macOS XPC listener accepts any / PID-checked client | Helper callable by any local process | major (critical as root) |
| macOS root helper acts on a user-writable path by path | Symlink/hardlink/TOCTOU → root | critical |
| macOS localhost server: all-interface bind, no Host/Origin check | DNS rebinding / browser CSRF | minor–major |
| macOS URL scheme acts without confirmation | Any web page drives the app | major |
| macOS update/install without Team-ID signature check | Network → code execution | major–critical |
| macOS injection entitlements / no hardened runtime | TCC and helper-trust inheritance | major–critical |
| macOS root process runs user-writable binary / passes DYLD_* | User → root | major–critical |
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
- Run: `git grep -nP "query\(\s*\`" src/db/` and confirm zero interpolated queries
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
- Audit siblings: `git grep -nP "WHERE id = \\$1" src/api/` and confirm each has an owner scope
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
