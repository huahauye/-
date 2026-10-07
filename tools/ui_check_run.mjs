// Verifies the run page hands over the document, and that the download really
// returns a file. Run while the case is temporarily owned by the admin account.
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ENV = {};
for (const line of readFileSync(new URL("./ecs.env", import.meta.url), "utf8").split(/\r?\n/)) {
  if (line.includes("=") && !line.trim().startsWith("#")) {
    const [key, ...rest] = line.split("=");
    ENV[key.trim()] = rest.join("=").trim();
  }
}

const BASE = "http://39.108.58.140";
const RUN = process.argv[2];

mkdirSync(fileURLToPath(new URL("./out/", import.meta.url)), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.fill('input[type="email"]', "3098195032@qq.com");
await page.fill('input[type="password"]', ENV.OA_ADMIN_PASSWORD);
await page.getByRole("button", { name: "登录" }).click();
await page.waitForURL("**/cases**", { timeout: 30000 });

await page.goto(`${BASE}/runs/${RUN}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
console.log("console/page text sample:", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200));

const heading = await page.locator("h1").first().innerText();
const buttons = await page.locator("a.button").allTextContents();
const body = await page.locator("body").innerText();
console.log("title:", heading);
console.log("buttons:", buttons.map((t) => t.replace(/\s+/g, " ").trim()));
console.log("shows 未完成:", body.includes("本次生成未完成"));
console.log("findings section:", body.includes("质检记录"));
const codes = [...body.matchAll(/([A-Z][A-Z0-9_]{6,})/g)].map((m) => m[1]);
console.log("finding codes seen:", [...new Set(codes)].slice(0, 8));
await page.screenshot({ path: fileURLToPath(new URL("./out/run-page.png", import.meta.url)), fullPage: true });

const docxLink = page.locator('a.button[href*="/download"]').first();
console.log("docx link:", await docxLink.getAttribute("href"));
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 120000 }),
  docxLink.click()
]);
const path = await download.path();
const fs = await import("node:fs");
const size = fs.statSync(path).size;
console.log(`downloaded: ${download.suggestedFilename()} ${size} bytes`);
fs.copyFileSync(path, fileURLToPath(new URL("./out/ui-download.docx", import.meta.url)));
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
