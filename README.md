<p align="center">
  <img src="tenet-white.png" alt="Tenet" width="240">
</p>

<h1 align="center">Tenet Skills</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://code.claude.com/docs/en/plugins"><img src="https://img.shields.io/badge/Claude%20Code-plugin-8A2BE2.svg" alt="Claude Code Plugin"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version"></a>
</p>

> *"I build in a twilight world."*

A Claude Code plugin containing 17 coordinated skills for application health auditing. Produces structured reports for the **Tenet** dashboard — a self-hosted Fastify + Postgres application that tracks project health over time.

## What is Tenet?

Tenet is a two-part system:

1. **tenet-skills** (this repo) — A Claude Code plugin that audits your codebase across 14 dimensions: security, complexity, SOLID, performance, dependencies, debt, testing, docs, accessibility, API contracts, secrets, errors, observability, and build/CI.
2. **tenet-dashboard** (separate repo) — A self-hosted web dashboard that receives reports, tracks trends, and lets you copy fix prompts directly into Claude Code.

Each audit run produces a single JSON report with per-dimension scores (0-100) and actionable findings. Every finding includes a **fix prompt** — a self-contained instruction you can paste into Claude Code to resolve the issue.

## Installation

### 1. Clone the plugin

```bash
git clone https://github.com/tenet-org/tenet-skills.git ~/src/tenet-skills
```

### 2. Enable the plugin in your project

Run Claude Code with the `--plugin-dir` flag pointing to your clone:

```bash
cd your-project/
claude --plugin-dir ~/src/tenet-skills
```

To make this permanent, add the flag to your shell alias or Claude Code configuration.

### 3. Set environment variables

The plugin uploads reports to your Tenet dashboard. Set these in your shell profile or `.env`:

```bash
export HEALTHCHECK_DASHBOARD_URL=http://localhost:8787   # Your dashboard URL
export HEALTHCHECK_API_TOKEN=your-bearer-token-here       # Dashboard auth token
```

If these aren't set, reports are printed to stdout instead of uploaded.

## Quick Start

### First-time setup

Run the setup concierge to detect your toolchain and generate config:

```
/tenet-skills:tenet-toolchain-setup
```

This will:
- Scan your machine for installed static analysis tools
- Analyze your project to determine which tools are needed
- Show a gap report with install commands for missing tools
- Generate `.healthcheck.toml` with sensible defaults

### Run your first audit

```
/tenet-skills:tenet-orchestrator
```

This runs the full audit pipeline:
1. Executes all available deterministic tools (semgrep, gitleaks, eslint, etc.)
2. Runs applicable dimension skills
3. Aggregates findings into a single report
4. Uploads to the dashboard (or prints to stdout)

### Run specific dimensions only

```
/tenet-skills:tenet-orchestrator --dimensions security,secrets,dependencies
```

### Dry run (see what would execute)

```
/tenet-skills:tenet-orchestrator --dry-run
```

## Skills Reference

### Foundational Skills

| Skill | Invocation | Purpose |
|---|---|---|
| `tenet-toolchain-setup` | `/tenet-skills:tenet-toolchain-setup` | First-run concierge — detects tools, generates config |
| `tenet-toolchain` | (called by orchestrator) | Runs deterministic tools, normalizes output |
| `tenet-orchestrator` | `/tenet-skills:tenet-orchestrator` | Main entry point — coordinates all skills |

### Dimension Skills

| # | Skill | Dimension | Default Weight |
|---|---|---|---|
| 2 | `tenet-security` | Security vulnerabilities | 1.5 |
| 3 | `tenet-complexity` | Code complexity metrics | 1.1 |
| 4 | `tenet-solid` | SOLID design principles | 1.1 |
| 5 | `tenet-performance` | Performance anti-patterns | 1.0 |
| 6 | `tenet-dependencies` | Dependency health | 1.3 |
| 7 | `tenet-debt` | Technical debt markers | 1.1 |
| 8 | `tenet-testing` | Test coverage & quality | 1.1 |
| 9 | `tenet-docs` | Documentation completeness | 0.8 |
| 10 | `tenet-accessibility` | Accessibility (a11y) | 0.8 |
| 11 | `tenet-api-contract` | API design consistency | 1.0 |
| 12 | `tenet-secrets` | Hardcoded secrets | 1.5 |
| 13 | `tenet-errors` | Error handling quality | 1.3 |
| 14 | `tenet-observability` | Logging, metrics, tracing | 1.0 |
| 15 | `tenet-build-ci` | Build & CI configuration | 1.0 |

## Configuration

### `.healthcheck.toml`

The config file at your project root controls which tools run and how dimensions are weighted:

```toml
[project]
slug = "my-project"
name = "My Project"

[toolchain]
semgrep = "auto"         # "auto" | "required" | "off"
gitleaks = "required"    # gitleaks is required by default
npm_audit = "auto"
eslint = "auto"

[weights]
security = 1.5           # Override dimension weight
complexity = 1.1

[dimensions]
accessibility = "off"    # Disable a dimension entirely
```

Run `/tenet-skills:tenet-toolchain-setup` to generate this file with sensible defaults for your project.

### Toolchain Tools

Tenet integrates with these static analysis tools for deterministic, reproducible scoring:

| Tool | Dimensions | Install |
|---|---|---|
| semgrep | security, errors | `pipx install semgrep` |
| gitleaks | secrets | `brew install gitleaks` |
| trufflehog | secrets | `brew install trufflehog` |
| npm audit | dependencies | (bundled with npm) |
| pip-audit | dependencies | `pipx install pip-audit` |
| osv-scanner | dependencies | `brew install osv-scanner` |
| trivy | dependencies, secrets | `brew install trivy` |
| eslint | complexity, errors | `npm install -g eslint` |
| radon | complexity (Python) | `pipx install radon` |
| gocyclo | complexity (Go) | `go install github.com/fzipp/gocyclo/cmd/gocyclo@latest` |
| hadolint | build-ci | `brew install hadolint` |
| actionlint | build-ci | `brew install actionlint` |
| axe-core | accessibility | `npm install -g @axe-core/cli` |
| pa11y | accessibility | `npm install -g pa11y` |
| markdownlint | docs | `npm install -g markdownlint-cli` |
| tflint | security, build-ci | `brew install tflint` |

When a tool is missing but set to `"auto"`, the corresponding skill falls back to heuristic analysis. When set to `"required"`, the run fails with an install command.

## Scoring

### Formula

Every dimension starts at **100** and is reduced by findings:

```
score = max(0, min(100, round(100 - 5×critical - 2×major - 0.5×minor)))
```

Info findings do not affect the score.

### Severity Levels

| Severity | Impact | Action |
|---|---|---|
| **critical** | -5 points | Security vuln, data loss, hardcoded secret. Fix immediately. |
| **major** | -2 points | Design flaw, systemic issue, vulnerable dep. Fix this sprint. |
| **minor** | -0.5 points | Code smell, complexity hotspot. Fix when touching that area. |
| **info** | 0 points | Observation or suggestion. Not required. |

### Composite Score

The composite score is the weighted average of all applicable dimensions:

```
composite = Σ(score_i × weight_i) / Σ(weight_i)
```

### Reproducibility

Given the same commit SHA and tool versions, scores are **deterministic**. The scoring formula is pure arithmetic — no LLM judgment, randomness, or time-of-day inputs affect scores.

## Fix Prompts

Every finding includes a `fix_prompt` — a self-contained instruction designed to be pasted directly into a Claude Code session. Fix prompts include:

- **Context** — What the problem is and why it matters
- **Location** — Exact file and line number
- **Current behavior** — What the code does now
- **Required change** — Step-by-step fix instructions
- **Constraints** — What to preserve (public APIs, existing tests, etc.)
- **Verification** — How to confirm the fix worked

In the Tenet dashboard, click "Copy fix prompt" on any finding, then paste it into Claude Code.

## Dashboard API

Reports are uploaded to:

```
POST {HEALTHCHECK_DASHBOARD_URL}/api/v1/reports
Authorization: Bearer {HEALTHCHECK_API_TOKEN}
Content-Type: application/json
```

The dashboard retains full reports for 90 days (configurable: 30/90/180/365/forever), then rolls up to daily score snapshots.

## Updating the Plugin

```bash
cd ~/src/tenet-skills
git pull
```

Then restart Claude Code or run `/reload-plugins` in your session.

## Project Structure

```
tenet-skills/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── skills/
│   ├── tenet-toolchain-setup/   # First-run concierge
│   │   ├── SKILL.md
│   │   └── rubric.md
│   ├── tenet-toolchain/         # Deterministic pre-pass
│   │   ├── SKILL.md
│   │   └── rubric.md
│   ├── tenet-orchestrator/      # Main coordinator
│   │   ├── SKILL.md
│   │   └── rubric.md
│   ├── tenet-security/          # Security vulnerabilities
│   ├── tenet-complexity/        # Code complexity
│   ├── tenet-solid/             # SOLID principles
│   ├── tenet-performance/       # Performance anti-patterns
│   ├── tenet-dependencies/      # Dependency health
│   ├── tenet-debt/              # Technical debt
│   ├── tenet-testing/           # Test coverage & quality
│   ├── tenet-docs/              # Documentation
│   ├── tenet-accessibility/     # Accessibility (a11y)
│   ├── tenet-api-contract/      # API consistency
│   ├── tenet-secrets/           # Hardcoded secrets
│   ├── tenet-errors/            # Error handling
│   ├── tenet-observability/     # Logging & metrics
│   └── tenet-build-ci/         # Build & CI config
├── shared/
│   ├── schema.json              # Report JSON schema
│   ├── severity.md              # Severity definitions
│   ├── fix_prompt_template.md   # Fix prompt template
│   ├── language-detect.md       # Language routing rules
│   └── upload.sh                # Reference upload script
├── README.md
└── .gitignore
```

## Plugin Spec Note

This plugin was generated against the Claude Code plugin specification as documented at [code.claude.com/docs/en/plugins](https://code.claude.com/docs/en/plugins) on 2026-04-16. Key conventions:

- **Manifest:** `.claude-plugin/plugin.json`
- **Skills:** `skills/<name>/SKILL.md` with YAML frontmatter
- **Namespace:** Skills are invoked as `/tenet-skills:<skill-name>`
- **Enablement:** `claude --plugin-dir <path>` or marketplace install

If the Claude Code plugin specification has evolved since this date, consult the current docs and update the manifest/structure accordingly.

## Related

- [tenet-dashboard](https://github.com/tenet-org/tenet-dashboard) — Self-hosted web dashboard that receives and displays reports from this plugin

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, skill structure conventions, commit style, and the PR process. All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

If you've found a vulnerability, please follow the disclosure process in [SECURITY.md](SECURITY.md) rather than filing a public issue.

## License

Released under the [MIT License](LICENSE). © 2026 jnew00.
