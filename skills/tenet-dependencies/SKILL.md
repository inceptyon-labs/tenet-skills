---
name: tenet-dependencies
description: "Audits dependencies for CVEs, stale packages, duplicates, unused deps, and outdated versions."
when_to_use: "Dependency audit, CVE scan, outdated packages, npm audit, pip-audit, tenet dependencies"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Dependencies — Dependency Health Audit

> Audits project dependencies for security vulnerabilities, maintenance status, duplication, staleness, and unused packages. Combines deterministic toolchain output with heuristic analysis of manifest files.

## Purpose

This skill evaluates the health of a project's dependency tree across five dimensions: known CVEs (security vulnerabilities with published advisories), unmaintained packages (no release in >2 years), duplicate dependencies (multiple packages serving the same purpose), unused dependencies (declared but never imported), and severely outdated versions (pinned to old majors when newer majors exist). It consumes toolchain output from vulnerability scanners and supplements with its own manifest analysis.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python, go, rust]
  heuristic: [java, ruby, php]
  skip: [yaml, json, markdown, css, html, shell, terraform, dockerfile]
```

- **Native** (npm/pip/go/cargo): Full manifest parsing, lockfile analysis, vulnerability cross-referencing, outdated version detection.
- **Heuristic** (Java/Ruby/PHP): Manifest parsing (`pom.xml`/`build.gradle`, `Gemfile`, `composer.json`) with limited version analysis. Vulnerability detection depends on toolchain (trivy/osv-scanner).

## Toolchain Inputs

This skill consumes the following `.healthcheck/toolchain/` files **if available**:

| File | Tool | What It Provides |
|---|---|---|
| `npm_audit.json` | npm audit | Known CVEs in npm dependency tree |
| `pip_audit.json` | pip-audit | Known CVEs in Python packages |
| `osv_scanner.json` | osv-scanner | OSV database CVEs across ecosystems |
| `trivy.json` | trivy | Container and filesystem vulnerability scan |

If none of these toolchain files exist, the skill falls back to its own heuristic analysis of manifest files. Toolchain findings have `"confidence": "deterministic"`, while heuristic findings use `"confidence": "heuristic"`.

It also reads:
- `.healthcheck/toolchain/language-census.json` — to determine which ecosystems are present

## Procedure

### Step 0: Read Language Census and Detect Ecosystems

Read `.healthcheck/toolchain/language-census.json`. Identify which package ecosystems are present:

```bash
# Check for manifest files
ls package.json package-lock.json yarn.lock pnpm-lock.yaml 2>/dev/null  # npm/yarn/pnpm
ls requirements.txt requirements/*.txt Pipfile pyproject.toml setup.py setup.cfg 2>/dev/null  # pip
ls go.mod go.sum 2>/dev/null  # go
ls Cargo.toml Cargo.lock 2>/dev/null  # cargo/rust
ls pom.xml build.gradle build.gradle.kts 2>/dev/null  # java
ls Gemfile Gemfile.lock 2>/dev/null  # ruby
ls composer.json composer.lock 2>/dev/null  # php
```

If no manifest files are found, mark the dimension as `applicable: false` and write a minimal report.

### Step 1: Known CVE Detection

#### 1a: Consume Toolchain Output

For each available toolchain file, parse the normalized findings:

```bash
# Read and parse each available toolchain file
cat .healthcheck/toolchain/npm_audit.json 2>/dev/null
cat .healthcheck/toolchain/pip_audit.json 2>/dev/null
cat .healthcheck/toolchain/osv_scanner.json 2>/dev/null
cat .healthcheck/toolchain/trivy.json 2>/dev/null
```

For each vulnerability found:
- Extract: package name, installed version, vulnerable range, CVE ID, severity (CVSS), advisory URL
- Map tool severity to Tenet severity:
  - CVSS >= 9.0 or tool "critical" → `critical`
  - CVSS >= 7.0 or tool "high" → `major`
  - CVSS >= 4.0 or tool "medium" → `minor`
  - CVSS < 4.0 or tool "low" → `info`
- Deduplicate: if multiple tools report the same CVE for the same package, keep only one finding (prefer the toolchain source with more detail)

#### 1b: Fallback — Run npm audit / pip-audit If Available

If no toolchain files exist for an ecosystem but the tool is available:

```bash
# npm ecosystem
npm audit --json 2>/dev/null | jq '.vulnerabilities'

# pip ecosystem
pip-audit --format json 2>/dev/null
```

Parse the output using the same mapping as 1a. Tag these findings with `"confidence": "deterministic"` since the tool output is authoritative.

### Step 2: Unmaintained Package Detection

Check for packages that have not had a release in over 2 years. This indicates potential abandonment — security patches and compatibility updates are unlikely.

#### npm Ecosystem

```bash
# For each direct dependency in package.json, check the last publish date
# Use npm view to get the time metadata
jq -r '.dependencies // {} | keys[]' package.json 2>/dev/null | while read pkg; do
  npm view "$pkg" time.modified 2>/dev/null
done
```

**Note:** This step requires network access. If `npm view` is not available or the network is unrestricted, fall back to checking the lockfile for version age heuristics.

#### Python Ecosystem

```bash
# Check PyPI for last release date
# Use pip index versions or parse pyproject.toml/requirements.txt
pip index versions <package> 2>/dev/null
```

#### Curated List of Known-Problematic Packages

Flag immediately if any of these are found in dependencies (regardless of network availability):

| Package | Ecosystem | Issue |
|---|---|---|
| `request` | npm | Deprecated since 2020, no security patches |
| `node-uuid` | npm | Deprecated, use `uuid` |
| `nomnom` | npm | Unmaintained since 2015 |
| `istanbul` | npm | Replaced by `nyc` / `c8` |
| `tslint` | npm | Deprecated, use `eslint` with `@typescript-eslint` |
| `left-pad` | npm | Historical incident, use `String.padStart` |
| `bower` | npm | Deprecated package manager |
| `coffeescript` | npm | Effectively unmaintained |
| `nose` | pip | Unmaintained since 2015, use `pytest` |
| `pycrypto` | pip | Unmaintained, use `pycryptodome` or `cryptography` |
| `optparse` | pip | Deprecated, use `argparse` |
| `distribute` | pip | Merged into `setuptools` |
| `fabric` (v1) | pip | Use `fabric2` |
| `flask-script` | pip | Unnecessary since Flask 0.11+ CLI |

**Severity:** `major` for deprecated packages with known security implications. `minor` for packages that are simply unmaintained but have no known vulnerabilities.

### Step 3: Duplicate Dependency Detection

Identify multiple packages that serve overlapping purposes — this bloats the dependency tree and creates maintenance burden.

#### Common Duplicate Groups

| Group | Packages | Recommendation |
|---|---|---|
| HTTP client | `axios`, `got`, `node-fetch`, `request`, `superagent` | Pick one |
| Date/time | `moment`, `date-fns`, `dayjs`, `luxon` | Pick one |
| Validation | `joi`, `yup`, `zod`, `class-validator`, `superstruct` | Pick one |
| Utility belt | `lodash`, `underscore`, `ramda` | Pick one |
| Logging | `winston`, `pino`, `bunyan`, `log4js` | Pick one |
| ORM/query | `sequelize`, `typeorm`, `prisma`, `knex` (unless deliberate) | Pick one |
| Test runner | `jest`, `mocha`, `vitest`, `ava`, `tap` | Pick one |
| CSS-in-JS | `styled-components`, `emotion`, `linaria`, `vanilla-extract` | Pick one |

```bash
# Read dependencies from package.json
jq -r '(.dependencies // {}) + (.devDependencies // {}) | keys[]' package.json 2>/dev/null
```

Cross-reference against the duplicate groups. Flag if two or more packages from the same group appear.

**Severity:** `minor` for duplicate utility packages. `info` for duplicate dev dependencies (less impactful since they don't ship to production).

### Step 4: Unused Dependency Detection

Detect dependencies declared in the manifest but never imported in source code.

#### npm Ecosystem

```bash
# Get all declared dependencies
DEPS=$(jq -r '.dependencies // {} | keys[]' package.json 2>/dev/null)

# For each dependency, check if it's imported anywhere in source
for dep in $DEPS; do
  # Search for import/require of this package
  grep -rq "from ['\"]${dep}['\"/]\|require(['\"]${dep}['\"/]" \
    --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" \
    --include="*.mjs" --include="*.cjs" src/ lib/ app/ pages/ 2>/dev/null
done
```

**Important exclusions — do NOT flag:**
- Packages used via CLI (`eslint`, `prettier`, `typescript`, `ts-node`, etc.)
- Packages used via config files (`@babel/preset-env`, `postcss-*`, `tailwindcss`, `autoprefixer`)
- `@types/*` packages (TypeScript type definitions, used implicitly)
- Packages referenced in scripts in `package.json`
- Webpack/Vite/Rollup plugins (used via bundler config)
- Packages that are peer dependencies of other installed packages
- `devDependencies` used only in test/build tooling

#### Python Ecosystem

```bash
# Parse requirements.txt or pyproject.toml for declared packages
# Search for imports matching package names (handle name mapping: e.g., Pillow -> PIL)
grep -rn "^import \|^from " --include="*.py" src/ app/ 2>/dev/null
```

**Severity:** `minor` for unused production dependencies. `info` for unused dev dependencies.

### Step 5: Severely Outdated Version Detection

Flag dependencies pinned to very old major versions when significantly newer versions exist.

#### npm Ecosystem

```bash
# Run npm outdated to get current vs latest versions
npm outdated --json 2>/dev/null
```

Parse the output. Flag if:
- The installed major version is **2+ majors behind** the latest (e.g., installed v3.x, latest v6.x)
- The package has published security advisories for the installed major

#### Python Ecosystem

```bash
# Check for outdated packages
pip list --outdated --format json 2>/dev/null
```

#### Go Ecosystem

```bash
# Check for available updates
go list -m -u all 2>/dev/null
```

**Severity mapping:**
- 3+ major versions behind with known CVEs in installed range → `critical`
- 3+ major versions behind → `major`
- 2 major versions behind → `minor`
- 1 major version behind → `info`

### Step 6: Compile Findings

For each detected issue, create a finding object:

```json
{
  "dimension": "dependencies",
  "severity": "critical",
  "title": "CVE-2023-44270: postcss ReDoS vulnerability",
  "description": "postcss 8.4.20 is affected by CVE-2023-44270, a Regular Expression Denial of Service (ReDoS) vulnerability in the parsing of CSS values. An attacker can craft a malicious CSS input that causes catastrophic backtracking, hanging the process. The fix is available in postcss >= 8.4.31.",
  "file": "package.json",
  "line": null,
  "snippet": "\"postcss\": \"^8.4.20\"",
  "fix_prompt": "...",
  "confidence": "deterministic"
}
```

### Step 7: Compute Score

Apply the standard scoring formula:

1. Start at **100**
2. Subtract: `5 x critical + 2 x major + 0.5 x minor`
3. Floor at **0**, ceil at **100**, round to integer
4. Info findings do NOT affect the score

### Step 8: Write Report

Write `.healthcheck/reports/dependencies.json`:

```json
{
  "key": "dependencies",
  "score": 68,
  "weight": 1.3,
  "skill_version": "1.0.0",
  "notes": "Scanned package.json with 42 dependencies and requirements.txt with 18 packages. Found 2 known CVEs (1 critical, 1 major), 3 unmaintained packages, 1 duplicate dependency group, and 4 severely outdated packages. Critical: postcss ReDoS vulnerability (CVE-2023-44270) requires immediate update.",
  "applicable": true,
  "metrics": {
    "ecosystems_scanned": ["npm", "pip"],
    "total_dependencies": 60,
    "direct_dependencies": 42,
    "cve_critical": 1,
    "cve_major": 1,
    "cve_minor": 0,
    "unmaintained_count": 3,
    "duplicate_groups": 1,
    "unused_count": 0,
    "outdated_major_count": 4,
    "toolchain_sources": ["npm_audit.json", "osv_scanner.json"]
  },
  "findings": [ ... ]
}
```

## Output

- `.healthcheck/reports/dependencies.json` — dimension report with score, metrics, and findings

## Constraints

- **Toolchain-first.** Always prefer toolchain output over re-running tools. If `.healthcheck/toolchain/npm_audit.json` exists, do not run `npm audit` again.
- **Determinism for toolchain findings.** Findings sourced from toolchain files MUST have `"confidence": "deterministic"`.
- **Heuristic for manifest analysis.** Findings from curated lists, outdated detection, and unused detection MUST have `"confidence": "heuristic"`.
- **Deduplicate across tools.** If npm_audit and osv_scanner both report the same CVE for the same package, emit only one finding.
- **Network calls are optional.** The skill MUST produce useful output even without network access. Curated lists and manifest analysis work offline. `npm outdated`, `npm view`, and `pip list --outdated` are best-effort.
- **Do not modify manifests.** This skill is read-only. All changes are described in fix_prompts for the user to apply.
- **Respect lockfiles.** Use lockfile versions (not manifest range specifiers) as the "installed version" for vulnerability matching.
- **All findings must include a fix_prompt.** Every finding must have a self-contained fix_prompt following the template in `shared/fix_prompt_template.md`.

## fix_prompt Examples

### Example 1: Known CVE

```
# Fix: CVE-2023-44270 — postcss ReDoS vulnerability

## Context
The project depends on postcss 8.4.20, which is affected by CVE-2023-44270 (CVSS 7.5). This is a Regular Expression Denial of Service vulnerability in CSS value parsing. A malicious CSS input can hang the Node.js process.

## Location
- File: package.json
- Line: N/A
- Dimension: dependencies / critical

## Current behavior
```json
"postcss": "^8.4.20"
```
The lockfile resolves to postcss 8.4.20, which contains the vulnerable regex pattern.

## Required change
1. Update postcss to >= 8.4.31 (the patched version):
   ```bash
   npm install postcss@^8.4.31
   ```
2. If postcss is a transitive dependency (pulled in by another package), check which parent depends on it:
   ```bash
   npm ls postcss
   ```
   If the parent pins an old version, update the parent package or add a resolution/override:
   ```json
   // package.json
   "overrides": {
     "postcss": "^8.4.31"
   }
   ```

## Constraints
- Run the full test suite after updating to catch any breaking changes in postcss 8.4.31
- If postcss is a transitive dependency, prefer updating the parent package over using overrides
- Verify that PostCSS plugins are compatible with the new version

## Verification
- Run: `npm audit` — should no longer report CVE-2023-44270
- Run: `npm test` — all tests should pass
- Run: `npm ls postcss` — should show version >= 8.4.31
```

### Example 2: Unmaintained Package

```
# Fix: Unmaintained dependency — request package (deprecated since 2020)

## Context
The project depends on the `request` npm package, which was officially deprecated in February 2020. It no longer receives security patches or bug fixes. Several CVEs have been reported since deprecation with no fixes forthcoming.

## Location
- File: package.json
- Line: N/A
- Dimension: dependencies / major

## Current behavior
```json
"request": "^2.88.2"
```
The `request` package is used for HTTP requests but has been deprecated for over 4 years.

## Required change
1. Identify all files that import `request`:
   ```bash
   grep -rn "require('request')\|from 'request'" src/ lib/
   ```
2. Replace with a maintained alternative. Recommended: `node-fetch` (lightweight) or `axios` (feature-rich):
   ```bash
   npm uninstall request
   npm install node-fetch
   ```
3. Update each call site. Common patterns:
   ```javascript
   // Before (request)
   const request = require('request');
   request.get('https://api.example.com/data', (err, res, body) => { ... });

   // After (node-fetch)
   const fetch = require('node-fetch');
   const res = await fetch('https://api.example.com/data');
   const body = await res.json();
   ```
4. Note: `request` uses callbacks; `node-fetch` uses Promises. If the codebase uses request's callback style extensively, consider `got` which supports both streams and promises.

## Constraints
- Ensure the replacement handles all HTTP methods used (GET, POST, PUT, DELETE)
- Preserve any custom headers, auth, proxy, or timeout configuration
- If `request` is used with `.pipe()` for streaming, ensure the replacement supports streams
- Run the full test suite after migration

## Verification
- Run: `npm test` — all tests should pass
- Run: `grep -rn "require('request')" src/ lib/` — should return no results
- Run: `npm ls request` — should show request is no longer in the dependency tree
```

### Example 3: Unused Dependency

```
# Fix: Unused dependency — slug package never imported

## Context
The `slug` package is declared in `dependencies` in package.json but is never imported in any source file. This adds unnecessary weight to the dependency tree and install time.

## Location
- File: package.json
- Line: N/A
- Dimension: dependencies / minor

## Current behavior
```json
"slug": "^8.2.2"
```
No file in `src/`, `lib/`, or `app/` imports or requires `slug`.

## Required change
1. Verify the package is truly unused (it may be used in a way not caught by import scanning):
   ```bash
   grep -rn "slug" src/ lib/ app/ --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"
   ```
   Also check if it is referenced in any config file, script, or as a CLI tool.
2. If confirmed unused, remove it:
   ```bash
   npm uninstall slug
   ```

## Constraints
- Double-check that `slug` is not used as a transitive peer dependency required by another package
- Check `package.json` scripts for any CLI usage of `slug`
- If the package was recently added and is intended for upcoming work, consider moving it to a feature branch instead

## Verification
- Run: `npm install` — should succeed without errors
- Run: `npm test` — all tests should pass
- Run: `npm ls slug` — should show the package is no longer installed
```
