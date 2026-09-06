---
name: tenet-orchestrator
description: "Runs the full Tenet audit, coordinates dimensions, builds the report, and uploads to dashboard."
when_to_use: "Run a Tenet audit, healthcheck, project audit, code quality audit, run tenet, tenet report"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash Read Write Glob Grep Agent
argument-hint: "[fable|opus|sonnet|haiku] [no-upload] [dry-run] [--dimensions a,b,c] [--judge m] [--worker m]"
---

# Tenet Orchestrator

> *"I build in a twilight world."*

The orchestrator is the single entry point for Tenet audits. Users invoke only this skill — it runs the toolchain, spawns one isolated subagent per applicable dimension, aggregates their reports into a single payload, and uploads to the Tenet dashboard.

## Purpose

Coordinates the full audit lifecycle: project detection → config validation → deterministic toolchain → one subagent per dimension (parallel, model per tier) → report aggregation → dashboard upload.

The orchestrator itself does no auditing and never reads specialist SKILL.md files into its own context. It is arithmetic and plumbing, which is why it runs on `sonnet`. Reasoning happens inside the dimension subagents, on the model tier each dimension is assigned (Step 4b).

## Language Support Matrix

```yaml
support:
  native: [all]
  note: "The orchestrator delegates to specialist skills. Language support is determined per-dimension."
```

## Toolchain Inputs

The orchestrator runs `tenet-toolchain` (as a subagent) to produce all toolchain outputs, then spawns dimension subagents that consume them.

## Locating the plugin

Specialist skills are run by subagents that read `SKILL.md` from disk, so the orchestrator needs the plugin's absolute path. Resolve it once, in this order:

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ] || [ ! -f "$PLUGIN_ROOT/skills/tenet-orchestrator/SKILL.md" ]; then
  PLUGIN_ROOT=$(find ~/.claude/plugins ~/src ~/Development -maxdepth 6 -path '*/skills/tenet-orchestrator/SKILL.md' 2>/dev/null \
    | head -1 | sed 's#/skills/tenet-orchestrator/SKILL.md$##')
fi
[ -f "$PLUGIN_ROOT/shared/verification.md" ] || { echo "Cannot locate tenet-skills plugin root"; exit 1; }
```

Every path handed to a subagent is built from `$PLUGIN_ROOT`.

## Procedure

### Step 0: Parse Arguments

Parse `$ARGUMENTS`. Both `--flag` forms and bare words are accepted, in any order, so
`/tenet-skills:tenet-orchestrator fable no-upload` is valid:

| Argument | Bare-word form | Effect |
|---|---|---|
| `--judge <model>` | a bare model name: `fable`, `opus`, `sonnet`, `haiku` | Override `[models].judge` for this run only |
| `--worker <model>` | — | Override `[models].worker` for this run only |
| `--model <model>` | — | Override both tiers |
| `--skip-upload` | `no-upload`, `skip-upload`, `local` | Write `final-report.json` and print the report to the terminal; do not POST to the dashboard |
| `--dry-run` | `dry-run` | Show which dimensions would run, on which model, and which are skipped and why. Run nothing |
| `--dimensions <a,b,c>` | `dims=a,b,c` | Only run the listed dimensions (intersected with applicability) |

Model precedence, highest first: command-line argument → `[dimensions.<key>].model` → `[models]` tier → built-in default. Print the resolved model per dimension before spawning anything so the cost is visible up front.

Unknown bare words are an error: print the table above and halt. Do not guess.

There is no `--setup` flag. Setup is a user-invoked skill: `/tenet-skills:tenet-toolchain-setup`.

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
1. Print: "No `.healthcheck.toml` found. Run `/tenet-skills:tenet-toolchain-setup` first, review the generated config, then re-run `/tenet-skills:tenet-orchestrator`."
2. **HALT** — do not proceed without config. Do not attempt to invoke the setup skill yourself; it is interactive and user-invoked only.

### Step 3: Run Toolchain

Spawn one subagent (Agent tool, `model` = `[models].worker` from `.healthcheck.toml`, default `sonnet`; see Step 4b) with this prompt:

```
Read $PLUGIN_ROOT/skills/tenet-toolchain/SKILL.md and follow its procedure exactly against the
repository at $(pwd). Write the outputs it specifies under .healthcheck/toolchain/. Reply with
at most 10 lines: which tools ran, which were skipped and why, and the path of _summary.json.
Do not paste tool output.
```

This produces:
- `.healthcheck/toolchain/*.json` — per-tool normalized findings
- `.healthcheck/toolchain/language-census.json` — language breakdown
- `.healthcheck/toolchain/_summary.json` — tool execution summary

If the toolchain fails (e.g., a required tool is missing), halt and report the error.

### Step 4: Determine Applicable Dimensions

This step only prevents spawning subagents for dimensions that obviously cannot apply. Each specialist also runs its own applicability check in its Step 1 and will write `applicable: false` if it finds nothing to audit, so when unsure, run it. Decide from `language-census.json` and cheap file-presence checks (`git ls-files | grep -E ...`), never from reading source:

| Dimension | Skip if... |
|---|---|
| security | Never skipped |
| correctness | Census shows no application source language (docs/config/assets only) |
| complexity | Never skipped |
| solid | Never skipped |
| performance | Never skipped |
| dependencies | No manifest file tracked (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, `pom.xml`, `build.gradle*`, `Package.swift`, `pubspec.yaml`, `composer.json`, `*.csproj`) |
| debt | Never skipped |
| testing | Never skipped |
| docs | Never skipped |
| accessibility | Census has zero HTML/JSX/TSX/Vue/Svelte files |
| api-contract | No file matching `openapi*`, `swagger*`, `*.graphql`, `schema.gql`, or `routes?/`, `api/`, `controllers?/`, `handlers?/`, `trpc` in a tracked path |
| secrets | Never skipped |
| errors | Never skipped |
| observability | Never skipped |
| build-ci | Never skipped — missing CI config is itself a critical finding |
| privacy-data | Rarely skipped. Skip only for pure libraries/CLIs with no user, account, email, customer, or profile tables/types (`git grep -lqiE "email|user_id|customer|profile|address|phone"` returns nothing) |
| supply-chain-license | No dependency manifest, `Dockerfile`, or `.github/workflows/` tracked |
| infra-cloud | No `*.tf`, `*.tfvars`, `Pulumi.*`, `serverless.y*ml`, `docker-compose*.y*ml`, `k8s/`, `helm/`, `*.yaml` under `deploy/`/`infra/`/`manifests/`, `wrangler.toml`, `fly.toml`, `vercel.json`, `netlify.toml`, `app.yaml`, `cdk.json` |
| database-migrations | No `migrations?/`, `drizzle/`, `prisma/`, `alembic/`, `db/migrate/`, `*.sql`, `schema.prisma`, `schema.rb` tracked |
| release-ops | No `Dockerfile`, `.github/workflows/`, `package.json` with a `publish`/`release` script, `fastlane/`, `*.xcodeproj`, `pubspec.yaml`, `Cargo.toml` with `[package]`, `setup.py`/`pyproject.toml` with a build backend |

Also check `[dimensions]` section of `.healthcheck.toml` for explicit `"off"` overrides.

If `--dimensions` flag was passed, intersect with the applicable set.

Log which dimensions are skipped and why.

### Step 4b: Resolve Model Tiers

Reasoning quality lives in the dimension subagents, so the model each one runs on is configuration, not something baked into a skill file. Read `[models]` from `.healthcheck.toml`, falling back to these defaults:

```toml
[models]
judge  = "fable"    # judgment dimensions: read code, verify, write findings and fix prompts
worker = "sonnet"   # toolchain-backed dimensions: mostly arithmetic and pattern import
```

Tier assignment:

| Tier | Dimensions | Why |
|---|---|---|
| `judge` | correctness, security, solid, api-contract, privacy-data, errors, performance | The finding is a judgment about code behaviour. A miss or a false positive is costly. |
| `worker` | complexity, dependencies, debt, testing, docs, accessibility, secrets, observability, build-ci, supply-chain-license, infra-cloud, database-migrations, release-ops, toolchain | Deterministic tool output plus bounded pattern checks. |

Per-dimension override: `[dimensions.<key>] model = "<name>"` wins over the tier. Unknown model names are passed through unchanged to the Agent tool; if the tool rejects the name, fall back to the tier default and print a one-line warning.

When a newer frontier model ships, change `judge` in `.healthcheck.toml`. No skill file changes.

### Step 5: Run Dimension Subagents

Spawn **one Agent per applicable dimension, all in a single message** so they run in parallel. Each gets `model` from Step 4b and this prompt, with `<dimension>` and `<model tier>` filled in:

```
You are running the Tenet "<dimension>" audit dimension against the repository at $(pwd).

1. Read $PLUGIN_ROOT/skills/tenet-<dimension>/SKILL.md and $PLUGIN_ROOT/skills/tenet-<dimension>/rubric.md.
2. Read every file under $PLUGIN_ROOT/shared/ that the SKILL.md references. Always read
   $PLUGIN_ROOT/shared/scan-discipline.md, $PLUGIN_ROOT/shared/verification.md, and
   $PLUGIN_ROOT/shared/severity.md even if not referenced.
3. Follow the SKILL.md procedure exactly. Toolchain outputs are already in .healthcheck/toolchain/.
   Do not re-run the toolchain. Do not modify any file outside .healthcheck/.
4. Write .healthcheck/reports/<dimension>.json exactly as the SKILL.md specifies.
5. Reply with at most 6 lines: score, applicable, finding counts by severity, and the notes
   field. Do not paste findings or file contents into the reply; they are in the JSON.

Report only issues that actually exist on reachable code paths. Zero findings is a valid result.
```

**Concurrency and rate limits.** The Agent tool caps concurrent subagents (20 by default) and a
burst of 20 audits can exhaust the account's session limit mid-run, killing every agent at once
with HTTP 429. Run in two waves: the `judge` dimensions first (7 agents), then the `worker`
dimensions once those return. If any agent dies with a rate-limit error, **stop spawning**. Do not
retry; report which dimensions completed (their JSON is on disk), which did not, and when the
limit resets. Delete `.healthcheck/tmp/*-worklog.md` for the failed dimensions so a re-run starts
clean. `--dimensions` lets the user re-run only the missing ones.

Dimension subagents are independent. `correctness` reads `.healthcheck/reports/complexity.json` when present and falls back to its own path selection when it is not, so it does not need to wait for `complexity`.

If an Agent fails or returns without writing its report, retry it once. If it fails again, mark the dimension `applicable: false` with a note and continue.

Each subagent writes its output to `.healthcheck/reports/{dimension}.json`. The orchestrator reads those files in Step 6 and never reads a specialist's SKILL.md.

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
    "toolchain_summary": { ... },
    "lines_of_code": 18420,
    "files_analyzed": 142
  },
  "dimensions": [ ... ],
  "findings": [ ... ]
}
```

Dashboard compatibility contract:
- `run.files_analyzed` drives the **Files Analyzed** header value.
- `run.lines_of_code` drives the **Lines of Code** header value.
- `dimensions[].checks` drives each dimension's **What was tested** section. If this array is missing or empty, the dashboard falls back to a generic "This skill did not report a structured list of checks" message.
- `dimensions[key="testing"].metrics.mutation_*` drives the dedicated **Mutation Testing** panel that appears below the dimension table.

Populate `run.lines_of_code` and `run.files_analyzed` from `.healthcheck/toolchain/language-census.json`. Prefer `total_loc` and `total_files` when present. If an older census omits those totals, sum `languages[].loc` and `languages[].files` instead of leaving the header blank.

Every aggregated dimension entry must carry forward:
- `applicable`
- `metrics` (use `{}` when the specialist skill has none)
- `checks` (preserve the specialist's structured checks when present)

If a specialist skill omits `checks` or returns an empty list, synthesize a compact structured checklist before upload. Use the dimension's rubric/procedure, metrics, toolchain evidence, and findings to create 3-8 entries that honestly describe what was evaluated. Example shape:

```json
{
  "name": "Line coverage threshold",
  "status": "failed",
  "count": 27,
  "tool": "coverage",
  "description": "Compared reported line coverage against the configured healthy threshold."
}
```

Synthesis rules:
- Prefer one check per major rubric slice or deterministic tool-backed sub-audit.
- Use `passed` for evaluated healthy checks, `failed` for gaps that produced findings, `skipped` when the dimension is not applicable or a sub-check genuinely does not apply, and `info` for observational signals such as mutation-report presence without score impact.
- Keep check names concrete, not generic score summaries.
- Do not invent tool names unless a real deterministic tool or normalized artifact backed the check.

Mutation testing is not a separate dimension. Preserve standardized mutation metrics from `.healthcheck/reports/testing.json` under the testing dimension's `metrics` object so the dashboard can render a dedicated mutation card or graph without changing composite-score semantics:

```json
{
  "key": "testing",
  "metrics": {
    "mutation_available": true,
    "mutation_provider": "muter",
    "mutation_scoring_mode": "informational",
    "mutation_score_pct": 74.2,
    "mutation_rating": "good",
    "mutation_mutants_total": 132,
    "mutation_mutants_killed": 98,
    "mutation_mutants_survived": 28,
    "mutation_bonus_applied": 0
  }
}
```

If `testing.metrics` lacks the standardized `mutation_*` keys but `.healthcheck/toolchain/mutation-testing.json` exists, backfill those fields from the normalized toolchain artifact before upload. If the toolchain artifact is missing but a configured raw report such as `.healthcheck/mutation/muter.json` is available and parseable, normalize it first and then populate the standardized `mutation_*` fields. Legacy placeholders such as `mutation_testing_configured` or `mutations_applied` are not sufficient for dashboard rendering on their own.

Phase behavior:
- **Phase 1:** mutation metrics and `info` findings are surfaced in the testing dimension, but they do not affect the testing score or composite score.
- **Phase 2:** when `[testing.mutation].mode = "bonus"`, `tenet-testing` may include a small positive `mutation_bonus_applied`; the orchestrator uses the already-computed testing score and does not apply any additional mutation math.
- Missing mutation data never creates a top-level score penalty during Phase 1 or Phase 2.

Before writing or uploading `final-report.json`, validate every finding against the shared fix prompt contract:

- `fix_prompt` must contain a `## Location` section.
- `fix_prompt` must contain `- File: ...`.
- `fix_prompt` must contain `- Line: ...`.
- `fix_prompt` must contain `- Dimension: <dimension> / <severity>`.
- The `- File:` value must match the finding's top-level `file` field, or `N/A` when `file` is `null`.
- The `- Line:` value must match the finding's top-level `line` field, or `N/A` when `line` is `null`.
- For findings with a precise source location, `line` is a 1-based integer and `- Line:` uses the same integer.
- For file-level, project-level, dependency-level, cloud-account-level, or other non-local findings, `line` is `null` and `- Line: N/A`.

If a specialist skill emits a finding with a missing or malformed `fix_prompt`, do not upload the raw malformed finding. Repair only the structural wrapper by prepending this standard Location block while preserving the specialist's original guidance below it:

```markdown
# Fix: <finding.title>

## Location
- File: <finding.file or N/A>
- Line: <finding.line or N/A>
- Dimension: <finding.dimension> / <finding.severity>
```

If the finding has no meaningful original `fix_prompt`, synthesize a minimal prompt with Context, Required change, Constraints, and Verification sections from the finding's `title`, `description`, `file`, `line`, `dimension`, `severity`, and `snippet`. This normalization is a dashboard compatibility gate; specialist skills should still be fixed when they emit malformed prompts.

Apply dimension weights from `.healthcheck.toml` `[weights]` section, falling back to defaults:

| Dimension | Default Weight |
|---|---|
| security | 1.5 |
| secrets | 1.5 |
| correctness | 1.3 |
| privacy-data | 1.3 |
| dependencies | 1.3 |
| errors | 1.3 |
| supply-chain-license | 1.2 |
| infra-cloud | 1.2 |
| solid | 1.1 |
| complexity | 1.1 |
| debt | 1.1 |
| testing | 1.1 |
| database-migrations | 1.1 |
| performance | 1.0 |
| api-contract | 1.0 |
| observability | 1.0 |
| build-ci | 1.0 |
| release-ops | 1.0 |
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

**If `--skip-upload` was passed:** do not POST. Print the Step 8 summary table, then a compact findings list for every `critical` and `major` finding (`severity  dimension  file:line  title`, one per line, grouped by dimension), then the path to `final-report.json`. Do not dump the full JSON; it is on disk.

**If env vars are missing:**
Print the same terminal report as `--skip-upload` and instruct:
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
Mutation: muter 74.2% good (98/132 killed, 28 survived)  mode=informational
Report: .healthcheck/reports/final-report.json
Dashboard: http://localhost:8787/projects/my-project
```

Only print the Mutation line when the testing dimension includes `metrics.mutation_available = true`. If mutation mode is configured but no report is available, print a compact note such as `Mutation: no report found (informational)`.

Delta is computed by comparing against `.healthcheck/reports/previous-report.json` if it exists. Before writing the new final report, copy the current one to `previous-report.json`.

## Output

- `.healthcheck/reports/final-report.json` — the complete aggregated report
- `.healthcheck/reports/previous-report.json` — the prior run (for delta computation)
- `.healthcheck/reports/last-upload.json` — saved on upload failure for manual retry

## Constraints

- NEVER proceed without `.healthcheck.toml` — tell the user to run setup and halt
- ALWAYS run `tenet-toolchain` before any dimension subagent
- Specialist skills run in isolated subagents (Agent tool) that read their own SKILL.md. The orchestrator NEVER invokes a specialist via the Skill tool and NEVER reads a specialist SKILL.md into its own context; both would pull every specialist's procedure into one window and switch the orchestrator's model mid-run.
- Spawn all dimension subagents in one message so they run in parallel
- Model per dimension comes from `[models]` / `[dimensions.<key>].model` in `.healthcheck.toml` (Step 4b), never from a hardcoded value in this file
- The composite score is the weighted average of all applicable dimension scores
- Scoring math is pure — no LLM judgment in arithmetic
- Mutation testing belongs under the `testing` dimension, not as its own dimension. The orchestrator preserves mutation metrics for dashboard visualization and never applies a penalty for missing mutation data.
- If a dimension subagent fails twice, log the error, mark that dimension as `applicable: false` with a note, and continue
- NEVER upload a finding whose `fix_prompt` is missing a `## Location` block with `- File:`, `- Line:`, and `- Dimension:` entries.
- NEVER invent source line numbers while normalizing malformed `fix_prompt`s. Use the finding's top-level `line` value exactly, or `N/A` when it is `null`.

## fix_prompt Templates

The orchestrator does not produce its own findings. All findings come from specialist skills. The orchestrator does validate and, when necessary, structurally normalizes finding `fix_prompt`s so the final report satisfies `shared/fix_prompt_template.md` and the dashboard upload contract.
