---
name: tenet-release-ops
description: "Audits release and operational readiness: deploy strategy, rollback path, feature flags, environment config drift, release notes, versioning, incident runbooks, SLO/error-budget signals, and production smoke checks."
when_to_use: "Release audit, deployment readiness, rollback plan, feature flags, runbook review, production smoke tests, tenet release-ops"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Release Operations

Audits whether changes can be shipped, observed, and rolled back safely. This complements `tenet-build-ci` by focusing on production release mechanics after CI turns green.

## Language Support Matrix

```yaml
support:
  native: [yaml, json, markdown, dockerfile, shell]
  heuristic: [typescript, javascript, python, go, ruby, java]
```

## Procedure

### Step 0: Detect Applicability

Applicable when the project appears deployable: Dockerfile, deployment workflow, package publish config, server entrypoint, infrastructure config, or release docs.

If the repo is a small library with no deployment/publish path, write `score: null`, `applicable: false`.

### Step 1: Deployment Strategy

Check deployment workflows and docs for:
- manual deploys with no checklist
- direct deploy to production from local machine
- no environment promotion path
- no smoke test after deploy

Severity:
- `critical`: production deploy bypasses CI or uses unreviewed local state
- `major`: no smoke test, promotion, or release gate for deployable app
- `minor`: deploy flow exists but docs are stale or incomplete

### Step 2: Rollback and Recovery

Search for rollback commands, image tags, database rollback notes, release runbooks, and incident procedures.

Severity:
- `critical`: no rollback path for production deploys with migrations or external state
- `major`: rollback exists for app code but not database/config/state
- `minor`: rollback doc exists but lacks owner, expected duration, or validation

### Step 3: Feature Flags and Progressive Delivery

Check for flag providers/config and whether risky features can be disabled without redeploy.

Severity:
- `major`: critical-path feature changes have no flag/kill-switch pattern
- `minor`: flags exist but no cleanup/ownership metadata
- `info`: flag debt cleanup policy missing

### Step 4: Runtime Config Drift

Compare `.env.example`, deployment manifests, CI environment settings, and docs.

Severity:
- `major`: required runtime env var is used in code but missing from deployment config/docs
- `minor`: env vars documented inconsistently across files
- `critical`: production secret/config value appears hardcoded in deployment scripts

### Step 5: Versioning and Release Artifacts

Check changelog, version tags, image tags, package versions, release notes, and artifact retention.

Severity:
- `major`: no immutable artifact/version for production releases
- `minor`: changelog or release notes absent for app with regular releases
- `info`: versioning exists but is not automated

### Step 6: Operational Runbooks

Look for incident, on-call, SLO, alert, and smoke-check docs.

Severity:
- `major`: production service has no runbook or smoke checks
- `minor`: runbook exists but misses dependencies or rollback validation
- `info`: SLO/error-budget docs missing

### Step 7: Compile and Score

Every finding uses:
- `dimension: "release-ops"`
- `confidence: "native"` for parsed workflow/config/docs, `heuristic` for grep-only checks
- `Line: N/A` for project-level release-process gaps

## Output

- `.healthcheck/reports/release-ops.json`

## Constraints

- Scale expectations by project type. A published library needs versioning and changelog; a service needs deploy, rollback, smoke checks, and runbooks.
- Do not duplicate CI lint/test findings; those belong in `tenet-build-ci`.
- Prefer fix_prompts that create lightweight runbooks/checklists over heavyweight process.
