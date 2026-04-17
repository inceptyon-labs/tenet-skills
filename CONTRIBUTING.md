# Contributing to Tenet Skills

Thanks for your interest in contributing. This document covers the development setup, conventions, and PR process.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Development Setup

Tenet Skills is a Claude Code plugin — there is no build step. Skills are Markdown files with YAML frontmatter.

```bash
git clone https://github.com/inceptyon-labs/tenet-skills.git
cd tenet-skills
```

To test a skill locally, point Claude Code at your clone:

```bash
cd your-test-project/
claude --plugin-dir ~/path/to/tenet-skills
```

Then invoke the skill you're working on:

```
/tenet-skills:tenet-<dimension>
```

## Skill Structure

Each skill lives in `skills/<name>/` and must have:

- `SKILL.md` — skill definition with YAML frontmatter (`name`, `description`, `trigger`)
- `rubric.md` — scoring rubric and finding examples (optional but strongly encouraged)

```
skills/tenet-example/
├── SKILL.md
└── rubric.md
```

Refer to an existing skill (e.g., `skills/tenet-security/`) as a reference implementation.

## Running the Evals

```bash
# Run all evals
ls evals/

# Individual eval
# (see evals/ directory for current test harness)
```

## Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(security): add taint-flow detection heuristic
fix(orchestrator): skip disabled dimensions before toolchain run
docs(readme): add tflint install instructions
```

Scopes: `orchestrator`, `toolchain`, `security`, `complexity`, `solid`, `performance`,
`dependencies`, `debt`, `testing`, `docs`, `accessibility`, `api-contract`, `secrets`,
`errors`, `observability`, `build-ci`, `shared`, `schema`, `readme`.

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes with clear commit messages
3. Test the skill against at least one real project
4. Open a PR — the template will prompt you for the details
5. A maintainer will review within a few days

## Reporting Issues

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for skill misfires or scoring anomalies, and the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for new dimensions or toolchain integrations.

## Adding a New Dimension

1. Create `skills/tenet-<name>/SKILL.md` following existing patterns
2. Add `rubric.md` with severity examples
3. Register the dimension in `shared/schema.json`
4. Update the weights table in `README.md`
5. Add a CHANGELOG entry under `[Unreleased]`
