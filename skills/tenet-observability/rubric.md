# Tenet Observability — Rubric

Detailed rubric for the observability dimension. Each check has a unique ID, detection strategy per language tier, severity mapping, and scoring impact.

## Scoring Formula

```
score = 100 - (5 x critical) - (2 x major) - (0.5 x minor)
Floor: 0 | Ceil: 100 | Round to integer
Info findings do NOT affect the score.
```

---

## OBS-01: Structured Logging Presence

**What it checks:** Whether production source files use a structured logging library rather than bare console/print output.

**Why it matters:** Unstructured text logs cannot be parsed by log aggregation platforms (Datadog, Splunk, ELK, CloudWatch Logs Insights). This makes filtering, alerting, and correlation impossible at scale.

| Condition | Severity | Score Impact |
|---|---|---|
| No structured logger imported anywhere in production code | major | -2 |
| > 5 bare console/print calls in production files (non-test, non-script) | major | -2 |
| 1-5 bare console/print calls in production files | minor | -0.5 each |
| Structured logger present and no bare console calls | (no finding) | 0 |

**Detection by language:**

| Language | Structured Loggers Recognized | Bare Output Patterns |
|---|---|---|
| TS/JS | winston, pino, bunyan, log4js, tslog, roarr, @nestjs/common Logger | console.log, console.warn, console.error, console.info |
| Python | logging (stdlib), structlog, loguru, python-json-logger | print() |
| Go | zap, zerolog, logrus, slog (stdlib) | fmt.Println, fmt.Printf, fmt.Print, log.Println |
| Java | slf4j, log4j, logback, LoggerFactory | System.out.println, System.err.println |
| Ruby | Rails.logger, Logger.new, SemanticLogger | puts, p, pp |
| Rust | tracing, log, env_logger, slog | println!, eprintln! |
| Other | grep for `logger`, `Logger`, `logging` | grep for `print`, `console`, `fmt.Print` |

**Confidence:** native for TS/JS/Python/Go, heuristic for others.

---

## OBS-02: Log Level Appropriateness

**What it checks:** Whether log levels match the semantic severity of what is being logged.

**Why it matters:** Using the wrong log level causes alert fatigue (errors logged as info get missed) or noise (startup messages logged as errors trigger pages).

| Condition | Severity | Score Impact |
|---|---|---|
| Debug-level logging includes sensitive data (passwords, tokens, keys) | critical | -5 |
| Error conditions logged with console.log/print (not error level) | major | -2 |
| Non-error conditions logged with error level | minor | -0.5 |
| Production config defaults to DEBUG log level | minor | -0.5 |

**Detection patterns:**

- **Sensitive data in debug logs:** Grep for `debug` log calls whose arguments include variable names containing `password`, `secret`, `token`, `key`, `auth`, `credential`, `apiKey`, `api_key`, `private`. Severity: critical.
- **Errors at wrong level:** Scan `catch` / `except` / `recover` blocks for `console.log`, `print()`, `fmt.Println`, `logger.info`, `logger.debug` instead of `logger.error` or `logger.warn`. Severity: major.
- **Noise at error level:** Scan for `logger.error` / `console.error` with messages like "started", "listening", "connected", "initialized", "ready". Severity: minor.
- **Debug in prod config:** Check `.env`, `.env.production`, config files for `LOG_LEVEL=debug`, `DEBUG=*`, or `logging.level=DEBUG` without a clear dev-only marker. Severity: minor.

**Confidence:** native for TS/JS/Python/Go, heuristic for others.

---

## OBS-03: Correlation ID / Trace Propagation

**What it checks:** Whether HTTP requests can be traced end-to-end through the system via correlation IDs or distributed tracing.

**Why it matters:** Without request-scoped identifiers, debugging production issues across services requires manual timestamp correlation — slow and error-prone. Distributed tracing is essential for microservice architectures.

| Condition | Severity | Score Impact |
|---|---|---|
| Web server app with no correlation ID or tracing mechanism | major | -2 |
| Tracing library imported but not wired into HTTP middleware | minor | -0.5 |
| Non-server app (library, CLI) | (skip) | 0 |

**What qualifies as trace propagation:**

- OpenTelemetry SDK configured and initialized
- Correlation ID middleware (generates or propagates `X-Request-ID`, `X-Correlation-ID`, `traceparent` headers)
- APM agent (Datadog dd-trace, New Relic, Elastic APM) initialized
- Custom middleware that injects a request ID into the logger context (e.g., `cls-hooked`, `async_hooks`, `structlog.bind`, `context.Context`)

**Detection by language:**

| Language | Libraries / Patterns |
|---|---|
| TS/JS | @opentelemetry/sdk-node, @opentelemetry/api, cls-hooked, express-request-id, dd-trace, newrelic |
| Python | opentelemetry-*, ddtrace, newrelic, structlog context binding, Django request ID middleware |
| Go | go.opentelemetry.io/otel, opentracing, jaeger-client-go, context.Context propagation |
| Other | Grep for opentelemetry, request.id, requestId, correlationId, X-Request-ID, traceparent |

**Confidence:** native for TS/JS/Python/Go, heuristic for others.

---

## OBS-04: Metrics on Critical Paths

**What it checks:** Whether the application instruments key operational and business metrics (request rate, latency, error rate, saturation).

**Why it matters:** Metrics are the first signal in incident detection. Without them, teams rely on user reports or log searches to detect degradation. The RED method (Rate, Errors, Duration) and USE method (Utilization, Saturation, Errors) require explicit instrumentation.

| Condition | Severity | Score Impact |
|---|---|---|
| Server app with > 3 routes and no metrics library | major | -2 |
| Metrics library imported but applied to < 20% of route files | minor | -0.5 |
| Library or CLI tool | (skip) | 0 |

**What qualifies as metrics instrumentation:**

- Prometheus client (prom-client, prometheus_client, client_golang/prometheus)
- OpenTelemetry Metrics SDK
- StatsD client (hot-shots, node-statsd, statsd, datadog-metrics)
- Framework-integrated metrics (django-prometheus, starlette-prometheus, gin metrics middleware)
- Custom middleware recording histograms, counters, or gauges

**Detection by language:**

| Language | Libraries / Patterns |
|---|---|
| TS/JS | prom-client, @opentelemetry/sdk-metrics, hot-shots, node-statsd, datadog-metrics |
| Python | prometheus_client, statsd, datadog, opentelemetry.metrics, django-prometheus |
| Go | prometheus/client_golang, go.opentelemetry.io/otel/metric, datadog-go/statsd |
| Other | Grep for histogram, counter, gauge, prometheus, statsd, metrics |

**Confidence:** native for TS/JS/Python/Go, heuristic for others.

---

## OBS-05: Health Check Endpoint

**What it checks:** Whether the application exposes an HTTP health check endpoint for orchestrators, load balancers, and uptime monitors.

**Why it matters:** Without a health endpoint, Kubernetes cannot determine liveness/readiness, load balancers cannot remove unhealthy instances, and uptime monitors cannot detect outages. This directly impacts availability and deployment safety.

| Condition | Severity | Score Impact |
|---|---|---|
| Server app with no health endpoint | major | -2 |
| Health endpoint returns static 200 without checking dependencies | minor | -0.5 |
| Health endpoint present with dependency checks | (no finding) | 0 |
| Library or CLI tool | (skip) | 0 |

**What qualifies as a health endpoint:**

- Route at `/health`, `/healthz`, `/livez`, `/readyz`, `/ready`, `/ping`, `/status`
- Kubernetes probe configuration: `livenessProbe`, `readinessProbe`, `startupProbe` in deployment manifests
- Docker HEALTHCHECK directive in Dockerfile
- Load balancer health check config in Terraform/CloudFormation/Pulumi

**Dependency check detection:**

A "smart" health endpoint is one that tests downstream dependencies (DB ping, cache ping, external API check) rather than just returning a static response. Look for:
- Database query execution inside the health handler
- Cache `ping()` calls
- HTTP requests to dependent services
- Any conditional logic that can return non-200

**Confidence:** native for TS/JS/Python/Go (route detection), heuristic for infrastructure-only detection.

---

## OBS-06: Graceful Shutdown Handling

**What it checks:** Whether the application handles SIGTERM and SIGINT signals to drain active connections and flush buffers before exiting.

**Why it matters:** During rolling deployments, Kubernetes sends SIGTERM and waits for `terminationGracePeriodSeconds` (default 30s). Without a handler, in-flight HTTP requests receive connection resets (502/503), database transactions may be left in an inconsistent state, and log buffers may not flush — losing the final (often most important) log lines.

| Condition | Severity | Score Impact |
|---|---|---|
| Long-running server with no SIGTERM/SIGINT handler | major | -2 |
| Signal handler exists but does not drain connections (no server.close or equivalent) | minor | -0.5 |
| Signal handler exists with proper drain logic | (no finding) | 0 |
| Library or CLI tool | (skip — unless it's a long-running worker) | 0 |

**What qualifies as graceful shutdown:**

- Signal handler registered for SIGTERM (and ideally SIGINT)
- Server stops accepting new connections (`server.close()`, `httpServer.Shutdown()`, etc.)
- In-flight requests are allowed to complete (with a timeout)
- Database connections are closed
- Log buffers are flushed

**Detection by language:**

| Language | Signal Handling Patterns | Connection Draining Patterns |
|---|---|---|
| TS/JS | `process.on('SIGTERM', ...)`, `process.on('SIGINT', ...)` | `server.close()`, `app.close()` |
| Python | `signal.signal(signal.SIGTERM, ...)`, `atexit.register(...)`, FastAPI `on_event("shutdown")`, Django `on_shutdown` | `server.shutdown()`, `loop.close()` |
| Go | `signal.Notify(ch, syscall.SIGTERM, ...)`, `os.Signal` | `http.Server.Shutdown(ctx)`, `listener.Close()` |
| Other | Grep for SIGTERM, SIGINT, signal, shutdown, graceful, on_exit, atexit | Grep for close, shutdown, drain |

**Confidence:** native for TS/JS/Python/Go, heuristic for others.

---

## Applicability Rules

| Condition | Result |
|---|---|
| Project is a library (no main entry point, only exports) | Skip OBS-04, OBS-05, OBS-06 |
| Project is a CLI tool (commander, click, cobra) | Skip OBS-04, OBS-05 |
| Project is a long-running worker (queue consumer) | Include OBS-06, skip OBS-05 |
| Project has < 100 LOC production code | `applicable: false`, `score: null` |

## Dimension Metrics

The `metrics` object in the report should include:

```json
{
  "structured_logger": "pino | winston | null",
  "bare_console_calls": 8,
  "has_correlation_ids": true,
  "tracing_library": "opentelemetry | dd-trace | null",
  "has_metrics": true,
  "metrics_library": "prom-client | null",
  "has_health_endpoint": true,
  "health_endpoint_path": "/healthz",
  "health_checks_dependencies": true,
  "has_graceful_shutdown": false,
  "project_type": "web-server | worker | cli | library"
}
```
