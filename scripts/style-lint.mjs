#!/usr/bin/env node
/* 文风体检：把「像 AI 写的」那些可测量特征标出来。
   只提示，不阻断发布；加 --strict 才在有硬伤时退出 1。

   用法：
     node scripts/style-lint.mjs daily-ai/web/2026-11-26.html
     node scripts/style-lint.mjs daily-ai/web/2026-11-26.html --strict
     npm run style -- daily-economy/web/2026-11-26.html

   指标口径见 docs/写作风格.md 第 1 节与第 6 节。 */

import fs from "node:fs";
import path from "node:path";
import { parseIssue, stripTags } from "./lib/issue.mjs";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const files = args.filter((a) => !a.startsWith("--"));

if (!files.length) {
  console.error("用法: node scripts/style-lint.mjs <日报.html> [--strict]");
  process.exit(2);
}

/* ---------- 阈值 ---------- */

const LIMIT = {
  zh: {
    avgSentence: 40,      // 平均句长（字）
    p90Sentence: 60,      // 90 分位句长
    longRatio: 0.1,       // 超过 80 字的句子占比
    whyMax: 260,          // 看点上限（字）
    whyMin: 120,          // 看点下限（字）
    colonRatio: 0.45,     // 标题带冒号的比例
    antithesis: 2,        // 「不是……而是……」每期上限
    deckSentences: 6      // 导语句数上限
  },
  en: {
    avgSentence: 26,      // 平均句长（词）
    p90Sentence: 42,
    longRatio: 0.1,       // 超过 40 词的句子占比
    whyMax: 170,          // 看点上限（词）
    whyMin: 60,
    colonRatio: 0.45,
    antithesis: 2,
    deckSentences: 6
  }
};

/* ---------- 词表 ---------- */

const BANNED = [
  "赋能", "抓手", "闭环", "护城河", "底层逻辑", "范式转移", "生态位",
  "值得注意的是", "需要指出的是", "不难看出", "众所周知",
  "引发广泛关注", "引发热议", "一场变革", "一场革命",
  "有待观察", "值得关注"
];

const LIMITED = ["这意味着", "换句话说", "归根结底", "本质上", "真正的"];

const LABELS = [
  "谁付钱", "谁收钱", "成本落在谁身上", "可持续性看", "证据强度",
  "它改变了哪个判断", "口径：", "设计是"
];

/* ---------- 工具 ---------- */

function sentences(text, lang) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = lang === "en"
    ? clean.split(/(?<=[.!?])\s+(?=[A-Z“"'(])/).filter((s) => s.trim().length > 1)
    : clean.split(/(?<=[。！？])/).filter((s) => s.trim().length > 1);
  return parts.map((s) => s.trim());
}

function size(text, lang) {
  if (lang === "en") return (String(text).match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g) || []).length;
  return String(text).replace(/\s+/g, "").length;
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const count = (text, needle) => String(text).split(needle).length - 1;

function mark(ok, warn = false) {
  return ok ? "✓" : warn ? "⚠" : "✗";
}

/* ---------- 单个文件 ---------- */

function inspect(file) {
  const issue = parseIssue(file);
  const lang = issue.lang;
  const L = LIMIT[lang];

  const cardTexts = issue.cards.map((c) => stripTags((c.paras || []).join(" ")));
  const allText = cardTexts.join(" ") + " " + issue.cards.map((c) => stripTags(c.why?.html || "")).join(" ");
  const allSents = cardTexts.flatMap((t) => sentences(t, lang)).map((s) => size(s, lang));
  const deckSents = sentences(issue.deckText || "", lang).map((s) => size(s, lang));

  const whyLens = issue.cards.map((c) => size(stripTags(c.why?.html || ""), lang)).filter(Boolean);
  const colon = issue.cards.filter((c) => /[：:]/.test(c.titleText)).length;
  const longLine = lang === "en" ? 40 : 80;

  const rows = [];
  const bad = [];

  const add = (name, value, ok, target) => {
    rows.push({ name, value, ok, target });
    if (ok === false) bad.push(name);
  };

  const a = Math.round(avg(allSents));
  const p90 = Math.round(pct(allSents, 0.9));
  const longRatio = allSents.length ? allSents.filter((n) => n > longLine).length / allSents.length : 0;

  add("平均句长", `${a} ${lang === "en" ? "词" : "字"}`, a <= L.avgSentence, `≤ ${L.avgSentence}`);
  add("句长 p90", `${p90}`, p90 <= L.p90Sentence, `≤ ${L.p90Sentence}`);
  add(`超过 ${longLine} ${lang === "en" ? "词" : "字"}的句子`, `${Math.round(longRatio * 100)}%`, longRatio <= L.longRatio, `< ${Math.round(L.longRatio * 100)}%`);

  const whyAvg = Math.round(avg(whyLens));
  add("看点平均长度", `${whyAvg}`, whyAvg >= L.whyMin && whyAvg <= L.whyMax, `${L.whyMin}–${L.whyMax}`);
  add("导语句数", `${deckSents.length}`, deckSents.length <= L.deckSentences, `≤ ${L.deckSentences}`);

  const colonRatio = issue.cards.length ? colon / issue.cards.length : 0;
  add("标题带冒号", `${colon}/${issue.cards.length}`, colonRatio <= L.colonRatio, `< ${Math.round(L.colonRatio * 100)}%`);

  const anti = count(allText, "而是");
  add("「而是」", `${anti} 次`, anti <= L.antithesis, `≤ ${L.antithesis} 次`);

  const bannedHits = BANNED.map((w) => [w, count(allText, w)]).filter(([, n]) => n > 0);
  add("禁用词", bannedHits.length ? bannedHits.map(([w, n]) => `${w}×${n}`).join(" ") : "0", bannedHits.length === 0, "0");

  const limitedHits = LIMITED.map((w) => [w, count(allText, w)]).filter(([, n]) => n > 0);
  add("限用词", limitedHits.length ? limitedHits.map(([w, n]) => `${w}×${n}`).join(" ") : "0",
    limitedHits.reduce((s, [, n]) => s + n, 0) <= 3, "合计 ≤ 3");

  const labelHits = LABELS.map((w) => [w, count(allText, w)]).filter(([, n]) => n > 0);
  add("模板标签", labelHits.length ? labelHits.map(([w, n]) => `${w}×${n}`).join(" ") : "0", labelHits.length === 0, "0");

  const dateOpen = issue.cards.filter((c) => {
    const first = sentences(stripTags((c.paras || [])[0] || ""), lang)[0] || "";
    return lang === "en"
      ? /^(On|In)\s+\w+\s+\d|^\d{1,2}\s+\w+\s+\d{4}/.test(first)
      : /^\d{1,2}\s*月\s*\d{1,2}\s*日|^\d{4}\s*年/.test(first);
  }).length;
  add("以日期开头", `${dateOpen}/${issue.cards.length}`, dateOpen / issue.cards.length <= 0.6, "≤ 60%");

  return { file, issue, rows, bad, allSents };
}

/* ---------- 输出 ---------- */

let failed = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`找不到文件：${file}`);
    failed++;
    continue;
  }
  const { issue, rows, bad } = inspect(file);
  const ok = bad.length === 0;

  console.log(`\n文风体检 · ${path.basename(file)} · ${issue.count} 条 · ${issue.issueLabel || ""}`);
  for (const r of rows) {
    console.log(`  ${mark(r.ok)} ${r.name.padEnd(16, " ")} ${String(r.value).padEnd(30, " ")} 目标 ${r.target}`);
  }
  if (!ok) {
    console.log(`  → 需要处理：${[...new Set(bad)].join("、")}`);
    failed++;
  }
}

console.log("\n提示：这些是体检指标，不是判决。文风问题以 docs/写作风格.md 为准；" +
  "硬指标之外，仍要通读一遍，问「把这段放进另一份日报，读得出是谁写的吗」。");

if (strict && failed) process.exit(1);
