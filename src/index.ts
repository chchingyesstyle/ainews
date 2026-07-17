import { Hono } from "hono";
import type { Env } from "./env";
import admin from "./routes/admin";
import { scheduledHandler } from "./scheduled";
import { getHealth } from "./routes/health";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", async (c) => {
  const result = await getHealth(c.env);
  return c.json(result.body, result.status);
});

app.route("/admin", admin);

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  scheduled: scheduledHandler,
};
