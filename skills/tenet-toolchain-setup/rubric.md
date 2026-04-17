# Tenet Toolchain Setup — Rubric

This skill does not produce scored findings. It generates configuration artifacts.

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/host-inventory.json` | Valid JSON, all tools checked, version captured where available |
| `.healthcheck/project-needs.json` | Valid JSON, all project signals checked |
| `.healthcheck/install-tools.sh` | Valid shell script, platform-appropriate commands |
| `.healthcheck.toml` | Valid TOML, all sections present, sensible defaults |

## No fix_prompts

This skill is a setup concierge. It does not audit code and does not produce findings.
