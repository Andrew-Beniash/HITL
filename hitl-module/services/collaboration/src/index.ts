import { buildServer } from "./app.js";
import { startRedisSubscriber, } from "./redis-subscriber.js";
import { createRedisSubscriber } from "./redis.js";

const port = Number(process.env.PORT ?? 3004);

const { app, io } = await buildServer();

// Start Redis pub/sub bridge on a dedicated subscriber connection
startRedisSubscriber(io, createRedisSubscriber());

app.listen({ host: "0.0.0.0", port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
