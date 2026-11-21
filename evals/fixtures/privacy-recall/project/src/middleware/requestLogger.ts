import type { Context, Next } from "hono";

export async function requestLogger(c: Context, next: Next) {
  const started = Date.now();
  const body = c.req.method === "GET" ? null : await c.req.raw.clone().text();
  await next();
  console.log(
    JSON.stringify({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
      authorization: c.req.header("authorization"),
      body,
    }),
  );
}
