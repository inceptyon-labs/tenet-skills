import { sql } from "../db";

export async function claimOrder(orderId: string, pickerId: string) {
  const rows = await sql`
    update orders set status = 'picking', picker_id = ${pickerId}
    where id = ${orderId} and status = 'paid'
    returning id`;
  if (rows.length === 0) {
    const [current] = await sql`select status, picker_id from orders where id = ${orderId}`;
    return { claimed: false, status: current?.status ?? "missing" };
  }
  return { claimed: true, status: "picking" };
}
