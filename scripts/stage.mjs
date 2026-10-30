#!/usr/bin/env node
/* 把「要公开的文件」拷到 dist/site/。
   Cloudflare Pages、Workers、自己的服务器都用这一份产物；
   脚本、模板、docs、deploy 这些开发文件不会上去。

   用法：node scripts/stage.mjs [--quiet]
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist", "site");
const QUIET = process.argv.includes("--quiet");

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const files = [
  "style.css",
  "site.js",
  "lang.js",
  "favicon.svg",
  "robots.txt",
  "sitemap.xml",
  "feed.xml",
  "feed-en.xml",
  "feed-economy.xml",
  "feed-economy-en.xml",
  "_headers",
  "_redirects"
];

const dirs = ["daily-ai", "daily-economy", "hark", "snipread", "assets"];

let count = 0;
function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  count++;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else if (entry.isFile()) copyFile(source, target);
  }
}

// 根目录的页面
for (const name of fs.readdirSync(ROOT)) {
  if (name.endsWith(".html")) copyFile(path.join(ROOT, name), path.join(DIST, name));
}

for (const name of files) {
  const source = path.join(ROOT, name);
  if (!fs.existsSync(source)) {
    console.error(`! 缺少 ${name}，先运行 node scripts/build.mjs`);
    process.exit(1);
  }
  copyFile(source, path.join(DIST, name));
}

for (const name of dirs) {
  const source = path.join(ROOT, name);
  if (fs.existsSync(source)) copyDir(source, path.join(DIST, name));
}

// GitHub Pages / 某些静态托管会跳过下划线开头的文件，放个标记
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");

if (!QUIET) {
  console.log(`✓ 已生成 dist/site/（${count} 个文件）`);
  console.log(`  部署这一份目录即可：dist/site/`);
}
