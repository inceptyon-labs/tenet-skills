# Tenet Dependencies — Rubric

## Scoring Formula

Start at **100**, subtract: `5 x critical + 2 x major + 0.5 x minor`. Floor 0, ceil 100, round to integer. Info findings do NOT affect the score.

## Finding Categories

### Known CVEs

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| CVSS >= 9.0 or tool-reported "critical" | critical | deterministic | Immediate patch required |
| CVSS >= 7.0 or tool-reported "high" | major | deterministic | Fix this sprint |
| CVSS >= 4.0 or tool-reported "medium" | minor | deterministic | Fix when convenient |
| CVSS < 4.0 or tool-reported "low" | info | deterministic | Low risk, monitor |
| CVE in transitive dependency with no direct upgrade path | major | deterministic | Requires override/resolution or parent package update |
| CVE reported by multiple tools for same package | (use highest) | deterministic | Deduplicate — emit only one finding |

**Toolchain sources (in priority order):**
1. `npm_audit.json` — most detailed for npm ecosystem
2. `pip_audit.json` — authoritative for Python
3. `osv_scanner.json` — cross-ecosystem, good coverage
4. `trivy.json` — broad but sometimes less detailed

### Unmaintained Packages

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| Package on curated deprecated list with security implications | major | native | Known-bad, well-documented replacement exists |
| Package on curated deprecated list without security implications | minor | native | Should migrate but not urgent |
| Package with no release in >2 years (network check) | minor | heuristic | May be stable/feature-complete, not necessarily abandoned |
| Package with no release in >4 years (network check) | major | heuristic | Likely abandoned, compatibility risks growing |

**Curated list packages flagged immediately (no network needed):**

npm: `request`, `node-uuid`, `nomnom`, `istanbul`, `tslint`, `left-pad`, `bower`, `coffeescript`

pip: `nose`, `pycrypto`, `optparse`, `distribute`, `fabric` (v1), `flask-script`

### Duplicate Dependencies

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| 2+ packages from same functional group in `dependencies` | minor | heuristic | Bloats bundle, maintenance burden |
| 2+ packages from same functional group in `devDependencies` only | info | heuristic | Less impactful, dev-only |
| 3+ packages from same functional group | major | heuristic | Significant duplication, consolidate |

**Functional groups checked:**
HTTP clients, date/time libraries, validation libraries, utility belts, logging libraries, ORMs/query builders, test runners, CSS-in-JS libraries

### Unused Dependencies

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| Declared in `dependencies`, never imported in source | minor | heuristic | Dead weight in production bundle |
| Declared in `devDependencies`, never imported or referenced | info | heuristic | Dead weight in install |

**Exclusions (do NOT flag as unused):**
- CLI tools (`eslint`, `prettier`, `typescript`, `ts-node`, `tsc`, `jest`, `vitest`)
- Babel/PostCSS/Tailwind plugins (used via config)
- `@types/*` packages (implicit TypeScript usage)
- Webpack/Vite/Rollup plugins (used via bundler config)
- Packages referenced in `package.json` scripts
- Peer dependencies of other installed packages

### Severely Outdated Versions

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| 3+ major versions behind with known CVEs in installed range | critical | deterministic | Security + staleness combined |
| 3+ major versions behind | major | heuristic | High migration debt |
| 2 major versions behind | minor | heuristic | Growing migration debt |
| 1 major version behind | info | heuristic | Normal, may be intentional |

## Dimension Metrics

The report MUST include these metrics in the `metrics` object:

| Metric | Type | Description |
|---|---|---|
| `ecosystems_scanned` | string[] | Package ecosystems analyzed (e.g., `["npm", "pip"]`) |
| `total_dependencies` | integer | Total declared dependencies across all manifests |
| `direct_dependencies` | integer | Direct (non-transitive) dependencies |
| `cve_critical` | integer | Critical CVEs found |
| `cve_major` | integer | Major/high CVEs found |
| `cve_minor` | integer | Minor/medium CVEs found |
| `unmaintained_count` | integer | Unmaintained packages found |
| `duplicate_groups` | integer | Duplicate functional groups detected |
| `unused_count` | integer | Unused dependencies found |
| `outdated_major_count` | integer | Packages 2+ major versions behind |
| `toolchain_sources` | string[] | Which toolchain files were consumed |

## Output Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/dependencies.json` | Valid JSON, matches report schema, all required fields present |
| Every finding | Has `dimension`, `severity`, `title`, `description`, `fix_prompt`, `confidence` |
| Score | Computed exactly per formula: `100 - (5*critical + 2*major + 0.5*minor)`, clamped [0, 100] |
| Confidence | Toolchain findings tagged `"confidence": "deterministic"`, manifest analysis tagged `"confidence": "heuristic"` or `"confidence": "native"` (curated list) |
| Deduplication | No two findings report the same CVE for the same package |
| Applicable | Set to `false` with `score: null` if no manifest files found |
