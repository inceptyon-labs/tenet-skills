import { sql } from "../db";

export type User = { id: string; handle: string; email: string; deleted_at: string | null };

/** Returns null when the user does not exist or has been soft-deleted. */
export async function findUser(id: string): Promise<User | null> {
  const [row] = await sql<User[]>`select id, handle, email, deleted_at from users where id = ${id}`;
  if (!row || row.deleted_at) return null;
  return row;
}
