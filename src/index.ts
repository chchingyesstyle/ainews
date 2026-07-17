import { Hono } from "hono";
import type { Env } from "./env";
import admin from "./routes/admin";
import { scheduledHandler } from "./scheduled";
import publicRoutes from "./routes/public";
import { getHealth } from "./routes/health";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", async (c) => {
  const result = await getHealth(c.env);
  return c.json(result.body, result.status);
});

app.route("/admin", admin);
app.route("/", publicRoutes);

app.notFound(async (c) => {
  if (c.env.ASSETS) {
    const asset = await c.env.ASSETS.fetch(c.req.raw);
    if (asset.status !== 404) return asset;
  }
  return c.json({ error: "Not found" }, 404);
});

export default {
  fetch: app.fetch,
  scheduled: scheduledHandler,
};
