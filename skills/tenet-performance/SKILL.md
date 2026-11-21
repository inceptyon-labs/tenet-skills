---
name: tenet-performance
description: "Audits performance risks: N+1 queries, sync I/O, indexes, leaks, bundles, and rerenders."
when_to_use: "tenet performance, tenet-performance dimension, Tenet performance anti-pattern audit. Run via /tenet-skills:tenet-orchestrator or directly with /tenet-skills:tenet-performance."
model: opus
disable-model-invocation: true
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Performance — Performance Anti-Pattern Detection

> Detects structural performance problems that cause latency spikes, memory bloat, and unnecessary resource consumption. Focuses on patterns that are reliably detectable through static analysis.

## Purpose

This skill identifies performance anti-patterns that are detectable without runtime profiling. It scans for N+1 query patterns (loop + await query), synchronous I/O in hot paths, missing database indexes, unbounded queries, memory leaks, bundle size issues in frontend projects, and React re-render hazards. Findings are grounded in specific code locations with actionable fix_prompts.

## Calibration — read first

Follow `shared/scan-discipline.md` (complete every step, enumerate rather than sample, and §2a:
report only issues that actually exist), `shared/verification.md` (every finding is confirmed
against the code before it ships; unconfirmed candidates are dropped, not demoted), and
`shared/severity.md` (severity is confirmed impact, never a hedge for doubt).

A finding must exist in this codebase on a path that can run. Do not report hypotheticals, dead
code, style preferences, or anything an upstream check already prevents. Zero findings for a step
is the normal result on healthy code; do not fill a step to show you looked. Do not overthink it:
read the code and its context, decide, move on.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python]
  heuristic: [go, java, ruby, swift, dart, rust]
  skip: [yaml, json, markdown, css, html, shell, terraform, dockerfile]
```

- **Native** (TS/JS/Python): Pattern matching with high confidence on async/await, ORM calls, React hooks, bundle config, event listener patterns.
- **Platform** (Swift/SwiftUI, Dart/Flutter, Rust/Tauri): Steps 7b to 7d. Grep finds the candidate; every finding is confirmed by reading the code around it.
- **Heuristic** (Go/Java/Ruby): Grep-based detection of common patterns (database calls in loops, missing pagination). Lower confidence — all findings tagged `"confidence": "heuristic"`.

## Toolchain Inputs

This skill does **not** consume `.healthcheck/toolchain/` outputs directly. It performs its own heuristic grep-based analysis on source files.

It **does** read:
- `.healthcheck/toolchain/language-census.json` — to determine which languages are present, which files to scan, and whether frontend-specific checks (bundle size, React) apply.

## Procedure

### Step 0: Read Language Census

Read `.healthcheck/toolchain/language-census.json`. Determine:
- Which languages are present and at what support tier
- Whether a frontend framework is in use (check manifests for `react`, `vue`, `svelte`, `next`, `nuxt`, `gatsby` in `package.json` dependencies)
- Whether an ORM or database library is present (check for `prisma`, `sequelize`, `typeorm`, `knex`, `mongoose`, `sqlalchemy`, `django`, `gorm`, `activerecord` in manifests)

Skip languages at the `skip` tier. For each supported language, run the applicable checks below.

### Step 1: N+1 Query Detection

Scan for loops that contain awaited database or network calls. This is the highest-value check — a single N+1 can dominate request latency.

**TypeScript / JavaScript:**
```bash
# Pattern: for/forEach/map loop containing await + DB call
git grep -nP "for\s*\(" -- '*.ts' '*.tsx' '*.js' '*.jsx'
  # Then check the loop body (next ~20 lines) for await + DB call patterns
```

Look for these DB call signatures inside loops:
- `await.*\.find(` / `.findOne(` / `.findMany(` / `.findAll(`
- `await.*\.query(` / `.execute(` / `.raw(`
- `await.*\.get(` / `.fetch(` / `.select(`
- `await.*prisma\.` / `await.*knex(` / `await.*sequelize\.`
- `await.*\.save(` / `.create(` / `.update(` / `.delete(`

Also check for `Promise.all(arr.map(async` wrapping individual DB calls — this parallelizes but still produces N queries.

**Python:**
```bash
# Pattern: for loop body containing ORM call
# Look for: for x in queryset / for x in items followed by Model.objects / session.query
git grep -nP "for .* in " -- '*.py'
  # Then check for .objects. / session.query / cursor.execute in the loop body
```

**Go / Java / Ruby (heuristic):**
```bash
# Go: for range loop + db.Query/db.Exec
# Java: for/forEach + repository.find / jdbcTemplate.query
# Ruby: .each do + Model.find / Model.where
```

**Severity:** `major` for confirmed N+1 patterns. `minor` for `Promise.all(arr.map(` wrapping DB calls (parallelized but still N queries).

### Step 2: Synchronous I/O in Hot Paths

Detect synchronous/blocking I/O calls that should be asynchronous.

**TypeScript / JavaScript:**
```bash
# Sync filesystem calls in non-config/non-setup files
git grep -nP "readFileSync|writeFileSync|existsSync|readdirSync|statSync|mkdirSync|appendFileSync" -- '*.ts' '*.tsx' '*.js' '*.jsx'
```

Exclude files that are clearly setup/build/config:
- `*.config.js`, `*.config.ts`, `webpack.config.*`, `vite.config.*`, `rollup.config.*`
- `scripts/`, `bin/`, `migrations/`, `seeds/`
- Test files (`*.test.*`, `*.spec.*`, `__tests__/`)

**Python:**
```bash
# Blocking calls in async functions
git grep -nP "def async|async def" -- '*.py'
  # Then check for: open(), requests.get/post, time.sleep, subprocess.run
```

**Severity:** `major` if found in route handlers, middleware, or API controllers. `minor` if in utility/helper files (may be acceptable).

### Step 3: Unbounded Queries

Scan for database queries that fetch unlimited rows — these are time bombs that work fine on small datasets and crash production.

**All languages:**
```bash
# SELECT * without WHERE or LIMIT
git grep -nP "SELECT \*" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.go' '*.java' '*.rb'
# Check for absence of WHERE / LIMIT / OFFSET / TOP in the same query string

# ORM calls without limits
git grep -nP "\.findAll\(\s*\)" -- '*.ts' '*.tsx' '*.js' '*.jsx'  # Empty findAll
git grep -nP "\.find\(\s*\{\s*\}\)" -- '*.ts' '*.tsx' '*.js' '*.jsx'  # find({}) with no limit
git grep -nP "Model\.objects\.all\(\)" -- '*.py'  # Django all() without [:N]
```

Also flag:
- `.find({})` or `.find()` without `.limit()` in Mongoose/MongoDB calls
- `SELECT *` in raw queries (should specify columns)
- Missing pagination in list endpoints (check route handlers returning array results without `skip`/`take`/`limit`/`offset` parameters)

**Severity:** `major` for unbounded queries in API handlers or scheduled jobs. `minor` for unbounded queries in scripts or CLI tools.

### Step 4: Missing Database Indexes

If schema/migration files are present, check for likely missing indexes.

```bash
# Find schema files
# Prisma: schema.prisma
# SQL migrations: *.sql in migrations/
# Sequelize/TypeORM: model definition files
# Django: models.py
```

Check for:
- Foreign key columns without `@index` (Prisma) or `INDEX` (SQL)
- Columns used in `WHERE` clauses (cross-reference query patterns from Step 3) without indexes
- `unique` constraints that could benefit from a unique index

**Severity:** `major` if the column is used in a WHERE clause found in the codebase. `minor` if it is a foreign key without a confirmed query pattern.

### Step 5: Memory Leak Detection

Scan for common memory leak patterns.

**TypeScript / JavaScript:**
```bash
# addEventListener without corresponding removeEventListener
git grep -nP "addEventListener" -- '*.ts' '*.tsx' '*.js' '*.jsx'
# Check if the same file has a matching removeEventListener for each add

# setInterval without clearInterval
git grep -nP "setInterval" -- '*.ts' '*.tsx' '*.js' '*.jsx'
# Check if the returned ID is stored and cleared

# Unbounded caches / Maps that grow without eviction
git grep -nP "new Map\(\)|new Set\(\)|const cache|let cache|var cache" -- '*.ts' '*.tsx' '*.js' '*.jsx'
# Flag if module-level (not inside a function) and no .delete() or .clear() in the same file

# Global/module-level array push without cleanup
git grep -nP "\.push\(" -- '*.ts' '*.tsx' '*.js' '*.jsx'
# Flag if pushing to a module-level array with no splice/pop/length=0
```

**React-specific:**
```bash
# useEffect with addEventListener but no cleanup return
# Pattern: useEffect(() => { ... addEventListener ... }) without return () => { removeEventListener }
```

Read useEffect bodies (within ~15 lines of `useEffect(`) and flag if `addEventListener` appears without a cleanup return.

**Python:**
```bash
# Unbounded lists/dicts at module level
# Threads without daemon=True
# open() without with statement (file handle leak)
git grep -nP "open\(" -- '*.py' | grep -v "with open"
```

**Severity:** `major` for addEventListener without cleanup in components, setInterval without clear in long-lived modules. `minor` for module-level caches without eviction (may be intentional).

### Step 6: Bundle Size Issues (Frontend Projects Only)

Skip this step if no frontend framework detected in Step 0.

```bash
# Check for large dependencies in package.json
# Flag: moment (use date-fns or dayjs), lodash (use lodash-es or individual imports),
#        aws-sdk (use @aws-sdk/client-*), faker (should be devDep only)
```

**Curated list of heavy/replaceable dependencies:**
| Package | Issue | Alternative |
|---|---|---|
| `moment` | 329kB, mutable | `date-fns`, `dayjs` |
| `lodash` | 72kB full bundle | `lodash-es` + tree-shaking, or individual `lodash.get` etc. |
| `aws-sdk` | 3MB+ | `@aws-sdk/client-*` (v3, tree-shakeable) |
| `chart.js` + all plugins | 200kB+ | Load plugins selectively |
| `faker` in dependencies | Should be devDependencies only | Move to devDependencies |
| `@fortawesome/fontawesome-free` | 1.5MB | SVG icons or icon subset |

```bash
# Check for dynamic imports / code splitting
# Webpack: look for splitChunks in webpack.config.*
# Vite: look for build.rollupOptions.output.manualChunks in vite.config.*
# Next.js: check for next/dynamic imports
# React.lazy: check for React.lazy / lazy( usage
git grep -nP "splitChunks|manualChunks|React\.lazy|next/dynamic|import\(" -- '*.ts' '*.tsx' '*.js' '*.jsx'
```

Flag if:
- No code splitting configuration found in a project with >20 route/page components
- Large dependencies are in `dependencies` (not `devDependencies`) without tree-shaking evidence

**Severity:** `major` for heavy dependencies with lighter alternatives. `minor` for missing code splitting config.

### Step 7: React Re-render Hazards (React Projects Only)

Skip this step if React is not detected in Step 0.

```bash
# Inline object props — creates new reference every render
# Pattern: <Component prop={{ ... }} /> or <Component prop={[ ... ]} />
git grep -nP "=\{\s*\{" -- '*.tsx' '*.jsx'
git grep -nP "=\{\s*\[" -- '*.tsx' '*.jsx'

# Inline function props — creates new function every render
# Pattern: <Component onClick={() => ...} /> (but NOT in event handlers of native elements)
git grep -nP "=\{\s*\(" -- '*.tsx' '*.jsx'
git grep -nP "=\{\s*function" -- '*.tsx' '*.jsx'

# Missing useMemo on expensive computations
# Look for .filter().map(), .sort(), .reduce() chains NOT wrapped in useMemo
git grep -nP "\.filter\(.*\.map\(|\.sort\(.*\.map\(|\.reduce\(" -- '*.tsx' '*.jsx'
# Check if the result is wrapped in useMemo

# Missing useCallback on functions passed as props to child components
# This is heuristic — look for functions defined in component body and passed as props
```

Apply these filters to reduce false positives:
- Ignore inline props on native HTML elements (`<div>`, `<span>`, `<button>`) — only flag on custom components (PascalCase)
- Ignore event handlers like `onClick`, `onChange` on native elements
- Only flag `.filter().map()` chains if they operate on arrays of >0 estimated size (heuristic: check if the source is state or props, not a small constant)

**Severity:** `minor` for inline object/function props on custom components. `major` for expensive computation chains (sort/filter/reduce on large data) without useMemo in components that re-render frequently (check if parent passes changing props).

### Step 7b: Swift and SwiftUI (Apple Platform Projects Only)

Skip this step if the census shows no Swift. These checks find candidates; confirm each by
reading the surrounding type before reporting it.

```bash
# Blocking I/O. On the main actor these freeze the UI for the length of the read or request.
git grep -nP "(Data|String|NSData)\(contentsOf:|\.wait\(\)|DispatchSemaphore|Thread\.sleep|sleep\(" -- '*.swift' ':!*Tests*'

# Formatters and decoders are expensive to create. Inside `body`, a cell, or a loop they are
# rebuilt on every render or iteration.
git grep -nP "\b(DateFormatter|NumberFormatter|ISO8601DateFormatter|MeasurementFormatter|JSONDecoder|JSONEncoder|NSRegularExpression)\(" -- '*.swift' ':!*Tests*'

# Fetches. Look for one inside a loop (N+1) and for an unbounded @Query filtered in memory.
git grep -nP "modelContext\.fetch\(|\.fetch\(\s*(FetchDescriptor|NSFetchRequest)|@Query\b|@FetchRequest\b" -- '*.swift' ':!*Tests*'

# Long-lived callbacks that need tearing down.
git grep -nP "Timer\.(scheduledTimer|publish)|NotificationCenter\.default\.(addObserver|publisher)|\.sink\s*\{|CADisplayLink\(" -- '*.swift' ':!*Tests*'
```

Read each hit and report only these:

- **Blocking call on the main actor.** `Data(contentsOf:)` with a remote URL, a semaphore wait, or
  a synchronous file read of unbounded size, reached from a view, a `@MainActor` type, or a UI
  callback. A read of a small bundled file at launch is not a finding.
- **Expensive object built per render.** A formatter, decoder or regex created inside `var body`,
  a row view, or a `ForEach` closure. Created once as a `static let` or stored property is correct.
- **Work in `body`.** Sorting, filtering or grouping a collection that is not trivially small,
  directly in `body` or a computed property `body` reads. It reruns on every state change.
- **Fetch per row.** `modelContext.fetch` or a relationship fault inside a loop or a row view. An
  `@Query` with no predicate and no `fetchLimit` on a table that grows with use, narrowed
  afterwards with `.filter` in Swift.
- **Callback never torn down.** A repeating `Timer` with no `invalidate()`, a selector-based
  observer or `CADisplayLink` with no removal, or a `.sink` or timer closure that captures `self`
  strongly and is stored on `self` (a retain cycle, so the object and its work never stop).

**Severity:** `major` for a blocking network call on the main actor, a fetch per row over a
growing table, and a retain cycle on an object created repeatedly. `minor` for the rest.

### Step 7c: Flutter and Dart (Flutter Projects Only)

Skip this step if the census shows no Dart.

```bash
# A Future or Stream created inline in build() restarts on every rebuild.
git grep -nP "(future|stream):\s*(?!_|widget\.|snapshot)\w[\w.]*\(" -- '*.dart' ':!*_test.dart'

# Eagerly built lists.
git grep -nP "\b(ListView|GridView)\(\s*$|children:\s*\[?\s*(\.\.\.)?\w[\w.]*\.map\(" -- '*.dart' ':!*_test.dart'

# Objects that must be disposed or cancelled.
git grep -nP "\b(AnimationController|TextEditingController|ScrollController|PageController|TabController|FocusNode|StreamController)\(|\.listen\(|Timer\.periodic\(" -- '*.dart' ':!*_test.dart'

# Synchronous I/O and heavy decoding on the UI isolate.
git grep -nP "\.(readAsStringSync|readAsBytesSync|readAsLinesSync|writeAsStringSync|writeAsBytesSync|existsSync|listSync)\(|\bjsonDecode\(" -- '*.dart' ':!*_test.dart'
```

Read each hit and report only these:

- **Future or Stream created in `build`.** `FutureBuilder(future: fetchThing())` calls
  `fetchThing` again on every rebuild. The future belongs in `initState`, a field or a provider.
- **Eager list over unbounded data.** `ListView(children: items.map(...).toList())` or a `Column`
  inside a scroll view, fed from a collection that grows with use. `ListView.builder` builds only
  what is visible. A fixed handful of children is not a finding.
- **Missing `dispose` or `cancel`.** A controller, focus node, stream subscription or periodic
  timer created in a `State` with no matching `dispose()`/`cancel()` in that state's `dispose`.
  Check the same class before reporting.
- **Synchronous file I/O or large `jsonDecode` on the UI isolate**, reached from a widget or a
  callback, on data whose size the app does not bound. Small config reads are not findings.

**Severity:** `major` for a network Future created in `build` and for a leaked subscription or
periodic timer on a screen that is opened repeatedly. `minor` for the rest.

### Step 7d: Tauri Commands (Tauri Projects Only)

Skip this step if no `#[tauri::command]` exists.

```bash
git grep -nP "#\[tauri::command" -- '*.rs'    # then read the fn declared under each
git grep -nP "std::thread::sleep|std::fs::|\.blocking_|reqwest::blocking|Command::new\(.*\.output\(\)" -- '*.rs'
```

A command declared as a plain `fn` (not `async fn`, and not `#[tauri::command(async)]`) runs on the
main thread, so file, network or subprocess work inside it freezes the window until it returns.
Report a synchronous command whose body does such work. In an `async fn` command, report blocking
calls (`std::thread::sleep`, `reqwest::blocking`, a long `std::fs` walk) made without
`spawn_blocking`, since they stall the async runtime the other commands share.

**Severity:** `major` when the blocking work is unbounded (network, a directory walk, a
subprocess); `minor` for a bounded local read.

### Step 8: Compile Findings

For each detected issue, create a finding object:

```json
{
  "dimension": "performance",
  "severity": "major",
  "title": "N+1 query: User.findOne called inside forEach loop",
  "description": "Each iteration of the forEach loop on line 34 executes a separate database query to fetch a User record. With 100 items, this produces 101 queries (1 for the list + 100 for each user). Batch the query using a single findMany with an IN clause.",
  "file": "src/services/orderService.ts",
  "line": 36,
  "snippet": "orders.forEach(async (order) => {\n  const user = await prisma.user.findUnique({ where: { id: order.userId } });\n  ...\n})",
  "fix_prompt": "...",
  "confidence": "native"
}
```

### Step 9: Compute Score

Apply the standard scoring formula:

1. Start at **100**
2. Subtract: `5 x critical + 2 x major + 0.5 x minor`
3. Floor at **0**, ceil at **100**, round to integer
4. Info findings do NOT affect the score

### Step 10: Write Report

Write `.healthcheck/reports/performance.json`:

```json
{
  "key": "performance",
  "score": 74,
  "weight": 1.0,
  "skill_version": "1.1.0",
  "notes": "Scanned 47 TypeScript files and 12 Python files. Found 3 N+1 query patterns, 2 unbounded queries, 4 memory leak risks, and 1 bundle size issue. Primary concern: N+1 queries in orderService.ts and userController.ts causing O(n) database round-trips per request.",
  "applicable": true,
  "metrics": {
    "files_scanned": 59,
    "n_plus_one_count": 3,
    "sync_io_count": 0,
    "unbounded_query_count": 2,
    "missing_index_count": 0,
    "memory_leak_count": 4,
    "bundle_size_issues": 1,
    "react_rerender_issues": 0,
    "languages_analyzed": ["typescript", "python"]
  },
  "findings": [ ... ]
}
```

## Output

- `.healthcheck/reports/performance.json` — dimension report with score, metrics, and findings

## Constraints

- **No runtime profiling.** This skill performs static analysis only. Do not execute application code, start servers, or run benchmarks.
- **Respect .gitignore.** Use `git ls-files` as the file list source. Never scan `node_modules/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `venv/`, `.venv/`.
- **Confidence tagging.** All heuristic findings MUST include `"confidence": "heuristic"`. Native findings use `"confidence": "native"`.
- **Confirm before reporting.** A performance finding needs a stated mechanism from this code: which loop issues N queries, which handler blocks on sync I/O, which cache has no eviction and grows with real traffic. If you cannot state it from the code (for example, a Map that could grow unbounded but whose key space is a fixed enum), it is not a finding. Drop it; do not emit it as `minor` with a disclaimer.
- **Exclude test files from most checks.** Test files (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/`) are excluded from N+1, sync I/O, and bundle checks. Memory leak checks still apply to test setup/teardown files.
- **Exclude config/build files from sync I/O checks.** Files in `scripts/`, `bin/`, config files, and migration scripts may legitimately use synchronous I/O.
- **All findings must include a fix_prompt.** Every finding must have a self-contained fix_prompt following the template in `shared/fix_prompt_template.md`.

## fix_prompt Examples

### Example 1: N+1 Query Pattern

```
# Fix: N+1 query — User.findUnique called inside forEach loop

## Context
The orderService.ts file fetches user details one-by-one inside a loop over orders. With N orders, this produces N+1 database queries instead of 1-2 batched queries.

## Location
- File: src/services/orderService.ts
- Line: 36
- Dimension: performance / major

## Current behavior
```typescript
const orders = await prisma.order.findMany({ where: { status: "pending" } });
orders.forEach(async (order) => {
  const user = await prisma.user.findUnique({ where: { id: order.userId } });
  order.userName = user.name;
});
```

## Required change
1. Collect all unique `userId` values from the orders array
2. Batch-fetch all users in a single query using `findMany` with an `IN` clause
3. Build a lookup map (userId -> user) and assign in a synchronous loop

```typescript
const orders = await prisma.order.findMany({ where: { status: "pending" } });
const userIds = [...new Set(orders.map(o => o.userId))];
const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
const userMap = new Map(users.map(u => [u.id, u]));
const enrichedOrders = orders.map(order => ({
  ...order,
  userName: userMap.get(order.userId)?.name ?? "Unknown",
}));
```

## Constraints
- Do not change the function signature or return type
- Preserve any filtering/sorting logic applied after the loop
- Ensure the fix handles the case where a user is not found (deleted user)

## Verification
- Run existing tests: `npm test -- --grep "orderService"`
- Manually verify: Enable query logging (`prisma.$on('query')`) and confirm only 2 queries are executed regardless of order count
```

### Example 2: addEventListener Without Cleanup

```
# Fix: Memory leak — addEventListener without removeEventListener in React component

## Context
The NotificationBanner component adds a "resize" event listener in a useEffect but does not return a cleanup function. Every time the component mounts, a new listener is added and never removed, causing a memory leak over time.

## Location
- File: src/components/NotificationBanner.tsx
- Line: 18
- Dimension: performance / major

## Current behavior
```tsx
useEffect(() => {
  window.addEventListener("resize", handleResize);
}, []);
```

## Required change
Return a cleanup function from the useEffect that removes the event listener:

```tsx
useEffect(() => {
  window.addEventListener("resize", handleResize);
  return () => {
    window.removeEventListener("resize", handleResize);
  };
}, []);
```

Ensure `handleResize` is a stable reference (defined outside the effect or wrapped in useCallback) so that `removeEventListener` correctly removes the same function instance.

## Constraints
- Do not change the resize handling behavior itself
- If handleResize is defined inline, extract it to a useCallback or define it outside the component
- Preserve the dependency array — if handleResize is moved to useCallback, add it to the deps

## Verification
- Run tests: `npm test -- --grep "NotificationBanner"`
- Manual check: Mount and unmount the component 100 times in React DevTools Profiler and confirm no listener accumulation via `getEventListeners(window)` in Chrome DevTools
```

### Example 3: Unbounded SELECT Query

```
# Fix: Unbounded query — SELECT * with no LIMIT in API handler

## Context
The listProducts handler executes `SELECT * FROM products` with no WHERE clause, no LIMIT, and no pagination. As the products table grows, this query will return increasingly large result sets, eventually causing timeouts and memory pressure.

## Location
- File: src/routes/products.ts
- Line: 22
- Dimension: performance / major

## Current behavior
```typescript
app.get("/api/products", async (req, res) => {
  const products = await db.query("SELECT * FROM products");
  res.json(products);
});
```

## Required change
1. Add pagination parameters (`page`, `pageSize`) with sensible defaults
2. Add LIMIT and OFFSET to the query
3. Return pagination metadata in the response

```typescript
app.get("/api/products", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const offset = (page - 1) * pageSize;

  const [products, [{ total }]] = await Promise.all([
    db.query("SELECT id, name, price, category FROM products LIMIT ? OFFSET ?", [pageSize, offset]),
    db.query("SELECT COUNT(*) as total FROM products"),
  ]);

  res.json({ data: products, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});
```

## Constraints
- Do not break existing API consumers — the `data` field should contain the same product shape
- Add pagination params as optional query parameters with defaults (backward compatible)
- Replace `SELECT *` with explicit column names to avoid fetching unnecessary data
- Cap `pageSize` at a maximum (e.g., 100) to prevent abuse

## Verification
- Run tests: `npm test -- --grep "products"`
- Manual check: `curl "http://localhost:3000/api/products?page=1&pageSize=5"` should return exactly 5 products with pagination metadata
- Confirm: `curl "http://localhost:3000/api/products"` still works (uses defaults)
```
