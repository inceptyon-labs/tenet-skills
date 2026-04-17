# Tenet Errors — Rubric

## Severity Reference

Refer to `shared/severity.md` for canonical severity definitions. Below are the dimension-specific rules.

## Toolchain Integration

This dimension consumes findings from:

| Tool | File | Rules Used |
|------|------|------------|
| Semgrep | `.healthcheck/toolchain/semgrep.json` | `category == "errors"` or rule IDs matching `empty-catch`, `broad-except`, `unhandled-promise` |
| ESLint | `.healthcheck/toolchain/eslint.json` | `no-empty`, `no-unused-vars` (catch clauses), `@typescript-eslint/no-floating-promises`, `no-async-promise-executor`, `@typescript-eslint/no-misused-promises` |

Toolchain findings are imported with `confidence: "deterministic"` and deduplicated against grep-based findings.

## Findings

### critical

| ID | Title | Condition | Confidence |
|----|-------|-----------|------------|
| ER-C01 | Global error handler swallows errors silently | Top-level Express error middleware, Django middleware, or process-level handler catches errors and does nothing (no logging, no response, no rethrow) | native |
| ER-C02 | Production error tracking disabled | Error tracking service (Sentry, Datadog, Bugsnag) is imported but initialized with `enabled: false` or `dsn: ''` in production config | native |

### major

| ID | Title | Condition | Confidence |
|----|-------|-----------|------------|
| ER-M01 | Empty catch block in production code | A catch/except block with no body, only `pass`, only whitespace/comments, or only a bare `return` | native |
| ER-M02 | Unhandled Promise rejection in request handler | An async function called without `await` and without `.catch()` in an HTTP request handler or critical code path | native |
| ER-M03 | Missing error boundary in React application | A React application with route components but no `ErrorBoundary`, `componentDidCatch`, or `getDerivedStateFromError` anywhere in the component tree | native |
| ER-M04 | Stream/EventEmitter without error handler | A Node.js stream or EventEmitter created without an `'error'` event listener, risking uncaught exception on error emission | native |
| ER-M05 | Network call without timeout | `fetch()`, `axios`, `http.request`, or `requests.get` called without timeout configuration in a request handler or critical path | native |
| ER-M06 | Async iteration without error handling | `for await...of` loop without surrounding try/catch, or async generator consumed without error handling | native |
| ER-M07 | Database query without error handling | Database query call (ORM or raw SQL) without try/catch or .catch(), risking unhandled rejection on query failure | native |

### minor

| ID | Title | Condition | Confidence |
|----|-------|-----------|------------|
| ER-m01 | Catch-and-ignore pattern | Catch block logs with `console.log` (not `console.error` or proper logger), returns a default without logging, or sets a flag without preserving error details | native |
| ER-m02 | Overly broad catch in application code | Catch block catches `Exception` (Python), `Throwable` (Java), or untyped error (JS/TS) in non-middleware application code | native |
| ER-m03 | Inconsistent error types | Project defines custom error classes but some code paths throw raw strings, plain objects, or generic `Error` instead | native |
| ER-m04 | console.log used for error logging | Error paths use `console.log` instead of `console.error`, a structured logger, or an error tracking service | heuristic |
| ER-m05 | Network call without timeout in background code | `fetch()`, `axios`, etc. without timeout in background jobs, cron tasks, or non-critical paths | native |
| ER-m06 | Unhandled Promise in fire-and-forget context | Floating Promise in non-critical code (event emission, analytics, cache warming) | native |
| ER-m07 | Partial error boundary coverage | Error boundaries exist but do not cover all major routes or high-risk components (data tables, charts, third-party widgets) | native |
| ER-m08 | Ignored Go error return | Go code assigns error return to `_` or does not check `err` after a function call that returns an error | tree_sitter |

### info

| ID | Title | Condition | Confidence |
|----|-------|-----------|------------|
| ER-i01 | No custom error classes | Project throws only generic `Error` objects with no custom subclasses for domain-specific errors | heuristic |
| ER-i02 | No global error tracking service | No Sentry, Datadog, Bugsnag, or similar error tracking service detected in dependencies | deterministic |
| ER-i03 | Intentional catch-and-discard with comment | Catch block is empty but contains an explanatory comment documenting why the error is safe to ignore | native |
| ER-i04 | No global unhandled rejection handler | No `process.on('unhandledRejection')` or equivalent global handler detected | heuristic |
| ER-i05 | Error boundary exists but uses generic fallback | Error boundary renders a generic fallback (empty div, "Something went wrong") without actionable information or retry mechanism | native |
| ER-i06 | Consider using Result/Either type | Language supports monadic error handling (TypeScript with neverthrow/fp-ts, Rust Result, Go error) but code uses exceptions for control flow | heuristic |

## Scoring

```
score = 100 - (5 * critical + 2 * major + 0.5 * minor)
score = max(0, min(100, round(score)))
```

- Info findings do NOT affect the score.
- If the dimension is not applicable: `score: null`, `applicable: false`.
- This dimension is always applicable (every codebase has error handling constructs).

## Grouping Rules

To avoid noisy reports, group related findings:

- Multiple empty catch blocks in the same file or module become one finding with a count (e.g., "4 empty catch blocks in src/services/")
- Multiple floating Promises calling the same function become one finding (e.g., "sendNotification called without await in 3 handlers")
- Multiple `requests.get` without timeout in the same file become one finding

Each grouped finding counts as ONE finding for scoring purposes, at the highest severity of its members.

## Metrics

The dimension report includes these metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `try_catch_count` | integer | Total try/catch blocks analyzed |
| `promise_catch_count` | integer | Total `.catch()` handlers found |
| `empty_catch_count` | integer | Empty catch blocks detected |
| `catch_and_ignore_count` | integer | Catch-and-ignore patterns detected |
| `broad_catch_count` | integer | Overly broad catch blocks detected |
| `unhandled_rejection_count` | integer | Floating Promises / unhandled rejections detected |
| `missing_error_boundary` | boolean | Whether a React project lacks any error boundary |
| `network_calls_without_timeout` | integer | Network calls missing timeout configuration |
| `inconsistent_error_types` | boolean | Whether the project mixes custom and generic error types |
| `has_global_error_handler` | boolean | Whether a global error handler exists |
| `has_error_tracking_service` | boolean | Whether Sentry/Datadog/Bugsnag/etc. is configured |
| `toolchain_findings_imported` | integer | Number of findings imported from Semgrep/ESLint |
| `languages_analyzed` | string[] | Languages that were analyzed for error handling |
