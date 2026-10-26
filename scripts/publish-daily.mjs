#!/usr/bin/env node
/* 发布一期双语日报：
   1. 读取中文版 HTML（自包含母版，或 daily/ 里已生成的页面）
   2. 读取英文版 HTML（默认找同名 -en.html，也可以用 --en 指定）
   3. 分别套上站点外壳，写到 daily/YYYY-MM-DD.html 与 daily/YYYY-MM-DD-en.html
   4. 重新生成首页中英文今日区、往期侧栏、两份 RSS、sitemap
   5. （可选）逐条检查原文链接，全部 200 才继续
   6. （可选）git commit + push

   用法：
     node scripts/publish-daily.mjs ../ai-daily/2026-10-26.html
     node scripts/publish-daily.mjs ../ai-daily/2026-10-26.html --en ../ai-daily/2026-10-26-en.html
     node scripts/publish-daily.mjs ../ai-daily/2026-10-26.html --en ../ai-daily/2026-10-26-en.html --check-links --push

   选项：
     --en <file>        英文版 HTML；不写就找同目录的 YYYY-MM-DD-en.html
     --check-links      发布前用浏览器 UA 逐条请求原文，非 2xx 直接失败
     --allow-bad-links  链接检查失败也继续发布（会打印警告）
     --push             git add daily/ index.html feed.xml feed-en.xml sitemap.xml
                        → commit → push origin 当前分支
     --dry-run          只解析和打印，不写文件
*/

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseIssue,
  readIssues,
  renderIssuePage,
  escapeHtml
} from "./lib/issue.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAILY_DIR = path.join(ROOT, "daily");
const TEMPLATE = path.join(ROOT, "templates", "issue.html");

const args = process.argv.slice(2);
const flags = new Set();
const positional = [];
let enArg = "";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--en") {
    enArg = args[++i] || "";
    continue;
  }
  if (arg.startsWith("--")) {
    flags.add(arg);
    continue;
  }
  positional.push(arg);
}

const sourceArg = positional[0];
if (!sourceArg) {
  console.error(`用法：node scripts/publish-daily.mjs <中文日报.html> [--en <英文日报.html>] [--check-links] [--push] [--dry-run]`);
  process.exit(1);
}

const source = path.resolve(process.cwd(), sourceArg);
if (!fs.existsSync(source)) {
  console.error(`✗ 找不到中文版：${source}`);
  process.exit(1);
}

const enSource = enArg
  ? path.resolve(process.cwd(), enArg)
  : source.replace(/\.html$/i, "-en.html");
if (!fs.existsSync(enSource)) {
  console.error(`\n✗ 找不到英文版：${enSource}`);
  console.error(`  双语日报必须同时提供英文版。用 --en 指定，或把英文版命名为 ${path.basename(source).replace(/\.html$/i, "-en.html")}。`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: "inherit",
    ...options
  });
}

function git(commandArgs) {
  return spawnSync("git", commandArgs, { cwd: ROOT, encoding: "utf8" });
}

function parseOrExit(file, label) {
  try {
    return parseIssue(file);
  } catch (error) {
    console.error(`\n✗ ${label}解析失败：${error.message}`);
    process.exit(1);
  }
}

const issue = parseOrExit(source, "中文版");
const enIssue = parseOrExit(enSource, "英文版");

if (issue.dateISO !== enIssue.dateISO) {
  console.error(`\n✗ 中英文版日期不一致：${issue.dateISO} vs ${enIssue.dateISO}`);
  process.exit(1);
}
if (enIssue.lang !== "en") {
  console.error(`\n✗ 英文版文件里的 <html lang="en"> 没写对，解析成了 ${enIssue.lang}`);
  process.exit(1);
}

const destination = path.join(DAILY_DIR, `${issue.dateISO}.html`);
const enDestination = path.join(DAILY_DIR, `${issue.dateISO}-en.html`);

/* 期号：优先用日报里写好的；没有就按日期顺序补一个。 */
if (!issue.issueNo) {
  if (fs.existsSync(destination)) {
    try {
      const existing = parseIssue(destination);
      if (existing.issueNo) {
        issue.issueNo = existing.issueNo;
        issue.issueLabel = `第 ${existing.issueNo} 期`;
      }
    } catch (e) {}
  }
}
if (!issue.issueNo && enIssue.issueNo) {
  issue.issueNo = enIssue.issueNo;
  issue.issueLabel = `第 ${issue.issueNo} 期`;
}
if (!issue.issueNo) {
  let others = [];
  if (fs.existsSync(DAILY_DIR)) {
    try { others = readIssues(DAILY_DIR).filter((i) => i.dateISO !== issue.dateISO); } catch (e) {}
  }
  const before = others.filter((i) => i.dateISO < issue.dateISO).length;
  issue.issueNo = String(before + 1).padStart(3, "0");
  issue.issueLabel = `第 ${issue.issueNo} 期`;
}
enIssue.issueNo = enIssue.issueNo || issue.issueNo;
enIssue.issueLabel = enIssue.issueLabel || `Issue ${enIssue.issueNo}`;

/* 补上期号时，顺手补 metabar 和脚注里的占位。 */
if (!/第\s*0*\d+\s*期/.test(issue.metabarHtml)) {
  issue.metabarHtml = `<span class="pill">${escapeHtml(issue.issueLabel)}</span><span class="dot"></span>${issue.metabarHtml}`;
}
if (!/\bIssue\s*#?\s*0*\d+/.test(enIssue.metabarHtml)) {
  enIssue.metabarHtml = `<span class="pill">${escapeHtml(enIssue.issueLabel)}</span><span class="dot"></span>${enIssue.metabarHtml}`;
}
for (const item of [issue, enIssue]) {
  item.footerHtml = item.footerHtml.replace(/Issue\s+—/g, `Issue ${item.issueNo}`);
  item.footerHtml = item.footerHtml.replace(/Issue\s+null/g, `Issue ${item.issueNo}`);
}

const page = renderIssuePage(issue, { templatePath: TEMPLATE });
const enPage = renderIssuePage(enIssue, { templatePath: TEMPLATE });

/* ---------- 先做链接检查，失败就不落盘 ---------- */
if (flags.has("--check-links")) {
  console.log(`\n→ 检查 ${issue.links.length} 条原文链接（浏览器 UA，15 秒超时）…`);
  const result = run(process.execPath, [path.join(ROOT, "scripts", "check-links.mjs"), source, "--strict"]);
  if (result.status !== 0) {
    if (!flags.has("--allow-bad-links")) {
      console.error(`\n✗ 有链接不可用，未写入站点。修好链接，或加 --allow-bad-links 强行发布。`);
      process.exit(1);
    }
    console.warn(`\n! 有链接不可用，按 --allow-bad-links 继续。`);
  }
}

console.log(`\nAI 日报 · ${issue.dateISO} ${issue.weekday} · ${issue.issueLabel} / ${enIssue.issueLabel}`);
console.log(`  ZH: ${issue.headline}`);
console.log(`  EN: ${enIssue.headline}`);
console.log(`  ${issue.count} 条 / ${issue.chapters.length} 个栏目 / ${issue.links.length} 个原文链接`);

if (flags.has("--dry-run")) {
  console.log(`\n(dry-run) 会写入 daily/${issue.dateISO}.html、daily/${issue.dateISO}-en.html，并重新生成首页 / 侧栏 / 两份 RSS / sitemap。`);
  process.exit(0);
}

fs.mkdirSync(DAILY_DIR, { recursive: true });
fs.writeFileSync(destination, page, "utf8");
fs.writeFileSync(enDestination, enPage, "utf8");
console.log(`\n✓ 已写入 ${path.relative(ROOT, destination)}`);
console.log(`✓ 已写入 ${path.relative(ROOT, enDestination)}`);

const build = run(process.execPath, [path.join(ROOT, "scripts", "build.mjs")]);
if (build.status !== 0) {
  console.error("\n✗ 站点生成失败，日报文件已写入，但首页/RSS 没有更新。");
  process.exit(build.status || 1);
}

/* ---------- 发布到 GitHub ---------- */
if (flags.has("--push")) {
  const branch = (git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout || "main").trim();
  // 只提交这一期相关的产物，避免把工作区里别的改动一起带走
  const add = run("git", ["add", "daily", "index.html", "feed.xml", "feed-en.xml", "sitemap.xml"]);
  if (add.status !== 0) process.exit(add.status || 1);

  const staged = git(["diff", "--cached", "--quiet"]);
  if (staged.status === 0) {
    console.log("\n✓ 没有需要提交的改动（内容与线上一致）。");
    process.exit(0);
  }

  const message = `daily: ${issue.dateISO} ${issue.issueLabel} / ${enIssue.issueLabel}`.trim();
  const commit = run("git", ["commit", "-m", message]);
  if (commit.status !== 0) process.exit(commit.status || 1);

  console.log(`\n→ git push origin ${branch}`);
  const push = run("git", ["push", "origin", branch]);
  if (push.status !== 0) {
    console.error(`\n✗ push 失败。本地提交已经存在，修好凭据后运行：git push origin ${branch}`);
    process.exit(push.status || 1);
  }
  console.log(`\n✓ 已推送。若 Cloudflare Pages 已接入 GitHub，一两分钟内上线。`);
} else {
  console.log(`\n下一步：看一眼本地页面，然后运行`);
  console.log(`  node scripts/publish-daily.mjs ${path.relative(process.cwd(), source)} --push`);
  console.log(`或直接 git add -A && git commit && git push。`);
}
