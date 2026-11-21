import { sql } from "../db";

const PAGE_SIZE = 50;

export async function listUsers(page: number) {
  const safePage = Math.max(1, Math.floor(page));
  const offset = (safePage - 1) * PAGE_SIZE;
  return sql`select id, handle from users order by handle limit ${PAGE_SIZE} offset ${offset}`;
}
