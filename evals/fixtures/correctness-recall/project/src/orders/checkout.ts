import { sql } from "../db";
import { capture } from "../billing/gateway";

export async function checkout(orderId: string) {
  const [order] = await sql`select id, status, total_cents from orders where id = ${orderId}`;
  if (!order) throw new Error("order not found");
  if (order.status !== "pending") return { status: order.status };

  const result = await capture(order.id, Number(order.total_cents));

  await sql`update orders set status = 'paid', capture_id = ${result.id} where id = ${orderId}`;
  return { status: "paid" };
}
