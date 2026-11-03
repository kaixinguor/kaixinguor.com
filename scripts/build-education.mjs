#!/usr/bin/env node
/* 由 daily-education/*.html 生成 education.html 的「今日教育日报」与「往期侧栏」。
   与 build.mjs 平行，互不影响：AI 日报写 index.html，经济日报写 economy.html，教育日报写 education.html。

   用法：
     node scripts/build-education.mjs           # 生成
     node scripts/build-education.mjs --check   # 只检查是否最新
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readIssues,
  renderHomeIssue,
  renderArchiveSidebar,
  applyMarkers,
  writeIfChanged
} from "./lib/issue.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDU_DIR = path.join(ROOT, "daily-education");
const PAGE = path.join(ROOT, "education.html");

const KICKER = { zh: "教育日报", en: "EDUCATION DAILY" };

const block = (cls, lang, inner, hidden = false) => `      <div class="${cls}" data-lang="${lang}"${hidden ? " hidden" : ""}>
${inner}
      </div>`;

export function buildEducation({ check = false, quiet = false } = {}) {
  if (!fs.existsSync(EDU_DIR)) return { skipped: true };

  const issues = readIssues(EDU_DIR);
  if (!issues.length) return { skipped: true, empty: true };

  const latest = issues[0];
  if (!latest.en) {
    throw new Error(`最新一期 ${latest.dateISO} 缺少英文版 daily-education/${latest.dateISO}-en.html`);
  }

  const todayZh = block("today-lang", "zh",
    renderHomeIssue(latest, "zh", { kicker: KICKER.zh, kickerEn: "Daily Education Brief" }));
  const todayEn = block("today-lang", "en",
    renderHomeIssue(latest.en, "en", { kicker: KICKER.en, kickerEn: "Daily Education Brief" }), true);
  const sidebarZh = block("archive-lang", "zh",
    renderArchiveSidebar(issues, "zh", { prefix: "daily-education/" }));
  const sidebarEn = block("archive-lang", "en",
    renderArchiveSidebar(issues, "en", { prefix: "daily-education/" }), true);

  const html = applyMarkers(fs.readFileSync(PAGE, "utf8"), {
    TODAY_ZH: todayZh,
    TODAY_EN: todayEn,
    ARCHIVE_SIDEBAR_ZH: sidebarZh,
    ARCHIVE_SIDEBAR_EN: sidebarEn
  });

  if (check) {
    const current = fs.readFileSync(PAGE, "utf8");
    return { stale: current !== html, issues };
  }

  const result = writeIfChanged(PAGE, html);
  if (!quiet) {
    console.log(`\n教育日报 · 已收录 ${issues.length} 期`);
    console.log(`  最新：${latest.dateISO} ${latest.weekday} · ${latest.count} 条 · ${latest.issueLabel || "—"}`);
    console.log(`  头条：${latest.headline}`);
    console.log(`  ${result.changed ? "✓ 已更新 education.html" : "✓ education.html 已是最新"}\n`);
  }
  return { changed: result.changed, issues };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  try {
    const out = buildEducation({ check });
    if (out.skipped) {
      console.log("（没有 daily-education/ 目录或没有期，跳过）");
      process.exit(0);
    }
    if (check) {
      if (!out.stale) {
        console.log("✓ education.html 已是最新");
        process.exit(0);
      }
      console.error("✗ education.html 不是最新，需要运行 npm run build");
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
