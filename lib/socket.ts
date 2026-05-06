// Socket.io server singleton — shared between API routes and worker processes
import type { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

/**
 * Initialises the Socket.io server on top of an existing HTTP server.
 * Call this once when your Next.js custom server boots.
 * Idempotent — calling it multiple times returns the existing instance.
 */
export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL ?? "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    path: "/api/socket",
  });

  io.on("connection", (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    // Client joins their org room after authentication
    socket.on("join_org", (orgId: string) => {
      if (typeof orgId === "string" && orgId.length > 0) {
        socket.join(`org:${orgId}`);
        console.log(`[socket] ${socket.id} joined org:${orgId}`);
      }
    });

    socket.on("leave_org", (orgId: string) => {
      socket.leave(`org:${orgId}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[socket] Client disconnected: ${socket.id} — ${reason}`);
    });
  });

  console.log("[socket] Socket.io server initialised");
  return io;
}

/**
 * Returns the existing Socket.io server instance, or null if not yet initialised.
 * Workers call this; if running as a standalone process without Next.js, this
 * returns null and the emit is a no-op.
 */
export function getSocketServer(): SocketIOServer | null {
  return io;
}
