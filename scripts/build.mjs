#!/usr/bin/env node
/* 由 daily/*.html 生成：
   - index.html 的中文 / 英文「今日日报」区与「往期侧栏」
   - feed.xml（中文 RSS）/ feed-en.xml（英文 RSS）
   - sitemap.xml（含中英文往期）
   不依赖任何第三方包。

   用法：
     node scripts/build.mjs            # 生成
     node scripts/build.mjs --check    # 只检查生成结果是否已是最新（CI 用）
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readIssues,
  renderHomeToday,
  renderArchiveSidebar,
  renderFeed,
  renderSitemap,
  applyMarkers,
  writeIfChanged
} from "./lib/issue.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAILY_DIR = path.join(ROOT, "daily");
const INDEX = path.join(ROOT, "index.html");
const FEED = path.join(ROOT, "feed.xml");
const FEED_EN = path.join(ROOT, "feed-en.xml");
const SITEMAP = path.join(ROOT, "sitemap.xml");
const CHECK = process.argv.includes("--check");
const QUIET = process.argv.includes("--quiet");

function rel(file) {
  return path.relative(ROOT, file) || ".";
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function validate(issue) {
  const warnings = [];
  if (!issue.deckText) warnings.push(`${rel(issue.file)}: 导语为空`);
  if (!issue.tldr.length) warnings.push(`${rel(issue.file)}: 速览为空`);
  if (!issue.chapters.length) warnings.push(`${rel(issue.file)}: 没有栏目`);
  if (!issue.count) warnings.push(`${rel(issue.file)}: 没有条目`);
  for (const card of issue.cards) {
    if (!/^https?:\/\//i.test(card.sourceUrl)) {
      warnings.push(`${rel(issue.file)}: 「${card.titleText.slice(0, 30)}」缺少原文链接`);
    }
  }
  const urls = issue.links;
  if (urls.length < issue.count) {
    warnings.push(`${rel(issue.file)}: 原文链接数（${urls.length}）少于条目数（${issue.count}）`);
  }
  return warnings;
}

if (!fs.existsSync(DAILY_DIR)) fail("找不到 daily/ 目录");

const issues = readIssues(DAILY_DIR);
if (!issues.length) fail("daily/ 里还没有任何 YYYY-MM-DD.html");

const warnings = issues.flatMap(validate);
for (const issue of issues) {
  if (issue.en) warnings.push(...validate(issue.en));
  else if (issue !== issues[0]) warnings.push(`daily/${issue.dateISO}.html: 没有对应的英文版 -en.html`);
}

const latest = issues[0];
if (!latest.en) {
  fail(`最新一期 ${latest.dateISO} 缺少英文版 daily/${latest.dateISO}-en.html；先运行 publish-daily 并带 --en。`);
}

const langBlock = (lang, inner) => `      <div class="today-lang" data-lang="${lang}">
${inner}
      </div>`;
const sideBlock = (lang, inner) => `      <div class="archive-lang" data-lang="${lang}">
${inner}
      </div>`;

const todayZh = langBlock("zh", renderHomeToday(latest, "zh"));
const todayEn = langBlock("en", renderHomeToday(latest.en, "en"));
const sidebarZh = sideBlock("zh", renderArchiveSidebar(issues, "zh"));
const sidebarEn = sideBlock("en", renderArchiveSidebar(issues, "en"));
const feed = renderFeed(issues, "zh");
const feedEn = renderFeed(issues, "en");
const sitemap = renderSitemap(issues);

const indexHtml = applyMarkers(fs.readFileSync(INDEX, "utf8"), {
  TODAY_ZH: todayZh,
  TODAY_EN: todayEn,
  ARCHIVE_SIDEBAR_ZH: sidebarZh,
  ARCHIVE_SIDEBAR_EN: sidebarEn
});

const outputs = [
  [INDEX, indexHtml],
  [FEED, feed],
  [FEED_EN, feedEn],
  [SITEMAP, sitemap]
];

if (CHECK) {
  let stale = 0;
  for (const [file, content] of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (current !== content) {
      stale++;
      console.error(`✗ ${rel(file)} 不是最新，需要运行 npm run build`);
    }
  }
  if (warnings.length) {
    for (const w of warnings) console.error(`! ${w}`);
  }
  if (stale) {
    console.error(`\n✗ ${stale} 个文件需要重新生成。`);
    process.exit(1);
  }
  console.log(`✓ 生成结果已是最新（${issues.length} 期，最新 ${latest.dateISO}）`);
  process.exit(0);
}

const changed = [];
for (const [file, content] of outputs) {
  const result = writeIfChanged(file, content);
  if (result.changed) changed.push(rel(file));
}

for (const w of warnings) console.error(`! ${w}`);

if (!QUIET) {
  console.log(`\nAI 日报 · 已收录 ${issues.length} 期`);
  console.log(`  最新：${latest.dateISO} ${latest.weekday} · ${latest.count} 条 · ${latest.issueLabel || "—"}`);
  console.log(`  头条：${latest.headline}`);
  console.log(changed.length ? `\n✓ 已更新：${changed.join("、")}` : "\n✓ 所有生成文件已是最新");
  console.log("  首页 index.html / feed.xml / feed-en.xml / sitemap.xml\n");
}
