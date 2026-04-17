# Tenet Build & CI — Rubric

Detailed rubric for the build-ci dimension. Each check has a unique ID, detection strategy per platform, severity mapping, and scoring impact.

## Scoring Formula

```
score = 100 - (5 x critical) - (2 x major) - (0.5 x minor)
Floor: 0 | Ceil: 100 | Round to integer
Info findings do NOT affect the score.
```

---

## BCI-01: CI Config Presence

**What it checks:** Whether the project has any CI/CD pipeline configuration.

**Why it matters:** Without CI, there is no automated quality gate. Code merges to main without lint, test, or build verification. Bugs, regressions, and security issues ship silently.

| Condition | Severity | Score Impact |
|---|---|---|
| No CI config files found anywhere in the repo | critical | -5 |
| CI config exists but is an empty skeleton (< 10 lines, no jobs) | major | -2 |
| CI config present and has at least one job | (no finding) | 0 |

**Recognized CI config files:**

| CI System | Config Location | Confidence |
|---|---|---|
| GitHub Actions | `.github/workflows/*.yml` / `.github/workflows/*.yaml` | native |
| GitLab CI | `.gitlab-ci.yml` | native |
| Jenkins | `Jenkinsfile`, `jenkins/Jenkinsfile` | heuristic |
| CircleCI | `.circleci/config.yml` | heuristic |
| Travis CI | `.travis.yml` | heuristic |
| Bitbucket Pipelines | `bitbucket-pipelines.yml` | heuristic |
| Azure DevOps | `azure-pipelines.yml` | heuristic |
| Drone CI | `.drone.yml` | heuristic |
| Buildkite | `.buildkite/pipeline.yml` | heuristic |

---

## BCI-02: Build Reproducibility

**What it checks:** Whether builds produce the same output given the same inputs — through lockfiles, pinned tool versions, and frozen install commands.

**Why it matters:** Non-reproducible builds cause "works on my machine" failures, make security auditing unreliable (you cannot verify what was actually deployed), and introduce non-determinism into incident response.

### BCI-02a: Lockfile Presence

| Condition | Severity | Score Impact |
|---|---|---|
| Manifest exists but lockfile is missing | critical | -5 |
| Lockfile exists but is in .gitignore | critical | -5 |
| Lockfile present and committed | (no finding) | 0 |

**Manifest-to-lockfile mapping:**

| Package Manager | Manifest File | Expected Lockfile |
|---|---|---|
| npm | package.json | package-lock.json |
| yarn (v1/berry) | package.json | yarn.lock |
| pnpm | package.json | pnpm-lock.yaml |
| bun | package.json | bun.lockb |
| pip (requirements) | requirements.txt | (self — check for pinned versions `==`) |
| poetry | pyproject.toml | poetry.lock |
| pdm | pyproject.toml | pdm.lock |
| uv | pyproject.toml | uv.lock |
| Go | go.mod | go.sum |
| Cargo | Cargo.toml | Cargo.lock |
| Bundler | Gemfile | Gemfile.lock |
| Composer | composer.json | composer.lock |
| Maven | pom.xml | (no convention — skip) |
| Gradle | build.gradle | gradle.lockfile (info only) |

For `requirements.txt`, check whether versions are pinned with `==`. If > 50% of entries use `>=` or have no version specifier: **major** — "requirements.txt uses unpinned version ranges"

### BCI-02b: Pinned Tool Versions in CI

| Condition | Severity | Score Impact |
|---|---|---|
| Setup action used without explicit version parameter | major | -2 |
| Version file present (.nvmrc, .tool-versions, etc.) | (no finding) | 0 |
| Setup action with explicit version parameter | (no finding) | 0 |

**Checked setup actions (GitHub Actions):**

- `actions/setup-node` — requires `node-version` or `.nvmrc` / `.node-version`
- `actions/setup-python` — requires `python-version` or `.python-version`
- `actions/setup-go` — requires `go-version` or `.go-version` / `go.mod`
- `actions/setup-java` — requires `java-version`
- `actions/setup-dotnet` — requires `dotnet-version`
- `ruby/setup-ruby` — requires `ruby-version` or `.ruby-version`

### BCI-02c: Frozen Install in CI

| Condition | Severity | Score Impact |
|---|---|---|
| CI uses `npm install` instead of `npm ci` | major | -2 |
| CI uses `yarn install` without `--frozen-lockfile` or `--immutable` | major | -2 |
| CI uses `pnpm install` without `--frozen-lockfile` | major | -2 |
| CI uses the correct frozen command | (no finding) | 0 |

---

## BCI-03: Quality Gates in CI Pipeline

**What it checks:** Whether the CI pipeline includes lint, typecheck, and test steps.

**Why it matters:** A CI pipeline that only builds is a deployment pipe, not a quality gate. Without lint, style regressions accumulate. Without typecheck, type errors ship. Without tests, regressions go undetected. The green checkmark must mean something.

| Condition | Severity | Score Impact |
|---|---|---|
| No lint step in CI | major | -2 |
| No typecheck step (typed language project) | major | -2 |
| No typecheck step (untyped language project) | info | 0 |
| No test step in CI | major | -2 |
| All three present | (no finding) | 0 |

**Lint detection patterns:**

| Language | Commands / Tools |
|---|---|
| TS/JS | eslint, biome, rome, standard, xo, `npm run lint`, `yarn lint` |
| Python | flake8, pylint, ruff, black --check, isort --check |
| Go | golangci-lint, go vet, staticcheck |
| Ruby | rubocop |
| Rust | cargo clippy |
| General | `make lint`, `lint` in script name |

**Typecheck detection patterns:**

| Language | Commands / Tools |
|---|---|
| TypeScript | tsc --noEmit, tsc -b, `npm run typecheck`, `yarn typecheck` |
| Python | mypy, pyright, pytype |
| Go | (go vet covers this — no separate step needed) |
| Rust | (cargo check covers this — no separate step needed) |

**Test detection patterns:**

| Language | Commands / Tools |
|---|---|
| TS/JS | jest, vitest, mocha, ava, tap, `npm test`, `yarn test` |
| Python | pytest, unittest, nose2, `python -m pytest` |
| Go | go test |
| Ruby | rspec, minitest, `bundle exec rspec` |
| Rust | cargo test |
| General | `make test`, `test` in script name |

---

## BCI-04: Secrets Handling

**What it checks:** Whether secrets are managed via CI secret stores rather than committed to the repository.

**Why it matters:** Secrets committed to git are in the reflog forever, visible to anyone with repo access, and exposed in CI logs. This is the most common root cause of credential breaches.

| Condition | Severity | Score Impact |
|---|---|---|
| Hardcoded secret value in CI config | critical | -5 |
| .env file with values committed to repo | critical | -5 |
| .gitignore missing exclusions for secret file patterns | major | -2 |
| Secrets properly referenced via CI secret store | (no finding) | 0 |

**Hardcoded secret detection patterns in CI:**

- Values assigned to keys named `password`, `token`, `secret`, `api_key`, `apikey`, `auth`, `credential` that are literal strings (not variable references)
- GitHub Actions: value is not `${{ secrets.* }}` or `${{ vars.* }}`
- GitLab CI: value is not `$CI_*` or marked `masked: true`
- Any string that looks like a bearer token, AWS key, or API key (length/pattern heuristic)

**.gitignore patterns to check:**

```
.env
.env.*
*.pem
*.key
*.p12
*.pfx
credentials.json
service-account.json
```

---

## BCI-05: Branch Protection Evidence

**What it checks:** Whether there is in-repo evidence that the main branch has protection rules (code review required, status checks required).

**Why it matters:** Without branch protection, anyone with write access can push directly to main, bypassing code review and CI. This is the last line of defense against shipping unreviewed code.

| Condition | Severity | Score Impact |
|---|---|---|
| No CODEOWNERS, no PR-triggered CI, no protection indicators | major | -2 |
| Single-developer project with no protection indicators | info | 0 |
| CODEOWNERS present or CI triggers on pull_request | (no finding) | 0 |

**Evidence indicators:**

| Indicator | What It Implies |
|---|---|
| `.github/CODEOWNERS` or `CODEOWNERS` | Review requirements are configured |
| CI workflow with `on: pull_request` trigger | PR-based workflow is in use |
| `.github/merge-queue.yml` | Merge queue implies strict protection |
| `branch_protection_rules` in Terraform/Pulumi IaC | Protection configured as code |
| `required_status_checks` in repo config | Status checks enforced |

**Confidence:** Always heuristic (cannot verify server-side settings from repo contents alone).

---

## BCI-06: Docker Image Security

**What it checks:** Whether Dockerfiles follow security best practices — non-root user, pinned base images, minimal base, no privileged containers.

**Why it matters:** Container security is the outermost defense layer for deployed applications. Running as root, using unpinned images, and granting excessive privileges all increase blast radius when vulnerabilities are exploited.

### BCI-06a: Root User

| Condition | Severity | Score Impact |
|---|---|---|
| No USER directive in Dockerfile | critical | -5 |
| Last USER directive is `root` | critical | -5 |
| USER directive sets a non-root user | (no finding) | 0 |

### BCI-06b: FROM Image Pinning

| Condition | Severity | Score Impact |
|---|---|---|
| FROM uses `:latest` tag | major | -2 |
| FROM has no tag at all (e.g., `FROM node`) | major | -2 |
| FROM uses a version tag without digest | (no finding) | 0 |
| FROM uses version tag with SHA256 digest | (no finding — best practice) | 0 |

### BCI-06c: Base Image Size

| Condition | Severity | Score Impact |
|---|---|---|
| FROM uses a full OS base (ubuntu, debian, centos) when slim/alpine alternative exists | minor | -0.5 |
| FROM uses slim or alpine variant | (no finding) | 0 |
| FROM uses distroless | (no finding — best practice) | 0 |

### BCI-06d: COPY vs ADD

| Condition | Severity | Score Impact |
|---|---|---|
| ADD used for local files (not URL, not tar extraction) | minor | -0.5 |
| COPY used for all local files | (no finding) | 0 |

### BCI-06e: .dockerignore

| Condition | Severity | Score Impact |
|---|---|---|
| Dockerfile exists but no .dockerignore | minor | -0.5 |
| .dockerignore present | (no finding) | 0 |

### BCI-06f: Docker Compose Security

| Condition | Severity | Score Impact |
|---|---|---|
| Service with `privileged: true` | critical | -5 |
| Service with `network_mode: host` | major | -2 |
| Hardcoded secret in docker-compose environment | critical | -5 |
| No issues found | (no finding) | 0 |

---

## Toolchain Integration

When toolchain output is available, import findings with `confidence: deterministic`:

### hadolint

File: `.healthcheck/toolchain/hadolint.json`

Map hadolint severity to Tenet severity:

| Hadolint Level | Tenet Severity |
|---|---|
| error | critical or major (depends on rule — see BCI-06 mapping) |
| warning | minor |
| info | info |
| style | info |

Deduplicate: if hadolint flags the same issue that native analysis would catch (e.g., DL3002 for root user), use the hadolint finding (deterministic) and suppress the native finding.

### actionlint

File: `.healthcheck/toolchain/actionlint.json`

Map actionlint findings:

| Pattern | Tenet Severity |
|---|---|
| Expression syntax error | major |
| Unknown action reference | major |
| Deprecated syntax | minor |
| Shell script issue | minor |
| Type mismatch in expressions | minor |

---

## Applicability Rules

| Condition | Result |
|---|---|
| No CI config AND no Dockerfile | Dimension is still applicable. BCI-01 fires as critical. |
| Only Dockerfile, no CI | Applicable. BCI-01 fires, BCI-06 checks run. |
| Only CI, no Dockerfile | Applicable. BCI-06 skipped. |
| Project has CI and Dockerfile | All checks run. |

This dimension is ALWAYS applicable. Having no CI is itself the finding.

## Dimension Metrics

The `metrics` object in the report should include:

```json
{
  "ci_system": "github-actions | gitlab-ci | jenkins | circleci | none",
  "workflow_count": 3,
  "has_lockfile": true,
  "lockfile_committed": true,
  "lockfile_type": "package-lock.json",
  "ci_install_frozen": true,
  "has_lint_step": true,
  "has_typecheck_step": false,
  "has_test_step": true,
  "secrets_in_ci_config": 0,
  "env_files_committed": 0,
  "has_codeowners": false,
  "ci_triggers_on_pr": true,
  "dockerfile_count": 2,
  "docker_runs_as_root": true,
  "docker_from_pinned": false,
  "docker_base_minimal": true,
  "has_dockerignore": true,
  "hadolint_available": true,
  "hadolint_finding_count": 5,
  "actionlint_available": true,
  "actionlint_finding_count": 2
}
```
