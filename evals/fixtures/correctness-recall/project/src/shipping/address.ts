import { sql } from "../db";

type Address = { line1: string; city: string; zip: string };

export async function saveAddresses(userId: string, body: { billing: Address; shipping: Address }) {
  const billing = { line1: body.billing.line1.trim(), city: body.billing.city.trim(), zip: body.billing.zip.trim() };
  const shipping = { line1: body.shipping.line1.trim(), city: body.shipping.city.trim(), zip: body.billing.zip.trim() };

  await sql`update users set billing_address = ${JSON.stringify(billing)},
                             shipping_address = ${JSON.stringify(shipping)}
            where id = ${userId}`;
  return { billing, shipping };
}
