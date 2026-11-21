import { sql } from "../db";

export async function verifyResetToken(token: string): Promise<boolean> {
  const [row] = await sql`select expires_at, used_at from reset_tokens where token = ${token}`;
  if (!row) return false;
  if (row.used_at) return false;
  if (new Date(row.expires_at).getTime() <= Date.now()) return false;
  return true;
}
