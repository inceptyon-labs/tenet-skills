# Security Calibration — flag / do-NOT-flag pairs

Junior-class models calibrate far better from contrastive examples than from prose rules.
For each vulnerability class, this file pairs a **real finding** with a **safe look-alike**
that must NOT be flagged. When a candidate matches a "do NOT flag" pattern, drop it (do not
even emit `info`) — it is a detector false positive, not an accepted risk.

Read this alongside `shared/verification.md`. These pairs are the concrete refutations to run.

---

## SQL / query injection

✅ **Flag** — user input concatenated/interpolated into raw SQL:
```ts
db.query(`SELECT * FROM users WHERE email = '${email}'`)
db.raw("... WHERE id = " + req.params.id)
cursor.execute(f"SELECT * FROM t WHERE name = '{name}'")   # Python f-string
```

🚫 **Do NOT flag** — parameterized / builder / safe tagged template:
```ts
db.query('SELECT * FROM users WHERE email = $1', [email])   // placeholder
db.select().from(users).where(eq(users.email, email))        // Drizzle/Knex builder
sql`SELECT * FROM users WHERE email = ${email}`              // Drizzle/postgres.js/Slonik tagged template — parameterizes
```
The `sql`...`` **tagged template** from Drizzle, `postgres`, `@vercel/postgres`, Slonik, etc.
is parameterized — `${x}` becomes a bind param, not string interpolation. Only flag
`sql.raw(...)` / `.raw()` with interpolation. Also do not flag interpolation of a
server-controlled constant/enum/identifier that is not user input.

---

## XSS / unsafe HTML

✅ **Flag** — user content rendered as raw HTML with no sanitizer:
```tsx
<div dangerouslySetInnerHTML={{ __html: comment.body }} />
element.innerHTML = userInput
```

🚫 **Do NOT flag** — sanitized, or not user-controlled:
```tsx
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.body) }} />
<div>{comment.body}</div>                          // JSX text is auto-escaped
element.innerHTML = "<b>Loading…</b>"              // static literal, no user input
element.innerHTML = marked(md)  /* only safe if marked is configured with sanitize */
```

---

## Weak randomness

✅ **Flag** — `Math.random()` / `random.random()` for a security value:
```ts
const resetToken = Math.random().toString(36).slice(2)     // password reset / session / API key
```

🚫 **Do NOT flag** — non-security use:
```ts
const jitter = base * (1 + Math.random())          // retry backoff
const pick = arr[Math.floor(Math.random() * arr.length)]   // UI shuffle, sample data
```
The distinguishing question: does the value gate access or need to be unguessable? Only then
is `Math.random()` a finding.

---

## Weak hashing

✅ **Flag** — MD5/SHA1 for passwords or tokens:
```ts
crypto.createHash('md5').update(password).digest('hex')
```

🚫 **Do NOT flag** — fast hash for a non-security checksum/cache key/etag (emit `info` at most):
```ts
crypto.createHash('sha1').update(fileBuffer).digest('hex')  // content-addressing / cache key
```

---

## Command execution

✅ **Flag** — user input in a shell string:
```ts
exec(`convert ${req.body.file} out.png`)
subprocess.call(f"ls {path}", shell=True)
```

🚫 **Do NOT flag** — argument-array form, or a static command:
```ts
execFile('convert', [file, 'out.png'])             // no shell, args are not interpreted
spawn('git', ['status'])
exec('npm run build')                               // static literal
```

---

## IDOR / ownership scoping

✅ **Flag** — record fetched/mutated by id with no owner scope on an authenticated route:
```ts
// user is logged in, but any id works — you can read anyone's order
const order = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id])
await db.orders.delete({ where: { id: req.params.id } })
```

🚫 **Do NOT flag** — scoped to the caller, or an admin route that legitimately spans users:
```ts
const order = await db.query(
  'SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id])
db.orders.delete({ where: { id: req.params.id, userId: session.user.id } })
```
Parameterization does NOT fix IDOR — `WHERE id = $1` is injection-safe but still IDOR if it
lacks the ownership predicate.

---

## Multi-tenant isolation

✅ **Flag** — query on a tenant-scoped table with no tenant predicate:
```ts
// tables have league_id / org_id / tenant_id, but this query omits it
const rows = await db.select().from(scores).where(eq(scores.roundId, roundId))
```

🚫 **Do NOT flag** — tenant-scoped, or a genuinely global table:
```ts
const rows = await db.select().from(scores)
  .where(and(eq(scores.roundId, roundId), eq(scores.leagueId, ctx.leagueId)))
```
First confirm the app is multi-tenant (a `tenant_id`/`org_id`/`league_id` column exists on
domain tables). Global/reference tables (currencies, feature flags) are exempt.

---

## SSRF

✅ **Flag** — user-controlled URL fetched server-side with no allowlist:
```ts
const r = await fetch(req.query.url)
```

🚫 **Do NOT flag** — allowlisted host, or a fixed/config URL:
```ts
if (!ALLOWED_HOSTS.includes(new URL(url).host)) throw new Error('bad host')
const r = await fetch(url)
const r = await fetch(`${process.env.API_BASE}/status`)   // server-controlled base
```

---

## Timing-safe comparison

✅ **Flag** — secret compared with `==`/`===`/`.equals`:
```ts
if (providedToken === storedResetToken) { ... }
if (hmac === signatureFromHeader) { ... }
```

🚫 **Do NOT flag** — constant-time comparison:
```ts
crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
```

---

## Webhook signature verification

✅ **Flag** — webhook body trusted without verifying the provider signature:
```ts
app.post('/webhooks/stripe', (req) => handle(req.body))    // no signature check
```

🚫 **Do NOT flag** — signature verified before use:
```ts
const event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret)
```

---

## Publishable / public-by-design keys (secrets dimension)

🚫 **Do NOT flag as critical** — keys that are safe to ship in client code:
- Firebase web config (`apiKey`, `authDomain`, …) — public by design; security is in rules.
- Stripe **publishable** key `pk_live_…` / `pk_test_…` (flag the **secret** `sk_live_…`).
- Mapbox `pk.…`, PostHog/Segment/Amplitude public write keys, Sentry public DSN, Google Maps
  browser key, Supabase `anon` public key.

✅ **Still flag** the private counterparts: `sk_live_…`, Supabase `service_role` key, Firebase
Admin SDK service-account JSON / private key, any `*_SECRET`, `*_PRIVATE_KEY`.

When unsure whether a public-looking key is truly publishable, emit `minor` with a note to
confirm, not `critical`.
