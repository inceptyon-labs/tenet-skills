import { sql } from "../db";

// Superseded by src/billing/refund.ts. Nothing imports this file.
export async function legacyRefund(orderId: string, amount: number) {
  const [order] = await sql`select total_cents from orders where id = ${orderId}`;
  if (amount < order.total_cents) throw new Error("refund exceeds order total");
  await sql`insert into refunds (order_id, amount_cents) values (${orderId}, ${amount * 100})`;
}
