import { Request, Response } from 'express';
import { db } from '../db/client';

// POST /webhooks/stripe — handle Stripe events.
export async function stripeWebhook(req: Request, res: Response) {
  // PLANT SEC-AUTH-008: no signature verification (no stripe.webhooks.constructEvent) ->
  // anyone can POST a forged event and trigger fulfillment
  const event = req.body;

  if (event.type === 'checkout.session.completed') {
    await db.orders.markPaid(event.data.object.id);
  }

  return res.json({ received: true });
}
