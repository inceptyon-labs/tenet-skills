# Tenet API Contract — Rubric

## Severity Reference

Refer to `shared/severity.md` for canonical severity definitions. Below are the dimension-specific rules.

## Findings

### critical

No critical-severity findings are defined for this dimension. API contract issues do not typically represent immediate security vulnerabilities or data loss risks. If a contract issue does create a security vector (e.g., GET handler that deletes data without authentication), it will be caught by the `security` dimension.

### major

| ID | Title | Condition | Confidence |
|----|-------|-----------|------------|
| AC-M01 | GET handler with side effects | A GET route handler writes to a database, sends emails, triggers jobs, or mutates state | native |
| AC-M02 | No consistent error response schema | Error responses across the API use 3+ different shapes with no shared structure | native |
| AC-M03 | Non-idempotent PUT handler | A PUT handler creates new records, appends to collections, or produces different results on repeated calls | native |
| AC-M04 | Unbounded list endpoint | A collection GET endpoint returns all records with no pagination, limit, or maximum cap | native |
| AC-M05 | Misleading status codes | Handler returns 200 for errors, 500 for validation failures, or 404 for authorization failures | native |
| AC-M06 | Mixed versioning strategies | Some routes use URL versioning (`/v1/`), others use header versioning, with no clear boundary | heuristic |

### minor

| ID | Title | Condition | Confidence |
|----|-------|-----------|------------|
| AC-m01 | Inconsistent response envelope | Endpoints for the same resource use different top-level keys (e.g., `data` vs `result` vs bare object) | native |
| AC-m02 | POST creation returns 200 instead of 201 | A POST handler that creates a resource returns 200 OK instead of 201 Created | native |
| AC-m03 | DELETE returns 200 with empty body instead of 204 | A DELETE handler returns 200 with no body instead of 204 No Content | native |
| AC-m04 | Inconsistent pagination parameters | Collection endpoints use different parameter names for pagination (`page`/`limit` vs `offset`/`count`) | native |
| AC-m05 | PUT used for partial updates | A PUT handler accepts and applies partial payloads (should be PATCH) | native |
| AC-m06 | DELETE not idempotent | A DELETE handler throws 500 or unhandled error when the resource is already deleted | native |
| AC-m07 | Missing Content-Type header | JSON responses do not explicitly set `Content-Type: application/json` | heuristic |
| AC-m08 | Inconsistent error status codes | Validation errors return 400 in some handlers and 422 in others with no pattern | native |

### info

| ID | Title | Condition | Confidence |
|----|-------|-----------|------------|
| AC-i01 | No API versioning detected | Public-facing API has no versioning strategy (URL, header, or query param) | heuristic |
| AC-i02 | No OpenAPI/Swagger spec | API has route handlers but no machine-readable API specification | deterministic |
| AC-i03 | No rate limiting headers | API responses do not include rate limiting headers (`X-RateLimit-*`) | heuristic |
| AC-i04 | HATEOAS opportunity | API responses do not include hypermedia links for resource navigation | heuristic |
| AC-i05 | OpenAPI spec drift detected | Routes exist in code but not in the OpenAPI spec, or vice versa | deterministic |
| AC-i06 | No Location header on 201 responses | POST endpoints returning 201 do not include a Location header pointing to the new resource | native |

## Scoring

```
score = 100 - (5 * critical + 2 * major + 0.5 * minor)
score = max(0, min(100, round(score)))
```

- Info findings do NOT affect the score.
- If the dimension is not applicable: `score: null`, `applicable: false`.

## Metrics

The dimension report includes these metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `route_count` | integer | Total number of route handlers detected |
| `resource_count` | integer | Number of distinct resource groups (base paths) |
| `frameworks_detected` | string[] | API frameworks found in the codebase |
| `versioning_strategy` | string | `"url"`, `"header"`, `"query"`, `"mixed"`, or `"none"` |
| `pagination_strategy` | string | `"offset"`, `"cursor"`, `"page"`, `"mixed"`, or `"none"` |
| `has_openapi_spec` | boolean | Whether an OpenAPI/Swagger spec file exists |
| `response_shape_consistency` | float | 0.0-1.0 ratio of endpoints using the dominant response envelope |
| `error_schema_consistency` | float | 0.0-1.0 ratio of error responses using the dominant error shape |
