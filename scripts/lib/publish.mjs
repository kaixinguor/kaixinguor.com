#!/usr/bin/env node
/* 发布一期双语日报（两个版块共用）。
   版块由 SECTIONS 决定：AI 日报写 daily-ai/ + index.html，经济日报写 daily-economy/ + economy.html。

   流程：
   1. 读中文母版 + 英文母版（默认找同名 -en.html，可用 --en 指定）
   2. 套上站点外壳，写到 <section dir>/YYYY-MM-DD.html 与 -en.html
   3. 重新生成首页今日区、往期侧栏、两份 RSS、sitemap
   4. （默认）逐条检查原文链接，全部可打开才落盘
   5. （可选）git commit + push
*/

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  SECTIONS,
  parseIssue,
  readIssues,
  renderIssuePage,
  escapeHtml
} from "./issue.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE = path.join(ROOT, "templates", "issue.html");

const HOMES = { ai: "index.html", economy: "economy.html" };
const LABELS = { ai: "AI 日报", economy: "经济日报" };

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: ROOT, stdio: "inherit", ...options });
}

function git(args) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

export function publish({ section = "ai", argv = [] } = {}) {
  const sec = SECTIONS[section];
  if (!sec) fail(`未知版块：${section}`);
  const DIR = path.join(ROOT, sec.dir);
  const HOME = HOMES[section];
  const LABEL = LABELS[section];
  const cmd = section === "ai" ? "publish-daily" : "publish-economy";

  const flags = new Set();
  const positional = [];
  let enArg = "";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--en") { enArg = argv[++i] || ""; continue; }
    if (arg.startsWith("--")) { flags.add(arg); continue; }
    positional.push(arg);
  }

  const sourceArg = positional[0];
  if (!sourceArg) {
    fail(`用法：node scripts/${cmd}.mjs <中文母版.html> [--en <英文母版.html>] [--no-check-links] [--push] [--dry-run]`);
  }

  const source = path.resolve(process.cwd(), sourceArg);
  if (!fs.existsSync(source)) fail(`找不到中文版：${source}`);

  const enSource = enArg ? path.resolve(process.cwd(), enArg) : source.replace(/\.html$/i, "-en.html");
  if (!fs.existsSync(enSource)) {
    fail(`找不到英文版：${enSource}`,
      `双语日报必须同时提供英文版。用 --en 指定，或把英文版命名为 ${path.basename(source).replace(/\.html$/i, "-en.html")}。`);
  }

  const parseOrExit = (file, label) => {
    try { return parseIssue(file); }
    catch (error) { fail(`${label}解析失败：${error.message}`); }
  };

  const issue = parseOrExit(source, "中文版");
  const enIssue = parseOrExit(enSource, "英文版");

  if (issue.dateISO !== enIssue.dateISO) fail(`中英文版日期不一致：${issue.dateISO} vs ${enIssue.dateISO}`);
  if (enIssue.lang !== "en") fail(`英文版文件里的 <html lang="en"> 没写对，解析成了 ${enIssue.lang}`);

  const destination = path.join(DIR, `${issue.dateISO}.html`);
  const enDestination = path.join(DIR, `${issue.dateISO}-en.html`);

  /* 期号：优先用母版里写好的；没有就按目录里已有的期次补一个。 */
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
    if (fs.existsSync(DIR)) {
      try { others = readIssues(DIR).filter((i) => i.dateISO !== issue.dateISO); } catch (e) {}
    }
    const before = others.filter((i) => i.dateISO < issue.dateISO).length;
    issue.issueNo = String(before + 1).padStart(3, "0");
    issue.issueLabel = `第 ${issue.issueNo} 期`;
  }
  enIssue.issueNo = enIssue.issueNo || issue.issueNo;
  enIssue.issueLabel = enIssue.issueLabel || `Issue ${enIssue.issueNo}`;

  /* 补期号时，顺手补 metabar 里的占位。 */
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

  /* ---------- 链接检查，失败就不落盘（默认开启） ---------- */
  if (flags.has("--no-check-links")) {
    console.warn(`\n! 已跳过原文链接检查（--no-check-links）。打不开的来源不该发布，仅限排障时使用。`);
  } else {
    console.log(`\n→ 检查 ${issue.links.length} 条原文链接（浏览器 UA，15 秒超时）…`);
    const result = run(process.execPath, [path.join(ROOT, "scripts", "check-links.mjs"), source, "--strict"]);
    if (result.status !== 0) {
      if (!flags.has("--allow-bad-links")) {
        console.error(`\n✗ 有原文链接打不开，未写入站点。`);
        console.error(`  底线：没打开过的页面不写进日报。删掉这几条、换一条能打开的来源，不要带病发布；`);
        console.error(`  确实要强行发布才加 --allow-bad-links。`);
        process.exit(1);
      }
      console.warn(`\n! 有链接不可用，按 --allow-bad-links 继续。`);
    }
  }

  console.log(`\n${LABEL} · ${issue.dateISO} ${issue.weekday} · ${issue.issueLabel} / ${enIssue.issueLabel}`);
  console.log(`  ZH: ${issue.headline}`);
  console.log(`  EN: ${enIssue.headline}`);
  console.log(`  ${issue.count} 条 / ${issue.chapters.length} 个栏目 / ${issue.links.length} 个原文链接`);

  if (flags.has("--dry-run")) {
    console.log(`\n(dry-run) 会写入 ${sec.dir}/${issue.dateISO}.html、${sec.dir}/${issue.dateISO}-en.html，并重新生成首页 / 侧栏 / 两份 RSS / sitemap。`);
    process.exit(0);
  }

  const page = renderIssuePage(issue, { templatePath: TEMPLATE, section });
  const enPage = renderIssuePage(enIssue, { templatePath: TEMPLATE, section });

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(destination, page, "utf8");
  fs.writeFileSync(enDestination, enPage, "utf8");
  console.log(`\n✓ 已写入 ${path.relative(ROOT, destination)}`);
  console.log(`✓ 已写入 ${path.relative(ROOT, enDestination)}`);

  const build = run(process.execPath, [path.join(ROOT, "scripts", "build.mjs")]);
  if (build.status !== 0) fail("站点生成失败，日报文件已写入，但首页/RSS 没有更新。");

  /* ---------- 本地成品图（仅 AI 日报） ---------- */
  if (section === "ai" && flags.has("--social")) {
    console.log("\n→ 生成公众号图片消息图（5 张，本地，不上线）…");
    const social = run(process.execPath, [path.join(ROOT, "scripts", "make-social.mjs"), destination]);
    if (social.status !== 0) {
      console.warn("\n! 成品图生成失败；日报正文与站点已正常发布，可稍后单独重跑：");
      console.warn(`  node scripts/make-social.mjs ${path.relative(ROOT, destination)}`);
    }
  }

  /* ---------- 发布到 GitHub ---------- */
  if (flags.has("--push")) {
    const branch = (git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout || "main").trim();
    const add = run("git", [
      "add", sec.dir, HOME, sec.feedZh, sec.feedEn, "sitemap.xml"
    ]);
    if (add.status !== 0) process.exit(add.status || 1);

    if (git(["diff", "--cached", "--quiet"]).status === 0) {
      console.log("\n✓ 没有需要提交的改动（内容与线上一致）。");
      process.exit(0);
    }

    const message = `${sec.dir}: ${issue.dateISO} ${issue.issueLabel} / ${enIssue.issueLabel}`.trim();
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
    console.log(`  node scripts/${cmd}.mjs ${path.relative(process.cwd(), source)} --push`);
    console.log(`或直接 git add -A && git commit && git push。`);
  }
}
