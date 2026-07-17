import { Hono } from "hono";
import type { Env } from "./env";
import { getHealth } from "./routes/health";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", async (c) => {
  const result = await getHealth(c.env);
  return c.json(result.body, result.status);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(): Promise<void> {},
};
