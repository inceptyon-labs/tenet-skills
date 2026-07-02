---
name: tenet-errors
description: "Audits error handling: empty catches, swallowed async errors, inconsistent types, and missing timeouts."
when_to_use: "Error handling audit, catch block review, unhandled rejection, error boundaries, tenet errors"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Errors

> Audits whether your codebase handles errors deliberately or silently swallows them.

## Purpose

This skill evaluates the quality and consistency of error handling throughout a project. Poor error handling is one of the most common sources of production incidents: an empty catch block turns a recoverable error into a silent data corruption, an unhandled Promise rejection crashes a Node.js process, and a missing error boundary takes down an entire React app for a single component failure.

The goal is not to mandate a specific error handling strategy, but to ensure that every error path is deliberate. If you catch an error, you should log it, rethrow it, recover from it, or explicitly document why you are ignoring it. If you make a network call, you should handle timeouts. If you use async iteration, you should handle errors from the iterable.

## Language Support Matrix

```yaml
support:
  native:
    - typescript
    - javascript
    - python
  tree_sitter:
    - go
    - java
    - ruby
    - kotlin
    - swift
  heuristic:
    - php
    - rust
    - c-sharp
    - all-others
  note: >
    Native support means the skill understands the language's error handling idioms
    (try/catch, async/await, Promise chains, except/raise, error boundaries).
    Tree-sitter support uses AST queries for try/catch block analysis.
    Heuristic support uses grep-based pattern matching.
```

## Toolchain Inputs

This skill consumes the following toolchain outputs when available:

| File | Used For |
|------|----------|
| `.healthcheck/toolchain/semgrep.json` | Pre-computed findings for empty catch blocks, broad exception catches, unhandled errors. Filter findings where `category` is `"errors"` or rule IDs match error-handling patterns. |
| `.healthcheck/toolchain/eslint.json` | Pre-computed findings for `no-empty`, `no-unused-vars` in catch blocks, `@typescript-eslint/no-floating-promises`, `no-async-promise-executor`. Filter for error-handling-related rules. |

**When toolchain data is available:**
- Import matching findings directly to avoid duplicate analysis
- Set `confidence: "deterministic"` on toolchain-sourced findings
- Still perform the full scan for patterns that Semgrep/ESLint do not cover (error boundaries, timeout handling, async iteration errors)

**When toolchain data is NOT available:**
- Perform all checks via grep/read-based analysis
- Set `confidence: "native"` or `"heuristic"` as appropriate

## Procedure

### Step 1: Inventory Error Handling Constructs

Scan the codebase to build an inventory of all error handling constructs:

**JavaScript/TypeScript:**
```bash
# try/catch blocks
grep -rn "catch\s*(" src/ --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"

# Promise .catch() handlers
grep -rn "\.catch(" src/ --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx"

# Async error handling
grep -rn "\.then(" src/ --include="*.ts" --include="*.js" | grep -v "\.catch("

# Error boundaries
grep -rn "componentDidCatch\|ErrorBoundary\|getDerivedStateFromError" src/ --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js"

# Global handlers
grep -rn "process\.on.*unhandledRejection\|process\.on.*uncaughtException\|window\.onerror\|window\.addEventListener.*error" src/ --include="*.ts" --include="*.js"
```

**Python:**
```bash
# try/except blocks
grep -rn "except" --include="*.py" | grep -v "test_\|_test\.py\|tests/"

# Bare except
grep -rn "except:" --include="*.py"

# Broad except
grep -rn "except Exception\b\|except BaseException" --include="*.py"
```

**Go:**
```bash
# Error returns ignored
grep -rn "_ = \|, _ :=\|, _ =" --include="*.go" | grep -v "_test\.go"

# Error not checked
grep -rn "err :=" --include="*.go" | grep -v "if err"
```

**Java/Kotlin:**
```bash
# Catch blocks
grep -rn "catch\s*(" --include="*.java" --include="*.kt"

# Broad catches
grep -rn "catch\s*(Exception\|catch\s*(Throwable" --include="*.java" --include="*.kt"
```

### Step 2: Detect Empty Catch Blocks

An empty catch block swallows the error completely, making debugging impossible and potentially hiding data corruption.

**Patterns to detect:**

JavaScript/TypeScript:
```
catch (e) { }
catch (err) {
}
catch (_) { }
.catch(() => {})
.catch(() => { })
.catch((_) => {})
```

Python:
```
except:
    pass
except Exception:
    pass
except Exception as e:
    pass
```

Go:
```
if err != nil {
    // nothing here or just return nil
}
```

Java:
```
catch (Exception e) {
}
catch (Exception e) {
    // intentionally empty
}
```

**Detection method:**
- For each catch/except block found in Step 1, read the block body
- A block is "empty" if it contains:
  - Nothing at all
  - Only whitespace/comments
  - Only `pass` (Python)
  - Only `return` with no logging or error propagation
  - Only a comment like `// TODO`, `// ignore`, `// intentionally empty`

**Exception:** A comment explicitly stating WHY the error is ignored (e.g., `// Expected error during cleanup, safe to ignore because X`) should reduce the finding to `info` severity.

**Severity:** major for empty catch blocks in production code, minor in test/utility code.

### Step 3: Detect Catch-and-Ignore Patterns

More subtle than empty catch blocks — these catch an error but do nothing meaningful with it:

**Patterns:**
```ts
// Logs but doesn't rethrow or recover
catch (err) {
  console.log(err);  // console.log is not proper error handling
}

// Catches and returns a default silently
catch (err) {
  return [];  // Caller has no idea an error occurred
}

// Catches and sets a boolean without logging
catch (err) {
  success = false;  // Error details lost
}
```

**Detection method:**
- Read catch block bodies
- Flag if the block:
  - Uses `console.log` instead of `console.error` or a proper logger
  - Returns a default value without logging the error
  - Sets a flag without preserving the error for debugging
  - Does not rethrow, report to error tracking (Sentry, Datadog, etc.), or use a structured logger

**Severity:** minor — the code acknowledges the error exists but handles it poorly.

### Step 4: Detect Overly Broad Catches

Catching too-general exception types masks specific errors and prevents targeted recovery:

**Patterns to flag:**
```ts
// JS/TS: catching everything
catch (e) {
  // handles TypeError, SyntaxError, custom errors all the same
}

// Python: bare except
except:
    handle_error()

// Python: catching Exception (catches everything except SystemExit, KeyboardInterrupt)
except Exception as e:
    handle_error(e)

// Java: catching Exception or Throwable
catch (Exception e) {
    handleError(e);
}
catch (Throwable t) {
    handleError(t);
}

// Go: ignoring error type
if err != nil {
    return fmt.Errorf("operation failed: %w", err)  // OK if wrapping
}
```

**When this is acceptable:**
- Top-level error handlers / middleware (Express error middleware, Django middleware, global exception handler)
- Process-level handlers (`process.on('uncaughtException')`)
- Error boundaries in React (by definition catch all render errors)

**Severity:** minor for broad catches in application code, info for broad catches in middleware/boundaries (where it is expected).

### Step 5: Detect Unhandled Promise Rejections

Unhandled Promise rejections crash Node.js processes (since Node 15+) and cause silent failures in browsers.

**Patterns to detect:**

```ts
// Floating promise (no await, no .catch, no .then)
fetchData();           // returns Promise, not awaited
db.save(record);       // returns Promise, not awaited

// .then() without .catch()
fetchData().then(process);  // rejection unhandled

// async function called without await in non-async context
async function save() { ... }
save();  // floating

// Promise.all without catch
Promise.all([fetchA(), fetchB()]);  // rejection from either unhandled
```

**Detection method:**
- Scan for function calls that return Promises (async functions, fetch, DB operations)
- Check if the return value is awaited, chained with `.catch()`, or assigned to a variable that is later awaited
- Check ESLint findings for `@typescript-eslint/no-floating-promises` if available

**Severity:** major for unhandled rejections in request handlers or critical paths, minor for fire-and-forget in background tasks (still flag, but lower severity).

### Step 6: Detect Error Swallowing in Async Iteration

Async iterators (for-await-of, streams, generators) have unique error handling needs:

**Patterns to detect:**
```ts
// for-await without try/catch
for await (const chunk of stream) {
  process(chunk);  // if process throws, the entire loop dies
}

// Stream error event not handled
const stream = fs.createReadStream('file.txt');
stream.on('data', process);
// missing: stream.on('error', handler)

// AsyncGenerator without error handling
async function* generate() {
  yield await fetchData();  // if fetchData rejects, generator throws
}
```

**Detection method:**
- Find all `for await` loops and check for surrounding try/catch
- Find all stream creation (createReadStream, createWriteStream, pipeline) and check for `.on('error')` or pipeline error callback
- Find async generators and check call sites for error handling

**Severity:** major for streams without error handlers (causes process crash), minor for for-await without try/catch.

### Step 7: Detect Inconsistent Error Types

A project should use consistent custom error types rather than throwing raw strings or generic Error objects:

**Patterns to detect:**
```ts
// Throwing strings
throw "Something went wrong";
throw 'Not found';

// Throwing generic Error with no subclass
throw new Error("validation failed");  // OK in small projects, flag if custom errors exist elsewhere

// Inconsistent custom errors
throw new NotFoundError(...)    // in one file
throw new HttpError(404, ...)   // in another file
throw { status: 404, message: "not found" }  // in yet another
```

**Detection method:**
- Find all `throw` / `raise` statements
- Categorize: string throws, generic Error, custom Error subclass, plain object
- If the project defines custom error classes, flag places that throw generic Errors or strings
- If the project has NO custom error classes, this is an info-level suggestion

**Severity:** minor for inconsistent error types when custom classes exist, info for suggesting custom error classes.

### Step 8: Detect Missing Error Boundaries in React

React error boundaries prevent a single component error from crashing the entire application.

**Detection method:**
- Check if the project uses React (look for `react` in package.json, `.tsx`/`.jsx` files)
- Find existing error boundaries: `componentDidCatch`, `getDerivedStateFromError`, or common libraries (`react-error-boundary`)
- Check route-level components and layout components for boundary wrapping
- Flag if NO error boundary exists anywhere in a React project
- Flag if error boundaries exist but major routes/layouts are not wrapped

**What to check:**
```tsx
// Good: Error boundary wrapping route content
<ErrorBoundary fallback={<ErrorPage />}>
  <Routes>...</Routes>
</ErrorBoundary>

// Bad: No error boundary anywhere
function App() {
  return <Routes>...</Routes>;  // any render error crashes the entire app
}
```

**Severity:** major if no error boundary exists in a React project, minor if boundaries exist but do not cover major routes.

### Step 9: Detect Missing Timeout Handling on Network Calls

Network calls without timeouts can hang indefinitely, causing resource exhaustion and cascading failures.

**Patterns to detect:**
```ts
// fetch without AbortController/timeout
const response = await fetch(url);  // hangs forever if server doesn't respond

// axios without timeout config
const data = await axios.get(url);  // default: no timeout

// http.request without timeout
const req = http.request(options, callback);
// missing: req.setTimeout(...)

// database calls without query timeout
const result = await db.query('SELECT ...');  // hangs on slow query

// Python requests without timeout
response = requests.get(url)  // default: no timeout
```

**Detection method:**
- Find all `fetch()`, `axios`, `http.request`, `got`, `node-fetch`, `undici` calls
- Check for timeout configuration (AbortSignal.timeout, axios timeout option, request.setTimeout)
- Find database client calls and check for query timeout configuration
- For Python: find `requests.get/post/put/delete` without `timeout=` parameter

**Severity:** major for network calls in request handlers without timeouts (can cause cascading failures), minor for background/batch jobs.

### Step 10: Import Toolchain Findings

If `.healthcheck/toolchain/semgrep.json` exists:
- Read and filter findings where `category == "errors"` or `rule_id` matches error handling patterns
- Map to the standard finding schema
- Set `confidence: "deterministic"`
- Deduplicate against findings from Steps 2-9 (prefer toolchain findings when they overlap)

If `.healthcheck/toolchain/eslint.json` exists:
- Read and filter for rules: `no-empty`, `no-unused-vars` (in catch clauses), `@typescript-eslint/no-floating-promises`, `no-async-promise-executor`, `@typescript-eslint/no-misused-promises`
- Map to the standard finding schema
- Set `confidence: "deterministic"`
- Deduplicate

### Step 11: Score and Write Report

Apply the standard scoring formula:

```
score = 100 - (5 * critical_count + 2 * major_count + 0.5 * minor_count)
score = max(0, min(100, int(score + 0.5)))  # Arithmetic rounding (not banker's rounding)
```

Info findings do NOT affect the score.

Write the dimension report to `.healthcheck/reports/errors.json`:

```json
{
  "key": "errors",
  "score": 64,
  "weight": 1.3,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Examined 87 try/catch blocks and 34 Promise chains. Found 4 empty catch blocks, 6 unhandled Promise rejections, no error boundary in React app, and 12 fetch calls without timeout handling.",
  "metrics": {
    "try_catch_count": 87,
    "promise_catch_count": 34,
    "empty_catch_count": 4,
    "catch_and_ignore_count": 3,
    "broad_catch_count": 8,
    "unhandled_rejection_count": 6,
    "missing_error_boundary": true,
    "network_calls_without_timeout": 12,
    "inconsistent_error_types": true,
    "has_global_error_handler": true,
    "has_error_tracking_service": false,
    "toolchain_findings_imported": 7,
    "languages_analyzed": ["typescript", "javascript"]
  }
}
```

Findings go into the `findings` array following the schema in `shared/schema.json`. Every finding MUST include a `fix_prompt` following `shared/fix_prompt_template.md`.

## Confidence Tiers

| Tier | When Used |
|------|-----------|
| `deterministic` | Finding from Semgrep or ESLint toolchain output |
| `native` | Language-aware analysis of try/catch bodies, Promise chains, error boundaries |
| `tree_sitter` | AST-based extraction for Go, Java, Ruby error handling patterns |
| `heuristic` | Grep-based pattern matching, may produce false positives |

## Worked fix_prompt Examples

### Example 1: Empty Catch Block

```
# Fix: Empty catch block swallows database connection errors

## Context
The database connection retry logic in `src/db/connection.ts` catches connection errors but
does nothing with them. If the database is unreachable, the application silently continues
with no connection, causing cryptic failures downstream when queries are attempted.

## Location
- File: src/db/connection.ts
- Line: 23
- Dimension: errors / major

## Current behavior
```ts
try {
  await pool.connect();
} catch (err) {
  // TODO: handle this
}
```

## Required change
1. Add proper error handling to the catch block:
   - Log the error with full context using the project's logger (check `src/utils/logger.ts` or similar)
   - Include retry attempt number and connection config (without credentials)
   - After max retries, throw a descriptive error that will surface at startup
2. Replace the empty catch with:
```ts
try {
  await pool.connect();
} catch (err) {
  logger.error('Database connection failed', {
    error: err instanceof Error ? err.message : String(err),
    attempt: retryCount,
    host: config.host,
    port: config.port,
    database: config.database,
  });
  if (retryCount >= MAX_RETRIES) {
    throw new DatabaseConnectionError(`Failed to connect after ${MAX_RETRIES} attempts: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

## Constraints
- Do not log database credentials (password, connection string with auth)
- Use the existing project logger — do not add console.log
- If no custom error class exists, create `DatabaseConnectionError` extending `Error` in `src/errors/`
- Preserve the retry loop structure

## Verification
- Run: `npm test -- --grep "database\|connection"`
- Stop the database and start the application — confirm error is logged with context
- Confirm the application fails to start (not silently continue) after max retries
```

### Example 2: Unhandled Promise Rejection

```
# Fix: Floating Promise in user notification dispatch

## Context
The `sendNotification` async function is called without `await` in the order confirmation
handler. If the notification service is down, the rejection is unhandled, which crashes
the Node.js process (Node 15+) or silently fails (older Node), and the order confirmation
response has already been sent so the user never learns their notification failed.

## Location
- File: src/handlers/orders.ts
- Line: 45
- Dimension: errors / major

## Current behavior
```ts
router.post('/orders/:id/confirm', async (req, res) => {
  await db.orders.update(req.params.id, { status: 'confirmed' });
  sendNotification(req.params.id, 'order_confirmed');  // floating Promise!
  res.json({ data: { status: 'confirmed' } });
});
```

## Required change
Option A — Await and handle inline (if notification failure should not block confirmation):
```ts
try {
  await sendNotification(req.params.id, 'order_confirmed');
} catch (err) {
  logger.error('Failed to send order confirmation notification', {
    orderId: req.params.id,
    error: err instanceof Error ? err.message : String(err),
  });
  // Do not rethrow — order confirmation is the primary operation
}
```

Option B — Fire-and-forget with explicit catch (if this is truly background work):
```ts
sendNotification(req.params.id, 'order_confirmed').catch((err) => {
  logger.error('Failed to send order confirmation notification', {
    orderId: req.params.id,
    error: err instanceof Error ? err.message : String(err),
  });
});
```

Choose Option A if the team prefers await-style, Option B if fire-and-forget is intentional.

## Constraints
- Do not make the order confirmation depend on notification success — the order update is the primary operation
- Use the project's existing logger, not console.log
- Do not remove the sendNotification call entirely

## Verification
- Run: `npm test -- --grep "order"`
- Search for other floating promises: `grep -rn "sendNotification\|sendEmail\|publishEvent" src/ --include="*.ts" | grep -v "await\|\.catch\|\.then"`
- Verify no `UnhandledPromiseRejection` warnings in test output
```

### Example 3: Missing Error Boundary in React

```
# Fix: React application has no error boundary

## Context
This React application has 24 route components and no error boundary anywhere in the
component tree. Any unhandled error during rendering (a null reference, a failed API
response used without checking, a missing property) will crash the entire application
and show a white screen to the user.

## Location
- File: src/App.tsx
- Line: 1
- Dimension: errors / major

## Current behavior
```tsx
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        {/* 22 more routes, none wrapped in an error boundary */}
      </Routes>
    </BrowserRouter>
  );
}
```

## Required change
1. Install `react-error-boundary` (or create a class component with `componentDidCatch`):
   ```bash
   npm install react-error-boundary
   ```
2. Create `src/components/ErrorFallback.tsx`:
   ```tsx
   export function ErrorFallback({ error, resetErrorBoundary }) {
     return (
       <div role="alert">
         <h2>Something went wrong</h2>
         <pre>{error.message}</pre>
         <button onClick={resetErrorBoundary}>Try again</button>
       </div>
     );
   }
   ```
3. Wrap the route content in `src/App.tsx`:
   ```tsx
   import { ErrorBoundary } from 'react-error-boundary';
   import { ErrorFallback } from './components/ErrorFallback';

   function App() {
     return (
       <BrowserRouter>
         <ErrorBoundary
           FallbackComponent={ErrorFallback}
           onError={(error, info) => {
             logger.error('React render error', { error: error.message, componentStack: info.componentStack });
           }}
           onReset={() => window.location.reload()}
         >
           <Routes>...</Routes>
         </ErrorBoundary>
       </BrowserRouter>
     );
   }
   ```
4. Optionally add more granular boundaries around high-risk sections (data tables, charts, third-party widgets)

## Constraints
- The ErrorFallback component must be accessible (use `role="alert"`)
- Do not catch errors in event handlers — error boundaries only catch render/lifecycle errors
- Preserve existing routing structure — just wrap it
- If the project uses a logging service (Sentry, Datadog), integrate it in the `onError` callback

## Verification
- Run: `npm test`
- Temporarily add `throw new Error('test')` in a route component, confirm the fallback renders instead of a white screen
- Remove the test throw after verifying
- Run: `grep -rn "ErrorBoundary" src/` to confirm the boundary is in place
```

## Output

- `.healthcheck/reports/errors.json` — dimension report with score, metrics, and findings

## Constraints

- NEVER flag catch blocks in test files as production issues — test code often has intentionally loose error handling
- NEVER flag `catch` blocks that contain a clear explanatory comment (e.g., `// Expected: file may not exist`) as empty — reduce to info
- NEVER flag Go's `if err != nil { return err }` pattern as "catch-and-ignore" — that IS proper Go error handling
- NEVER flag Python's `except KeyboardInterrupt` or `except SystemExit` as "broad catch"
- ALWAYS check if the project has a global error handler (Express middleware, Django middleware, process.on) before flagging individual catch blocks
- ALWAYS prefer toolchain findings (Semgrep, ESLint) over grep-based findings when both exist — toolchain findings are more precise
- Scoring math is pure arithmetic: `100 - (5 * critical + 2 * major + 0.5 * minor)`, floor 0, ceil 100, round to integer
- Info findings do NOT affect the score
- Every finding MUST include a `fix_prompt` following the template in `shared/fix_prompt_template.md`
- File paths in findings are always repo-relative
- The `confidence` field must reflect the detection method used (deterministic, native, tree_sitter, heuristic)
- Group findings when possible — "4 empty catch blocks in src/services/" is one finding, not four

## Edge Cases

- **Monorepo:** Analyze each package/service independently. An error boundary in the web app package does not cover the admin panel package.
- **Generated code:** If catch blocks are in generated files (e.g., protobuf stubs, GraphQL codegen), note in the finding and reduce to info severity.
- **Legacy migration:** If the project is migrating from callbacks to async/await, flag floating Promises but note the migration context in the finding.
- **Server-side rendering:** In SSR React apps, error boundaries behave differently — `componentDidCatch` does not fire during SSR. Note this in the finding and suggest try/catch in `getServerSideProps` or loader functions.
- **Deno / Bun:** These runtimes handle unhandled rejections differently from Node.js. Adjust severity based on runtime detection from package.json or config files.
- **Intentional fire-and-forget:** If an async call has a `.catch()` that logs and discards, this is acceptable. Only flag completely unhandled rejections.
