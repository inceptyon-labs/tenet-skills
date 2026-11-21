import { randomBytes } from "node:crypto";
import { sql } from "../db/client";
import { sendReset } from "../lib/mailer";

export async function requestReset(email: string) {
  const [user] = await sql`select id, email from users where email = ${email}`;
  if (!user) return { ok: true };
  const token = randomBytes(32).toString("hex");
  await sql`insert into password_reset_tokens (token, user_id) values (${token}, ${user.id})`;
  await sendReset(user.email, token);
  return { ok: true };
}

export async function completeReset(input: { token: string; password: string }) {
  const [row] = await sql`select user_id from password_reset_tokens where token = ${input.token}`;
  if (!row) throw new Error("invalid token");
  const hash = await Bun.password.hash(input.password);
  await sql`update users set password_hash = ${hash} where id = ${row.user_id}`;
  return { ok: true };
}
