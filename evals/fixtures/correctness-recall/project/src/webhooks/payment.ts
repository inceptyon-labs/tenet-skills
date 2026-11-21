import { sql } from "../db";

type PaymentEvent = { id: string; type: string; data: { user_id: string; amount: number } };

export async function onPaymentEvent(event: PaymentEvent) {
  if (event.type !== "topup.succeeded") return { ignored: true };

  await sql`update wallets set balance_cents = balance_cents + ${event.data.amount}
            where user_id = ${event.data.user_id}`;
  return { credited: event.data.amount };
}
