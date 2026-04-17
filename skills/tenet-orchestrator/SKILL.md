---
name: tenet-orchestrator
description: "Main entry point for Tenet audits. Coordinates all dimension skills, aggregates findings into a single report, and uploads to the Tenet dashboard. Use this to run a full health audit on the current project."
when_to_use: "Run a Tenet audit, healthcheck, health check, project audit, code quality audit, run tenet, tenet report"
disable-model-invocation: true
model: opus
allowed-tools: Bash Read Write Glob Grep Skill Agent
argument-hint: "[--setup] [--dimensions security,complexity,...] [--skip-upload] [--dry-run]"
---

# Tenet Orchestrator

> *"I build in a twilight world."*

The orchestrator is the single entry point for Tenet audits. Users invoke only this skill — it coordinates the toolchain, runs applicable dimension skills, aggregates findings into a single report, and uploads to the Tenet dashboard.

## Purpose

Coordinates the full audit lifecycle: project detection → config validation → deterministic toolchain → specialist dimension skills → report aggregation → dashboard upload.

## Language Support Matrix

```yaml
support:
  native: [all]
  note: "The orchestrator delegates to specialist skills. Language support is determined per-dimension."
```

## Toolchain Inputs

The orchestrator invokes `tenet-toolchain` to produce all toolchain outputs, then passes control to specialist skills that consume them.

## Procedure

### Step 0: Parse Arguments

Parse `$ARGUMENTS` for flags:
- `--setup` → invoke `tenet-skills:tenet-toolchain-setup` and halt
- `--dimensions <comma-list>` → only run specified dimensions
- `--skip-upload` → produce report but don't POST to dashboard
- `--dry-run` → show what would run without running anything

### Step 1: Detect Project Metadata

```bash
# Project slug (kebab-case from directory name)
SLUG=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

# Human-readable name (from package.json if available, else directory name)
NAME=$(jq -r '.name // empty' package.json 2>/dev/null || basename "$(pwd)")

# Git metadata
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
REPO_URL=$(git remote get-url origin 2>/dev/null || echo "")
```

### Step 2: Check for Configuration

If `.healthcheck.toml` does NOT exist:
1. Print: "No `.healthcheck.toml` found. Running first-time setup..."
2. Invoke `tenet-skills:tenet-toolchain-setup`
3. After setup completes, tell the user: "Review `.healthcheck.toml` and re-run `/tenet-skills:tenet-orchestrator`"
4. **HALT** — do not proceed without config

### Step 3: Invoke Toolchain

Invoke `tenet-skills:tenet-toolchain` to run all deterministic tools.

This produces:
- `.healthcheck/toolchain/*.json` — per-tool normalized findings
- `.healthcheck/toolchain/language-census.json` — language breakdown
- `.healthcheck/toolchain/_summary.json` — tool execution summary

If the toolchain fails (e.g., a required tool is missing), halt and report the error.

### Step 4: Determine Applicable Dimensions

Read `language-census.json` and `.healthcheck.toml` to determine which dimensions to run:

| Dimension | Skip if... |
|---|---|
| security | Never skipped |
| complexity | Never skipped |
| solid | Never skipped |
| performance | Never skipped |
| dependencies | No manifest files (package.json, requirements.txt, go.mod, etc.) |
| debt | Never skipped |
| testing | Never skipped |
| docs | Never skipped |
| accessibility | No HTML/JSX/TSX/Vue/Svelte files |
| api-contract | No API route handlers, OpenAPI schemas, or tRPC routers detected |
| secrets | Never skipped |
| errors | Never skipped |
| observability | Never skipped |
| build-ci | No CI config files (.github/workflows/, .gitlab-ci.yml, Jenkinsfile) |

Also check `[dimensions]` section of `.healthcheck.toml` for explicit `"off"` overrides.

If `--dimensions` flag was passed, intersect with the applicable set.

Log which dimensions are skipped and why.

### Step 5: Run Specialist Skills

For each applicable dimension, invoke the specialist skill:
- `tenet-skills:tenet-security`
- `tenet-skills:tenet-complexity`
- `tenet-skills:tenet-solid`
- `tenet-skills:tenet-performance`
- `tenet-skills:tenet-dependencies`
- `tenet-skills:tenet-debt`
- `tenet-skills:tenet-testing`
- `tenet-skills:tenet-docs`
- `tenet-skills:tenet-accessibility`
- `tenet-skills:tenet-api-contract`
- `tenet-skills:tenet-secrets`
- `tenet-skills:tenet-errors`
- `tenet-skills:tenet-observability`
- `tenet-skills:tenet-build-ci`

Each skill writes its output to `.healthcheck/reports/{dimension}.json`.

### Step 6: Aggregate Report

Read all dimension reports and aggregate into the final payload matching the schema in `shared/schema.json`:

```json
{
  "project": {
    "slug": "<slug>",
    "name": "<name>",
    "repo_url": "<repo_url or null>",
    "commit": "<short SHA>",
    "branch": "<branch>"
  },
  "run": {
    "started_at": "<ISO-8601>",
    "completed_at": "<ISO-8601>",
    "orchestrator_version": "1.0.0",
    "dimensions_run": ["security", "complexity", ...],
    "toolchain_summary": { ... }
  },
  "dimensions": [ ... ],
  "findings": [ ... ]
}
```

Apply dimension weights from `.healthcheck.toml` `[weights]` section, falling back to defaults:

| Dimension | Default Weight |
|---|---|
| security | 1.5 |
| secrets | 1.5 |
| dependencies | 1.3 |
| errors | 1.3 |
| solid | 1.1 |
| complexity | 1.1 |
| debt | 1.1 |
| testing | 1.1 |
| performance | 1.0 |
| api-contract | 1.0 |
| observability | 1.0 |
| build-ci | 1.0 |
| docs | 0.8 |
| accessibility | 0.8 |

### Step 7: Upload or Print

Read `HEALTHCHECK_DASHBOARD_URL` and `HEALTHCHECK_API_TOKEN` from environment.

**If both are set:**
```bash
curl -s -o /tmp/tenet-response.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer ${HEALTHCHECK_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @.healthcheck/reports/final-report.json \
  "${HEALTHCHECK_DASHBOARD_URL}/api/v1/reports"
```

On success (2xx): Print the dashboard URL for the project.
On failure (4xx/5xx): Save payload to `.healthcheck/reports/last-upload.json` and print the curl command for manual retry.

**If env vars are missing:**
Print the full JSON report to stdout and instruct:
```
Dashboard upload skipped — set these environment variables to enable:
  export HEALTHCHECK_DASHBOARD_URL=http://localhost:8787
  export HEALTHCHECK_API_TOKEN=your-token-here
```

### Step 8: Print Summary Table

```
╭─────────────────┬───────┬───────┬────────────────────────────────╮
│ Dimension       │ Score │ Delta │ Findings (C/M/m/i)             │
├─────────────────┼───────┼───────┼────────────────────────────────┤
│ security        │  85   │  +5   │ 0 / 3 / 2 / 1                 │
│ complexity      │  72   │  -3   │ 0 / 2 / 16 / 0                │
│ solid           │  90   │   0   │ 0 / 1 / 4 / 2                 │
│ ...             │       │       │                                │
├─────────────────┼───────┼───────┼────────────────────────────────┤
│ COMPOSITE       │  81   │  +1   │ 1 / 14 / 32 / 8               │
╰─────────────────┴───────┴───────┴────────────────────────────────╯

Toolchain: semgrep ✓  gitleaks ✓  eslint ✓  npm_audit ✓  (4/6 tools ran)
Report: .healthcheck/reports/final-report.json
Dashboard: http://localhost:8787/projects/my-project
```

Delta is computed by comparing against `.healthcheck/reports/previous-report.json` if it exists. Before writing the new final report, copy the current one to `previous-report.json`.

## Output

- `.healthcheck/reports/final-report.json` — the complete aggregated report
- `.healthcheck/reports/previous-report.json` — the prior run (for delta computation)
- `.healthcheck/reports/last-upload.json` — saved on upload failure for manual retry

## Constraints

- NEVER proceed without `.healthcheck.toml` — always run setup first
- ALWAYS run `tenet-toolchain` before any specialist skill
- Specialist skills are invoked via the Skill tool, not by reading their SKILL.md directly
- The composite score is the weighted average of all applicable dimension scores
- Scoring math is pure — no LLM judgment in arithmetic
- If a specialist skill fails, log the error, mark that dimension as `applicable: false` with a note, and continue

## fix_prompt Templates

The orchestrator does not produce its own findings. All findings come from specialist skills.
