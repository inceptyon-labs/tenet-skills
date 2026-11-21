import { sql } from "../db";

const PER_PAGE = 25;

export async function listInvoices(userId: string, page: number) {
  const start = page * PER_PAGE;
  const rows = await sql`select id, number, total_cents, issued_at from invoices
                         where user_id = ${userId} order by issued_at desc
                         limit ${PER_PAGE} offset ${start}`;
  return { page, rows };
}
