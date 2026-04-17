# Tenet Toolchain — Rubric

This skill does not produce scored findings. It runs deterministic tools and normalizes output.

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/toolchain/{tool}.json` | Valid JSON, matches normalized schema |
| `.healthcheck/toolchain/{tool}.raw.json` | Raw tool output preserved |
| `.healthcheck/toolchain/language-census.json` | Valid JSON, all languages detected |
| `.healthcheck/toolchain/_summary.json` | Valid JSON, tool execution summary |

## Determinism Guarantee

Given the same commit SHA and tool versions, all `.healthcheck/toolchain/` files (excluding timestamp metadata) must be byte-identical across runs.

## No fix_prompts

This skill produces raw data for specialist skills. It does not produce findings or fix_prompts.
