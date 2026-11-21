import { Hono } from "hono";
import { requireSession } from "./auth/session";
import { verifyResetToken } from "./auth/token";
import { withdraw } from "./billing/withdraw";
import { refund } from "./billing/refund";
import { chargeOrder } from "./billing/charge";
import { lineTotal } from "./billing/price";
import { taxFor } from "./billing/tax";
import { checkout } from "./orders/checkout";
import { cancelOrder } from "./orders/cancel";
import { claimOrder } from "./orders/claim";
import { listOrders } from "./api/listOrders";
import { listInvoices } from "./api/listInvoices";
import { listUsers } from "./api/listUsers";
import { getProfile } from "./api/profile";
import { displayName } from "./users/display";
import { reserve } from "./inventory/reserve";
import { restock } from "./inventory/restock";
import { onPaymentEvent } from "./webhooks/payment";
import { onShippingEvent } from "./webhooks/shipping";
import { saveAddresses } from "./shipping/address";
import { roundHalfDown } from "./pricing/rounding";
import { withRetry } from "./util/retry";

const app = new Hono();

app.use("/api/*", requireSession);

app.post("/api/withdraw", async (c) => c.json(await withdraw(c.get("userId"), (await c.req.json()).amountCents)));
app.post("/api/orders/:id/checkout", async (c) => c.json(await checkout(c.req.param("id"))));
app.post("/api/orders/:id/claim", async (c) => c.json(await claimOrder(c.req.param("id"), c.get("userId"))));
app.post("/api/orders/:id/cancel", async (c) => c.json(await cancelOrder(c.req.param("id"))));
app.post("/api/orders/:id/charge", async (c) => c.json(await chargeOrder(c.req.param("id"))));
app.post("/api/orders/:id/refund", async (c) => c.json(await refund(c.req.param("id"), (await c.req.json()).amountCents)));
app.get("/api/orders", async (c) => c.json(await listOrders(c.get("userId"), Number(c.req.query("page") ?? 1))));
app.get("/api/invoices", async (c) => c.json(await listInvoices(c.get("userId"), Number(c.req.query("page") ?? 1))));
app.get("/api/users", async (c) => c.json(await listUsers(Number(c.req.query("page") ?? 1))));
app.get("/api/users/:id", async (c) => c.json(await getProfile(c.req.param("id"))));
app.get("/api/users/:id/name", async (c) => c.text(await displayName(c.req.param("id"))));
app.post("/api/cart/line", async (c) => {
  const { unitCents, quantity } = await c.req.json();
  const subtotal = lineTotal(unitCents, quantity);
  return c.json({ subtotal, tax: taxFor(subtotal), rounded: roundHalfDown(subtotal / 3) });
});
app.post("/api/inventory/:sku/reserve", async (c) => c.json(await reserve(c.req.param("sku"), (await c.req.json()).quantity)));
app.post("/api/inventory/:sku/restock", async (c) => c.json(await restock(c.req.param("sku"), (await c.req.json()).quantity)));
app.post("/api/addresses", async (c) => c.json(await saveAddresses(c.get("userId"), await c.req.json())));
app.post("/auth/reset/verify", async (c) => c.json({ ok: await verifyResetToken((await c.req.json()).token) }));

app.post("/webhooks/payment", async (c) => {
  const event = await c.req.json();
  return c.json(await withRetry(() => onPaymentEvent(event)));
});
app.post("/webhooks/shipping", async (c) => c.json(await onShippingEvent(await c.req.json())));

export default app;
