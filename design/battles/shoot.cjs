// Test harness: wraps an artifact body like the publisher does, serves CDN modules from local node_modules,
// runs a list of steps, records console errors and screenshots.
// usage: NODE_PATH=/opt/node22/lib/node_modules node shoot.cjs page.html steps.json outPrefix [width height]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const [, , file, stepsFile, outPrefix = "shot", w = "1280", h = "800"] = process.argv;
const LIB = path.join(__dirname, "lib", "node_modules");
const body = fs.readFileSync(file, "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#fafaf7}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>${body}</body></html>`;
const steps = stepsFile && stepsFile !== "-" ? JSON.parse(fs.readFileSync(stepsFile, "utf8")) : [{ wait: 3000 }, { shot: "main" }];

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
  });
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, colorScheme: process.env.DARK ? "dark" : "light" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
    else if (process.env.LOGALL) console.log(`[log] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("https://artifact.test/")) {
      return route.fulfill({ status: 200, contentType: "text/html", body: html });
    }
    const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/(three|cannon-es)@[^/]+\/(.*)$/);
    if (m) {
      const p = path.join(LIB, m[1], m[2]);
      if (fs.existsSync(p)) return route.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(p) });
      errors.push(`[missing module] ${url}`);
      return route.fulfill({ status: 404, body: "" });
    }
    if (url.startsWith("https://fonts.googleapis.com") || url.startsWith("https://fonts.gstatic.com")) return route.continue();
    if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    errors.push(`[blocked] ${url}`);
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("https://artifact.test/index.html", { waitUntil: "load" });
  for (const s of steps) {
    try {
      if (s.wait) await page.waitForTimeout(s.wait);
      if (s.waitFor) await page.waitForFunction(s.waitFor, null, { timeout: s.timeout || 30000, polling: 100 });
      if (s.click) await page.click(s.click, { timeout: 5000 });
      if (s.clickAt) await page.mouse.click(s.clickAt[0], s.clickAt[1]);
      if (s.drag) {
        const [x1, y1, x2, y2] = s.drag;
        await page.mouse.move(x1, y1);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8);
        await page.mouse.up();
      }
      if (s.eval) console.log("[eval]", JSON.stringify(await page.evaluate(s.eval)));
      if (s.key) await page.keyboard.press(s.key);
      if (s.shot) await page.screenshot({ path: `${outPrefix}-${s.shot}.png`, fullPage: Boolean(s.full) });
    } catch (e) {
      errors.push(`[step ${JSON.stringify(s)}] ${e.message.split("\n")[0]}`);
    }
  }
  console.log(errors.length ? errors.join("\n") : "no console errors");
  await browser.close();
})();
