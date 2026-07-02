---
name: tenet-toolchain-setup
description: "Sets up Tenet static-analysis tools and generates .healthcheck.toml for a project."
when_to_use: "First time running Tenet, setting up healthcheck, refreshing toolchain config, tenet setup, tenet init, tenet-orchestrator --setup"
disable-model-invocation: true
model: sonnet
allowed-tools: Bash Read Write Glob Grep
---

# Tenet Toolchain Setup

> First-run concierge. Scans the host for installed static-analysis tools, scans the project to determine what tools it needs, shows a gap report, and — with confirmation — writes a sensible `.healthcheck.toml`.

## Purpose

This skill bootstraps the Tenet audit environment for a project. It inventories the host machine's installed tools, cross-references them against what the project actually needs, produces a formatted gap report, generates install commands, and writes the `.healthcheck.toml` configuration file that all other Tenet skills depend on.

## Language Support Matrix

```yaml
support:
  native: [all]
  note: "This skill detects languages but does not analyze code. It determines which tools and dimensions are relevant for the detected languages."
```

## Toolchain Inputs

This skill does not consume toolchain outputs — it *produces* the configuration that the toolchain skill reads.

## Procedure

### Step 1: Host Inventory

For every tool in the Tenet toolchain catalog, check if it is installed and capture its version:

```bash
# Tools to check (run `which <tool>` and `<tool> --version` for each):
# Required:
#   git, jq
# Static analysis:
#   semgrep, gitleaks, trufflehog
# Package auditing:
#   npm (+ npm audit), pip-audit, osv-scanner, trivy, syft, grype
# Linting / complexity:
#   eslint, radon, gocyclo
# CI / Docker:
#   hadolint, actionlint
# Accessibility:
#   axe (npx @axe-core/cli), pa11y
# Docs:
#   markdownlint
# Infrastructure:
#   tflint, checkov, tfsec, kube-linter, conftest
# Mutation report providers (optional; Tenet ingests reports but does not run them by default):
#   muter
# Runtime support:
#   node, python3, tree-sitter
```

Write the results to `.healthcheck/host-inventory.json`:

```json
[
  { "tool": "semgrep", "installed": true, "version": "1.56.0", "path": "/usr/local/bin/semgrep" },
  { "tool": "gitleaks", "installed": false, "version": null, "path": null }
]
```

### Step 2: Project Needs Analysis

Scan the repo to determine which tools are useful:

| Condition | Tools needed |
|---|---|
| `package.json` present | npm_audit, eslint |
| `*.py` files present | pip-audit, radon |
| `*.go` files present | osv-scanner, gocyclo |
| `Dockerfile` present | hadolint |
| `.github/workflows/` present | actionlint |
| `*.tf` files present | tflint, checkov, tfsec |
| Kubernetes YAML / Helm charts present | kube-linter, checkov |
| Dependency manifests or Dockerfile present | syft, grype |
| OPA/Rego policies present | conftest |
| JSX/TSX/HTML/Vue/Svelte files | axe, pa11y |
| `*.md` files present | markdownlint |
| Swift package or Xcode project present | muter optional, mutation report ingestion config |

Write results to `.healthcheck/project-needs.json`:

```json
[
  { "tool": "npm_audit", "needed": true, "reason": "package.json detected" },
  { "tool": "hadolint", "needed": false, "reason": "no Dockerfile found" }
]
```

### Step 3: Gap Report

Compute the intersection and print a formatted table:

```
╭──────────────────┬────────────────────┬─────────────────────────────────────╮
│ Tool             │ Status             │ Recommendation                      │
├──────────────────┼────────────────────┼─────────────────────────────────────┤
│ git              │ ✓ installed (2.43) │                                     │
│ semgrep          │ ● needed, missing  │ pipx install semgrep                │
│ gitleaks         │ ● needed, missing  │ brew install gitleaks               │
│ eslint           │ ✓ installed (8.56) │                                     │
│ hadolint         │ ○ not needed       │                                     │
│ radon            │ ◐ installed, not   │                                     │
│                  │   needed here      │                                     │
╰──────────────────┴────────────────────┴─────────────────────────────────────╯
```

Statuses:
- `✓ installed` — tool is available and needed
- `● needed, missing` — tool is needed but not installed
- `○ not needed` — tool is not relevant for this project
- `◐ installed, not needed` — tool is installed but project doesn't use it

### Step 4: Install Command Generation

Detect the host OS:
```bash
OS=$(uname -s)
# Also check /etc/os-release for Linux distro
# Check for WSL via /proc/version containing "microsoft"
# Check for brew on macOS
```

Generate install commands per platform:

**macOS (brew preferred):**
```bash
brew install gitleaks trufflehog hadolint actionlint tflint syft grype tfsec kube-linter conftest
pipx install semgrep radon pip-audit checkov
npm install -g eslint markdownlint-cli @axe-core/cli pa11y

# Swift/Xcode projects only, when the team wants to generate mutation reports:
brew install muter-mutation-testing/formulae/muter
```

**Ubuntu/Debian:**
```bash
sudo apt install -y jq
pipx install semgrep radon pip-audit
npm install -g eslint markdownlint-cli @axe-core/cli pa11y
# gitleaks: download from GitHub releases
# hadolint: download from GitHub releases
# muter: install from the Muter GitHub release or project-recommended package manager
```

For corporate/locked-down environments (detect via `npm config get registry` pointing to internal mirror or `.npmrc` with proxy), flag this and print commands WITHOUT running them, with a note about proxy/SSO requirements.

### Step 5: Install Script

Write all install commands to `.healthcheck/install-tools.sh`:

```bash
#!/usr/bin/env bash
# Tenet Toolchain Installer
# Generated: <date>
# Platform: <detected OS>
#
# Review this script before running it.
# Usage: chmod +x .healthcheck/install-tools.sh && ./.healthcheck/install-tools.sh

set -euo pipefail

echo "Installing Tenet toolchain dependencies..."

# <platform-specific install commands>

echo ""
echo "Verifying installation..."
# Re-run host inventory checks
```

### Step 6: Config Generation

Write `.healthcheck.toml` at the repo root:

```toml
# Tenet Configuration
# Generated by tenet-toolchain-setup v1.0.0
# Date: <ISO-8601>

[project]
slug = "<detected-slug>"
name = "<detected-name>"
# repo_url = "<git remote origin>"

[toolchain]
# "auto" = run if installed, "required" = fail if missing, "off" = skip
semgrep = "auto"
gitleaks = "required"
trufflehog = "auto"
npm_audit = "auto"
pip_audit = "auto"
osv_scanner = "auto"
trivy = "auto"
syft = "auto"
grype = "auto"
checkov = "auto"
tfsec = "auto"
kube_linter = "auto"
conftest = "auto"
eslint = "auto"
radon = "auto"
gocyclo = "auto"
hadolint = "auto"
actionlint = "auto"
axe = "auto"
pa11y = "auto"
markdownlint = "auto"
tflint = "auto"

[weights]
security = 1.5
secrets = 1.5
correctness = 1.3
privacy-data = 1.3
dependencies = 1.3
errors = 1.3
supply-chain-license = 1.2
infra-cloud = 1.2
solid = 1.1
complexity = 1.1
debt = 1.1
testing = 1.1
database-migrations = 1.1
performance = 1.0
api-contract = 1.0
observability = 1.0
build-ci = 1.0
release-ops = 1.0
docs = 0.8
accessibility = 0.8

[dimensions]
# Set to "off" to disable a dimension entirely
# security = "off"
# accessibility = "off"

[suppressions]
# Accept a known finding so it stops re-appearing as critical every run. A suppressed finding
# is demoted to `info` (no score impact) and recorded with its reason — never silently dropped.
# See shared/suppressions.md. Inline `// tenet-ignore: <RULE-ID> <reason>` comments also work.
#
# Suppress a rule everywhere:  "RULE-ID" = "reason"
# "SEC-DEFAULT-005" = "internal LAN-only tool, HTTP is intentional"
#
# Suppress a rule for a path glob:
# [[suppressions.paths]]
# rule = "secrets"
# path = "config/dev-keys.ts"
# reason = "quota-capped throwaway dev keys, rotated monthly"

[testing.mutation]
# Tenet ingests mutation reports; the target project CI/local scripts run mutation tools.
# off | informational | bonus
mode = "informational"
minimum_score = 70
excellent_score = 85
bonus_points = 2
scope = "changed_files"
report_paths = [
  ".healthcheck/mutation/mutation-testing.json",
  ".healthcheck/mutation/muter.json",
  "mutation-report.json",
  "reports/mutation-testing.json"
]
```

For Swift/Xcode projects, include Muter in the optional gap report but do not mark it required by default. Print a note recommending that the target project add a CI step which runs Muter on changed files and writes the report to one of `[testing.mutation].report_paths`, for example:

```bash
mkdir -p .healthcheck/mutation
muter --format json --output .healthcheck/mutation/muter.json \
  --files-to-mutate "$(git diff --name-only HEAD~1 HEAD | tr '\n' ',')"
```

**IMPORTANT:** If `.healthcheck.toml` already exists, write to `.healthcheck.toml.new` instead and diff them for the user. NEVER overwrite silently.

### Step 7: Final Summary

Print:
```
Tenet Toolchain Setup Complete
═══════════════════════════════

  Tools: 12 of 16 toolchain tools installed and useful for this project
  Full determinism: security, complexity, dependencies, testing, build-ci, docs
  Heuristic mode: performance, accessibility (install axe/pa11y to upgrade)
  Skipped: (none)

  Next: run /tenet-skills:tenet-orchestrator to produce your first report
```

## Output

- `.healthcheck/host-inventory.json`
- `.healthcheck/project-needs.json`
- `.healthcheck/install-tools.sh` (if any tools are missing)
- `.healthcheck.toml` (or `.healthcheck.toml.new` if config already exists)

## Constraints

- **NEVER install tools automatically.** Always print commands and let the user decide.
- **NEVER overwrite an existing `.healthcheck.toml`** without explicit user confirmation.
- Detect WSL vs native Linux for install commands (WSL has quirks with npm global installs).
- If `brew` is installed on macOS, prefer it even when pip/npm would also work.
- For corporate environments, flag proxy/SSO requirements.
- All JSON output must be valid and parseable by `jq`.

## fix_prompt Templates

This skill does not produce findings — it generates configuration. No fix_prompts needed.
