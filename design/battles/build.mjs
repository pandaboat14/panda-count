// Inlines shared modules into page sources: /*@include shared/x.js*/ or <!--@include shared/x.html-->
import fs from "node:fs";
import path from "node:path";
const root = path.dirname(new URL(import.meta.url).pathname);
const names = process.argv.slice(2);
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const pages = names.length ? names : fs.readdirSync(path.join(root, "pages")).filter((f) => f.endsWith(".html"));
for (const name of pages) {
  let src = fs.readFileSync(path.join(root, "pages", name), "utf8");
  src = src.replace(/\/\*@include ([^*]+)\*\/|<!--@include ([^>]+)-->/g, (_, a, b) => {
    const file = (a || b).trim();
    return `/* ---- ${file} ---- */\n` + fs.readFileSync(path.join(root, file), "utf8");
  });
  fs.writeFileSync(path.join(root, "dist", name), src);
  console.log(`built dist/${name} (${(src.length / 1024).toFixed(0)} KB)`);
}
