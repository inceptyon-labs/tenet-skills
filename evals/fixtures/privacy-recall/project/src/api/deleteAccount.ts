import { sql } from "../db/client";

export async function deleteAccount(userId: string) {
  await sql`delete from users where id = ${userId}`;
  return { deleted: true };
}
