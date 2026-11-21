import { Hono } from "hono";
import * as Sentry from "@sentry/node";
import { requestLogger } from "./middleware/requestLogger";
import { signup } from "./api/signup";
import { deleteAccount } from "./api/deleteAccount";
import { addPaymentMethod } from "./api/payment";
import { requestReset, completeReset } from "./auth/reset";
import { recordLogin } from "./lib/audit";
import { sendWelcome } from "./lib/mailer";
import { announceSignup } from "./lib/slack";
import { log } from "./lib/logger";

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = new Hono();
app.use("*", requestLogger);

app.post("/signup", async (c) => {
  const user = await signup(await c.req.json());
  await sendWelcome(user);
  await announceSignup(user);
  return c.json({ id: user.id });
});
app.post("/login", async (c) => {
  const { userId } = await c.req.json();
  recordLogin(userId);
  log.info({ userId }, "login");
  return c.json({ ok: true });
});
app.post("/account/payment-method", async (c) => c.json(await addPaymentMethod(c.req.header("x-user")!, await c.req.json())));
app.delete("/account", async (c) => c.json(await deleteAccount(c.req.header("x-user")!)));
app.post("/auth/reset", async (c) => c.json(await requestReset((await c.req.json()).email)));
app.post("/auth/reset/complete", async (c) => c.json(await completeReset(await c.req.json())));

export default app;
