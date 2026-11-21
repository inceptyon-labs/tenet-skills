import { sql } from "../db";

type ShippingEvent = { id: string; type: string; data: { order_id: string } };

export async function onShippingEvent(event: ShippingEvent) {
  if (event.type !== "shipment.delivered") return { ignored: true };

  return sql.begin(async (tx) => {
    const inserted = await tx`insert into processed_events (id) values (${event.id})
                              on conflict (id) do nothing returning id`;
    if (inserted.length === 0) return { duplicate: true };

    await tx`update orders set status = 'delivered' where id = ${event.data.order_id}`;
    return { delivered: event.data.order_id };
  });
}
