import { sql } from "../db";

export async function getBalance(userId: string): Promise<number> {
  const [row] = await sql`select balance_cents from wallets where user_id = ${userId}`;
  return row ? Number(row.balance_cents) : 0;
}

export async function debit(userId: string, amountCents: number) {
  await sql`update wallets set balance_cents = balance_cents - ${amountCents} where user_id = ${userId}`;
  return { ok: true };
}
