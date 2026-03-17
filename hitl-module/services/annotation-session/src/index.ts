import { buildServer } from "./app.js";

const port = Number(process.env.PORT ?? 3003);

buildServer().then((app) => {
  app.listen({ host: "0.0.0.0", port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
});
