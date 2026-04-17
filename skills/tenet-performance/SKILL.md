---
name: tenet-performance
description: "Identifies performance anti-patterns: N+1 query patterns, synchronous I/O in hot paths, missing indexes, unbounded queries, memory leaks, bundle size issues, and React re-render hazards."
when_to_use: "Performance audit, N+1 queries, memory leaks, bundle size, React performance, tenet performance"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Performance — Performance Anti-Pattern Detection

> Detects structural performance problems that cause latency spikes, memory bloat, and unnecessary resource consumption. Focuses on patterns that are reliably detectable through static analysis.

## Purpose

This skill identifies performance anti-patterns that are detectable without runtime profiling. It scans for N+1 query patterns (loop + await query), synchronous I/O in hot paths, missing database indexes, unbounded queries, memory leaks, bundle size issues in frontend projects, and React re-render hazards. Findings are grounded in specific code locations with actionable fix_prompts.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python]
  heuristic: [go, java, ruby]
  skip: [yaml, json, markdown, css, html, shell, terraform, dockerfile]
```

- **Native** (TS/JS/Python): Pattern matching with high confidence on async/await, ORM calls, React hooks, bundle config, event listener patterns.
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
grep -rn "for\s*(" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" | \
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
grep -rn "for .* in " --include="*.py" | \
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
grep -rn "readFileSync\|writeFileSync\|existsSync\|readdirSync\|statSync\|mkdirSync\|appendFileSync" \
  --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"
```

Exclude files that are clearly setup/build/config:
- `*.config.js`, `*.config.ts`, `webpack.config.*`, `vite.config.*`, `rollup.config.*`
- `scripts/`, `bin/`, `migrations/`, `seeds/`
- Test files (`*.test.*`, `*.spec.*`, `__tests__/`)

**Python:**
```bash
# Blocking calls in async functions
grep -rn "def async\|async def" --include="*.py" | \
  # Then check for: open(), requests.get/post, time.sleep, subprocess.run
```

**Severity:** `major` if found in route handlers, middleware, or API controllers. `minor` if in utility/helper files (may be acceptable).

### Step 3: Unbounded Queries

Scan for database queries that fetch unlimited rows — these are time bombs that work fine on small datasets and crash production.

**All languages:**
```bash
# SELECT * without WHERE or LIMIT
grep -rn "SELECT \*" --include="*.ts" --include="*.js" --include="*.py" --include="*.go" --include="*.java" --include="*.rb"
# Check for absence of WHERE / LIMIT / OFFSET / TOP in the same query string

# ORM calls without limits
grep -rn "\.findAll(\s*)" --include="*.ts" --include="*.js"  # Empty findAll
grep -rn "\.find(\s*{\s*})" --include="*.ts" --include="*.js"  # find({}) with no limit
grep -rn "Model\.objects\.all()" --include="*.py"  # Django all() without [:N]
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
grep -rn "addEventListener" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"
# Check if the same file has a matching removeEventListener for each add

# setInterval without clearInterval
grep -rn "setInterval" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"
# Check if the returned ID is stored and cleared

# Unbounded caches / Maps that grow without eviction
grep -rn "new Map()\|new Set()\|const cache\|let cache\|var cache" \
  --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"
# Flag if module-level (not inside a function) and no .delete() or .clear() in the same file

# Global/module-level array push without cleanup
grep -rn "\.push(" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"
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
grep -rn "open(" --include="*.py" | grep -v "with open"
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
grep -rn "splitChunks\|manualChunks\|React\.lazy\|next/dynamic\|import(" \
  --include="*.config.js" --include="*.config.ts" --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js"
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
grep -rn "={\s*{" --include="*.tsx" --include="*.jsx"
grep -rn "={\s*\[" --include="*.tsx" --include="*.jsx"

# Inline function props — creates new function every render
# Pattern: <Component onClick={() => ...} /> (but NOT in event handlers of native elements)
grep -rn "={\s*(" --include="*.tsx" --include="*.jsx"
grep -rn "={\s*function" --include="*.tsx" --include="*.jsx"

# Missing useMemo on expensive computations
# Look for .filter().map(), .sort(), .reduce() chains NOT wrapped in useMemo
grep -rn "\.filter(.*\.map(\|\.sort(.*\.map(\|\.reduce(" --include="*.tsx" --include="*.jsx"
# Check if the result is wrapped in useMemo

# Missing useCallback on functions passed as props to child components
# This is heuristic — look for functions defined in component body and passed as props
```

Apply these filters to reduce false positives:
- Ignore inline props on native HTML elements (`<div>`, `<span>`, `<button>`) — only flag on custom components (PascalCase)
- Ignore event handlers like `onClick`, `onChange` on native elements
- Only flag `.filter().map()` chains if they operate on arrays of >0 estimated size (heuristic: check if the source is state or props, not a small constant)

**Severity:** `minor` for inline object/function props on custom components. `major` for expensive computation chains (sort/filter/reduce on large data) without useMemo in components that re-render frequently (check if parent passes changing props).

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
  "skill_version": "1.0.0",
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
- **False positive management.** When in doubt, prefer `minor` over `major`. Clearly state in the description when a finding may be a false positive (e.g., "This cache may have intentional unbounded growth if the key space is small").
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
