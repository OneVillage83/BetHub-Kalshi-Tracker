import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true, service: "kalshi-tracker-api" }));

app.get("/api/dashboard/summary", async () => ({
  data: null,
  meta: {
    source: "stub",
    stubReason: "Next.js route handlers are the primary API surface for the Netlify scaffold",
    generatedAt: new Date().toISOString(),
  },
}));

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
