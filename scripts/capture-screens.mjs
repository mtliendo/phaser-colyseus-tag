import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE = process.env.CLIENT_URL ?? "http://localhost:5173";
const OUT = process.env.SHOT_DIR ?? "/opt/cursor/artifacts";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

const hostCtx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
});
const hostPage = await hostCtx.newPage();
await hostPage.goto(`${BASE}/host?devName=Host`, { waitUntil: "networkidle" });
await hostPage.waitForSelector("#room-id");
await hostPage.waitForFunction(() => {
  const el = document.querySelector("#room-id");
  return el && el.textContent && el.textContent.trim() !== "—";
});
const roomId = (await hostPage.locator("#room-id").innerText()).trim();
console.log("room", roomId);

const phones = [];
for (const name of ["Alice", "Bob", "Cara"]) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play?room=${roomId}&devName=${name}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("#it-status");
  phones.push({ name, ctx, page });
}

await hostPage.waitForFunction(() => {
  const items = document.querySelectorAll("#player-list li");
  return items.length >= 3;
});

await hostPage.screenshot({
  path: resolve(OUT, "host_lobby.png"),
  fullPage: true,
});

await hostPage.locator("#start-btn").click();
await hostPage.waitForSelector("#arena-wrap:not([hidden])");
await hostPage.waitForTimeout(800);

await hostPage.screenshot({
  path: resolve(OUT, "host_playing.png"),
  fullPage: true,
});

const alice = phones[0].page;
await alice.waitForTimeout(400);
await alice.screenshot({
  path: resolve(OUT, "player_phone.png"),
  fullPage: true,
});

console.log("screenshots written to", OUT);
await browser.close();
