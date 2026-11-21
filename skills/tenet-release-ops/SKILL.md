---
name: tenet-release-ops
description: "Audits release readiness, rollback, feature flags, env drift, runbooks, SLOs, and smoke checks."
when_to_use: "tenet release-ops, tenet-release-ops dimension, Tenet release operations audit. Run via /tenet-skills:tenet-orchestrator or directly with /tenet-skills:tenet-release-ops."
model: sonnet
disable-model-invocation: true
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Release Operations

Audits whether changes can be shipped, observed, and rolled back safely. This complements `tenet-build-ci` by focusing on production release mechanics after CI turns green.

## Calibration — read first

Follow `shared/scan-discipline.md` (complete every step, enumerate rather than sample, and §2a:
report only issues that actually exist), `shared/verification.md` (every finding is confirmed
against the code before it ships; unconfirmed candidates are dropped, not demoted), and
`shared/severity.md` (severity is confirmed impact, never a hedge for doubt).

A finding must exist in this codebase on a path that can run. Do not report hypotheticals, dead
code, style preferences, or anything an upstream check already prevents. Zero findings for a step
is the normal result on healthy code; do not fill a step to show you looked. Do not overthink it:
read the code and its context, decide, move on.

## Language Support Matrix

```yaml
support:
  native: [yaml, json, markdown, dockerfile, shell]
  heuristic: [typescript, javascript, python, go, ruby, java]
```

## Procedure

### Step 0: Detect Applicability

Applicable when the project appears deployable: Dockerfile, deployment workflow, package publish config, server entrypoint, infrastructure config, or release docs.

Also applicable for apps released through a store or an updater: a `fastlane/` directory, an
Xcode project, a Flutter `pubspec.yaml` with a `version:`, a Sparkle appcast, a Tauri updater
config.

```bash
git ls-files -- '*Dockerfile*' '*docker-compose*' '*compose.y*ml' '.github/workflows/*' '*deploy*' '*release*' '*fastlane/*' '*appcast*' '*tauri.conf*' '*wrangler.*' '*fly.toml' '*vercel.json' '*netlify.toml' 'Procfile' '.deploy' | head -60
```

If the repo is a small library with no deployment/publish path, write `score: null`, `applicable: false`.

**Project scale.** Classify the project per `shared/project-scale.md` before scoring anything. Findings
marked *(scaled)* below are `info` at `solo` scale and keep the listed severity at `team` scale.


### Step 1: Deployment Strategy

Check deployment workflows and docs for:
- manual deploys with no checklist *(scaled)*
- direct deploy to production from a developer machine *(scaled)*
- no environment promotion path *(scaled)*
- no smoke test after deploy *(scaled)*
- a deploy script that ships whatever is in the working tree without checking it is committed,
  so the deployed code cannot be identified or rebuilt (not scaled)
- a deploy script that keeps going after a failed build, test or migration step: no `set -e`, an
  ignored exit status, `|| true` on a step that matters (not scaled)

Read every deploy script and workflow found in Step 0 end to end before deciding.

Severity:
- `critical`: production deploy bypasses CI or uses unreviewed local state *(scaled; at `solo` scale deploying from your own machine is the normal path)*
- `major`: a deploy script ships uncommitted state, or continues past a failed step
- `major`: no smoke test, promotion, or release gate for deployable app *(scaled)*
- `minor`: deploy flow exists but docs are stale or incomplete

### Step 2: Rollback and Recovery

Search for rollback commands, image tags, database rollback notes, release runbooks, and incident procedures.

Severity:
- `critical`: no rollback path for production deploys with migrations or external state *(scaled)*
- `major`: the rollback that exists cannot work: it redeploys old code against a schema an irreversible migration already changed, or references an image tag the build overwrites
- `major`: rollback exists for app code but not database/config/state *(scaled)*
- `minor`: rollback doc exists but lacks owner, expected duration, or validation *(scaled)*

### Step 3: Feature Flags and Progressive Delivery

Check for flag providers/config and whether risky features can be disabled without redeploy.

Severity:
- `major`: critical-path feature changes have no flag/kill-switch pattern *(scaled)*
- `minor`: flags exist but no cleanup/ownership metadata *(scaled)*
- `info`: flag debt cleanup policy missing

### Step 4: Runtime Config Drift

Compare `.env.example`, deployment manifests, CI environment settings, and docs. List every
variable the code reads, then check each against what the deploy provides:

```bash
git grep -noP "(process\.env\.|import\.meta\.env\.|os\.environ(\.get)?[\[(]\s*['\"]|os\.getenv\(\s*['\"]|env::var\(\s*\"|Deno\.env\.get\(\s*['\"]|c\.env\.)\K[A-Z][A-Z0-9_]+" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.rs' '*.go' ':!*.test.*' ':!*.spec.*' | awk -F: '{print $NF}' | sort -u
git ls-files -- '*.env.example' '*.env.sample' '*.env.template' '*docker-compose*' '*compose.y*ml' '*wrangler.*' '.github/workflows/*'
```

This is not scaled: a variable the code requires and the deploy never sets fails the same way for
one developer as for fifty.

Severity:
- `major`: required runtime env var is used in code but missing from deployment config/docs
- `minor`: env vars documented inconsistently across files
- `critical`: production secret/config value appears hardcoded in deployment scripts

### Step 5: Versioning and Release Artifacts

Check changelog, version tags, image tags, package versions, release notes, and artifact retention.

Severity:
- `major`: no immutable artifact/version for production releases *(scaled)*
- `major`: a store or updater release whose build number or version is not raised by the release path (fastlane lane, script or workflow), so an upload is rejected or an update is never offered
- `minor`: changelog or release notes absent for app with regular releases *(scaled)*
- `info`: versioning exists but is not automated

### Step 6: Operational Runbooks

Look for incident, on-call, SLO, alert, and smoke-check docs.

Severity:
- `major`: production service has no runbook or smoke checks *(scaled)*
- `minor`: runbook exists but misses dependencies or rollback validation *(scaled)*
- `info`: SLO/error-budget docs missing

### Step 7: Compile and Score

Every finding uses:
- `dimension: "release-ops"`
- `confidence: "native"` for parsed workflow/config/docs, `heuristic` for grep-only checks
- `fix_prompt` following `shared/fix_prompt_template.md`
- `Line: N/A` in the `fix_prompt` and top-level `line: null` for project-level release-process gaps
- Every `fix_prompt` Location section MUST include `- File:`, `- Line:`, and `- Dimension:` entries

## Output

- `.healthcheck/reports/release-ops.json`

## Constraints

- Scale expectations by project type. A published library needs versioning and changelog; a service needs deploy, rollback, smoke checks, and runbooks.
- Do not duplicate CI lint/test findings; those belong in `tenet-build-ci`.
- Prefer fix_prompts that create lightweight runbooks/checklists over heavyweight process.
