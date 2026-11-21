# Entry-Point Inventory

The highest-value security and correctness checks — auth, authorization, ownership/tenant
scoping, input validation, CSRF — cannot be done by grep alone. They require knowing **every
place untrusted input enters the application** and then verifying each one. This file gives
mechanical enumeration recipes per framework so the executing model builds a *complete* list
instead of eyeballing a few handlers.

Used by `tenet-security`, `tenet-correctness`, and `tenet-api-contract`.

---

## The route table

Build a table and persist it to `.healthcheck/tmp/entry-points.md`. One row per entry point.
**Fill in every cell by reading the handler — do not sample, do not leave cells blank.**

| method | path | file:line | auth? | role/authz? | ownership/tenant scope? | input validation? | mutates data? |
|---|---|---|---|---|---|---|---|

Column meaning:

- **auth?** — is an authentication check enforced (middleware, guard, decorator, `locals.user`
  gate) before the handler body runs? `yes` / `no` / `public-by-design`.
- **role/authz?** — for privileged actions, is there a role/permission check? `yes` / `no` /
  `n/a`.
- **ownership/tenant scope?** — if the handler reads or writes a record by id, is the query
  scoped to the caller's user/org/tenant? `yes` / `no` / `n/a` (see IDOR + multi-tenant
  checks in the security rubric).
- **input validation?** — is the request body/query/params validated by a schema (zod, joi,
  yup, pydantic, class-validator) or explicit checks? `yes` / `no` / `n/a`.
- **mutates data?** — does it write (POST/PUT/PATCH/DELETE, or a GET that mutates)? `yes`/`no`.

### Turning the table into findings

- A **mutating** route with `auth? = no` (and not `public-by-design`) → missing auth
  (`major`, `critical` if admin/privileged).
- A privileged route with `role/authz? = no` → missing authorization (`critical`).
- A route that fetches/updates a record by id with `ownership/tenant scope? = no` → IDOR /
  tenant leak (`critical` — see `SEC-AUTHZ-IDOR` / `SEC-AUTHZ-TENANT`).
- A route reading request input with `input validation? = no` → missing validation
  (`major`).
- A cookie-authenticated mutating route with no CSRF defense and no `SameSite` → CSRF
  (`major`).

The completed table is also excellent `checks` output for the dashboard — emit a summary
(e.g. "Audited 34 routes: 3 missing auth, 2 missing ownership scope").

---

## Enumeration recipes by framework

Detect the stack from manifests/imports first, then run the matching recipe. Cover **all**
that apply (a repo may mix, e.g. Next.js API routes + tRPC).

### Express / Fastify / Koa (Node)

```bash
git grep -nP "\b(app|router|r|api)\.(get|post|put|patch|delete|all)\s*\(" -- '*.ts' '*.tsx' '*.tsx' '*.js' '*.jsx'
git grep -nP "\.(use)\s*\(" -- '*.ts' '*.tsx' '*.tsx' '*.js' '*.jsx'   # middleware — note auth middleware & order
```
Middleware **order** matters: an auth middleware registered *after* a route, or on the wrong
router, does not protect it. Confirm the auth middleware actually wraps each route.

### Hono (Cloudflare Workers — Jason's default web backend)

```bash
git grep -nP "\.(get|post|put|patch|delete|on|all)\s*\(" -- '*.ts' '*.tsx'
git grep -nP "\.(use|route)\s*\(" -- '*.ts' '*.tsx'          # middleware mounts & sub-apps
git grep -nP "\bc\.(req|env|var)\b" -- '*.ts' '*.tsx'         # request access inside handlers
```
Check that `app.use('*', authMiddleware)` or per-route middleware runs before protected
handlers, and that `c.req.param()/query()/json()` values are validated (often via
`@hono/zod-validator`). On Workers, also confirm secrets come from `c.env` bindings, not
hardcoded.

### tRPC

```bash
git grep -nP "(publicProcedure|protectedProcedure|\.procedure)\b" -- '*.ts' '*.tsx'
git grep -nP "\.(query|mutation)\s*\(" -- '*.ts' '*.tsx'
```
**A `publicProcedure` that is a `.mutation` is a finding** unless it is genuinely public
(login, signup, public webhook). Confirm `protectedProcedure` actually enforces auth in its
middleware, and that mutations scope by `ctx.session.user.id`.

### Next.js (App Router + Pages)

```bash
git grep -nP "export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)" -- '*app/*route.ts' '*app/*route.js'
git ls-files -- '*pages/api/*'                             # every file under pages/api is an endpoint
git grep -nP "'use server'|\"use server\"" -- '*.ts' '*.tsx'   # server actions are entry points too
```
Server Actions (`'use server'`) are unauthenticated by default and are real mutation entry
points — audit them like routes.

### SvelteKit

```bash
git ls-files -- '*+server.ts' '*+server.js'            # API endpoints
git grep -nP "export\s+(const|function)\s+(GET|POST|PUT|PATCH|DELETE)" -- '*+server.ts' '*+server.js'
git grep -nP "export\s+(const|function)\s+(load|actions)\b" -- '*+page.server.*' '*+layout.server.*'
```
`+page.server.ts` `load` functions **return data to the browser** — a `load` that returns a
full user/tenant record without field filtering is a data-exposure finding. Form `actions`
are mutation entry points; verify auth via `locals` and ownership scoping.

### FastAPI / Flask / Django (Python)

```bash
git grep -nP "@(app|router|api|blueprint)\.(get|post|put|patch|delete|route)\b" -- '*.py'
git grep -nP "@(login_required|permission_required|requires)\b" -- '*.py'   # auth decorators
git grep -nP "(path|re_path|url)\s*\(" -- '*urls.py'            # Django routing
```
For FastAPI, check for `Depends(get_current_user)` on protected routes and Pydantic models on
the body. For Django, check `LoginRequiredMixin`/`permission_required` and queryset scoping
(`.filter(owner=request.user)` vs `.get(pk=...)`).

### Go (net/http, chi, gin, echo)

```bash
git grep -nP "\.(HandleFunc|Handle|GET|POST|PUT|PATCH|DELETE)\s*\(" -- '*.go'
git grep -nP "\.(Use)\s*\(" -- '*.go'   # middleware
```

### Serverless / other

Also treat as entry points: message-queue/event consumers, cron/scheduled jobs that read
external data, GraphQL resolvers, WebSocket message handlers, file-upload handlers, and
webhook receivers (verify the signature — see `SEC-WEBHOOK`).

---

## Non-web entry points (desktop / mobile)

These take input too and are covered by the platform playbooks in the security skill:

- **Tauri**: commands exposed via `#[tauri::command]` and `invoke_handler`; the capability /
  allowlist config; deep-link and file-drop handlers.
- **Electron**: `ipcMain.handle` / `ipcMain.on` channels; anything reachable from the
  renderer; custom protocol handlers.
- **iOS/Android**: URL-scheme / universal-link handlers, share extensions, and any parsing of
  data received from the network or other apps.
