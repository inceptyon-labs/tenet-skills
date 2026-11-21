import { sql } from "../db";
import { capture } from "./gateway";

export async function chargeOrder(orderId: string) {
  const [order] = await sql`select id, total_cents, capture_id from orders where id = ${orderId}`;
  if (!order) throw new Error("order not found");
  if (order.capture_id) return { captureId: order.capture_id };

  const dollars = Number(order.total_cents) / 100;
  const result = await capture(order.id, dollars);

  await sql`update orders set capture_id = ${result.id}, status = 'paid' where id = ${orderId}`;
  return { captureId: result.id };
}
