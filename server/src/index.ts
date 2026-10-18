import "dotenv/config";
import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TagRoom } from "./rooms/TagRoom.js";

const port = Number(process.env.PORT ?? 2567);
const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "phaser-colyseus-tag",
    phase: "spike",
  });
});

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
  }),
});

gameServer.define("tag", TagRoom);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Tag server listening on http://0.0.0.0:${port}`);
});

function isAllowedOrigin(origin: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    if (entry === "*") return true;
    if (entry === origin) return true;
    if (entry.includes("*")) {
      const pattern = entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${pattern}$`).test(origin);
    }
    // Preview deployments on the linked Vercel project.
    if (entry.endsWith(".vercel.app") && origin.endsWith(".vercel.app")) {
      return true;
    }
    return false;
  });
}
