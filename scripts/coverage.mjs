#!/usr/bin/env node
/* 日报去重与窗口衔接工具。

   用法：
     node scripts/coverage.mjs check daily-economy/2026-11-02.html
     node scripts/coverage.mjs check daily-ai/2026-11-03.html --json
     node scripts/coverage.mjs window --section ai
     node scripts/coverage.mjs report

   规则：
     - 同一事件被不同媒体、在不同时间再写一遍，也算重复；
     - 发布脚本默认调用 check，命中就拒绝落盘（--allow-overlap 可强行放行）；
     - 确属追更的，在 <article class="card" data-followup="2026-10-31"> 上标记，
       并且正文必须带上期没有的新数字/型号，否则仍然拦截。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseIssue, readIssues } from "./lib/issue.mjs";
import {
  compareCards,
  makeStats,
  cardText,
  newFacts,
  formatBJ,
  formatDuration,
  normalizeUrl
} from "./lib/coverage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = { ai: "daily-ai", economy: "daily-economy" };
const LABELS = { ai: "AI 日报", economy: "经济日报" };

const argv = process.argv.slice(2);
const flags = new Set();
const positional = [];
for (const arg of argv) {
  if (arg.startsWith("--")) flags.add(arg);
  else positional.push(arg);
}
const cmd = positional[0] || "help";

function flagValue(name, fallback = "") {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] || fallback : fallback;
}

function sectionFor(file = "") {
  if (/daily-economy/.test(file)) return "economy";
  return "ai";
}

function loadIssues(section) {
  const dir = path.join(ROOT, DIRS[section]);
  if (!fs.existsSync(dir)) return [];
  return readIssues(dir);
}

function flatCards(issue) {
  const out = [];
  issue.chapters.forEach((chapter) => {
    chapter.cards.forEach((card, i) => {
      out.push({ card, chapter, chapterIndex: chapter.cnum, cardIndex: String(i + 1).padStart(2, "0") });
    });
  });
  return out;
}

function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function nowISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00+08:00`;
}

function shortISO(iso) {
  return iso ? iso.slice(0, 16).replace("T", " ") : "—";
}

/* 把本期与上一期的窗口首尾相接与否算出来。 */
function windowCheck(issue, previous) {
  const problems = [];
  if (!issue.windowStart || !issue.windowEnd) {
    problems.push({ level: "warn", text: "本期没有可解析的窗口（metabar 或 meta issue-window），无法检查窗口衔接。" });
    return problems;
  }
  if (!previous) return problems;
  if (!previous.windowEnd) {
    problems.push({ level: "warn", text: `上一期 ${previous.dateISO} 没有可解析的窗口终点，无法检查衔接。` });
    return problems;
  }
  const delta = new Date(issue.windowStart).getTime() - new Date(previous.windowEnd).getTime();
  if (delta < -60000) {
    problems.push({
      level: "error",
      text: `窗口与上一期重叠 ${formatDuration(delta)}：上期结束 ${formatBJ(previous.windowEnd)}，本期开始 ${formatBJ(issue.windowStart)}。`
    });
  } else if (delta > 5 * 60000) {
    problems.push({
      level: "warn",
      text: `窗口与上一期之间空了 ${formatDuration(delta)}：上期结束 ${formatBJ(previous.windowEnd)}，本期开始 ${formatBJ(issue.windowStart)}。这段时间的新闻会被漏掉。`
    });
  }
  return problems;
}

/* ---------- check ---------- */

function check(file) {
  if (!file) {
    console.error("用法：node scripts/coverage.mjs check <日报.html> [--section ai|economy] [--json]");
    process.exit(2);
  }
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) {
    console.error(`✗ 找不到文件：${resolved}`);
    process.exit(2);
  }
  const section = flagValue("--section") || sectionFor(resolved);
  const otherSection = section === "ai" ? "economy" : "ai";
  const issue = parseIssue(resolved);

  const history = loadIssues(section).filter((i) => i.dateISO < issue.dateISO);
  const previous = history[0] || null;
  const sameDate = loadIssues(section).find((i) => i.dateISO === issue.dateISO);
  const crossIssues = loadIssues(otherSection).filter((i) => i.dateISO === issue.dateISO);

  const newEntries = flatCards(issue);
  const historyEntries = history.flatMap((i) => flatCards(i).map((e) => ({ ...e, issue: i })));
  const crossEntries = crossIssues.flatMap((i) => flatCards(i).map((e) => ({ ...e, issue: i })));

  const texts = [
    ...historyEntries.map((e) => cardText(e.card)),
    ...crossEntries.map((e) => cardText(e.card)),
    ...newEntries.map((e) => cardText(e.card))
  ];
  const stats = makeStats(texts);
  const cache = new Map();

  const conflicts = [];
  const push = (entry, match, kind) => {
    const result = compareCards(entry.card, match.card, stats, cache);
    if (!result.level) return;
    const facts = newFacts(entry.card, match.card, cache);
    const followed = Boolean(entry.card.followup);
    let level = result.level;
    let note = "";
    if (followed) {
      if (facts.length) {
        level = "warn";
        note = `已标记追更（${entry.card.followup}），新增 ${facts.slice(0, 4).join("、")}`;
      } else {
        level = "error";
        note = "已标记追更，但正文没有上期之外的新数字/型号，仍按重复处理";
      }
    }
    conflicts.push({
      level,
      kind,
      score: result.score,
      reasons: result.reasons,
      note,
      newEntry: entry,
      match,
      facts
    });
  };

  newEntries.forEach((entry, i) => {
    for (const old of historyEntries) push(entry, old, "history");
    for (const old of crossEntries) push(entry, old, "cross-section");
    newEntries.slice(i + 1).forEach((other) => push(other, entry, "inside"));
  });

  const windows = windowCheck(issue, previous);
  if (sameDate && (sameDate.windowStart !== issue.windowStart || sameDate.windowEnd !== issue.windowEnd)) {
    windows.push({
      level: "error",
      text: `同一天已有页面（${sameDate.windowStart || "缺窗口"} – ${sameDate.windowEnd || "缺窗口"}），本期窗口是 ${issue.windowStart || "缺窗口"} – ${issue.windowEnd || "缺窗口"}。重跑请沿用原窗口；确要改窗口才加 --allow-overlap。`
    });
  }
  const blocking = conflicts.filter((c) => c.level !== "warn");
  const windowBlocking = windows.filter((w) => w.level === "error");

  const label = `${LABELS[section]} · ${issue.issueLabel || issue.dateISO}`;
  if (flags.has("--json")) {
    console.log(JSON.stringify({
      file: path.relative(ROOT, resolved),
      section,
      label,
      windowStart: issue.windowStart,
      windowEnd: issue.windowEnd,
      conflicts: conflicts.map((c) => ({
        level: c.level,
        kind: c.kind,
        score: Number(c.score.toFixed(3)),
        reasons: c.reasons,
        note: c.note,
        newCard: c.newEntry.card.titleText,
        oldCard: c.match.card.titleText,
        oldIssue: c.match.issue.dateISO,
        oldSource: c.match.card.sourceName
      })),
      windows,
      blocking: blocking.length + windowBlocking.length
    }, null, 2));
    process.exit(blocking.length + windowBlocking.length ? 1 : 0);
  }

  console.log(`检查 ${path.relative(ROOT, resolved)}（${label}）`);
  console.log(`往期 ${history.length} 期 / ${historyEntries.length} 条卡片；同日另一版块 ${crossEntries.length} 条\n`);

  if (!conflicts.length) {
    console.log("✓ 没有发现与往期重复的故事。");
  } else {
    console.log(blocking.length ? `✗ 发现 ${blocking.length} 处重复或疑似重复：\n` : `! 发现 ${conflicts.length} 处需要留意的相似内容：\n`);
    conflicts
      .sort((a, b) => b.score - a.score)
      .forEach((c, i) => {
        const n = c.newEntry;
        const where = c.kind === "inside" ? `本期第 ${n.cardIndex} 条（同版块内）`
          : c.kind === "cross-section" ? `${LABELS[otherSection]} ${c.match.issue.dateISO} ·「${c.match.card.titleText}」`
          : `${c.match.issue.dateISO} · ${c.match.issue.issueLabel || ""} ·「${c.match.card.titleText}」`;
        console.log(`${i + 1}) 本期 ${n.chapterIndex}-${n.cardIndex}「${n.card.titleText}」`);
        console.log(`   ↔ ${where}`);
        console.log(`   ${c.reasons.join("；")}${c.note ? `；${c.note}` : ""}`);
      });
    const first = conflicts[0];
    if (blocking.length) {
      console.log(`\n处理：删掉重复条目；确属追更时，把卡片改成`);
      console.log(`  <article class="card" data-followup="${first.match.issue.dateISO}">`);
      console.log(`并在正文补至少一个上期没有的新数字/型号。`);
    }
  }

  if (windows.length) {
    console.log("");
    for (const w of windows) console.log(`${w.level === "error" ? "✗" : "!"} ${w.text}`);
  } else if (previous) {
    console.log(`\n✓ 窗口与上一期首尾相接：${formatBJ(previous.windowEnd)}。`);
  }

  const bad = blocking.length + windowBlocking.length;
  process.exit(bad ? 1 : 0);
}

/* ---------- window ---------- */

function windowCmd() {
  const section = flagValue("--section") || "ai";
  const dir = path.join(ROOT, DIRS[section]);
  const today = todayISO();
  const issues = loadIssues(section);
  const current = issues.find((i) => i.dateISO === today);

  if (current && !flags.has("--force")) {
    console.log(`# ${LABELS[section]} ${today} 已有页面：重跑请沿用这个窗口，不要重算。`);
    console.log(`start: ${current.windowStart || "（缺 windowStart）"}`);
    console.log(`end:   ${current.windowEnd || "（缺 windowEnd）"}`);
    console.log(`metabar: 窗口 ${formatBJ(current.windowStart)} – ${formatBJ(current.windowEnd)}`);
    return;
  }

  const previous = issues[0] || null;
  const start = flagValue("--start") || (previous && previous.windowEnd) || "";
  const end = flagValue("--end") || nowISO();
  if (!start) {
    console.error(`✗ 找不到上一期窗口终点；请用 --start 指定起点。`);
    process.exit(2);
  }
  console.log(`# ${LABELS[section]} 下一期窗口（起点 = 上一期终点，不重叠）`);
  console.log(`start: ${start}`);
  console.log(`end:   ${end}`);
  console.log(`metabar: 窗口 ${formatBJ(start)} – ${formatBJ(end)}`);
  console.log(`meta: <meta name="issue-window" content="${start}/${end}">`);
}

/* ---------- report ---------- */

function report() {
  for (const section of ["ai", "economy"]) {
    const issues = loadIssues(section).slice().reverse();
    if (!issues.length) continue;
    console.log(`\n===== ${LABELS[section]} · 窗口链 =====`);
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const prev = issues[i - 1];
      let note = "";
      if (prev && prev.windowEnd && issue.windowStart) {
        const delta = new Date(issue.windowStart).getTime() - new Date(prev.windowEnd).getTime();
        if (delta < -60000) note = `  ✗ 重叠 ${formatDuration(delta)}`;
        else if (delta > 5 * 60000) note = `  ! 空档 ${formatDuration(delta)}`;
        else note = "  ✓ 相接";
      }
      console.log(`${issue.dateISO}  ${shortISO(issue.windowStart)} – ${shortISO(issue.windowEnd)}${note}`);
    }

    const entries = issues.flatMap((i) => flatCards(i).map((e) => ({ ...e, issue: i })));
    const stats = makeStats(entries.map((e) => cardText(e.card)));
    const cache = new Map();
    const pairs = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].issue.dateISO === entries[j].issue.dateISO) continue;
        const r = compareCards(entries[i].card, entries[j].card, stats, cache);
        if (r.level) pairs.push({ r, a: entries[i], b: entries[j] });
      }
    }
    pairs.sort((x, y) => y.r.score - x.r.score);
    console.log(`\n----- ${LABELS[section]} · 跨期重复 -----`);
    if (!pairs.length) console.log("✓ 没有发现。");
    for (const p of pairs.slice(0, 20)) {
      console.log(`${p.r.score.toFixed(2)}  ${p.a.issue.dateISO}「${p.a.card.titleText.slice(0, 28)}」 ↔ ${p.b.issue.dateISO}「${p.b.card.titleText.slice(0, 28)}」  ${p.r.reasons.join("；")}`);
    }
  }

  console.log(`\n===== 同日跨版块 =====`);
  const ai = loadIssues("ai");
  const econ = loadIssues("economy");
  let cross = 0;
  for (const a of ai) {
    const e = econ.find((x) => x.dateISO === a.dateISO);
    if (!e) continue;
    const entriesA = flatCards(a);
    const entriesE = flatCards(e);
    const stats = makeStats([...entriesA, ...entriesE].map((x) => cardText(x.card)));
    const cache = new Map();
    for (const x of entriesA) {
      for (const y of entriesE) {
        const r = compareCards(x.card, y.card, stats, cache);
        if (r.level) {
          cross++;
          console.log(`${a.dateISO}  AI「${x.card.titleText.slice(0, 26)}」 ↔ 经济「${y.card.titleText.slice(0, 26)}」  ${r.reasons.join("；")}`);
        }
      }
    }
  }
  if (!cross) console.log("✓ 没有发现。");
}

/* ---------- main ---------- */

if (cmd === "check") check(positional[1]);
else if (cmd === "window") windowCmd();
else if (cmd === "report") report();
else {
  console.log(`用法：
  node scripts/coverage.mjs check <日报.html> [--section ai|economy] [--json]
  node scripts/coverage.mjs window --section ai|economy [--force] [--start ISO] [--end ISO]
  node scripts/coverage.mjs report`);
  process.exit(cmd === "help" ? 0 : 2);
}
