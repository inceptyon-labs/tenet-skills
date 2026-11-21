import { sql } from "../db";
import { refundCapture } from "./gateway";

export async function refund(orderId: string, amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("invalid amount");

  const [order] = await sql`select id, total_cents, capture_id from orders where id = ${orderId}`;
  if (!order || !order.capture_id) throw new Error("order not captured");

  if (amountCents > Number(order.total_cents)) throw new Error("refund exceeds order total");

  await refundCapture(order.capture_id, amountCents);
  await sql`insert into refunds (order_id, amount_cents) values (${orderId}, ${amountCents})`;
  return { refundedCents: amountCents };
}
