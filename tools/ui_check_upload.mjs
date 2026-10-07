// Drives a real browser against the plain-HTTP deployment to prove the upload
// path works where `crypto.subtle` is unavailable.
//
//   node ui-check.mjs [baseUrl] [caseId]
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

const BASE = (process.argv[2] ?? "http://39.108.58.140").replace(/\/$/, "");
const CASE_ID = process.argv[3] ?? "58cf4717-4418-4021-a5ea-358b4629c195";
const EMAIL = "3098195032@qq.com";
const PASSWORD = ENV.OA_ADMIN_PASSWORD;
const FIXTURE = fileURLToPath(new URL("./fixtures/application.pdf", import.meta.url));
const SHOT = fileURLToPath(new URL("./out/", import.meta.url));

mkdirSync(fileURLToPath(new URL("./out/", import.meta.url)), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (message) => console.log(`[console.${message.type()}] ${message.text()}`));
page.on("pageerror", (error) => console.log(`[pageerror] ${error.message}`));
page.on("request", (request) => {
  if (request.url().includes("/api/")) console.log(`[request] ${request.method()} ${request.url()}`);
});
page.on("response", (response) => {
  if (response.url().includes("/api/")) console.log(`[response] ${response.status()} ${response.url()}`);
});

try {
  console.log("--- login ---");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  // React must be hydrated before the submit handler exists, otherwise the
  // browser performs a native form submit and the page just reloads.
  await page.waitForTimeout(1200);
  console.log("secure context:", await page.evaluate(() => window.isSecureContext));
  console.log("crypto.subtle available:", await page.evaluate(() => Boolean(window.crypto?.subtle)));
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL("**/cases**", { timeout: 30000 });
  console.log("logged in ->", page.url());
  await page.screenshot({ path: `${SHOT}/ui-1-cases.png` });

  console.log("--- open case ---");
  await page.goto(`${BASE}/cases/${CASE_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/ui-2-before-upload.png` });
  console.log("case page title:", await page.title());

  console.log("--- upload through the UI (exercises the SHA-256 fallback) ---");
  await page.setInputFiles('input[type="file"]', FIXTURE);
  const started = Date.now();
  let uploaded = false;
  while (Date.now() - started < 120_000) {
    const notice = await page.locator(".notice").allTextContents().catch(() => []);
    const text = notice.join(" | ");
    if (text.includes("文件已上传") || text.includes("文件上传失败") || text.includes("Cannot read")) {
      console.log(`notice after ${Math.round((Date.now() - started) / 1000)}s: ${text}`);
      uploaded = text.includes("文件已上传");
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (!uploaded) console.log("WARNING: no success notice observed; check the screenshot");
  await page.screenshot({ path: `${SHOT}/ui-3-after-upload.png` });

  console.log("--- wait for parsing ---");
  const parseStart = Date.now();
  while (Date.now() - parseStart < 120_000) {
    const body = await page.locator("body").innerText();
    if (body.includes("已解析") || body.includes("解析完成") || body.includes("待确认")) break;
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: `${SHOT}/ui-4-parsed.png`, fullPage: true });
  const rows = await page.locator("table tr, .doc-row, li").allTextContents().catch(() => []);
  console.log("visible rows:", rows.filter((row) => row.trim()).slice(0, 8));
  console.log("RESULT:", uploaded ? "UPLOAD OK" : "UPLOAD FAILED");
} finally {
  await browser.close();
}
