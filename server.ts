import { createServer } from "http";
import next from "next";
import { initSocketServer } from "./lib/socket";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);
  initSocketServer(httpServer);

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`> Ready on http://localhost:${port} (Socket.io enabled)`);
  });
});
