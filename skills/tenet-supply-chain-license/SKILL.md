---
name: tenet-supply-chain-license
description: "Audits dependency provenance, lockfiles, action/image pinning, licenses, and supply-chain risk."
when_to_use: "Supply chain audit, SBOM check, license compliance, provenance, dependency confusion, pinned actions, tenet supply-chain-license"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Supply Chain & License

Audits whether build inputs are traceable, pinned, licensed intentionally, and resistant to common supply-chain attacks.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python, go, rust, java]
  heuristic: [ruby, php, csharp, swift, kotlin]
  config-only: [yaml, json, dockerfile]
```

## Toolchain Inputs

Consume these files when present:
- `.healthcheck/toolchain/osv_scanner.json`, `trivy.json`, `npm_audit.json`, `pip_audit.json`
- `.healthcheck/toolchain/syft.json` for SBOM/package inventory
- `.healthcheck/toolchain/grype.json` for vulnerability data

## Procedure

### Step 0: Detect Ecosystems

Check for manifests and lockfiles: `package.json`, lockfiles, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, Dockerfiles, and `.github/workflows`.

If no dependency manifests, container files, or CI workflow files exist, mark `applicable: false`.

### Step 1: Lockfile and Reproducibility

Flag missing or conflicting lockfiles for application projects.

Severity:
- `critical`: app has manifest but no lockfile and CI/build installs dependencies
- `major`: multiple lockfiles for one ecosystem create ambiguous install behavior
- `minor`: lockfile exists but CI does not use frozen install mode

### Step 2: Provenance and Pinning

Check:
- GitHub Actions pinned to full commit SHA rather than mutable tags
- Docker base images pinned by digest
- Package manager config for private scopes/registries
- `npm publishConfig`, `.npmrc`, `pip.conf`, `poetry` sources for dependency confusion risk

Severity:
- `critical`: public registry can satisfy internal package names or private scope has no registry binding
- `major`: Actions or Docker images use mutable major/version tags in protected CI
- `minor`: tool versions are unpinned in CI but not on a release path

### Step 3: SBOM Coverage

Look for generated SBOMs or CI steps using Syft, CycloneDX, SPDX, Trivy SBOM, or equivalent.

Severity:
- `major`: deployable app/container has no SBOM generation evidence
- `minor`: SBOM exists but is not generated in CI/release
- `info`: SBOM generated but not archived as a release artifact

### Step 4: License Risk

Use available tool output first. Otherwise inspect package manifests for license metadata and known high-risk licenses.

Severity:
- `critical`: AGPL/GPL dependency appears in distributed proprietary product path without documented approval
- `major`: unknown/missing licenses in runtime dependencies
- `minor`: weak license metadata in dev-only dependencies
- `info`: license policy file is missing

### Step 5: Toolchain Vulnerability Signals

Import supply-chain-relevant toolchain findings from OSV, Trivy, Grype, npm audit, and pip-audit. Deduplicate against `tenet-dependencies` by preferring this dimension for provenance/license/SBOM issues and dependencies for package CVEs.

### Step 6: Compile and Score

Every finding uses:
- `dimension: "supply-chain-license"`
- `confidence: "deterministic"` for scanner output, `native` for parsed manifests/workflows, `heuristic` for grep-only checks
- fix_prompts following `shared/fix_prompt_template.md`

## Output

- `.healthcheck/reports/supply-chain-license.json`

## Constraints

- Do not make legal conclusions. Report license facts and recommend review where needed.
- Do not require SBOMs for tiny libraries unless they publish packages or containers.
- Use `Line: N/A` for package-level, license-policy, or project-level findings.
