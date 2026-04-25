# Tenet Debt — Rubric

## Scoring Formula

```
score = 100 - (5 * critical) - (2 * major) - (0.5 * minor)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding, not banker's rounding
```

Info findings do NOT affect the score.

## Finding Categories

### 1. TODO/FIXME/HACK/XXX/KLUDGE/WORKAROUND Comments

| Condition | Severity |
|---|---|
| Marker < 90 days old | `info` |
| Marker 90-365 days old | `minor` |
| Marker > 365 days old | `major` |
| HACK or XXX marker > 90 days old | escalate one tier |
| Any marker in critical path (auth, payment, validation) > 180 days | escalate one tier |

**Detection:** `grep -n -i -E '\b(TODO|FIXME|HACK|XXX|KLUDGE|WORKAROUND)\b'` across `git ls-files`.

**Aging:** `git blame --porcelain` on each file, extract `author-time` for flagged lines.

**Exclusions:**
- Files in `node_modules/`, `vendor/`, `dist/`, `build/`, `__pycache__/`, `.venv/`
- Lockfiles (`package-lock.json`, `yarn.lock`, `Gemfile.lock`, `poetry.lock`, `go.sum`, `Cargo.lock`)
- Generated files (headers: `@generated`, `// Code generated`, `auto-generated`)

### 2. Commented-Out Code Blocks

| Condition | Severity |
|---|---|
| Block of 5-15 commented lines with >60% code-like patterns | `minor` |
| Block of 16-50 commented lines with >60% code-like patterns | `major` |
| Block of 50+ commented lines | `major` |

**Detection:** Walk each file, track runs of consecutive comment lines (1 blank line gap allowed). For runs of 5+ lines, check if >60% match code-like patterns: assignments (`=`, `+=`, `:=`), function calls (`word(`), control flow (`if`, `else`, `for`, `while`, `return`), brackets/braces, semicolons, import/require statements.

**Aging:** `git blame` on the first line of the block.

**Confidence:** `heuristic`

### 3. Deprecated API Usage

| Condition | Severity |
|---|---|
| Deprecated API still functional in current runtime | `minor` |
| Deprecated API removed or scheduled for removal in next major version | `major` |

**Detection:** Pattern-match against known deprecated APIs per language:

- **JS/TS:** `new Buffer(`, `url.parse(`, `document.write(`, `with (`, `__proto__`, `require('domain')`, `require('sys')`
- **Python:** `imp` module, `optparse`, `os.popen(`, `cgi` module, `typing.Dict`/`List`/`Optional` (3.9+)
- **Java:** `Date()` constructor, `StringBuffer` in non-threaded contexts, `Vector`, `Hashtable`
- **Go:** `ioutil` package, `io/ioutil.ReadAll`, `io/ioutil.ReadFile`

**Confidence:** `native`

### 4. Stub Implementations

| Condition | Severity |
|---|---|
| Stub in test file | skip (not a finding) |
| Stub in non-test file < 90 days old | `minor` |
| Stub in non-test file > 90 days old | `major` |
| Stub in critical path (auth, payment, validation) | `major` regardless of age |

**Detection patterns:**
- JS/TS: `throw new Error("not implemented")`, `throw new Error("TODO")`
- Python: `raise NotImplementedError`, `pass # TODO`, `pass # stub`
- Go: `panic("not implemented")`, `panic("TODO")`
- Rust: `unimplemented!()`, `todo!()`
- Java: `throw new UnsupportedOperationException()`
- C#: `throw new NotImplementedException()`

**Confidence:** `native`

### 5. Long-Lived Feature Flags

| Condition | Severity |
|---|---|
| Flag < 90 days old | `info` |
| Flag 90-180 days with `// temporary` comment | `minor` |
| Flag > 180 days | `minor` |
| Flag > 365 days | `major` |

**Detection:** Pattern-match on `feature_flag`, `featureFlag`, `FEATURE_`, `FF_`, `feature_toggle`, `isEnabled`, `is_enabled`, plus `process.env.ENABLE_*` / `os.environ.get("FEATURE_*")` patterns.

**Aging:** `git blame` on the line where the flag is declared or first used.

**Confidence:** `heuristic`

## Metrics Tracked

| Metric | Description |
|---|---|
| `total_markers` | Total TODO/FIXME/HACK/XXX/KLUDGE/WORKAROUND markers found |
| `aged_markers_90d` | Markers older than 90 days |
| `aged_markers_365d` | Markers older than 365 days |
| `commented_out_blocks` | Number of commented-out code blocks (5+ lines) |
| `commented_out_lines` | Total lines across all commented-out blocks |
| `deprecated_api_usages` | Count of deprecated API pattern matches |
| `stub_implementations` | Count of stub/placeholder implementations in non-test code |
| `stale_feature_flags` | Feature flags older than 90 days |
| `median_marker_age_days` | Median age of all debt markers |
| `oldest_marker_age_days` | Age of the oldest debt marker |

## Output

`.healthcheck/reports/debt.json` conforming to the findings schema in `shared/schema.json`.

Every finding includes a `fix_prompt` following `shared/fix_prompt_template.md`.
