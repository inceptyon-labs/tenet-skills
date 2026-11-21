import { sql } from "../db";

/** Manual stock correction from the back office. Refuses to take stock below zero. */
export async function adjust(sku: string, delta: number) {
  const rows = await sql`update inventory set on_hand = on_hand + ${delta}
                         where sku = ${sku} and on_hand + ${delta} >= 0 returning on_hand`;
  if (rows.length === 0) throw new Error("adjustment would make stock negative");
  return { onHand: rows[0].on_hand };
}
