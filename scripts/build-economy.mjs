#!/usr/bin/env node
/* 由 daily-economy/*.html 生成 economy.html 的「今日经济日报」与「往期侧栏」。
   与 build.mjs 平行，互不影响：AI 日报写 index.html，经济日报写 economy.html。

   用法：
     node scripts/build-economy.mjs            # 生成
     node scripts/build-economy.mjs --check    # 只检查是否最新
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
const ECON_DIR = path.join(ROOT, "daily-economy");
const PAGE = path.join(ROOT, "economy.html");

const KICKER = { zh: "经济日报", en: "ECONOMY DAILY" };

const block = (cls, lang, inner, hidden = false) => `      <div class="${cls}" data-lang="${lang}"${hidden ? " hidden" : ""}>
${inner}
      </div>`;

export function buildEconomy({ check = false, quiet = false } = {}) {
  if (!fs.existsSync(ECON_DIR)) return { skipped: true };

  const issues = readIssues(ECON_DIR);
  if (!issues.length) return { skipped: true, empty: true };

  const latest = issues[0];
  if (!latest.en) {
    throw new Error(`最新一期 ${latest.dateISO} 缺少英文版 daily-economy/${latest.dateISO}-en.html`);
  }

  const todayZh = block("today-lang", "zh",
    renderHomeIssue(latest, "zh", { kicker: KICKER.zh, kickerEn: "Daily Economy Brief" }));
  const todayEn = block("today-lang", "en",
    renderHomeIssue(latest.en, "en", { kicker: KICKER.en, kickerEn: "Daily Economy Brief" }), true);
  const sidebarZh = block("archive-lang", "zh",
    renderArchiveSidebar(issues, "zh", { prefix: "daily-economy/" }));
  const sidebarEn = block("archive-lang", "en",
    renderArchiveSidebar(issues, "en", { prefix: "daily-economy/" }), true);

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
    console.log(`\n经济日报 · 已收录 ${issues.length} 期`);
    console.log(`  最新：${latest.dateISO} ${latest.weekday} · ${latest.count} 条 · ${latest.issueLabel || "—"}`);
    console.log(`  头条：${latest.headline}`);
    console.log(`  ${result.changed ? "✓ 已更新 economy.html" : "✓ economy.html 已是最新"}\n`);
  }
  return { changed: result.changed, issues };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  try {
    const out = buildEconomy({ check });
    if (out.skipped) {
      console.log("（没有 daily-economy/ 目录或没有期，跳过）");
      process.exit(0);
    }
    if (check) {
      if (!out.stale) {
        console.log("✓ economy.html 已是最新");
        process.exit(0);
      }
      console.error("✗ economy.html 不是最新，需要运行 npm run build");
      process.exit(1);
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
