# Language Detection & Polyglot Routing

## Overview

Before any dimension skill runs, the orchestrator produces a `language-census.json` at `.healthcheck/toolchain/language-census.json`. Every dimension skill consumes this to determine which files to scan and at what confidence tier.

## Census Format

```json
{
  "primary_language": "typescript",
  "languages": [
    { "lang": "typescript", "loc": 4820, "files": 47, "support": "native" },
    { "lang": "terraform",  "loc": 420,  "files": 6,  "support": "heuristic" },
    { "lang": "yaml",       "loc": 180,  "files": 12, "support": "config-only" }
  ],
  "manifests": ["package.json", "tsconfig.json", ".terraform.lock.hcl"]
}
```

## Detection Procedure

1. Walk the repo tree, respecting `.gitignore`
2. Map file extensions to languages using the extension table below
3. Count lines of code (LOC) per language, excluding blank lines and comments
4. Identify manifest files (package.json, requirements.txt, go.mod, Cargo.toml, etc.)
5. Determine `primary_language` as the language with the highest LOC
6. Assign `support` tier per skill's declared support matrix

## Extension Table

| Extension(s) | Language |
|---|---|
| `.ts`, `.tsx` | typescript |
| `.js`, `.jsx`, `.mjs`, `.cjs` | javascript |
| `.py`, `.pyi` | python |
| `.go` | go |
| `.rs` | rust |
| `.java` | java |
| `.kt`, `.kts` | kotlin |
| `.swift` | swift |
| `.rb` | ruby |
| `.php` | php |
| `.c`, `.h` | c |
| `.cpp`, `.cc`, `.cxx`, `.hpp` | cpp |
| `.cs` | csharp |
| `.tf`, `.tfvars` | terraform |
| `.rego` | rego |
| `.yaml`, `.yml` | yaml |
| `.json` | json |
| `.md`, `.mdx` | markdown |
| `.html`, `.htm` | html |
| `.css`, `.scss`, `.less` | css |
| `.sql` | sql |
| `.sh`, `.bash`, `.zsh` | shell |
| `.dockerfile`, `Dockerfile` | dockerfile |
| `.vue` | vue |
| `.svelte` | svelte |

## Support Tiers

Each dimension skill declares a support matrix with these tiers:

| Tier | Meaning | Confidence |
|---|---|---|
| `native` | Full AST-level analysis available | High — findings are precise |
| `tree_sitter` | Tree-sitter grammar available for parsing | High — structural analysis |
| `heuristic` | Pattern-matching / grep-based analysis | Medium — may produce false positives |
| `config-only` | Only configuration/manifest scanning | Low — limited to config issues |
| `skip` | Language not relevant to this dimension | N/A |

When a skill produces findings from a `heuristic` pass, it MUST include `"confidence": "heuristic"` in the finding's metrics or as a top-level field so the dashboard can visually flag lower-confidence results.

## Skill Support Matrix Declaration

Every skill MUST include a support matrix in its SKILL.md:

```yaml
support:
  native: [typescript, javascript, python]
  tree_sitter: [go, rust, java, ruby]
  heuristic: [terraform, kotlin, swift]
  skip: [yaml, json, markdown]
```

When processing a file, the skill picks the highest available tier. If a language appears in the census but the skill has no support for it, the skill skips those files and notes the gap in its dimension report.
