---
name: tenet-observability
description: "Evaluates observability posture: structured logging presence, log level appropriateness, correlation IDs and trace propagation, metrics on critical paths, health check endpoints, and graceful shutdown handling."
when_to_use: "Observability audit, logging review, metrics check, health endpoint, tracing, tenet observability"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Observability

> *"You cannot improve what you cannot observe."*

Audits the project's observability posture across six pillars: structured logging, log level hygiene, correlation/trace propagation, metrics instrumentation, health check endpoints, and graceful shutdown handling. Produces findings and a score written to `.healthcheck/reports/observability.json`.

## Purpose

Production systems that lack observability are blind. When incidents occur, teams without structured logs, correlation IDs, metrics, and health endpoints spend hours guessing instead of minutes resolving. This skill detects observability gaps before they become 3 AM pages.

## Language Support Matrix

```yaml
support:
  native: [typescript, javascript, python, go]
  heuristic: [java, ruby, rust, csharp, php, elixir, kotlin, scala]
  note: >
    Native support uses AST-aware pattern matching for TS/JS/Python/Go.
    Heuristic support uses regex-based detection for other languages.
    All languages get file-presence checks (health endpoints, signal handlers, metrics libs).
```

## Toolchain Inputs

This skill does not consume toolchain outputs. All detection is performed directly by the skill via file scanning and pattern matching.

## Rubric Summary

| ID | Check | Severity | Confidence |
|---|---|---|---|
| OBS-01 | Structured logging presence | major | native / heuristic |
| OBS-02 | Log level appropriateness | minor-major | native / heuristic |
| OBS-03 | Correlation ID / trace propagation | major | native / heuristic |
| OBS-04 | Metrics on critical paths | major | native / heuristic |
| OBS-05 | Health check endpoint | major | native / heuristic |
| OBS-06 | Graceful shutdown handling | major | native / heuristic |

See `rubric.md` for full details on each check.

## Procedure

### Step 0: Detect Project Context

```bash
# Read language census from toolchain if available
CENSUS=".healthcheck/toolchain/language-census.json"
if [ -f "$CENSUS" ]; then
  PRIMARY_LANG=$(jq -r '.primary_language' "$CENSUS")
else
  # Fallback: detect from file extensions
  PRIMARY_LANG="unknown"
fi
```

Determine the project type (web server, CLI tool, library, worker, etc.) by scanning for:
- HTTP framework imports (express, fastify, koa, flask, django, gin, net/http, fiber)
- Queue/worker imports (bull, celery, asynq)
- CLI framework imports (commander, click, cobra)
- Library-only indicators (no main entry point, only exports)

Libraries and CLI tools have reduced observability expectations — skip OBS-04 (metrics) and OBS-05 (health endpoint) for them. Log this decision.

### Step 1: OBS-01 — Structured Logging Presence

**Goal:** Verify that production code paths use a structured logger rather than bare console/print output.

**Detection — Native (TS/JS):**

```bash
# Find console.log/warn/error in production source files (exclude tests, scripts, configs)
# Glob for src/**/*.{ts,js,tsx,jsx}, lib/**/*.{ts,js}, app/**/*.{ts,js}
# Exclude: **/*.test.*, **/*.spec.*, **/test/**, **/tests/**, **/__tests__/**, **/scripts/**
```

Check for structured logger imports:
- `winston`, `pino`, `bunyan`, `log4js`, `@nestjs/common` (Logger), `tslog`, `roarr`
- If NONE of these are imported anywhere in production code AND bare console calls exist: **critical** — the project has zero structured logging infrastructure while actively logging to console. This means production incidents produce unparseable, unsearchable, unalertable output.
- If a structured logger exists but some files bypass it: **major**

Check for bare `console.log` / `console.warn` / `console.error` in production paths:
- If no structured logger exists AND more than 5 bare console calls in non-test files: already covered by the critical above
- If structured logger exists but more than 5 bare console calls also exist: **major** — "Production code mixes structured and unstructured logging"
- If 1-5 bare console calls exist alongside a structured logger: **minor** — "Scattered console.log calls should migrate to structured logger"
- If 0: no finding

**Detection — Native (Python):**

```bash
# Look for print() statements in production code
# Look for logging module usage: import logging, from logging import
# Look for structured loggers: structlog, loguru, python-json-logger
```

- No `logging` or structured logger imported AND `print()` used in production: **critical** — zero logging infrastructure
- `logging` module used but no structured formatter (structlog/loguru/python-json-logger): **major**
- `print()` used in production paths alongside proper logging: **minor** per file, **major** if > 5 files

**Detection — Native (Go):**

```bash
# Look for fmt.Println/Printf in non-test files
# Look for structured loggers: zap, zerolog, logrus, slog
```

- No structured logger imported AND `fmt.Print*` used in production: **critical** — zero logging infrastructure
- Structured logger exists but `fmt.Print*` used alongside it: **minor** per file, **major** if > 5 files

**Detection — Heuristic (other languages):**

Grep for common structured logging patterns:
- Java: `LoggerFactory`, `slf4j`, `log4j`, `Logback`
- Ruby: `Rails.logger`, `Logger.new`, `Semantic Logger`
- Rust: `tracing`, `log`, `env_logger`, `slog`
- Others: generic grep for `logger`, `Logger`, `logging`

If no logger pattern found and the project has > 500 LOC and uses print/console equivalents: **critical** (confidence: heuristic)
If no logger pattern found and no print/console calls either: **major** (confidence: heuristic) — project has no logging at all

### Step 2: OBS-02 — Log Level Appropriateness

**Goal:** Ensure log levels match the nature of what is being logged.

**Detection — Native (TS/JS):**

Scan for these anti-patterns:
1. `console.log` used for error conditions (e.g., inside `catch` blocks): **major** — errors must use error-level logging
2. `logger.debug` or `console.debug` with sensitive data (passwords, tokens, keys): **critical** — debug logs may leak secrets
3. `logger.error` or `console.error` for non-error conditions (e.g., "Server started on port 3000"): **minor**
4. `.env` or config files setting `LOG_LEVEL=debug` or `DEBUG=*` without a comment marking it dev-only: **minor** — prod configs should not default to debug

**Detection — Native (Python):**

1. `print()` inside `except` blocks: **major**
2. `logging.debug()` with sensitive variable names (password, secret, token, key, auth): **critical**
3. `LOG_LEVEL` or `LOGGING` in settings files defaulting to `DEBUG`: **minor**

**Detection — Native (Go):**

1. `fmt.Println` inside error-handling branches: **major**
2. Debug-level logging with sensitive field names: **critical**
3. Production config files with debug log level: **minor**

**Detection — Heuristic:**

Grep for `catch` / `except` / `rescue` blocks containing `print` / `console.log` / `fmt.Print`. Flag as **major** (confidence: heuristic).

### Step 3: OBS-03 — Correlation ID / Trace Propagation

**Goal:** Verify that requests can be traced end-to-end through correlation IDs or distributed tracing.

**Detection — Native (TS/JS):**

Check for any of:
- OpenTelemetry SDK: `@opentelemetry/sdk-node`, `@opentelemetry/api`
- Correlation ID middleware: `cls-hooked`, `async_hooks`, `express-request-id`, `x-request-id` header handling
- Custom middleware that injects a request ID into the logger context
- DD-Trace, Datadog APM, New Relic agent imports

If the project is a web server (has express/fastify/koa/nest) and NONE of the above are found: **major** — "No correlation ID or trace propagation detected in a server application"

**Detection — Native (Python):**

Check for:
- `opentelemetry` packages
- Django middleware with request ID injection
- Flask `g.request_id` or `before_request` hooks
- `structlog` with `bind` or context variables
- `ddtrace`, `newrelic` agent

If web framework detected and none found: **major**

**Detection — Native (Go):**

Check for:
- `go.opentelemetry.io/otel`
- Context propagation (`context.Context` passed through handlers)
- Middleware injecting request IDs
- `opentracing`, `jaeger-client-go`

If HTTP server detected and none found: **major**

**Detection — Heuristic:**

Grep for `request.id`, `requestId`, `correlation.id`, `correlationId`, `trace.id`, `traceId`, `X-Request-ID`, `opentelemetry`, `datadog`, `newrelic`. If web server detected and none found: **major** (confidence: heuristic).

### Step 4: OBS-04 — Metrics on Critical Paths

**Goal:** Verify that key business and operational metrics are instrumented.

**Skip this check for libraries and CLI tools.**

**Detection — Native (TS/JS):**

Check for metrics libraries:
- `prom-client` (Prometheus)
- `@opentelemetry/sdk-metrics`
- `hot-shots` / `node-statsd` (StatsD)
- `datadog-metrics`
- Custom metrics middleware (e.g., request duration histogram)

If the project is a web server with > 3 route handlers and no metrics library is imported: **major** — "No metrics instrumentation found in a server with multiple endpoints"

If a metrics library is imported but only used in < 20% of route handler files: **minor** — "Metrics library imported but not applied to most route handlers"

**Detection — Native (Python):**

Check for: `prometheus_client`, `statsd`, `datadog`, `opentelemetry.metrics`, `django-prometheus`, `starlette-prometheus`

**Detection — Native (Go):**

Check for: `prometheus/client_golang`, `go.opentelemetry.io/otel/metric`, `datadog/datadog-go`, `statsd`

**Detection — Heuristic:**

Grep for `histogram`, `counter`, `gauge`, `metrics`, `prometheus`, `statsd`. If server app and none found: **major** (confidence: heuristic).

### Step 5: OBS-05 — Health Check Endpoint

**Goal:** Verify the application exposes a health check endpoint for orchestrators and load balancers.

**Skip this check for libraries and CLI tools.**

**Detection — All Languages:**

```bash
# Search for health endpoint patterns
# Routes: /health, /healthz, /livez, /readyz, /ready, /ping, /status
# Also check for Kubernetes probe configuration in deployment manifests
```

Scan for:
1. Route definitions matching health endpoint patterns
2. Kubernetes/Docker health check config: `livenessProbe`, `readinessProbe`, `HEALTHCHECK` directive in Dockerfile
3. Load balancer health check config in infrastructure-as-code (Terraform, CloudFormation, Pulumi)

If the project is a web server and NO health endpoint is found: **major** — "No health check endpoint detected"

If a health endpoint exists but only returns a static 200 (no dependency checks): **minor** — "Health endpoint does not verify downstream dependencies"

### Step 6: OBS-06 — Graceful Shutdown Handling

**Goal:** Verify the application handles termination signals to drain connections and flush buffers.

**Detection — Native (TS/JS):**

```bash
# Search for signal handlers
# process.on('SIGTERM', ...), process.on('SIGINT', ...)
# Also check for server.close(), connection draining
```

If the project is a long-running server and no SIGTERM/SIGINT handler is found: **major** — "No graceful shutdown handler for SIGTERM"

If a signal handler exists but does not call `server.close()` or equivalent: **minor** — "Signal handler does not drain active connections"

**Detection — Native (Python):**

Check for: `signal.signal(signal.SIGTERM, ...)`, `atexit.register(...)`, framework-specific shutdown hooks (Django `on_shutdown`, FastAPI `on_event("shutdown")`, Gunicorn `on_exit`)

**Detection — Native (Go):**

Check for: `signal.Notify`, `os.Signal`, `context.WithCancel` in main, `http.Server.Shutdown`

**Detection — Heuristic:**

Grep for `SIGTERM`, `SIGINT`, `signal`, `graceful`, `shutdown`, `on_exit`, `atexit`. If server app and none found: **major** (confidence: heuristic).

### Step 7: Compile Findings and Score

1. Collect all findings from Steps 1-6
2. Deduplicate — if the same file triggers multiple checks, merge where appropriate
3. Apply severity counts:
   - Start at **100**
   - Subtract: `5 x critical + 2 x major + 0.5 x minor`
   - Floor at **0**, ceil at **100**, round to integer
4. Info findings do NOT affect the score

### Step 8: Write Report

Write `.healthcheck/reports/observability.json` conforming to the dimension report schema:

```json
{
  "key": "observability",
  "score": 78,
  "weight": 1.0,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Structured logging present via pino but 8 console.log calls remain in production paths. No correlation ID propagation detected. Health endpoint present at /healthz. No SIGTERM handler found.",
  "metrics": {
    "structured_logger": "pino",
    "bare_console_calls": 8,
    "has_correlation_ids": false,
    "has_metrics": true,
    "metrics_library": "prom-client",
    "has_health_endpoint": true,
    "health_endpoint_path": "/healthz",
    "has_graceful_shutdown": false
  },
  "findings": [ ... ]
}
```

## Confidence Tiers

| Tier | Meaning | Used When |
|---|---|---|
| `deterministic` | Tool output — not used by this skill | N/A |
| `native` | AST-aware or import-resolution-based detection | TS/JS, Python, Go checks |
| `heuristic` | Regex/grep pattern matching | Other languages, fallback detection |

This skill does not consume deterministic toolchain output, so no findings carry `deterministic` confidence.

## Output

- `.healthcheck/reports/observability.json` — dimension report with score, metrics, and findings

## Constraints

- NEVER mark a library or CLI tool down for missing health endpoints or metrics — these apply only to server applications
- ALWAYS exclude test files, scripts, and config files from bare-console/print counts
- ALWAYS include a `fix_prompt` on every finding — no exceptions
- Scoring math is pure arithmetic — no LLM judgment in the score computation
- Respect `.gitignore` — only scan files tracked by git
- If the project has < 100 LOC of production code, mark `applicable: false` with a note and write `score: null`
- De-duplicate findings — do not emit separate findings for the same issue in the same file on adjacent lines
- Confidence must be set accurately: `native` for TS/JS/Python/Go, `heuristic` for all others

## fix_prompt Examples

### Example 1: console.log Instead of Structured Logger

**Finding:**
```json
{
  "dimension": "observability",
  "severity": "major",
  "title": "Production code uses console.log instead of structured logger",
  "description": "src/services/payment.ts uses console.log for 6 log statements including error handling in the charge() method. Unstructured logs cannot be parsed by log aggregators, making production debugging difficult and alerting unreliable.",
  "file": "src/services/payment.ts",
  "line": 23,
  "snippet": "console.log('Payment failed:', error.message);",
  "fix_prompt": "# Fix: Replace console.log with structured logger in payment service\n\n## Context\nsrc/services/payment.ts uses bare console.log for all logging, including error paths. The project already uses pino elsewhere.\n\n## Location\n- File: src/services/payment.ts\n- Line: 23\n- Dimension: observability / major\n\n## Current behavior\nThe file calls `console.log(...)` and `console.error(...)` directly, producing unstructured text output that log aggregators cannot parse or index. Related console calls appear on lines 31, 45, 52, 67, and 89.\n\n## Required change\n1. Import the project's pino logger instance (from src/lib/logger.ts or wherever it is centralized)\n2. Replace each `console.log(...)` with the appropriate structured log call:\n   - `console.log('Payment failed:', error.message)` → `logger.error({ err: error, paymentId }, 'Payment failed')`\n   - `console.log('Processing payment for', userId)` → `logger.info({ userId }, 'Processing payment')`\n3. Ensure error objects are passed as structured fields, not string-concatenated\n4. Remove all bare `console.*` calls from this file\n\n## Constraints\n- Do not change the control flow or business logic\n- Use the existing logger instance — do not introduce a new logging library\n- Preserve all existing information in log messages (user IDs, payment IDs, error details)\n\n## Verification\n- `grep -rn 'console\\.' src/services/payment.ts` should return no results\n- `npm test` should pass with no regressions\n- Manually verify that log output is valid JSON (run the service and inspect stdout)",
  "confidence": "native"
}
```

### Example 2: Missing Health Check Endpoint

**Finding:**
```json
{
  "dimension": "observability",
  "severity": "major",
  "title": "No health check endpoint detected",
  "description": "This Express application serves 12 route handlers but does not expose a /health, /healthz, or /readyz endpoint. Kubernetes liveness and readiness probes, load balancers, and uptime monitors require a health endpoint to determine service availability.",
  "file": "src/app.ts",
  "line": null,
  "snippet": null,
  "fix_prompt": "# Fix: Add health check endpoint\n\n## Context\nThe Express application in src/app.ts has no health check endpoint. Orchestrators and load balancers cannot determine if the service is healthy.\n\n## Location\n- File: src/app.ts\n- Line: N/A\n- Dimension: observability / major\n\n## Current behavior\nNo /health, /healthz, or /readyz route exists. Health checks from Kubernetes or load balancers will get 404 responses.\n\n## Required change\n1. Add a GET /healthz route near the top of the route definitions in src/app.ts that returns 200 with a JSON body\n2. The endpoint should check critical dependencies (database connection, cache connection) and return their status\n3. Return structure:\n   ```json\n   {\n     \"status\": \"ok\",\n     \"timestamp\": \"2024-01-15T10:30:00Z\",\n     \"checks\": {\n       \"database\": { \"status\": \"ok\", \"latency_ms\": 2 },\n       \"cache\": { \"status\": \"ok\", \"latency_ms\": 1 }\n     }\n   }\n   ```\n4. If any dependency is down, return 503 with `\"status\": \"degraded\"` and indicate which check failed\n5. Add a simple GET /livez that always returns 200 (for Kubernetes liveness probes)\n\n## Constraints\n- Do not add authentication to the health endpoint — it must be publicly accessible for probes\n- Keep the endpoint fast (< 500ms timeout on dependency checks)\n- Do not expose sensitive information (versions, internal IPs) in the response\n\n## Verification\n- `curl http://localhost:3000/healthz` should return 200 with JSON body\n- `curl http://localhost:3000/livez` should return 200\n- `npm test` should pass",
  "confidence": "native"
}
```

### Example 3: No SIGTERM Handler

**Finding:**
```json
{
  "dimension": "observability",
  "severity": "major",
  "title": "No graceful shutdown handler for SIGTERM",
  "description": "The Express server in src/server.ts listens on port 3000 but does not handle SIGTERM or SIGINT signals. When Kubernetes sends SIGTERM during a rolling deployment, in-flight requests will be abruptly terminated, causing 502 errors for clients and potential data corruption in pending transactions.",
  "file": "src/server.ts",
  "line": 15,
  "snippet": "app.listen(3000, () => console.log('Server started'));",
  "fix_prompt": "# Fix: Add graceful shutdown handler\n\n## Context\nsrc/server.ts starts the Express server but never handles SIGTERM/SIGINT. In-flight requests are killed mid-execution during deployments.\n\n## Location\n- File: src/server.ts\n- Line: 15\n- Dimension: observability / major\n\n## Current behavior\n```ts\napp.listen(3000, () => console.log('Server started'));\n```\nNo signal handlers are registered. The process exits immediately on SIGTERM, dropping all active connections.\n\n## Required change\n1. Capture the server instance returned by `app.listen()` on line 15\n2. Register handlers for SIGTERM and SIGINT signals\n3. In the handler:\n   a. Log that shutdown has been initiated\n   b. Call `server.close()` to stop accepting new connections\n   c. Wait for in-flight requests to complete (with a timeout of 30 seconds)\n   d. Close database/cache connections\n   e. Flush any pending log buffers\n   f. Exit with code 0\n4. Example:\n   ```ts\n   const server = app.listen(3000, () => logger.info('Server started'));\n\n   const shutdown = (signal: string) => {\n     logger.info({ signal }, 'Shutdown signal received, draining connections');\n     server.close(() => {\n       logger.info('All connections drained, exiting');\n       process.exit(0);\n     });\n     setTimeout(() => {\n       logger.error('Forced shutdown after timeout');\n       process.exit(1);\n     }, 30_000);\n   };\n\n   process.on('SIGTERM', () => shutdown('SIGTERM'));\n   process.on('SIGINT', () => shutdown('SIGINT'));\n   ```\n\n## Constraints\n- Do not change the port or host configuration\n- Preserve the existing startup callback behavior\n- Ensure the shutdown timeout is configurable via environment variable (default 30s)\n\n## Verification\n- Start the server and send `kill -TERM <pid>` — it should log shutdown and exit cleanly\n- `npm test` should pass\n- Verify with `lsof -i :3000` that the port is released after shutdown",
  "confidence": "native"
}
```
