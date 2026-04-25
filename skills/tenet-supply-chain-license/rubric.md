# Tenet Supply Chain & License — Rubric

## Scoring

`score = max(0, min(100, int(raw + 0.5)))`, where `raw = 100 - 5*critical - 2*major - 0.5*minor`.

## Finding Categories

| Check | Severity | Confidence |
|---|---|---|
| Dependency confusion exposure for private package names | critical | native / heuristic |
| High-risk copyleft license in distributed runtime path without approval | critical-major | native / heuristic |
| Missing app lockfile on CI/release path | critical | native |
| GitHub Action or Docker base image not pinned in release CI | major | native |
| No SBOM generation for deployable app/container | major | heuristic |
| Unknown runtime dependency license | major | deterministic / native |
| CI does not use frozen install | minor | native |
| SBOM not archived as artifact | info | heuristic |

## Metrics

- `manifest_count`
- `lockfile_count`
- `unpinned_action_count`
- `unpinned_image_count`
- `unknown_license_count`
- `sbom_present`
- `scanner_findings_imported`
