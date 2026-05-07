// Entry point for all background job workers
// Run this as a separate process: npx ts-node workers/index.ts
// (or: node -r ts-node/register workers/index.ts)

import { leadPullingQueue } from "./leadPuller";
import { callTriggeringQueue } from "./callTrigger";
import { calendarBookingQueue } from "./calendarBooker";
import { dailySummaryQueue } from "./dailySummary";

// ─── Re-export queue instances for use in API routes ─────────────────────────
// Import from here rather than individual worker files to avoid double-processing.
export { leadPullingQueue, callTriggeringQueue, calendarBookingQueue, dailySummaryQueue };

// ─── Socket server stub ──────────────────────────────────────────────────────
// This module is also imported by lib/socket.ts for emitting events.
// When running as a standalone worker process (no Next.js), the socket server
// may not be available — that is acceptable and handled gracefully in each worker.

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[workers] Received ${signal}. Closing queues gracefully...`);

  try {
    await Promise.all([
      leadPullingQueue.close(),
      callTriggeringQueue.close(),
      calendarBookingQueue.close(),
      dailySummaryQueue.close(),
    ]);
    console.log("[workers] All queues closed. Exiting.");
    process.exit(0);
  } catch (err) {
    console.error("[workers] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Health check on startup ─────────────────────────────────────────────────
async function checkQueueHealth(): Promise<void> {
  const queues = [
    { name: "lead-pulling", queue: leadPullingQueue },
    { name: "call-triggering", queue: callTriggeringQueue },
    { name: "calendar-booking", queue: calendarBookingQueue },
    { name: "daily-summary", queue: dailySummaryQueue },
  ];

  for (const { name, queue } of queues) {
    try {
      const counts = await queue.getJobCounts();
      console.log(
        `[workers] Queue "${name}" ready — ` +
          `waiting: ${counts.waiting}, active: ${counts.active}, ` +
          `delayed: ${counts.delayed}, failed: ${counts.failed}`
      );
    } catch (err) {
      console.error(`[workers] Queue "${name}" health check failed:`, err);
    }
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
// Workers register their processors upon import (above).
// Log a startup banner and run health check.

console.log("╔═══════════════════════════════════════╗");
console.log("║   LeadMey — Worker Node   ║");
console.log("╚═══════════════════════════════════════╝");
console.log(`[workers] Starting at ${new Date().toISOString()}`);
console.log(`[workers] Redis: ${process.env.REDIS_URL ?? "redis://127.0.0.1:6379"}`);

checkQueueHealth().catch((err) => {
  console.error("[workers] Startup health check error:", err);
});
