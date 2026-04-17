---
name: tenet-api-contract
description: "Evaluates API design consistency: response shape uniformity, error response schemas, RESTful verb usage, versioning strategy, idempotency on PUT/DELETE, proper status codes, and pagination consistency. Applicable when API route handlers, OpenAPI/GraphQL schemas, or tRPC routers are detected."
when_to_use: "API audit, REST consistency, OpenAPI check, GraphQL review, tRPC review, tenet api-contract"
model: opus
allowed-tools: Bash Read Grep Glob Write
---

# Tenet API Contract

> Evaluates whether your API surface is consistent, predictable, and well-designed.

## Purpose

This skill audits the API layer of a project for design consistency and contract quality. A well-designed API follows predictable patterns: every resource returns the same response shape, error responses use a uniform schema, HTTP verbs map to their intended semantics, status codes are precise, and pagination follows a single strategy. This skill detects deviations from those principles and flags them as findings.

APIs are the public contract of a service. Inconsistencies in response shapes, verb semantics, or status codes create integration friction, increase client-side error handling complexity, and signal a codebase where conventions are not enforced. This dimension catches those issues before they reach consumers.

## Language Support Matrix

```yaml
support:
  native:
    - express
    - fastify
    - nextjs-api-routes
    - nextjs-app-router
    - flask
    - django
    - django-rest-framework
    - trpc
    - nestjs
    - hono
    - koa
  tree_sitter:
    - spring-boot
    - gin
    - echo
    - rails
    - phoenix
  heuristic:
    - all-others
  note: >
    Native support means the skill understands the framework's routing conventions
    and can precisely extract route handlers, middleware, and response calls.
    Tree-sitter support uses AST queries for common patterns.
    Heuristic support uses grep-based pattern matching for HTTP verb + path + status code detection.
```

## Applicability Detection

This skill is applicable when ANY of the following are detected:

1. **Express/Fastify/Koa/Hono route handlers** — files containing `app.get(`, `app.post(`, `router.get(`, `fastify.get(`, etc.
2. **Next.js API routes** — files under `pages/api/` or `app/*/route.ts`
3. **Flask/Django views** — `@app.route`, `@api_view`, `urlpatterns` with view references
4. **tRPC routers** — `createTRPCRouter`, `publicProcedure`, `protectedProcedure`
5. **NestJS controllers** — `@Controller`, `@Get()`, `@Post()` decorators
6. **OpenAPI/Swagger specs** — `openapi.yaml`, `openapi.json`, `swagger.yaml`, `swagger.json`
7. **GraphQL schemas** — `.graphql` files, `typeDefs`, `gql` tagged templates

If none of these are detected, write the dimension report with `applicable: false` and `score: null`.

## Toolchain Inputs

This skill does NOT consume toolchain outputs directly. It performs its own code analysis using Grep, Glob, and Read to examine route handlers and API definitions.

However, if `.healthcheck/toolchain/eslint.json` exists, check for any ESLint findings related to API patterns (e.g., consistent-return) and incorporate them to avoid duplicate work.

## Procedure

### Step 1: Detect API Framework and Enumerate Routes

Scan the codebase to identify which API framework(s) are in use and build a route inventory.

**For Express/Fastify/Koa/Hono:**
```bash
# Find route definitions
grep -rn "app\.\(get\|post\|put\|patch\|delete\)\s*(" src/ routes/ --include="*.ts" --include="*.js"
grep -rn "router\.\(get\|post\|put\|patch\|delete\)\s*(" src/ routes/ --include="*.ts" --include="*.js"
```

**For Next.js API routes:**
```bash
# App Router
find . -path "*/app/*/route.ts" -o -path "*/app/*/route.js"
# Pages Router
find . -path "*/pages/api/*.ts" -o -path "*/pages/api/*.js"
```

**For Flask:**
```bash
grep -rn "@app\.route\|@blueprint\.route" --include="*.py"
```

**For Django/DRF:**
```bash
grep -rn "urlpatterns\|@api_view\|class.*ViewSet\|class.*APIView" --include="*.py"
```

**For tRPC:**
```bash
grep -rn "createTRPCRouter\|publicProcedure\|protectedProcedure" --include="*.ts" --include="*.js"
```

**For NestJS:**
```bash
grep -rn "@Controller\|@Get\|@Post\|@Put\|@Patch\|@Delete" --include="*.ts"
```

Build a route table:

| Method | Path | File | Line | Handler |
|--------|------|------|------|---------|
| GET | /api/users | src/routes/users.ts | 12 | listUsers |
| POST | /api/users | src/routes/users.ts | 45 | createUser |
| ... | ... | ... | ... | ... |

### Step 2: Check Response Shape Uniformity

For each resource (group of routes sharing a base path like `/api/users`), examine the response bodies:

**What to check:**
- All success responses for a resource should wrap data in the same envelope (e.g., `{ data: ..., meta: ... }` or bare objects)
- If one endpoint returns `{ data: users, total: 100 }`, another should not return `{ results: users, count: 100 }`
- Collection endpoints (GET /resources) vs. singleton endpoints (GET /resources/:id) should use consistent wrapping

**Detection method:**
- Read each handler and look for `res.json(`, `res.send(`, `return Response.json(`, `jsonify(`, `JsonResponse(`
- Extract the top-level keys of the response object
- Compare across handlers in the same resource group

**Severity:** minor for inconsistent shapes within a resource, major if the inconsistency spans the entire API (no two resources use the same envelope).

### Step 3: Check Error Response Schemas

Examine error handling across all routes:

**What to check:**
- Error responses should follow a uniform schema (e.g., `{ error: { code: string, message: string } }`)
- Different error handlers should not return different shapes (one returning `{ error: "msg" }` and another `{ message: "msg", status: 400 }`)
- Express error middleware, NestJS exception filters, Flask errorhandlers should be consistent

**Detection method:**
- Search for error response patterns: `res.status(4`, `res.status(5`, `HttpException`, `abort(`, `raise Http`
- Extract the response body shape from each error path
- Check for a centralized error handler vs. ad-hoc error responses

**Severity:** major if no consistent error schema exists, minor if most errors are consistent with a few outliers.

### Step 4: Validate HTTP Verb Semantics

Check that HTTP methods are used according to their semantics:

**Rules:**
| Verb | Expected Semantics | Flag if... |
|------|--------------------|------------|
| GET | Read-only, no side effects | Handler writes to DB, sends emails, creates records |
| POST | Create a resource or trigger an action | Used for idempotent updates (should be PUT/PATCH) |
| PUT | Full replacement, idempotent | Handler does partial updates (should be PATCH) |
| PATCH | Partial update | Handler requires all fields (should be PUT) |
| DELETE | Remove a resource, idempotent | Handler has non-idempotent side effects |

**Detection method:**
- For GET handlers: look for `save()`, `create()`, `insert`, `delete`, `update`, `sendEmail`, `publish`, write operations on DB models
- For POST handlers used for updates: check if the path contains an `:id` param and the handler does a full replacement
- For PUT handlers: check if the handler merges/patches rather than replaces

**Severity:** major for GET with side effects (violates HTTP spec and breaks caching), minor for PUT/PATCH confusion.

### Step 5: Check Versioning Strategy

Examine how (or if) the API is versioned:

**Detection method:**
- URL-based: paths starting with `/v1/`, `/v2/`, `/api/v1/`
- Header-based: checks for `Accept` header version parsing, `X-API-Version` headers
- No versioning: all routes under a flat path

**What to flag:**
- Mixed versioning strategies (some routes versioned in URL, others in headers)
- Multiple API versions with identical implementations (dead versions)
- No versioning at all on a public API (info-level suggestion)

**Severity:** minor for mixed strategies, info for missing versioning on public APIs.

### Step 6: Validate Idempotency on PUT and DELETE

PUT and DELETE requests MUST be idempotent (calling them N times produces the same result as calling once).

**Detection method:**
- PUT handlers that use auto-increment IDs or generate new records instead of upserting
- PUT handlers that append to collections rather than replace
- DELETE handlers that throw errors on already-deleted resources instead of returning 204/404

**What to look for in code:**
```
# Bad: PUT that creates duplicates
router.put('/items/:id', (req, res) => {
  db.items.insert(req.body)  // creates a new record every call
})

# Bad: DELETE that throws on missing
router.delete('/items/:id', (req, res) => {
  const item = db.items.findOrFail(req.params.id)  // throws 500 on second call
})
```

**Severity:** major for non-idempotent PUT, minor for DELETE that errors on missing resources.

### Step 7: Validate Status Codes

Check that HTTP status codes match the operation:

**Rules:**
| Operation | Expected Status | Flag if... |
|-----------|----------------|------------|
| Create (POST) | 201 Created | Returns 200 |
| Delete | 204 No Content (or 200 with body) | Returns 200 with empty body |
| Update (PUT/PATCH) | 200 OK | Returns 204 when body is returned |
| Not Found | 404 | Returns 200 with null/empty |
| Validation Error | 400 or 422 | Returns 500 |
| Auth failure | 401 or 403 | Returns 400 or 500 |

**Detection method:**
- Read POST handlers and check for `res.status(201)` vs `res.status(200)` or no explicit status
- Read DELETE handlers and check for `res.status(204)` or `res.sendStatus(204)`
- Flag handlers that return 200 for everything regardless of operation

**Severity:** minor for incorrect but functional status codes (200 instead of 201), major for misleading codes (200 for errors, 500 for validation).

### Step 8: Check Pagination Consistency

For collection endpoints that return lists, check pagination:

**What to check:**
- All list endpoints should use the same pagination strategy (offset-based, cursor-based, or page-based)
- Pagination parameters should have consistent names (`page`/`per_page` vs `offset`/`limit` vs `cursor`/`after`)
- Responses should include pagination metadata consistently (`total`, `next_cursor`, `has_more`)
- Default and maximum page sizes should be enforced

**Detection method:**
- Find all GET endpoints that return arrays/lists
- Check query parameter parsing for pagination params
- Compare pagination metadata shapes across endpoints

**Severity:** minor for inconsistent parameter naming, major for some endpoints paginated and others returning unbounded lists (performance risk).

### Step 9: Additional Checks

**Content-Type consistency:**
- All JSON endpoints should set `Content-Type: application/json`
- Mixed content types without Accept header negotiation

**HATEOAS/Links (info only):**
- Note whether the API includes hypermedia links for discoverability

**Rate limiting headers:**
- Check if rate limiting headers are set consistently (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)

**OpenAPI/Swagger spec drift:**
- If an OpenAPI spec exists, check whether routes in code match the spec
- Flag undocumented endpoints or spec-only endpoints that don't exist in code

### Step 10: Score and Write Report

Apply the standard scoring formula:

```
score = 100 - (5 * critical_count + 2 * major_count + 0.5 * minor_count)
score = max(0, min(100, round(score)))
```

Info findings do NOT affect the score.

Write the dimension report to `.healthcheck/reports/api-contract.json`:

```json
{
  "key": "api-contract",
  "score": 78,
  "weight": 1.0,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Examined 24 route handlers across 6 resources. Found inconsistent response shapes in /api/users and /api/orders, GET handler with database writes, and POST returning 200 instead of 201.",
  "metrics": {
    "route_count": 24,
    "resource_count": 6,
    "frameworks_detected": ["express"],
    "versioning_strategy": "url",
    "pagination_strategy": "offset",
    "has_openapi_spec": false,
    "response_shape_consistency": 0.75,
    "error_schema_consistency": 0.90
  }
}
```

Findings go into the `findings` array following the schema in `shared/schema.json`. Every finding MUST include a `fix_prompt` following `shared/fix_prompt_template.md`.

## Confidence Tiers

| Tier | When Used |
|------|-----------|
| `deterministic` | OpenAPI spec parsed, route explicitly defined with status code literal |
| `native` | Framework-aware handler analysis (Express, Flask, tRPC, etc.) |
| `tree_sitter` | AST-based extraction for supported languages |
| `heuristic` | Grep-based pattern matching, may produce false positives |

## Worked fix_prompt Examples

### Example 1: Inconsistent Response Shape

```
# Fix: Inconsistent response envelope in /api/users endpoints

## Context
The GET /api/users endpoint wraps its response in `{ data: [...], total: N }` but
GET /api/users/:id returns a bare user object without the `data` wrapper. Clients
must handle two different response shapes for the same resource.

## Location
- File: src/routes/users.ts
- Line: 67
- Dimension: api-contract / minor

## Current behavior
```ts
// GET /api/users (line 12)
res.json({ data: users, total: users.length });

// GET /api/users/:id (line 67)
res.json(user);  // bare object, no envelope
```

## Required change
Wrap the single-resource response in the same envelope used by the collection endpoint:
1. In `src/routes/users.ts` line 67, change `res.json(user)` to `res.json({ data: user })`
2. Apply the same pattern to all other single-resource GET handlers in this file (lines 89, 112)
3. If a shared response helper exists (check `src/utils/` or `src/middleware/`), use it instead

## Constraints
- Do not change the collection endpoint shape — it is already the standard
- Ensure any client-side code that consumes this endpoint is updated (check `src/client/` or `src/hooks/`)
- Preserve all existing fields in the user object — only change the wrapping

## Verification
- Run: `npm test -- --grep "users"`
- Run: `curl localhost:3000/api/users/1` and confirm response is `{ "data": { ... } }`
- Check that `curl localhost:3000/api/users` still returns `{ "data": [...], "total": N }`
```

### Example 2: GET Handler with Side Effects

```
# Fix: GET /api/reports/:id triggers report generation (side effect)

## Context
The GET /api/reports/:id handler generates a report on-demand and writes it to the database
before returning it. GET requests must be safe and idempotent per RFC 7231. This breaks HTTP
caching, causes duplicate writes on retries, and violates client expectations.

## Location
- File: src/routes/reports.ts
- Line: 34
- Dimension: api-contract / major

## Current behavior
```ts
router.get('/reports/:id', async (req, res) => {
  const report = await generateReport(req.params.id); // writes to DB
  await db.reports.save(report);                        // side effect!
  res.json(report);
});
```

## Required change
Split this into two endpoints:
1. POST /api/reports — triggers report generation, returns 201 with the new report
2. GET /api/reports/:id — retrieves an existing report by ID, returns 200 or 404

Specific steps:
1. In `src/routes/reports.ts`, rename the current handler to POST and change the path to `/reports`
2. Add a new GET `/reports/:id` handler that calls `db.reports.findById(req.params.id)`
3. The POST handler should return `res.status(201).json({ data: report })`
4. The GET handler should return `res.json({ data: report })` or `res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } })`

## Constraints
- Update any client code that calls GET /reports/:id to first POST then GET
- If a job queue exists, consider making POST /reports return 202 Accepted and generating asynchronously
- Do not remove the generateReport function — just move where it is called

## Verification
- Run: `npm test -- --grep "reports"`
- Run: `curl -X POST localhost:3000/api/reports -d '{"id":"123"}' -H 'Content-Type: application/json'` and confirm 201
- Run: `curl localhost:3000/api/reports/123` and confirm 200 with saved report
- Run: `curl localhost:3000/api/reports/nonexistent` and confirm 404
```

### Example 3: Wrong Status Code on Create

```
# Fix: POST /api/projects returns 200 instead of 201 Created

## Context
The POST /api/projects endpoint creates a new project but returns HTTP 200 OK instead
of 201 Created. While functionally harmless, this violates REST conventions, confuses
API consumers, and causes issues with client libraries that check for 201 to confirm creation.

## Location
- File: src/controllers/projects.ts
- Line: 28
- Dimension: api-contract / minor

## Current behavior
```ts
router.post('/projects', async (req, res) => {
  const project = await Project.create(req.body);
  res.json({ data: project }); // implicit 200
});
```

## Required change
1. In `src/controllers/projects.ts` line 28, change `res.json({ data: project })` to `res.status(201).json({ data: project })`
2. Optionally add a `Location` header pointing to the new resource: `res.set('Location', `/api/projects/${project.id}`)`
3. Check all other POST handlers in the codebase that create resources and apply the same fix:
   - `grep -rn "router.post\|app.post" src/ --include="*.ts" | grep -v "login\|auth\|search"` (exclude non-creation POST endpoints)

## Constraints
- Do not change POST endpoints that are actions (login, search, trigger) — only creation endpoints
- Ensure any integration tests asserting `expect(res.status).toBe(200)` are updated to `201`
- Preserve the response body shape — only the status code changes

## Verification
- Run: `npm test`
- Run: `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/projects -d '{"name":"test"}' -H 'Content-Type: application/json'` and confirm `201`
- Run: `grep -rn "res.json\|res.send" src/controllers/ --include="*.ts"` to check no other POST creation handlers return 200
```

## Output

- `.healthcheck/reports/api-contract.json` — dimension report with score, metrics, and findings

## Constraints

- NEVER flag GraphQL queries as "wrong verb usage" — GraphQL uses POST for all operations by convention
- NEVER flag tRPC procedures as "wrong verb usage" — tRPC abstracts over HTTP verbs
- NEVER penalize for choosing cursor-based over offset-based pagination or vice versa — only flag inconsistency
- NEVER require HATEOAS — it is an info-level suggestion only
- ALWAYS group findings by resource (e.g., "3 inconsistent shapes in /api/users") rather than filing one finding per endpoint
- If an OpenAPI spec exists and routes match it perfectly, give credit even if the code is hard to analyze
- Scoring math is pure arithmetic: `100 - (5 * critical + 2 * major + 0.5 * minor)`, floor 0, ceil 100, round to integer
- Info findings do NOT affect the score
- Every finding MUST include a `fix_prompt` following the template in `shared/fix_prompt_template.md`
- File paths in findings are always repo-relative
- The `confidence` field must reflect the detection method used (deterministic, native, tree_sitter, heuristic)

## Edge Cases

- **Monorepo with multiple APIs:** Treat each API root (e.g., `packages/api-a/`, `services/user-service/`) as a separate resource group. Do not compare response shapes across different services.
- **API Gateway / BFF pattern:** If a Backend-for-Frontend layer exists, audit it separately from the downstream services.
- **Mixed frameworks:** If a project uses both Express and tRPC (e.g., tRPC mounted on Express), analyze each framework's routes with the appropriate strategy.
- **Generated code:** If routes are auto-generated (e.g., Prisma, Swagger codegen), note this in the dimension `notes` and reduce severity of findings in generated files to `info`.
- **File-based routing (Next.js, Nuxt, SvelteKit):** Use the filesystem structure to infer routes rather than looking for `router.get()` calls.
