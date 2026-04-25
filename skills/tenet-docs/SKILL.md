---
name: tenet-docs
description: "Evaluates documentation quality: README completeness, inline doc coverage on public APIs, ADR/decision log presence, changelog presence, and documentation freshness."
when_to_use: "Documentation audit, README check, JSDoc coverage, API docs, tenet docs"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Docs — Documentation Quality Audit

> Measures the presence, completeness, and freshness of project documentation: README sections, inline doc coverage on public APIs, architectural decision records, and changelogs.

## Purpose

Documentation is the load-bearing surface between the code and every future contributor. This skill audits documentation from four angles:

1. **README completeness** — Does the project's front door explain what it is, how to set it up, and how to contribute?
2. **Inline doc coverage** — Are exported/public symbols annotated with JSDoc, docstrings, or equivalent?
3. **ADR/decision log presence** — For non-trivial projects, are architectural decisions recorded?
4. **Changelog presence** — Is there a changelog or equivalent release history?

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python]
  heuristic: [go, rust, java, kotlin, ruby, php, swift, csharp, cpp, c]
  skip: [yaml, json, css, sql, shell, dockerfile, markdown]
```

- **Native (TS/JS):** JSDoc detection via `/** ... */` comments directly preceding `export` statements.
- **Native (Python):** Docstring detection via triple-quoted strings immediately inside `def`/`class` bodies.
- **Heuristic (Go, Rust, Java, etc.):** Comment blocks preceding public/exported symbols detected via regex patterns (`//`, `///`, `/* ... */`, `/** ... */`).
- **Skip:** Non-code files are not scanned for inline docs (but markdown files are checked as documentation artifacts).

## Toolchain Inputs

| File | Source Tool | Usage |
|---|---|---|
| `.healthcheck/toolchain/markdownlint.json` | markdownlint | Lint violations in markdown files (broken links, heading style, etc.) |
| `.healthcheck/toolchain/language-census.json` | language census | LOC counts, file lists, primary language |

Both are optional. If `markdownlint.json` is absent, skip markdown lint checks. If `language-census.json` is absent, derive file lists via `git ls-files`.

## Procedure

### Step 0: Read Configuration and Toolchain

```bash
# Read config overrides
cat .healthcheck.toml 2>/dev/null

# Read toolchain outputs
cat .healthcheck/toolchain/markdownlint.json 2>/dev/null
cat .healthcheck/toolchain/language-census.json 2>/dev/null
```

If `.healthcheck.toml` contains a `[docs]` section, apply overrides:
- `readme_required_sections` — override the default section list
- `inline_doc_threshold` — minimum percentage of documented public APIs (default: 80)
- `adr_threshold` — minimum source file count before ADR is expected (default: 10)
- `changelog_required` — boolean, default true

### Step 1: README Presence and Completeness

**1a. Check README exists:**

Search for `README.md`, `README.rst`, `README.txt`, or `README` (case-insensitive) in the project root.

- Missing README: emit a **critical** finding.

**1b. Parse README for expected sections:**

The default expected sections are:

| Section | Match Pattern | Severity if Missing |
|---|---|---|
| Overview / Introduction | `# ` (H1) or first paragraph >50 chars | major |
| Setup / Installation | `/(?:setup|install|getting.started|quick.start)/i` | major |
| Usage | `/(?:usage|how.to.use|examples?|quick.start)/i` | major |
| Deployment | `/(?:deploy|ship|release|publish|ci.?cd)/i` | minor |
| Contributing | `/(?:contribut|develop|hack)/i` | minor |

Scan H2 (`## `) and H3 (`### `) headings in the README. For each expected section, check if at least one heading matches the pattern.

**1c. README freshness:**

Check the last-modified date of the README:
```bash
git log -1 --format="%aI" -- README.md
```

If the README has not been modified in >180 days and the project has commits in the last 30 days, emit an **info** finding about stale documentation.

**1d. Consume markdownlint findings:**

If `.healthcheck/toolchain/markdownlint.json` exists, parse findings that apply to the README file. Map markdownlint rule severities:
- `MD001` (heading increment) → minor
- `MD009` (trailing spaces) → info
- `MD012` (multiple blank lines) → info
- `MD013` (line length) → info
- `MD025` (multiple H1s) → minor
- `MD034` (bare URLs) → info
- `MD040` (fenced code without language) → minor
- All others → info

### Step 2: Inline Documentation Coverage

**2a. Identify public API surface:**

Use the language census to determine which files to scan. For each supported language:

**TypeScript / JavaScript (native):**
```bash
# Find exported symbols without preceding JSDoc
grep -n "^export " src/**/*.{ts,tsx,js,jsx} 2>/dev/null
```

For each `export` line (including `export default`, `export function`, `export class`, `export const`, `export interface`, `export type`, `export enum`), check the preceding lines (up to 5 lines above) for a `/** ... */` block.

A symbol is **documented** if a non-empty `/** ... */` comment exists within 5 lines above the export. It is **undocumented** if no such block exists or the block is empty.

**Python (native):**
```bash
# Find public functions/classes without docstrings
grep -n "^def \|^class \|^async def " **/*.py 2>/dev/null
```

For each `def`/`class`/`async def` at module level (not indented, or indented once for class methods), check if the next non-blank line is a triple-quoted string (`"""` or `'''`).

Skip symbols starting with `_` (private by convention).

**Go (heuristic):**
```bash
# Exported symbols start with uppercase
grep -n "^func [A-Z]\|^type [A-Z]\|^var [A-Z]\|^const [A-Z]" **/*.go 2>/dev/null
```

Check if the line immediately preceding the symbol starts with `//`.

**Java / Kotlin (heuristic):**
```bash
grep -n "public \(class\|interface\|enum\|.*(\)" **/*.java **/*.kt 2>/dev/null
```

Check for `/** ... */` Javadoc preceding the declaration.

**Other heuristic languages:**
Apply similar patterns — look for public/exported declarations and check for comment blocks immediately above.

**2b. Calculate coverage:**

```
coverage_pct = (documented_symbols / total_public_symbols) * 100
```

Emit findings based on coverage:
- Coverage < 30%: **major** — "Public API is largely undocumented ({pct}% coverage)"
- Coverage 30-79%: **minor** — "Inline doc coverage is below threshold ({pct}% vs {threshold}%)"
- Coverage >= 80%: no finding (or **info** if >95% as positive reinforcement)

**2c. Emit per-file findings for egregious gaps:**

If a file has >5 undocumented public symbols, emit a **minor** finding for that specific file listing the undocumented symbols.

### Step 3: ADR / Decision Log Presence

**3a. Count source files:**

Using the language census, count total source files (excluding test files, config files, and generated files).

**3b. Check for ADR directory:**

If source file count exceeds the `adr_threshold` (default: 10):

```bash
# Look for ADR-like directories
ls -d docs/adr/ docs/decisions/ docs/architecture/ adr/ ADR/ decisions/ 2>/dev/null
```

Also check for:
- `ARCHITECTURE.md` in the root
- `docs/architecture.md`
- Any file matching `**/adr-*.md` or `**/ADR-*.md`

If no ADR directory or architecture documentation is found:
- Projects with >50 source files: **major** — architectural decisions should be recorded
- Projects with 10-50 source files: **minor** — consider adding an ADR directory

If an ADR directory exists but contains 0 files: **minor** — "ADR directory exists but is empty"

### Step 4: Changelog Presence

**4a. Check for changelog:**

```bash
ls CHANGELOG.md CHANGELOG.rst CHANGELOG.txt CHANGES.md HISTORY.md RELEASES.md 2>/dev/null
```

Also check `package.json` for a `version` field as evidence of versioning intent. If no changelog is found: versioned projects get **minor**, non-versioned get **info**.

**4b. Changelog freshness:**

If a changelog exists, check its last modification:
```bash
git log -1 --format="%aI" -- CHANGELOG.md
```

If the changelog has not been updated in >90 days but there have been commits: **info** — "Changelog may be stale"

### Step 5: Score Calculation

Apply the standard scoring formula:

```
score = 100 - (5 * critical_count) - (2 * major_count) - (0.5 * minor_count)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding, not banker's rounding
```

Info findings do NOT affect the score.

### Step 6: Write Report

Write the dimension report to `.healthcheck/reports/docs.json`:

```json
{
  "key": "docs",
  "score": 78,
  "weight": 0.8,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "README present but missing deployment and contributing sections. Inline doc coverage at 62% (below 80% threshold). No ADR directory found (34 source files). Changelog present and current.",
  "metrics": {
    "readme_present": true,
    "readme_sections_found": ["overview", "setup", "usage"],
    "readme_sections_missing": ["deployment", "contributing"],
    "inline_doc_coverage_pct": 62,
    "total_public_symbols": 84,
    "documented_public_symbols": 52,
    "adr_present": false,
    "source_file_count": 34,
    "changelog_present": true,
    "markdownlint_findings": 3
  }
}
```

## Output

- `.healthcheck/reports/docs.json` — dimension report using the dimension fields and finding schema in `shared/schema.json`

## Constraints

- **Respect .gitignore:** Only scan files tracked by git (`git ls-files`)
- **Skip generated files:** Exclude files in `node_modules/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `vendor/`, and any directory matching common generation patterns
- **Skip test files:** Do not count test files (`*.test.*`, `*.spec.*`, `test_*`, `*_test.*`) when measuring inline doc coverage — tests are their own documentation
- **No false positives on re-exports:** An `export { foo } from './bar'` re-export does not need its own JSDoc — the original declaration should be documented
- **Confidence tagging:** Tag all findings with the appropriate confidence tier from the language support matrix
- **Scoring math is pure:** No LLM judgment in the arithmetic. The score is a deterministic function of finding counts.
- **All findings must include a `fix_prompt`** following the template in `shared/fix_prompt_template.md`

## fix_prompt Examples

### Example 1: Missing README Sections

**Finding:** README missing setup and contributing sections (major)

```
# Fix: Add missing sections to README.md

## Context
The project README is missing "Setup" and "Contributing" sections. New contributors
cannot determine how to install dependencies or set up a development environment.

## Location
- File: README.md
- Line: N/A
- Dimension: docs / major

## Current behavior
README.md contains an overview and usage section but no setup instructions or
contributing guidelines.

## Required change
1. Add a `## Setup` section after the overview that includes:
   - Prerequisites (Node.js version, system dependencies)
   - Clone and install commands (`git clone`, `npm install`)
   - Environment variable setup (reference `.env.example` if it exists)
   - How to verify the setup works (e.g., `npm run dev`)
2. Add a `## Contributing` section near the end that includes:
   - Branch naming convention
   - How to run tests (`npm test`)
   - PR process (if applicable)
   - Link to CODE_OF_CONDUCT.md if it exists

## Constraints
- Do not rewrite existing sections — only add the missing ones
- Match the heading style already used in the file (ATX headings with ##)
- Keep each section concise (5-15 lines)

## Verification
- Visually inspect README.md for the new sections
- Run `markdownlint README.md` if available to check formatting
```

### Example 2: Undocumented Public API

**Finding:** 8 exported functions in `src/utils/transform.ts` lack JSDoc (minor)

```
# Fix: Add JSDoc to exported functions in src/utils/transform.ts

## Context
8 exported functions in src/utils/transform.ts have no JSDoc comments.
These are public API surface consumed by other modules and should document
their purpose, parameters, and return values.

## Location
- File: src/utils/transform.ts
- Line: 12
- Dimension: docs / minor

## Current behavior
Functions are exported without any documentation:
```ts
export function normalizeInput(raw: string): NormalizedData {
  // ... implementation
}
```

## Required change
Add a JSDoc block above each exported function with:
- A one-line `@description` or summary line
- `@param` for each parameter with type and meaning
- `@returns` describing the return value
- `@throws` if the function can throw
- `@example` for non-obvious usage (optional but encouraged)

Apply this to the exports currently starting at lines 12, 28, 45, 62, 78, 95, 110, and 130.

Example:
```ts
/**
 * Normalizes raw user input by trimming whitespace, lowercasing,
 * and stripping control characters.
 *
 * @param raw - The unprocessed input string from the request body
 * @returns Cleaned and normalized data ready for validation
 * @throws {ValidationError} If raw input exceeds 10,000 characters
 */
export function normalizeInput(raw: string): NormalizedData {
```

## Constraints
- Do not change any function signatures or implementations
- Do not add `@internal` or `@private` — these are intentionally public exports
- Match the JSDoc style used elsewhere in the project if one exists

## Verification
- Run `grep -c '/\*\*' src/utils/transform.ts` — count should increase by 8
- Run `npx tsc --noEmit` to verify no type errors introduced
```

### Example 3: No ADR Directory

**Finding:** Project has 34 source files but no architectural decision records (minor)

```
# Fix: Create ADR directory and first decision record

## Context
This project has 34 source files but no architectural decision records.
As the codebase grows, capturing key design decisions prevents knowledge
loss and repeated debates.

## Location
- File: docs/adr/ (directory to create)
- Line: N/A
- Dimension: docs / minor

## Current behavior
No `docs/adr/` directory or equivalent architecture documentation exists.

## Required change
1. Create the directory structure:
   ```
   docs/adr/
   ```
2. Create `docs/adr/README.md` with a brief explanation:
   ```markdown
   # Architecture Decision Records

   This directory contains Architecture Decision Records (ADRs) for this project.

   ## Format

   Each ADR is a markdown file named `NNNN-title-in-kebab-case.md` with sections:
   - **Status:** Proposed | Accepted | Deprecated | Superseded
   - **Context:** What is the issue motivating this decision?
   - **Decision:** What is the change we are making?
   - **Consequences:** What becomes easier or harder?
   ```
3. Create `docs/adr/0001-use-adr-for-architecture-decisions.md` as the seed record
   documenting the decision to use ADRs.

## Constraints
- Do not move or restructure existing documentation
- Use the Nygard ADR template format (Status, Context, Decision, Consequences)
- Number ADRs with zero-padded 4-digit prefixes (0001, 0002, ...)

## Verification
- Run `ls docs/adr/` and confirm at least 2 files exist (README.md + first ADR)
- Run `cat docs/adr/0001-use-adr-for-architecture-decisions.md` and verify it follows the template
```

## Applicability Check

This dimension is **always applicable** — every project should have documentation. However, the depth of findings scales with project size:

- Projects with <5 source files: Only check README presence and basic completeness
- Projects with 5-10 source files: Add inline doc coverage checks
- Projects with >10 source files: Add ADR presence checks
- Projects with >50 source files: Increase ADR severity to major

## Edge Cases

- **Monorepo with multiple READMEs:** Check root README plus any `packages/*/README.md`. Each workspace README is evaluated independently but only the root README missing is critical.
- **Non-English documentation:** Accept any natural language content — do not flag non-English READMEs.
- **Auto-generated docs:** If a `docs/` directory exists with generated API docs (typedoc, sphinx, etc.), credit that toward inline doc coverage even if source-level comments are sparse.
- **README in non-markdown format:** Accept `.rst`, `.txt`, `.adoc` — not just `.md`.
