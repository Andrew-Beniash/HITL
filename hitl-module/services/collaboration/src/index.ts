import { createServer } from "node:http";
import { Server } from "socket.io";

const port = Number(process.env.PORT ?? 3004);
const httpServer = createServer((_, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ service: "collaboration", status: "ok" }));
});

const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  socket.emit("presence", { status: "connected" });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`collaboration listening on ${port}`);
});
