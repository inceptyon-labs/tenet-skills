import { sql } from "../db";

const PAGE_SIZE = 20;

export async function listOrders(userId: string, page: number) {
  const offset = page * PAGE_SIZE;
  return sql`select id, status, total_cents from orders
             where user_id = ${userId} order by created_at desc
             limit ${PAGE_SIZE} offset ${offset}`;
}
