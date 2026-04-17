# Tenet Performance — Rubric

## Scoring Formula

Start at **100**, subtract: `5 x critical + 2 x major + 0.5 x minor`. Floor 0, ceil 100, round to integer. Info findings do NOT affect the score.

## Finding Categories

### N+1 Query Patterns

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| `for`/`forEach`/`map` loop containing `await` + DB call (TS/JS) | major | native | Confirmed N+1: N queries in a loop |
| `for x in queryset` with ORM call in body (Python) | major | native | Django/SQLAlchemy N+1 |
| `Promise.all(arr.map(async => db.find()))` | minor | native | Parallelized but still N queries; prefer batch |
| Loop + DB call in Go/Java/Ruby | major | heuristic | Grep-based, may miss context |
| Nested ORM eager-load that triggers lazy queries | major | heuristic | Hard to confirm without runtime; flag if ORM has no `include`/`select_related` |

### Synchronous I/O in Hot Paths

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| `readFileSync`/`writeFileSync` in route handler or middleware | major | native | Blocks event loop |
| `readFileSync`/`writeFileSync` in utility module imported by handlers | minor | native | Indirectly blocks; may be acceptable for startup-only code |
| `requests.get/post` (sync) inside `async def` (Python) | major | native | Blocks the async event loop |
| `time.sleep()` inside `async def` (Python) | major | native | Use `asyncio.sleep()` |
| `open()` without `with` statement (Python) | minor | native | File handle leak risk |

**Exclusions (do NOT flag):**
- Sync I/O in `*.config.js`, `*.config.ts`, `webpack.config.*`, `vite.config.*`
- Sync I/O in `scripts/`, `bin/`, `migrations/`, `seeds/`
- Sync I/O in test files (`*.test.*`, `*.spec.*`, `__tests__/`)
- `existsSync` in conditional checks at module load time (common, acceptable pattern)

### Unbounded Queries

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| `SELECT * FROM table` with no WHERE/LIMIT in API handler | major | native | Unbounded result set in request path |
| `.findAll()` / `.find({})` with no `.limit()` in API handler | major | native | ORM equivalent of above |
| `Model.objects.all()` without slicing in Django view | major | native | Returns full table |
| `SELECT *` in any context (should list columns) | minor | native | Performance and security smell |
| Raw query without LIMIT in script/CLI tool | minor | heuristic | Less risky but still unbounded |

### Missing Database Indexes

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| Foreign key column without index, used in WHERE clause | major | heuristic | Confirmed slow query path |
| Foreign key column without index, no confirmed query | minor | heuristic | Preventive; may not matter yet |
| Column in `@unique` without explicit index | info | heuristic | Most ORMs create indexes for unique constraints automatically |

### Memory Leaks

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| `addEventListener` without `removeEventListener` in React useEffect | major | native | Listener accumulates on each mount |
| `addEventListener` without `removeEventListener` in class component | major | native | Missing cleanup in componentWillUnmount |
| `setInterval` without `clearInterval` in long-lived module | major | native | Interval never stops |
| Module-level `Map`/`Set`/`Object` used as cache with no eviction | minor | heuristic | May be intentional if key space is bounded |
| Module-level array with `.push()` and no cleanup | minor | heuristic | Grows without bound |
| `setInterval` without `clearInterval` in useEffect (no cleanup return) | major | native | React-specific leak |

### Bundle Size Issues (Frontend Only)

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| `moment` in dependencies | major | native | 329kB, replace with `date-fns` or `dayjs` |
| `lodash` (full) in dependencies without tree-shaking | major | native | 72kB, use `lodash-es` or individual imports |
| `aws-sdk` v2 in frontend dependencies | major | native | 3MB+, use `@aws-sdk/client-*` v3 |
| `faker` in dependencies (not devDependencies) | minor | native | Test-only package shipped to production |
| No code splitting config in project with >20 routes | minor | heuristic | All code in a single bundle |
| Large icon library imported fully | minor | heuristic | Subset or SVG icons preferred |

### React Re-render Hazards (React Only)

| Pattern | Severity | Confidence | Notes |
|---|---|---|---|
| Inline object/array literal as prop on custom component | minor | native | New reference on every render |
| Inline function as prop on custom component | minor | native | New function on every render |
| `.filter().map()` / `.sort().map()` chain without `useMemo` | minor | native | Recomputed on every render |
| Expensive computation without `useMemo` in component body | major | heuristic | Difficult to confirm "expensive" statically |
| Missing `useCallback` on function passed to memoized child | minor | heuristic | Breaks `React.memo` optimization |

**Exclusions (do NOT flag):**
- Inline props on native HTML elements (`div`, `span`, `button`, etc.)
- Event handlers (`onClick`, `onChange`) on native HTML elements
- Props in components rendered once (e.g., top-level `<App>`)
- Style objects extracted to module-level constants (these are stable references)

## Dimension Metrics

The report MUST include these metrics in the `metrics` object:

| Metric | Type | Description |
|---|---|---|
| `files_scanned` | integer | Total source files analyzed |
| `n_plus_one_count` | integer | N+1 query patterns found |
| `sync_io_count` | integer | Sync I/O in hot path findings |
| `unbounded_query_count` | integer | Unbounded queries found |
| `missing_index_count` | integer | Missing indexes found |
| `memory_leak_count` | integer | Memory leak patterns found |
| `bundle_size_issues` | integer | Bundle size findings (0 if not frontend) |
| `react_rerender_issues` | integer | React re-render findings (0 if not React) |
| `languages_analyzed` | string[] | Languages that were scanned |

## Output Validated

| Artifact | Validation |
|---|---|
| `.healthcheck/reports/performance.json` | Valid JSON, matches report schema, all required fields present |
| Every finding | Has `dimension`, `severity`, `title`, `description`, `fix_prompt`, `confidence` |
| Score | Computed exactly per formula: `100 - (5*critical + 2*major + 0.5*minor)`, clamped [0, 100] |
| Confidence | All heuristic-tier findings tagged `"confidence": "heuristic"` |
| Excluded files | No findings from `node_modules/`, `dist/`, test files (except memory leak in setup), config files (for sync I/O) |
