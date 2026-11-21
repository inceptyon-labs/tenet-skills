import * as Sentry from "@sentry/node";
import { sql } from "../db/client";

export async function addPaymentMethod(userId: string, body: { cardNumber: string; expiry: string; cvc: string }) {
  try {
    const res = await fetch("https://processor.example/v1/tokens", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.PROCESSOR_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`tokenize failed: ${res.status}`);
    const { token } = await res.json();
    await sql`insert into payment_methods (id, user_id, card_last4, processor_token)
              values (gen_random_uuid(), ${userId}, ${body.cardNumber.slice(-4)}, ${token})`;
    return { ok: true };
  } catch (err) {
    Sentry.setExtra("payment_request", body);
    Sentry.captureException(err);
    throw err;
  }
}
