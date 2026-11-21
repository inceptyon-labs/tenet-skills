import { sql } from "../db";
import { refundCapture } from "../billing/gateway";

export async function cancelOrder(orderId: string) {
  const [order] = await sql`select id, status, total_cents, capture_id from orders where id = ${orderId}`;
  if (!order) throw new Error("order not found");
  if (order.status === "cancelled") return { status: "cancelled" };
  if (order.status === "shipped" || order.status === "delivered") throw new Error("already shipped");

  if (order.capture_id) {
    await refundCapture(order.capture_id, Number(order.total_cents));
  }

  await sql`update inventory set on_hand = on_hand + oi.quantity
            from order_items oi where oi.order_id = ${orderId} and oi.sku = inventory.sku`;
  await sql`update orders set status = 'cancelled' where id = ${orderId}`;
  return { status: "cancelled" };
}
