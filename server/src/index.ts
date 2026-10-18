import "dotenv/config";
import { Server } from "colyseus";
import { authMode } from "./auth/verifyToken.js";
import { TagRoom } from "./rooms/TagRoom.js";

const port = Number(process.env.PORT ?? 2567);

/**
 * Colyseus 0.18 owns the HTTP + WebSocket server. Matchmake routes are bound
 * only after `listen()`. Custom routes go in the `express` hook.
 */
const gameServer = new Server({
  express(app) {
    app.get("/health", (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
      res.status(200).json({
        ok: true,
        service: "phaser-colyseus-tag",
        phase: "spike",
        authMode: authMode(),
      });
    });
  },
});

gameServer.define("tag", TagRoom);

await gameServer.listen(port);
console.log(`Tag server listening on http://0.0.0.0:${port}`);
