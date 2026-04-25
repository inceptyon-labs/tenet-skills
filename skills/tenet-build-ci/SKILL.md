---
name: tenet-build-ci
description: "Audits build and CI configuration: CI config presence, build reproducibility (lockfiles, pinned tool versions), lint/typecheck/test in CI pipeline, secrets handling via CI secret store, branch protection, and Docker image security."
when_to_use: "CI audit, build config review, Docker security, GitHub Actions review, tenet build-ci"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Build & CI

> *"A build you cannot reproduce is a build you cannot trust."*

Audits the project's build and CI configuration across six pillars: CI config presence, build reproducibility, pipeline quality gates, secrets handling, branch protection evidence, and Docker image security. Produces findings and a score written to `.healthcheck/reports/build-ci.json`.

## Purpose

Weak CI pipelines ship bugs, leak secrets, and produce unreproducible builds. A missing lockfile means dependency resolution varies between machines. Docker images running as root escalate container escapes to host compromises. CI without lint/typecheck/test steps means the green checkmark is meaningless. This skill catches these gaps before they reach production.

## Language Support Matrix

```yaml
support:
  native: [github-actions, gitlab-ci, docker]
  heuristic: [jenkins, circleci, travis, bitbucket-pipelines, azure-devops]
  note: >
    Native support parses GitHub Actions workflows, GitLab CI YAML, and Dockerfiles with full structure awareness.
    Heuristic support uses pattern matching for Jenkins, CircleCI, and other CI systems.
```

## Toolchain Inputs

This skill consumes the following toolchain outputs when available:

| Toolchain File | Tool | What It Provides |
|---|---|---|
| `.healthcheck/toolchain/hadolint.json` | hadolint | Dockerfile lint findings (base image pinning, USER directive, COPY vs ADD, etc.) |
| `.healthcheck/toolchain/actionlint.json` | actionlint | GitHub Actions workflow lint findings (expression errors, unknown actions, deprecated syntax) |

If these files are absent (tool was not installed or not applicable), the skill falls back to its own heuristic analysis. Toolchain findings are imported with `confidence: deterministic`.

## Rubric Summary

| ID | Check | Severity | Confidence |
|---|---|---|---|
| BCI-01 | CI config presence | critical | native / heuristic |
| BCI-02 | Build reproducibility (lockfiles, pinned versions) | major-critical | native / heuristic |
| BCI-03 | Lint + typecheck + test in CI pipeline | major | native / heuristic |
| BCI-04 | Secrets handling via CI secret store | critical | native / heuristic |
| BCI-05 | Branch protection evidence | minor-major | heuristic |
| BCI-06 | Docker image security | major-critical | deterministic / native |

See `rubric.md` for full details on each check.

## Procedure

### Step 0: Detect CI System and Project Context

Check for CI config files: `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml`, `.travis.yml`, `bitbucket-pipelines.yml`, `azure-pipelines.yml`. Also detect Dockerfiles and docker-compose files.

Read `.healthcheck/toolchain/language-census.json` if available to determine the primary language and package manager.

### Step 1: BCI-01 — CI Config Presence

**Goal:** Verify that the project has a CI/CD pipeline configured.

**Detection:**

Check for any of the CI config files listed in Step 0. Also check for:
- Makefile with CI-related targets (`test`, `lint`, `build`, `ci`)
- `package.json` scripts containing CI-related commands
- `.github/actions/` custom composite actions

If NO CI configuration is found at all:
- **critical** — "No CI/CD pipeline configuration detected"

If CI config exists but appears to be a skeleton (< 10 lines, no steps/jobs defined):
- **major** — "CI config exists but appears to be an empty skeleton"

### Step 2: BCI-02 — Build Reproducibility

**Goal:** Verify that builds are reproducible across environments through lockfiles and pinned tool versions.

**Detection — Lockfiles:**

| Package Manager | Manifest | Expected Lockfile |
|---|---|---|
| npm | package.json | package-lock.json |
| yarn (v1) | package.json | yarn.lock |
| yarn (berry) | package.json | yarn.lock + .yarnrc.yml |
| pnpm | package.json | pnpm-lock.yaml |
| bun | package.json | bun.lockb |
| pip | requirements.txt | requirements.txt (with pinned versions) or pip.lock |
| pip | pyproject.toml | poetry.lock or pdm.lock or uv.lock |
| poetry | pyproject.toml | poetry.lock |
| Go | go.mod | go.sum |
| Cargo | Cargo.toml | Cargo.lock |
| Bundler | Gemfile | Gemfile.lock |
| Composer | composer.json | composer.lock |
| Maven | pom.xml | (no lockfile convention — skip) |
| Gradle | build.gradle | gradle.lockfile (optional — info only) |

For each manifest found:
- If the corresponding lockfile is missing: **critical** — "Lockfile missing for {manager}; builds are not reproducible"
- If the lockfile exists but is in `.gitignore`: **critical** — "Lockfile is gitignored; it must be committed for reproducible builds"

**Detection — Pinned Tool Versions in CI:**

For GitHub Actions workflows, check:
- `actions/setup-node@v4` with explicit `node-version` parameter
- `actions/setup-python@v5` with explicit `python-version` parameter
- `actions/setup-go@v5` with explicit `go-version` parameter
- Use of `.node-version`, `.nvmrc`, `.python-version`, `.tool-versions`, `.go-version` files

If a setup action is used without pinning the language version: **major** — "CI uses setup-node without pinning node-version; builds may break on runtime version changes"

**Detection — CI Install Command:**

Check that CI uses the frozen/locked install command:
- npm: `npm ci` (not `npm install`)
- yarn: `yarn --frozen-lockfile` or `yarn install --immutable`
- pnpm: `pnpm install --frozen-lockfile`
- pip: `pip install -r requirements.txt` (with pinned versions)
- poetry: `poetry install --no-update`

If CI uses `npm install` instead of `npm ci`: **major** — "CI uses `npm install` instead of `npm ci`; lockfile may be ignored"

### Step 3: BCI-03 — Lint + Typecheck + Test in CI Pipeline

**Goal:** Verify that the CI pipeline runs lint, type checking, and tests as quality gates.

**Detection — GitHub Actions (native):**

Parse each workflow YAML and look for steps that run:

| Quality Gate | Patterns |
|---|---|
| Lint | `eslint`, `flake8`, `pylint`, `ruff`, `golangci-lint`, `rubocop`, `clippy`, `npm run lint`, `yarn lint`, `pnpm lint`, `make lint` |
| Typecheck | `tsc --noEmit`, `tsc -b`, `mypy`, `pyright`, `pytype`, `npm run typecheck`, `yarn typecheck`, `make typecheck` |
| Test | `jest`, `vitest`, `pytest`, `go test`, `rspec`, `cargo test`, `npm test`, `yarn test`, `pnpm test`, `make test` |

For each missing quality gate:
- No lint step: **major** — "CI pipeline has no linting step"
- No typecheck step (and project uses a typed language): **major** — "CI pipeline has no type checking step"
- No test step: **major** — "CI pipeline has no test execution step"

If the project is untyped (plain JS without tsconfig.json, Python without mypy/pyright config): skip typecheck finding, emit **info** — "Consider adding type checking to improve CI quality gates"

**Detection — GitLab CI (native):**

Parse `.gitlab-ci.yml` for `script:` blocks matching the same patterns.

**Detection — Heuristic (Jenkins, CircleCI, etc.):**

Grep CI config files for the same patterns. Confidence: heuristic.

### Step 4: BCI-04 — Secrets Handling

**Goal:** Verify that secrets are managed through CI secret stores, not committed to the repository.

**Detection:**

1. **Hardcoded secrets in CI config:**
   Scan CI config files for patterns that look like inline secrets:
   - `password:`, `token:`, `secret:`, `api_key:` followed by a non-variable value
   - Base64-encoded strings > 40 chars that are not action references
   - If found: **critical** — "Possible hardcoded secret in CI config"

2. **Proper secret references:**
   Verify that sensitive values use the CI platform's secret store:
   - GitHub Actions: `${{ secrets.* }}`
   - GitLab CI: `$CI_*` variables or `variables:` section with `masked: true`
   - Jenkins: `credentials()`, `withCredentials`
   - CircleCI: `$CIRCLE_*` or context references

3. **Env files committed:**
   Check if `.env`, `.env.local`, `.env.production` files are committed (exist in git and not in `.gitignore`):
   - If `.env` with actual values (not just variable names) is committed: **critical** — ".env file with secrets committed to repository"
   - If `.env.example` or `.env.template` exists (with placeholder values): no finding (this is correct practice)

4. **Missing .gitignore entries:**
   Check `.gitignore` for common secret file patterns (`.env`, `*.pem`, `*.key`, `credentials.json`):
   - If `.gitignore` is missing or does not exclude secret file patterns: **major** — ".gitignore does not exclude common secret file patterns"

### Step 5: BCI-05 — Branch Protection Evidence

**Goal:** Check for evidence that the main branch has protection rules (cannot verify API-side, but can detect indicators).

**Detection:**

This check is inherently limited because branch protection is configured server-side. Look for evidence:

1. **CODEOWNERS file:** If `.github/CODEOWNERS` or `CODEOWNERS` exists, it implies review requirements are enforced: no finding.
2. **Required status checks:** If CI workflows use `on: pull_request` (not just `on: push`), this suggests PR-based workflow: no finding.
3. **Merge queue config:** If `.github/merge-queue.yml` or branch protection references exist: no finding.
4. **No evidence at all:** If the repo has no CODEOWNERS, CI only triggers on push (not PR), and no branch protection indicators exist:
   - **major** — "No evidence of branch protection; main branch may accept direct pushes"

If the repo has < 2 contributors (single-developer project), downgrade to **info**.

### Step 6: BCI-06 — Docker Image Security

**Goal:** Audit Dockerfiles for security best practices.

**Skip this step if no Dockerfile is present.**

**Detection — Deterministic (from hadolint):**

If `.healthcheck/toolchain/hadolint.json` exists, import findings directly. Map hadolint rules to severity:

| Hadolint Rule | Tenet Severity |
|---|---|
| DL3006 (no tag on FROM) | major |
| DL3007 (using :latest tag) | major |
| DL3002 (last USER should not be root) | critical |
| DL3003 (use WORKDIR instead of cd) | minor |
| DL3008 (pin apt versions) | minor |
| DL3009 (delete apt lists) | minor |
| DL3013 (pin pip versions) | minor |
| DL3018 (pin apk versions) | minor |
| DL3025 (use JSON for CMD) | minor |
| DL3042 (avoid cache in pip install) | info |
| DL4006 (set SHELL for pipefail) | minor |

**Detection — Native (no hadolint):**

Parse each Dockerfile and check:

1. **No USER directive (running as root):**
   If Dockerfile has no `USER` instruction, or the last `USER` is `root`:
   - **critical** — "Docker image runs as root; container escapes escalate to host-level access"

2. **Unpinned FROM tag:**
   If `FROM` uses `:latest` or has no tag at all (e.g., `FROM node`):
   - **major** — "FROM image is not pinned; builds may break when upstream updates"

   If `FROM` uses a tag but not a digest (e.g., `FROM node:20` vs `FROM node:20@sha256:...`):
   - **info** — "Consider pinning FROM image by digest for maximum reproducibility"

3. **Large base image:**
   If `FROM` uses a non-slim, non-alpine, non-distroless base (e.g., `FROM ubuntu:22.04`, `FROM node:20`):
   - **minor** — "Consider using a minimal base image (alpine, slim, or distroless) to reduce attack surface"

4. **COPY vs ADD:**
   If `ADD` is used for local files (not URLs, not tar extraction):
   - **minor** — "Use COPY instead of ADD for local files; ADD has implicit behaviors"

5. **No .dockerignore:**
   If a Dockerfile exists but `.dockerignore` is missing:
   - **minor** — "No .dockerignore file; build context may include unnecessary files"

**Detection — docker-compose:**

Check `docker-compose.yml` / `docker-compose.yaml` for:
- Services with `privileged: true`: **critical** — "Docker Compose service runs in privileged mode"
- Services with `network_mode: host`: **major** — "Docker Compose service uses host networking; container isolation is bypassed"
- Hardcoded environment values that look like secrets: **critical** — "Possible hardcoded secret in docker-compose environment"

### Step 7: Compile Findings and Score

1. Collect all findings from Steps 1-6
2. Import toolchain findings from hadolint and actionlint (with `confidence: deterministic`)
3. Deduplicate — if hadolint and native analysis flag the same issue, keep the deterministic finding
4. Apply severity counts:
   - Start at **100**
   - Subtract: `5 x critical + 2 x major + 0.5 x minor`
   - Floor at **0**, ceil at **100**, round to integer
5. Info findings do NOT affect the score

### Step 8: Write Report

Write `.healthcheck/reports/build-ci.json` conforming to the dimension report schema:

```json
{
  "key": "build-ci",
  "score": 65,
  "weight": 1.0,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "GitHub Actions CI present with lint and test steps but no typecheck. Lockfile committed. Dockerfile runs as root. No CODEOWNERS file.",
  "metrics": {
    "ci_system": "github-actions",
    "workflow_count": 3,
    "has_lockfile": true,
    "lockfile_committed": true,
    "ci_install_frozen": true,
    "has_lint_step": true,
    "has_typecheck_step": false,
    "has_test_step": true,
    "secrets_in_ci_config": 0,
    "has_codeowners": false,
    "dockerfile_count": 2,
    "docker_runs_as_root": true,
    "docker_from_pinned": false,
    "hadolint_available": true,
    "actionlint_available": true
  },
  "findings": [ ... ]
}
```

## Confidence Tiers

| Tier | Meaning | Used When |
|---|---|---|
| `deterministic` | Imported from hadolint or actionlint toolchain output | Toolchain findings available |
| `native` | Full YAML/Dockerfile parsing by this skill | GitHub Actions, GitLab CI, Dockerfile analysis |
| `heuristic` | Grep/regex pattern matching | Jenkins, CircleCI, other CI systems |

## Output

- `.healthcheck/reports/build-ci.json` — dimension report with score, metrics, and findings

## Constraints

- NEVER score a project that has no CI config as applicable: false — having no CI IS the finding (critical). The dimension is applicable; the score is low.
- ALWAYS import toolchain findings (hadolint, actionlint) when available rather than re-deriving them
- ALWAYS deduplicate when both toolchain and native analysis detect the same issue — prefer deterministic confidence
- ALWAYS include a `fix_prompt` on every finding — no exceptions
- Scoring math is pure arithmetic — no LLM judgment in the score computation
- Respect `.gitignore` — only scan files tracked by git
- Do NOT make API calls to GitHub/GitLab to check branch protection — only check for in-repo evidence
- If the project has no CI config and no Dockerfile, the dimension is still applicable (BCI-01 fires as critical)
- Confidence must be set accurately: `deterministic` for toolchain imports, `native` for GitHub Actions/GitLab CI/Docker, `heuristic` for Jenkins/CircleCI/others

## fix_prompt Examples

### Example 1: Missing Lockfile

**Finding:**
```json
{
  "dimension": "build-ci",
  "severity": "critical",
  "title": "No package-lock.json committed; builds are not reproducible",
  "description": "The project has a package.json but no package-lock.json (or yarn.lock, pnpm-lock.yaml). Without a lockfile, npm install resolves dependencies at build time using semver ranges, meaning different builds on different machines or at different times may install different dependency versions. This causes 'works on my machine' bugs and makes security auditing impossible.",
  "file": "package.json",
  "line": null,
  "snippet": null,
  "fix_prompt": "# Fix: Commit a lockfile for reproducible builds\n\n## Context\nThe project has package.json but no lockfile committed. Dependency resolution is non-deterministic across environments.\n\n## Location\n- File: package.json (project root)\n- Line: N/A\n- Dimension: build-ci / critical\n\n## Current behavior\nRunning `npm install` resolves dependency versions using semver ranges in package.json. Two installs at different times may produce different node_modules trees.\n\n## Required change\n1. Determine which package manager the team uses (check for references in scripts, CI config, or README):\n   - npm: Generate `package-lock.json` by running `npm install`\n   - yarn: Generate `yarn.lock` by running `yarn install`\n   - pnpm: Generate `pnpm-lock.yaml` by running `pnpm install`\n2. Ensure the lockfile is NOT in `.gitignore`\n3. Commit the lockfile: `git add package-lock.json && git commit -m 'chore: add package-lock.json for reproducible builds'`\n4. Update CI to use the frozen install command:\n   - npm: `npm ci` (not `npm install`)\n   - yarn: `yarn --frozen-lockfile`\n   - pnpm: `pnpm install --frozen-lockfile`\n\n## Constraints\n- Do not switch package managers without team consensus\n- If both package-lock.json and yarn.lock exist, remove one to avoid confusion\n- Ensure CI uses the frozen install variant so lockfile drift is caught\n\n## Verification\n- `ls package-lock.json` (or yarn.lock / pnpm-lock.yaml) should exist\n- `grep -q 'package-lock' .gitignore` should return no match\n- `rm -rf node_modules && npm ci` should succeed without modifying the lockfile\n- `git diff package-lock.json` should show no changes after a clean install",
  "confidence": "native"
}
```

### Example 2: Docker Image Running as Root

**Finding:**
```json
{
  "dimension": "build-ci",
  "severity": "critical",
  "title": "Docker image runs as root user",
  "description": "Dockerfile has no USER directive, meaning the container process runs as root (UID 0). If an attacker exploits a vulnerability in the application, they gain root access inside the container. Combined with a container escape vulnerability, this escalates to host-level root access. Running as a non-root user is a fundamental container security requirement.",
  "file": "Dockerfile",
  "line": null,
  "snippet": "FROM node:20\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD [\"node\", \"dist/index.js\"]",
  "fix_prompt": "# Fix: Run Docker container as non-root user\n\n## Context\nThe Dockerfile does not set a USER directive. The application runs as root inside the container, violating container security best practices.\n\n## Location\n- File: Dockerfile\n- Line: N/A\n- Dimension: build-ci / critical\n\n## Current behavior\n```dockerfile\nFROM node:20\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD [\"node\", \"dist/index.js\"]\n```\nNo USER instruction means the process runs as root (UID 0).\n\n## Required change\n1. Create a non-root user and group in the Dockerfile\n2. Set ownership of application files to the new user\n3. Switch to the non-root user before CMD\n4. Updated Dockerfile:\n   ```dockerfile\n   FROM node:20-slim\n   WORKDIR /app\n\n   # Create non-root user\n   RUN groupadd --gid 1001 appuser && \\\n       useradd --uid 1001 --gid 1001 --shell /bin/false --create-home appuser\n\n   COPY --chown=appuser:appuser . .\n   RUN npm ci --omit=dev\n\n   USER appuser\n   CMD [\"node\", \"dist/index.js\"]\n   ```\n5. If the app needs to bind to port < 1024, either:\n   - Use a port >= 1024 (e.g., 3000, 8080)\n   - Use `setcap` to grant the binary the `net_bind_service` capability\n\n## Constraints\n- Ensure the non-root user has read access to all application files\n- If the app writes to the filesystem (logs, uploads), ensure the target directory is writable by the non-root user\n- Do not use UID 0 or username 'root' for the USER directive\n- Test that the application starts correctly as the non-root user\n\n## Verification\n- `docker build -t myapp . && docker run --rm myapp whoami` should print 'appuser' (not 'root')\n- `docker run --rm myapp id` should show uid=1001\n- Application should start and serve requests correctly\n- `hadolint Dockerfile` should not report DL3002",
  "confidence": "native"
}
```

### Example 3: No Test Step in CI

**Finding:**
```json
{
  "dimension": "build-ci",
  "severity": "major",
  "title": "CI pipeline has no test execution step",
  "description": "The GitHub Actions workflow .github/workflows/ci.yml runs build and lint steps but does not execute the test suite. The CI green checkmark currently does not guarantee that tests pass, meaning broken tests can be merged without detection. This undermines the purpose of CI as a quality gate.",
  "file": ".github/workflows/ci.yml",
  "line": null,
  "snippet": "steps:\n  - uses: actions/checkout@v4\n  - uses: actions/setup-node@v4\n  - run: npm ci\n  - run: npm run lint\n  - run: npm run build",
  "fix_prompt": "# Fix: Add test execution to CI pipeline\n\n## Context\nThe CI workflow builds and lints but never runs tests. Merging broken code is undetected by CI.\n\n## Location\n- File: .github/workflows/ci.yml\n- Line: N/A\n- Dimension: build-ci / major\n\n## Current behavior\n```yaml\nsteps:\n  - uses: actions/checkout@v4\n  - uses: actions/setup-node@v4\n  - run: npm ci\n  - run: npm run lint\n  - run: npm run build\n```\nNo test step exists. CI passes even when tests fail.\n\n## Required change\n1. Add a test step after lint and before or after build:\n   ```yaml\n   steps:\n     - uses: actions/checkout@v4\n     - uses: actions/setup-node@v4\n       with:\n         node-version: '20'\n     - run: npm ci\n     - run: npm run lint\n     - run: npm run typecheck\n     - run: npm test\n     - run: npm run build\n   ```\n2. If the project uses a test runner that needs configuration (e.g., database for integration tests):\n   - Add service containers for dependencies\n   - Set environment variables for test database URLs\n3. If the project has separate unit and integration test commands, run both:\n   ```yaml\n   - run: npm run test:unit\n   - run: npm run test:integration\n   ```\n4. Optionally add coverage reporting:\n   ```yaml\n   - run: npm test -- --coverage\n   - uses: codecov/codecov-action@v4\n   ```\n\n## Constraints\n- Do not remove existing lint or build steps\n- Ensure tests run after dependency installation\n- If tests require environment variables, use GitHub Actions secrets (not hardcoded values)\n- The test step must fail the workflow if any test fails (default behavior for most runners)\n\n## Verification\n- Push a commit that breaks a test — CI should fail\n- Push a commit that fixes all tests — CI should pass\n- `gh run list --workflow=ci.yml` should show the test step in recent runs",
  "confidence": "native"
}
```
