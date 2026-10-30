#!/usr/bin/env node
/* 逐条检查日报里的原文链接是否还能打开。
   只用 Node 内置 fetch，不需要装包。

   用法：
     node scripts/check-links.mjs daily-ai/2026-10-26.html
     node scripts/check-links.mjs daily-ai/2026-10-26.html --strict
     node scripts/check-links.mjs --latest
     node scripts/check-links.mjs --latest --section economy
     node scripts/check-links.mjs --all

   判定：最终状态码 200–299 算通过；其余算失败。
   境外站 / 防盗链站可能会 403，这种情况需要换来源，不是脚本的问题。
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const sectionIdx = args.indexOf("--section");
const section = sectionIdx >= 0 ? (args[sectionIdx + 1] || "ai") : "ai";
const DAILY_DIR = path.join(ROOT, section === "economy" ? "daily-economy" : "daily-ai");
const flags = new Set(args.filter((a) => a.startsWith("--")));
const strict = flags.has("--strict");
const all = flags.has("--all");
const latest = flags.has("--latest");
const sectionValueIdx = sectionIdx >= 0 ? sectionIdx + 1 : -1;
const fileArg = args.find((a, i) => !a.startsWith("--") && i !== sectionValueIdx);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function dailyFiles() {
  return fs.readdirSync(DAILY_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}(-en)?\.html$/.test(name))
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
    console.error(`✗ ${section === "economy" ? "daily-economy" : "daily-ai"}/ 里还没有日报`);
    process.exit(1);
  }
  const latestDate = path.basename(allFiles[allFiles.length - 1]).slice(0, 10);
  files = allFiles.filter((file) => path.basename(file).startsWith(latestDate));
} else if (all) {
  files = dailyFiles();
} else {
  console.error("用法：node scripts/check-links.mjs <日报.html> [--strict] | --latest | --all [--section ai|economy]");
  process.exit(1);
}

const links = [];
for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const re = /href="(https?:\/\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].replace(/&amp;/g, "&");
    // 生成页里还有 canonical / hreflang 指向本站，不当作外链检查
    if (/^https?:\/\/(www\.)?kaixinguor\.com\//i.test(url)) continue;
    if (!links.includes(url)) links.push(url);
  }
}

if (!links.length) {
  console.log("没有需要检查的外链。");
  process.exit(0);
}

console.log(`检查 ${links.length} 条链接（${files.length} 个文件）…\n`);

const failed = [];
const suspects = [];
const blocked = [];
const results = new Array(links.length);

/* 200 不等于“打开了”：软 404、登录墙、Cloudflare 验证页都会返回 200。
   这里读首块 HTML 看标题，区分“正文页”和“打不开的页”。 */
async function inspectBody(res) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("html")) return { kind: "ok" };
  let text = "";
  try {
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const chunk = await reader.read();
      if (chunk && chunk.value) text = new TextDecoder("utf-8").decode(chunk.value);
      try { await reader.cancel(); } catch (e) {}
    } else {
      text = await res.text();
    }
  } catch (e) {
    return { kind: "ok" };
  }
  const m = text.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
  const title = m ? m[1].replace(/\s+/g, " ").trim() : "";
  if (/^(404|410|403)\b/.test(title)) return { kind: "notfound", note: `标题是「${title}」` };
  if (/页面不存在|页面未找到|找不到该?页面|内容不存在|已删除|访问受限|无权限|Page not found|Not Found|has been removed/i.test(title)) {
    return { kind: "notfound", note: `标题是「${title}」` };
  }
  if (/^(just a moment|attention required|请稍候|安全验证|人机验证)/i.test(title) || /cloudflare/i.test(title)) {
    return { kind: "blocked", note: `是验证页「${title}」` };
  }
  if (/^(登录|登陆|sign in|log in)/i.test(title)) {
    return { kind: "blocked", note: `是登录页「${title}」` };
  }
  if (!title) {
    return { kind: "blocked", note: "读不到标题（可能是纯前端壳，也可能是失效页）" };
  }
  return { kind: "ok" };
}

async function checkOne(url, index) {
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, attempt === 2 ? 600 : 1500));
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "user-agent": UA,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          "range": "bytes=0-16383"
        },
        signal: AbortSignal.timeout(15000)
      });
      if (res.status >= 200 && res.status < 300) {
        const verdict = await inspectBody(res);
        if (verdict.kind === "notfound") {
          results[index] = { ok: false, status: "疑似无效页", url };
          suspects.push({ url, note: verdict.note });
          console.log(`  ⚠ 200 但${verdict.note}  ${url}`);
          return;
        }
        if (verdict.kind === "blocked") {
          results[index] = { ok: true, status: res.status, url };
          blocked.push({ url, note: verdict.note });
          console.log(`  ⚠ 200 但${verdict.note}（需人工在浏览器确认）  ${url}`);
          return;
        }
        results[index] = { ok: true, status: res.status, url };
        console.log(`  ✓ ${res.status}  ${url}`);
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      const cause = error.cause && (error.cause.code || error.cause.message);
      lastError = error.name === "TimeoutError"
        ? "超时"
        : `${error.message || String(error)}${cause ? `（${cause}）` : ""}`;
    }
  }
  /* 传输层失败（连不上、超时、连接被重置）说明“这台机器打不开”，
     不等于“页面不存在”——交给人工在浏览器确认，不直接判死。
     DNS 解析不到、HTTP 4xx/5xx 才是页面真的没了。 */
  const transport = /fetch failed|超时|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR|socket/i.test(lastError)
    && !/ENOTFOUND|EAI_AGAIN/i.test(lastError);
  if (transport) {
    results[index] = { ok: true, status: lastError, url };
    blocked.push({ url, note: `脚本连不上（${lastError}）` });
    console.log(`  ⚠ ${lastError}（需人工在浏览器确认）  ${url}`);
    return;
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

await runPool(links, checkOne, 3);

console.log(`\n结果：${links.length - failed.length - suspects.length} 可打开（其中 ${blocked.length} 条需人工确认）/ ${failed.length} 打不开 / ${suspects.length} 疑似无效页`);
if (suspects.length) {
  console.log("\n疑似无效页（返回 200，但标题像 404 / 已删除 / 无权限）：");
  for (const item of suspects) console.log(`  ${item.note}  ${item.url}`);
}
if (blocked.length) {
  console.log("\n需要人工确认（验证页 / 登录页，脚本读不到正文）：");
  for (const item of blocked) console.log(`  ${item.note}  ${item.url}`);
}
if (failed.length || suspects.length) {
  console.log("\n失败的链接：");
  for (const item of failed) console.log(`  ${item.error}  ${item.url}`);
  console.log("\n处理方式：换一个报道同一事件、能打开的来源；换不到就删掉那条，不要凭标题或搜索摘要补写。");
  if (strict) process.exit(1);
}
