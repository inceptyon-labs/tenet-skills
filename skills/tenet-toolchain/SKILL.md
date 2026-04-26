---
name: tenet-toolchain
description: "Runs Tenet static-analysis tools and writes normalized outputs for audit skills."
when_to_use: "Called by tenet-orchestrator automatically. Can be invoked directly to re-run the deterministic toolchain layer without running specialist skills."
user-invocable: false
model: sonnet
allowed-tools: Bash Read Write Glob Grep
---

# Tenet Toolchain — Deterministic Pre-Pass

> Runs every available static analysis tool in parallel, normalizes output, and writes results to `.healthcheck/toolchain/`. Specialist skills consume these files rather than re-deriving them.

## Purpose

This skill is the deterministic foundation of the Tenet audit. It runs all configured static analysis tools, captures their raw output, normalizes it to a consistent schema, and writes per-tool JSON files. This ensures scores are reproducible, fast, and cost-efficient — given the same commit SHA and tool versions, output is byte-identical.

## Language Support Matrix

```yaml
support:
  native: [all]
  note: "This skill runs external tools — language support depends on which tools are installed and configured."
```

## Toolchain Inputs

This skill does not consume other toolchain outputs — it *produces* them for all specialist skills.

## Procedure

### Step 1: Read Configuration

Read `.healthcheck.toml` if present; otherwise use these defaults:

```toml
[toolchain]
semgrep = "auto"
gitleaks = "required"
trufflehog = "auto"
npm_audit = "auto"
pip_audit = "auto"
osv_scanner = "auto"
trivy = "auto"
eslint = "auto"
radon = "auto"
gocyclo = "auto"
hadolint = "auto"
actionlint = "auto"
axe = "auto"
pa11y = "auto"
markdownlint = "auto"
tflint = "auto"
syft = "auto"
grype = "auto"
checkov = "auto"
tfsec = "auto"
kube_linter = "auto"
conftest = "auto"

[testing.mutation]
mode = "informational"
report_paths = [
  ".healthcheck/mutation/mutation-testing.json",
  ".healthcheck/mutation/muter.json",
  "mutation-report.json",
  "reports/mutation-testing.json"
]
```

### Step 2: Check Tool Availability

For each tool in the config:
- If mode is `"required"` and tool is missing → **fail the run** with a clear error and install command
- If mode is `"auto"` and tool is missing → log and skip
- If mode is `"off"` → skip entirely

### Step 3: Run Tools

Run all available tools. For each tool, capture:
- stdout, stderr, exit code
- Wall-clock duration (use `time` or bash `SECONDS`)

**Tool commands and dimension routing:**

| Tool | Command | Dimensions Fed |
|---|---|---|
| semgrep | `semgrep --config=auto --json --quiet .` | security, errors |
| gitleaks | `gitleaks detect --source=. --report-format=json --report-path=-` | secrets |
| trufflehog | `trufflehog filesystem --json .` | secrets |
| npm audit | `npm audit --json 2>/dev/null` | dependencies |
| pip-audit | `pip-audit -f json 2>/dev/null` | dependencies |
| osv-scanner | `osv-scanner --format json -r .` | dependencies |
| trivy | `trivy fs --format json --quiet .` | dependencies, secrets |
| eslint | `npx eslint --format json . 2>/dev/null` | complexity, errors |
| radon | `radon cc -j -a .` | complexity (python) |
| gocyclo | `gocyclo -json .` | complexity (go) |
| hadolint | `hadolint -f json Dockerfile` | build-ci |
| actionlint | `actionlint -format '{{json .}}'` | build-ci |
| axe | `npx @axe-core/cli --stdout .` | accessibility |
| pa11y | `pa11y --reporter json <url>` | accessibility |
| markdownlint | `markdownlint --json . 2>&1` | docs |
| tflint | `tflint --format=json` | security, build-ci |
| syft | `syft dir:. -o json` | supply-chain-license |
| grype | `grype dir:. -o json` | supply-chain-license, dependencies |
| checkov | `checkov -d . -o json --quiet` | infra-cloud, security |
| tfsec | `tfsec . --format json` | infra-cloud, security |
| kube-linter | `kube-linter lint . --format json` | infra-cloud |
| conftest | `conftest test --output json .` | infra-cloud, build-ci |

Also check for and parse coverage reports:
```bash
# Look for coverage reports in common locations
# lcov.info, coverage/lcov.info, coverage/cobertura.xml, .coverage, htmlcov/
```

Also discover and normalize mutation testing reports that were already produced by the target project's CI/local tooling:

```bash
# Look for mutation reports in configured paths first, then common locations:
# .healthcheck/mutation/mutation-testing.json
# .healthcheck/mutation/muter.json
# mutation-report.json
# reports/mutation*.json
# build/reports/pitest/mutations.xml
```

Do **not** run mutation testing tools from the Tenet toolchain by default. Tools such as Muter can require Xcode schemes, simulators, warmed build artifacts, and long runtimes. Tenet ingests their reports; the target project owns execution.

### Step 4: Normalize Output

For each tool that ran, normalize output to:

```json
{
  "tool": "semgrep",
  "version": "1.56.0",
  "ran_at": "2024-01-15T10:30:00Z",
  "duration_ms": 4523,
  "exit_code": 0,
  "finding_count": 12,
  "findings": [
    {
      "rule_id": "javascript.lang.security.detect-eval",
      "message": "Detected eval() usage",
      "file": "src/utils/parser.js",
      "line": 42,
      "severity": "warning",
      "category": "security"
    }
  ],
  "raw_path": ".healthcheck/toolchain/semgrep.raw.json"
}
```

Write per-tool files to `.healthcheck/toolchain/{tool}.json`.
Also save the raw output to `.healthcheck/toolchain/{tool}.raw.json`.

For discovered mutation reports, write a normalized `.healthcheck/toolchain/mutation-testing.json`:

```json
{
  "tool": "mutation-testing",
  "provider": "muter",
  "version": null,
  "source_path": ".healthcheck/mutation/muter.json",
  "scope": "changed_files",
  "summary": {
    "mutation_score_pct": 74.2,
    "mutants_total": 132,
    "mutants_killed": 98,
    "mutants_survived": 28,
    "mutants_timed_out": 6,
    "mutants_equivalent": 0
  },
  "survivors_by_file": [
    { "file": "Sources/App/AuthService.swift", "survived": 8, "total": 21 }
  ],
  "raw_path": ".healthcheck/toolchain/mutation-testing.raw.json"
}
```

If a mutation report exists but cannot be parsed confidently, preserve the raw file and write `parse_error` plus `source_path` in the normalized output so `tenet-testing` can report it as informational.

Line normalization rules:
- `line` is always a 1-based source line number.
- Convert source tool locations to 1-based if a tool reports 0-based positions.
- Preserve `null` when a tool reports only a file, package, selector, or project-level issue.
- Do not invent approximate line numbers during normalization. Specialist skills may provide placement guidance inside `fix_prompt.Required change`, not in the `line` field.
- When a tool reports a range, store the start line in `line` and keep range details only in tool-specific metadata or the eventual finding description.

### Step 5: Generate Language Census

Walk the repo tree (respecting `.gitignore`) and count LOC per extension:

```bash
# Use git ls-files to respect .gitignore, then count lines per extension
git ls-files | while read f; do
  ext="${f##*.}"
  wc -l < "$f"
done
# Aggregate by language using the extension table in shared/language-detect.md
```

Write `.healthcheck/toolchain/language-census.json`:

```json
{
  "primary_language": "typescript",
  "languages": [
    { "lang": "typescript", "loc": 4820, "files": 47, "support": "native" },
    { "lang": "javascript", "loc": 320, "files": 8, "support": "native" }
  ],
  "manifests": ["package.json", "tsconfig.json"]
}
```

### Step 6: Write Summary

Write `.healthcheck/toolchain/_summary.json`:

```json
{
  "ran_at": "2024-01-15T10:30:00Z",
  "total_duration_ms": 12450,
  "tools_ran": ["semgrep", "gitleaks", "eslint", "npm_audit"],
  "tools_skipped": ["radon", "gocyclo", "hadolint"],
  "tools_failed": [],
  "tools_missing_required": [],
  "config_source": ".healthcheck.toml"
}
```

## Output

All output goes to `.healthcheck/toolchain/`:
- `{tool}.json` — normalized findings per tool
- `{tool}.raw.json` — raw tool output for debugging
- `mutation-testing.json` — normalized mutation testing report, if one was discovered
- `mutation-testing.raw.json` — raw mutation report, if one was discovered
- `language-census.json` — LOC and language breakdown
- `_summary.json` — what ran, what skipped, timing

## Constraints

- **Determinism:** Given the same commit and tool versions, output must be byte-identical (excluding timestamps in metadata)
- **No LLM judgment:** This skill only runs tools and normalizes output. No scoring, no descriptions, no fix_prompts.
- **Mutation report ingestion only:** Never execute mutation testing tools from the default toolchain. Only parse existing reports.
- **Parallel execution:** Run tools concurrently where possible to minimize wall-clock time
- **Respect .gitignore:** Never scan files excluded by .gitignore (use `git ls-files` as the file list source)
- **Fail fast on required tools:** If a `"required"` tool is missing, fail immediately with an install command
- **Raw preservation:** Always save raw tool output alongside normalized output for debugging

## fix_prompt Templates

This skill does not produce findings or fix_prompts. It produces raw data for specialist skills.
