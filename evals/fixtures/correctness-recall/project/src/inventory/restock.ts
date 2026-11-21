import { sql } from "../db";

export async function restock(sku: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("invalid quantity");
  await sql`update inventory set on_hand = on_hand + ${quantity} where sku = ${sku}`;
  return { restocked: quantity };
}
