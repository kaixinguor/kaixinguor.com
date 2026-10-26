#!/usr/bin/env node
/* 逐条检查日报里的原文链接是否还能打开。
   只用 Node 内置 fetch，不需要装包。

   用法：
     node scripts/check-links.mjs daily/2026-10-26.html
     node scripts/check-links.mjs daily/2026-10-26.html --strict
     node scripts/check-links.mjs --latest
     node scripts/check-links.mjs --all

   判定：最终状态码 200–299 算通过；其余算失败。
   境外站 / 防盗链站可能会 403，这种情况需要换来源，不是脚本的问题。
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAILY_DIR = path.join(ROOT, "daily");
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const strict = flags.has("--strict");
const all = flags.has("--all");
const latest = flags.has("--latest");
const fileArg = args.find((a) => !a.startsWith("--"));

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function dailyFiles() {
  return fs.readdirSync(DAILY_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.html$/.test(name))
    .sort()
    .map((name) => path.join(DAILY_DIR, name));
}

let files;
if (fileArg) {
  const resolved = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(resolved)) {
    console.error(`✗ 找不到文件：${resolved}`);
    process.exit(1);
  }
  files = [resolved];
} else if (latest) {
  const allFiles = dailyFiles();
  if (!allFiles.length) {
    console.error("✗ daily/ 里还没有日报");
    process.exit(1);
  }
  files = [allFiles[allFiles.length - 1]];
} else if (all) {
  files = dailyFiles();
} else {
  console.error("用法：node scripts/check-links.mjs <日报.html> [--strict] | --latest | --all");
  process.exit(1);
}

const links = [];
for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const re = /href="(https?:\/\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].replace(/&amp;/g, "&");
    if (!links.includes(url)) links.push(url);
  }
}

if (!links.length) {
  console.log("没有需要检查的外链。");
  process.exit(0);
}

console.log(`检查 ${links.length} 条链接（${files.length} 个文件）…\n`);

const failed = [];
const results = new Array(links.length);

async function checkOne(url, index) {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "user-agent": UA,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          "range": "bytes=0-0"
        },
        signal: AbortSignal.timeout(15000)
      });
      if (res.body) {
        try { await res.body.cancel(); } catch (e) {}
      }
      if (res.status >= 200 && res.status < 300) {
        results[index] = { ok: true, status: res.status, url };
        console.log(`  ✓ ${res.status}  ${url}`);
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error.name === "TimeoutError" ? "超时" : (error.message || String(error));
    }
  }
  results[index] = { ok: false, status: lastError, url };
  failed.push({ url, error: lastError });
  console.log(`  ✗ ${lastError}  ${url}`);
}

async function runPool(items, worker, concurrency = 5) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

await runPool(links, checkOne, 5);

console.log(`\n结果：${links.length - failed.length} 通过 / ${failed.length} 失败`);
if (failed.length) {
  console.log("\n失败的链接：");
  for (const item of failed) console.log(`  ${item.error}  ${item.url}`);
  console.log("\n处理方式：换一个报道同一事件、能打开的来源；换不到就删掉那条。");
  if (strict) process.exit(1);
}
