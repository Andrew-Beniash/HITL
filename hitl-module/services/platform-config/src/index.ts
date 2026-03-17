import Fastify from "fastify";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3008);

app.get("/health", async () => ({ service: "platform-config", status: "ok" }));

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
