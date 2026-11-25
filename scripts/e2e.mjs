import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "fs/promises";
import { execFileSync } from "child_process";

const base = "http://127.0.0.1:43123";
const out = "/opt/cursor/artifacts";
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--user-data-dir=/tmp/chrome-hct-e2e"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

async function shot(name) {
  const path = `${out}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log("shot", path);
}

async function clickText(text) {
  const clicked = await page.evaluate((label) => {
    const nodes = [...document.querySelectorAll("button, a")];
    const node = nodes.find((item) => item.textContent?.includes(label));
    if (!node) return false;
    node.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`找不到按鈕：${text}`);
}

await page.goto(base, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.body.innerText.includes("北北區"));
await shot("01-phone-regions");

await clickText("北北區");
await page.waitForFunction(() => document.body.innerText.includes("天母分校"));
await shot("02-phone-branches");

await clickText("天母分校");
await page.waitForFunction(() => document.body.innerText.includes("何宜臻"));
await shot("03-phone-names");

await clickText("何宜臻");
await page.waitForSelector("canvas");
await shot("04-phone-signature");

const canvas = await page.$("canvas");
const box = await canvas.boundingBox();
await page.mouse.move(box.x + 40, box.y + 80);
await page.mouse.down();
await page.mouse.move(box.x + 120, box.y + 60, { steps: 8 });
await page.mouse.move(box.x + 180, box.y + 120, { steps: 8 });
await page.mouse.move(box.x + 250, box.y + 70, { steps: 8 });
await page.mouse.up();
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("下一步") && !b.disabled));
await clickText("下一步");
await page.waitForFunction(() => document.body.innerText.includes("請選擇便當"));
await shot("05-phone-meal");
await clickText("葷");
await clickText("送出");
await page.waitForFunction(() => document.body.innerText.includes("簽到完成"), { timeout: 20000 });
await shot("06-phone-done");

await clickText("下一位簽到");
await page.waitForFunction(() => document.body.innerText.includes("北南新湖區"), { timeout: 20000 });
await clickText("北南新湖區");
await page.waitForFunction(() => document.body.innerText.includes("新內湖"));
await clickText("新內湖");
await clickText("當場報名");
await page.waitForSelector("input");
const inputs = await page.$$("input");
await inputs[0].type("李珮人予");
await inputs[1].type("Peggy Lee");
await shot("07-phone-walkin");
await clickText("下一步，簽名");
await page.waitForSelector("canvas");
const canvas2 = await page.$("canvas");
const box2 = await canvas2.boundingBox();
await page.mouse.move(box2.x + 30, box2.y + 140);
await page.mouse.down();
await page.mouse.move(box2.x + 90, box2.y + 90, { steps: 6 });
await page.mouse.move(box2.x + 160, box2.y + 150, { steps: 6 });
await page.mouse.move(box2.x + 280, box2.y + 80, { steps: 8 });
await page.mouse.up();
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("下一步") && !b.disabled));
await clickText("下一步");
await clickText("素");
await clickText("送出");
await page.waitForFunction(() => document.body.innerText.includes("Peggy Lee") && document.body.innerText.includes("簽到完成"), { timeout: 20000 });
await shot("08-phone-walkin-done");

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`${base}/admin/login`, { waitUntil: "networkidle0" });
await shot("09-admin-login");
await page.type("input[type=password]", "hct-admin-2026");
await clickText("登入");
await page.waitForFunction(() => document.body.innerText.includes("下載簽到記錄"), { timeout: 20000 });
await shot("10-admin");

const cookie = (await page.cookies()).map((item) => `${item.name}=${item.value}`).join("; ");
execFileSync("curl", ["-sf", "-H", `Cookie: ${cookie}`, "-o", `${out}/signin-record.pdf`, `${base}/api/admin/pdf`], {
  timeout: 120000,
});
console.log("pdf saved");

await browser.close();
