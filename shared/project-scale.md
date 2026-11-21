# Project Scale

Some findings are about process a project is missing: no runbook, no staging environment, no
SBOM, no feature flags, no signed commits. Whether that absence is a defect depends on who ships
the project. A team running a production service needs those things. One person shipping a
personal tool does not, and a report that marks their absence `major` or `critical` on every run
teaches the reader to ignore the dimension.

Dimensions that report process gaps (`release-ops`, `supply-chain-license`, `infra-cloud`,
`database-migrations`) classify the project first and scale those findings by the result.

## Classify

An explicit setting wins. Read `.healthcheck.toml`:

```toml
[project]
scale = "solo"   # "solo" | "team"
```

With no setting, decide from the repo:

```bash
git shortlog -sne --since="180 days ago" HEAD | grep -viE "bot\b|\[bot\]|dependabot|renovate|github-actions" | wc -l
git ls-files -- '*CODEOWNERS'
git ls-files -- '*staging*' '*production*' '*prod.*' '*oncall*' '*runbook*' '*incident*' | head -20
```

- **team**: two or more human committers in the last 180 days, or a `CODEOWNERS` file, or
  separate staging and production configuration, or on-call or incident documents.
- **solo**: none of the above.

State the classification and the evidence in `notes`.

## What scale changes

Scale changes the severity of **absence-of-process** findings only. At `solo` scale they are
`info`: worth knowing, not counted in the score.

| Absence-of-process (scaled) | Not scaled, at any size |
|---|---|
| No runbook, on-call or SLO document | A migration that drops a column the code still reads |
| No staging or promotion path | A deploy script that ships uncommitted or untested state silently |
| No SBOM generation | A dependency with no lockfile entry |
| No feature flags or kill switches | A database port published to the internet |
| No smoke test after deploy | Default admin credentials in a seed |
| Deploying from a developer machine | A destructive fallback that deletes user data |
| Unsigned commits, no license policy file | Credentials embedded in infrastructure config |
| No documented rollback procedure | A rollback that cannot work (irreversible migration already applied) |

A defect in something the project does have is never scaled. If a solo project has a deploy
script and the script is wrong, that is a finding at its normal severity.
