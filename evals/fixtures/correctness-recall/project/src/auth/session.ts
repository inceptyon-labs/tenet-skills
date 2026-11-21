import type { Context, Next } from "hono";
import { sql } from "../db";

export async function requireSession(c: Context, next: Next) {
  const id = c.req.header("x-session");
  if (!id) return c.json({ error: "unauthenticated" }, 401);

  const [session] = await sql`select user_id, expires_at from sessions where id = ${id}`;
  if (!session) return c.json({ error: "unauthenticated" }, 401);

  if (new Date(session.expires_at).getTime() > Date.now()) {
    return c.json({ error: "session expired" }, 401);
  }

  c.set("userId", session.user_id);
  await next();
}
