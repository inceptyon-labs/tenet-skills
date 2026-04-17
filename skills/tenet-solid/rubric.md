# Tenet SOLID — Rubric

## Scoring Formula

```
score = 100 - (5 × critical + 2 × major + 0.5 × minor)
score = max(0, min(100, round(score)))
```

Info findings do NOT affect the score.

## Finding Thresholds

### S — Single Responsibility Principle (SRP)

| Condition | Severity | Score Impact |
|---|---|---|
| Class with 3-4 distinct responsibility clusters | minor | -0.5 each |
| Class with 5-6 distinct responsibility clusters | major | -2 each |
| Class with 7+ distinct responsibility clusters | critical | -5 each |
| File mixes domain logic with infrastructure concerns | minor | -0.5 each |
| Single function handles 3+ unrelated tasks | minor | -0.5 each |

**Responsibility clusters** are identified by grouping methods semantically:
- Data access: `fetch*`, `load*`, `read*`, `query*`, `find*`, `save*`, `persist*`, `insert*`, `update*`, `delete*`
- Presentation: `render*`, `display*`, `format*`, `toString`, `toHTML`, `toJSON`, `print*`
- Validation: `validate*`, `check*`, `verify*`, `is*`, `has*`, `can*`, `assert*`, `ensure*`
- HTTP/API: `handle*`, `route*`, `middleware*`, `respond*`, `request*`
- Business logic: `process*`, `calculate*`, `compute*`, `apply*`, `execute*`, `run*`
- Notification: `notify*`, `send*`, `email*`, `alert*`, `publish*`, `emit*`, `dispatch*`
- Auth/Security: `authenticate*`, `authorize*`, `login*`, `logout*`, `encrypt*`
- Caching: `cache*`, `invalidate*`, `evict*`, `memoize*`
- Logging/Monitoring: `log*`, `trace*`, `metric*`, `track*`, `audit*`
- Configuration: `configure*`, `setup*`, `init*`, `bootstrap*`, `register*`

### O — Open/Closed Principle (OCP)

| Condition | Severity | Score Impact |
|---|---|---|
| Type-switch with 3-4 behavioral branches | minor | -0.5 each |
| Type-switch with 5-7 behavioral branches | major | -2 each |
| Type-switch with 8+ behavioral branches | critical | -5 each |
| `instanceof`/`typeof` checks driving behavior branches | minor | -0.5 each |

**Excluded (not violations):** Redux reducers, factory functions, serialization codecs, exhaustive pattern matching (Rust/Scala/Haskell), simple value-mapping switches.

### L — Liskov Substitution Principle (LSP)

| Condition | Severity | Score Impact |
|---|---|---|
| Override throws `NotImplementedError` / `UnsupportedOperationException` | major | -2 each |
| Override narrows parameter types (contravariance violation) | major | -2 each |
| Override widens return type or changes error semantics | minor | -0.5 each |
| Override changes void to throwing or vice versa | minor | -0.5 each |

### I — Interface Segregation Principle (ISP)

| Condition | Severity | Score Impact |
|---|---|---|
| Interface with 8-11 methods | minor | -0.5 each |
| Interface with 12-15 methods | major | -2 each |
| Interface with 16+ methods | critical | -5 each |
| Implementation leaves methods as no-ops / throws | major | -2 each |

### D — Dependency Inversion Principle (DIP)

| Condition | Severity | Score Impact |
|---|---|---|
| Domain module imports concrete infrastructure class | minor | -0.5 each |
| Domain module instantiates infrastructure (`new ConcreteClient()`) | major | -2 each |
| 3+ domain files import the same concrete infrastructure class | critical | -5 (once, for the systemic pattern) |

**DIP analysis is skipped** when the project has fewer than 10 source files or no detectable layered architecture. This is noted in the report `notes` field.

### Info Observations (no score impact)

| Condition | Reported As |
|---|---|
| Class with 2 responsibility clusters | info: approaching SRP threshold |
| Interface with 6-7 methods | info: approaching ISP threshold |
| Concrete dependency that could benefit from interface | info: DIP improvement opportunity |
| Sealed/final class that could benefit from interface for testability | info: testability suggestion |

## Deduplication Rules

- If a class violates both SRP (god class) and DIP (concrete infrastructure imports), emit both findings — they measure different problems.
- If the same concrete infrastructure class is imported by multiple domain files, emit one `critical` DIP finding for the systemic pattern rather than multiple `minor` findings. Do NOT double-count.
- If an interface is fat (ISP) AND an implementing class throws on some methods (also ISP), emit one finding for the interface and one for the implementation — both count.

## Confidence Mapping

| Detection Method | Confidence Tag |
|---|---|
| TS/JS/Python/Java class/interface analysis | `native` |
| Keyword/naming pattern matching for other languages | `heuristic` |

Note: This dimension never produces `deterministic` or `tree_sitter` findings. SOLID analysis requires semantic judgment beyond what static tools or AST traversal alone can provide.

## Acceptable Patterns (Must NOT Be Flagged)

| Pattern | Reason |
|---|---|
| Redux reducers (`switch` on `action.type`) | Idiomatic; does not violate OCP in practice |
| Factory functions/classes | Factories are the OCP-compliant creation pattern |
| Serialization/deserialization switches | Stable, exhaustive codec mappings |
| Exhaustive `match`/`case` in Rust, Scala, Haskell, F# | Compiler-enforced exhaustiveness |
| Facade/Orchestrator/Mediator classes | Coordination is their single responsibility |
| MVC Controller classes | Composition roots that delegate to services |
| Simple enum-to-label mapping | Data mapping, not behavioral branching |
| Abstract base classes with shared implementation | Template Method pattern |
| Test helper classes with many methods | Test utilities are exempt from SRP |

## Outputs Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/solid.json` | Valid JSON, matches dimension schema, score 0-100 integer |
| All findings | Each has `dimension`, `severity`, `title`, `description`, `file`, `line`, `fix_prompt`, `confidence` |
| Metrics object | Contains `total_classes_analyzed`, `srp_violations`, `ocp_violations`, `lsp_violations`, `isp_violations`, `dip_violations` at minimum |

## Edge Cases

- **No classes or interfaces (purely functional codebase):** SRP analysis applies to modules/files instead of classes. OCP analysis still applies to type-switches. ISP/LSP may be not applicable — set findings to empty for those, note in `notes`.
- **No layered architecture detected:** Skip DIP analysis, note in `notes`.
- **Project with fewer than 10 source files:** Skip DIP analysis, reduce SRP thresholds by 1 cluster (4+ becomes minor instead of 3+). Note in `notes`.
- **Monorepo:** Analyze each package/workspace independently. Domain vs. infrastructure boundaries are per-package.
- **Findings cap exceeded (>50):** Keep all critical, then major, then minor, then info. Add an info finding noting omitted count.
