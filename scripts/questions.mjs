#!/usr/bin/env node
/* 问题层 · 插件（不碰事实层）
   读：daily-ai/<date>.html（已发布的日报，只读）
       lab/questions/<date>.json（人工/模型写的问题）
   出：lab/questions/<date>.html（独立页面，两层并列）

   事实层（daily-ai/）完全不知道这一层的存在：
   它照常发布、照常进 RSS、照常生成首页。
   这一层读它、引它、在它上面长问题；删掉这一层，日报一点不受影响。

   用法：
     node scripts/questions.mjs 2026-10-30
     node scripts/questions.mjs 2026-10-30 --dry-run
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseIssue, escapeHtml } from "./lib/issue.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAILY_DIR = path.join(ROOT, "daily-ai");
const LAB_DIR = path.join(ROOT, "lab", "questions");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

if (!date) {
  console.error("用法：node scripts/questions.mjs YYYY-MM-DD [--dry-run]");
  process.exit(1);
}

const baseFile = path.join(DAILY_DIR, `${date}.html`);
const dataFile = path.join(LAB_DIR, `${date}.json`);
const outFile = path.join(LAB_DIR, `${date}.html`);

for (const f of [baseFile, dataFile]) {
  if (!fs.existsSync(f)) {
    console.error(`! 找不到 ${path.relative(ROOT, f)}`);
    process.exit(1);
  }
}

const issue = parseIssue(baseFile);
const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));

/* ---------- 校验：问题必须挂在事实层的某一条上 ---------- */

const REQUIRED = [
  "id", "discipline", "concept", "conceptNote", "anchorCard", "anchorFact",
  "question", "quickAnswer", "quickAnswerGap", "assumption", "turn", "probes", "boundary"
];

// card 序号 → 所属栏目 id，用来生成回事实层的锚点
const chapterOf = [];
for (const ch of issue.chapters) {
  for (const _ of ch.cards) chapterOf.push(ch.id);
}

const errors = [];
const seen = new Set();

data.questions.forEach((q, i) => {
  for (const k of REQUIRED) {
    if (q[k] === undefined || q[k] === "" || (Array.isArray(q[k]) && !q[k].length)) {
      errors.push(`第 ${i + 1} 问缺少字段 ${k}`);
    }
  }
  if (seen.has(q.id)) errors.push(`id 重复：${q.id}`);
  seen.add(q.id);
  if (!Number.isInteger(q.anchorCard) || !issue.cards[q.anchorCard]) {
    errors.push(`第 ${i + 1} 问的 anchorCard=${q.anchorCard} 在事实层里不存在（共 ${issue.cards.length} 条）`);
  }
  if (Array.isArray(q.probes) && q.probes.length !== 3) {
    errors.push(`第 ${i + 1} 问的 probes 应该正好 3 条`);
  }
  if (q.question && q.question.includes("如何看待")) {
    errors.push(`第 ${i + 1} 问是作文题（"如何看待"）：${q.question}`);
  }
});

if (errors.length) {
  console.error("✗ 校验没过：");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

/* ---------- 渲染 ---------- */

const num = (i) => String(i + 1).padStart(2, "0");

function cardLink(q) {
  const card = issue.cards[q.anchorCard];
  const chapterId = chapterOf[q.anchorCard];
  const href = `../../daily-ai/${date}.html#${chapterId}`;
  return { card, chapterId, href };
}

function renderQuestion(q, i) {
  const { card, href } = cardLink(q);
  const probes = q.probes.map((p, k) => `            <li><span class="pn">${k + 1}</span><span>${escapeHtml(p)}</span></li>`).join("\n");

  return `
      <article class="qcard" id="q-${escapeHtml(q.id)}" data-id="${escapeHtml(q.id)}">
        <div class="qtop">
          <span class="qnum">${num(i)}</span>
          <span class="qtag">${escapeHtml(q.discipline)}</span>
          <span class="qsep"></span>
          <span class="qconcept">${escapeHtml(q.concept)}</span>
        </div>

        <h2 class="qtext">${escapeHtml(q.question)}</h2>

        <p class="qanchor">
          <span class="alabel">挂靠</span>
          <a href="${escapeHtml(href)}">${escapeHtml(card.titleText)}</a>
          <span class="afact">${escapeHtml(q.anchorFact)}</span>
        </p>

        <details class="qmore">
          <summary>怎么答 · 答完改什么</summary>
          <div class="qbody">
            <div class="qrow">
              <span class="rlabel">最顺口的答案</span>
              <p>${escapeHtml(q.quickAnswer)}</p>
            </div>
            <div class="qrow">
              <span class="rlabel">它不够的地方</span>
              <p>${escapeHtml(q.quickAnswerGap)}</p>
            </div>
            <div class="qrow">
              <span class="rlabel">撬开的假设</span>
              <p>${escapeHtml(q.assumption)}</p>
            </div>
            <div class="qrow">
              <span class="rlabel">承重的概念</span>
              <p><b>${escapeHtml(q.concept)}</b> —— ${escapeHtml(q.conceptNote)}</p>
            </div>
            <div class="qrow turn">
              <span class="rlabel">答完可以改口说</span>
              <p>${escapeHtml(q.turn)}</p>
            </div>
            <div class="qrow">
              <span class="rlabel">带去问你的 AI · 三层追问</span>
              <ol class="probes">
${probes}
              </ol>
            </div>
            <div class="qrow edge">
              <span class="rlabel">这个答案什么时候不成立</span>
              <p>${escapeHtml(q.boundary)}</p>
            </div>
          </div>
        </details>

        <div class="qfoot">
          <button class="take" type="button" data-take="${escapeHtml(q.id)}">带走这一问</button>
          <span class="taken" hidden>已带走 · 只在你这边</span>
        </div>
      </article>`;
}

const factRows = issue.cards.map((c, i) => {
  const chapterId = chapterOf[i];
  return `        <li><span class="fn">${String(i + 1).padStart(2, "0")}</span><a href="../../daily-ai/${date}.html#${chapterId}">${escapeHtml(c.titleText)}</a><span class="fs">${escapeHtml(c.sourceName || "")}</span></li>`;
}).join("\n");

const rejectedRows = (data.rejected || []).map((r) => `
        <li>
          <p class="rq">${escapeHtml(r.question)}</p>
          <p class="rr"><span class="kind">${escapeHtml(r.kind)}</span>${escapeHtml(r.reason)}</p>
        </li>`).join("\n");

const toc = data.questions.map((q, i) =>
  `      <a href="#q-${escapeHtml(q.id)}"><span class="n">${num(i)}</span>${escapeHtml(q.concept)}</a>`
).join("\n");

/* 带走卡的纯文本，直接从数据生成，两边不会漂移 */
const takeData = Object.fromEntries(data.questions.map((q) => {
  const { card } = cardLink(q);
  return [q.id, {
    title: card.titleText,
    issue: issue.issueLabel,
    date: issue.dateDisplay,
    concept: q.concept,
    discipline: q.discipline,
    question: q.question,
    anchorFact: q.anchorFact,
    quickAnswer: q.quickAnswer,
    quickAnswerGap: q.quickAnswerGap,
    assumption: q.assumption,
    conceptNote: q.conceptNote,
    turn: q.turn,
    probes: q.probes,
    boundary: q.boundary
  }];
}));

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>问题层 · ${escapeHtml(issue.dateDisplay)} · 附于第 ${String(issue.issueNo).padStart(3, "0")} 期</title>
<meta name="description" content="${escapeHtml(issue.dateDisplay)} 问题层：从当日 ${issue.count} 条事实里长出 ${data.questions.length} 个问题。不评分、不记录、不建库。">
<meta name="robots" content="noindex">
<link rel="icon" href="../../favicon.svg?v=2" type="image/svg+xml">
<link rel="stylesheet" href="../../style.css?v=6">
<script>
(function () {
  try {
    var t = localStorage.getItem("kaixinguor.theme");
    if (t !== "dark" && t !== "light") {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
})();
</script>
<style>
/* ---------- 问题层：只在 64rem 里生效，不污染全站 ---------- */
.qpage { --qmax: 47rem; }
.qpage .wrap { max-width: var(--maxw); }
.qpage .narrow { max-width: var(--qmax); margin-inline: auto; padding-inline: clamp(18px, 5vw, 28px); }

.qhead { padding: clamp(34px, 6vw, 62px) 0 clamp(22px, 3vw, 30px); border-bottom: 1px solid var(--line); }
.qhead .kicker {
  display: flex; align-items: center; gap: .62rem;
  font-family: var(--mono); font-size: 11px; letter-spacing: .2em;
  text-transform: uppercase; color: var(--muted);
}
.qhead .kicker .zh { color: var(--accent); letter-spacing: .12em; }
.qhead .kicker .sep { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); flex: none; }
.qhead .kicker .issue-tag { margin-left: auto; letter-spacing: .12em; }
.qhead h1 {
  margin: .5rem 0 0; font-family: var(--serif);
  font-size: clamp(1.62rem, 5.2vw, 3.1rem); font-weight: 600;
  line-height: 1.2; letter-spacing: -.01em; text-wrap: balance;
}
.qhead .deck { max-width: 40em; margin: .9rem 0 0; color: var(--ink-2); font-size: clamp(.98rem, 1.5vw, 1.08rem); line-height: 1.75; }
.qhead .metabar {
  display: flex; flex-wrap: wrap; align-items: center; gap: .55rem;
  margin-top: 1.1rem; font-family: var(--mono); font-size: 11px;
  letter-spacing: .06em; color: var(--muted);
}
.qhead .metabar .dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .55; }

.qlayer { padding: clamp(30px, 5vw, 46px) 0 0; }

/* 事实层：压到很小，只说"问题是从这长出来的" */
.facts { border-bottom: 1px solid var(--line); padding-bottom: clamp(20px, 3.4vw, 28px); margin-bottom: clamp(22px, 3.6vw, 32px); }
.facts h2 {
  margin: 0 0 .2rem; font-family: var(--mono); font-size: 10.5px;
  font-weight: 400; letter-spacing: .18em; text-transform: uppercase; color: var(--muted);
}
.facts .fhint { margin: 0 0 1rem; color: var(--muted); font-size: .82rem; line-height: 1.6; }
.facts ol { list-style: none; margin: 0; padding: 0; display: grid; gap: .34rem; }
.facts li {
  display: flex; align-items: baseline; gap: .6rem;
  font-size: .86rem; line-height: 1.55; color: var(--ink-2);
  padding-bottom: .34rem; border-bottom: 1px solid var(--line-soft);
}
.facts li:last-child { border-bottom: 0; }
.facts .fn { font-family: var(--mono); font-size: 9.5px; color: var(--muted); flex: none; letter-spacing: .08em; }
.facts a { color: var(--ink-2); }
.facts a:hover { color: var(--accent); }
.facts .fs { margin-left: auto; font-family: var(--mono); font-size: 9.5px; color: var(--muted); flex: none; }

/* 问题卡 */
.qcard { padding: clamp(26px, 4vw, 38px) 0; border-top: 1px solid var(--line); }
.qcard:first-of-type { border-top: 0; padding-top: 0; }
.qtop { display: flex; align-items: baseline; gap: .55rem; font-family: var(--mono); font-size: 10px; letter-spacing: .14em; color: var(--muted); text-transform: uppercase; }
.qtop .qnum { color: var(--accent); font-size: 11px; }
.qtop .qsep { width: 14px; height: 1px; background: var(--line); }
.qtop .qconcept { color: var(--ink-2); letter-spacing: .08em; }

.qtext {
  margin: .72rem 0 0; font-family: var(--serif);
  font-size: clamp(1.28rem, 2.9vw, 1.72rem); font-weight: 600;
  line-height: 1.62; letter-spacing: .004em; text-wrap: balance;
}
.qanchor {
  margin: 1rem 0 0; padding: .6rem .8rem .6rem .85rem;
  border-left: 2px solid var(--line); color: var(--ink-2); font-size: .84rem; line-height: 1.65;
}
.qanchor .alabel {
  display: inline-block; margin-right: .5rem; font-family: var(--mono);
  font-size: 9px; letter-spacing: .16em; color: var(--muted); vertical-align: .1em;
}
.qanchor a { color: var(--ink); border-bottom: 1px solid var(--line); }
.qanchor a:hover { color: var(--accent); border-color: currentColor; }
.qanchor .afact { display: block; margin-top: .3rem; color: var(--muted); }

.qmore { margin-top: .9rem; }
.qmore summary {
  cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: .4rem;
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .12em;
  color: var(--muted); padding: .3rem 0; text-transform: uppercase;
}
.qmore summary::-webkit-details-marker { display: none; }
.qmore summary::before { content: "+"; color: var(--accent); font-size: 13px; line-height: 1; }
.qmore[open] summary::before { content: "–"; }
.qmore summary:hover { color: var(--ink); }

.qbody { margin-top: .8rem; display: grid; gap: .1rem; }
.qrow { padding: .68rem 0; border-top: 1px solid var(--line-soft); }
.qrow p { margin: .18rem 0 0; color: var(--ink-2); font-size: .95rem; line-height: 1.75; }
.rlabel { font-family: var(--mono); font-size: 9.5px; letter-spacing: .14em; color: var(--muted); text-transform: uppercase; }
.qrow.turn p { color: var(--ink); font-weight: 500; }
.qrow.turn {
  border-top-color: transparent;
  margin: .2rem 0;
  padding: .75rem .85rem;
  background: var(--tint);
  box-shadow: inset 2px 0 0 var(--accent);
}
.qrow b { font-weight: 600; color: var(--ink); }
.probes { list-style: none; margin: .3rem 0 0; padding: 0; display: grid; gap: .42rem; }
.probes li { display: flex; gap: .55rem; font-size: .93rem; line-height: 1.7; color: var(--ink-2); }
.probes .pn { font-family: var(--mono); font-size: 9.5px; color: var(--accent); flex: none; padding-top: .3em; }

.qfoot { display: flex; align-items: center; gap: .75rem; margin-top: 1rem; }
.take {
  font: inherit; font-family: var(--mono); font-size: 10.5px; letter-spacing: .12em;
  text-transform: uppercase; color: var(--ink-2); background: transparent;
  border: 1px solid var(--line); border-radius: 2px; padding: .5rem .85rem;
  cursor: pointer; transition: color .16s, border-color .16s, background .16s;
}
.take:hover { color: var(--accent); border-color: var(--accent); background: var(--tint); }
.taken { font-family: var(--mono); font-size: 9.5px; letter-spacing: .1em; color: var(--accent); }
.qcard.is-taken .take { display: none; }

/* 判准与判掉 */
.judge { border-top: 1px solid var(--line); padding: clamp(30px, 5vw, 46px) 0 0; margin-top: clamp(10px, 3vw, 24px); }
.judge h2 { font-family: var(--serif); font-size: 1.24rem; font-weight: 600; margin: 0 0 .5rem; }
.judge .lead { margin: 0 0 1rem; color: var(--ink-2); font-size: .95rem; line-height: 1.78; }
.judge .lead b { color: var(--ink); }
.rejected { list-style: none; margin: 1.1rem 0 0; padding: 0; display: grid; gap: .9rem; }
.rejected li { padding-top: .8rem; border-top: 1px solid var(--line-soft); }
.rejected .rq { margin: 0; font-family: var(--serif); font-size: 1rem; line-height: 1.6; color: var(--ink-2); text-decoration: line-through; text-decoration-color: var(--line); }
.rejected .rr { margin: .3rem 0 0; font-size: .86rem; line-height: 1.7; color: var(--muted); }
.rejected .kind {
  display: inline-block; margin-right: .5rem; padding: .05rem .4rem;
  font-family: var(--mono); font-size: 9px; letter-spacing: .1em;
  color: var(--accent); border: 1px solid var(--line); border-radius: 2px; white-space: nowrap;
}

/* 带走：模态 */
.takebox[hidden] { display: none; }
.takebox {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: flex-end; justify-content: center;
  background: rgba(12, 9, 7, .42); backdrop-filter: blur(2px);
  padding: 0;
}
.takecard {
  width: 100%; max-width: 34rem; max-height: 86vh; overflow: auto;
  background: var(--paper-2); border: 1px solid var(--line); border-bottom: 0;
  border-radius: 4px 4px 0 0; padding: 1.15rem 1.2rem 1.3rem;
  box-shadow: 0 -18px 50px rgba(0, 0, 0, .16);
}
@media (min-width: 720px) {
  .takebox { align-items: center; }
  .takecard { border-bottom: 1px solid var(--line); border-radius: 4px; padding: 1.4rem 1.5rem 1.5rem; }
}
.takecard .th { display: flex; align-items: center; gap: .5rem; font-family: var(--mono); font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
.takecard .th .x { margin-left: auto; cursor: pointer; background: none; border: 0; font: inherit; color: var(--muted); padding: .2rem .3rem; }
.takecard .th .x:hover { color: var(--accent); }
.takecard h3 { margin: .7rem 0 0; font-family: var(--serif); font-size: 1.06rem; font-weight: 600; line-height: 1.62; }
.takecard pre {
  margin: .9rem 0 0; padding: .85rem; background: var(--tint);
  border: 1px solid var(--line-soft); border-radius: 2px;
  font-family: var(--mono); font-size: 11px; line-height: 1.72;
  white-space: pre-wrap; word-break: break-word; color: var(--ink-2);
  max-height: 42vh; overflow: auto;
}
.takecard .acts { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .9rem; align-items: center; }
.takecard .copy {
  flex: none; white-space: nowrap;
  font: inherit; font-family: var(--mono); font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase;
  background: var(--ink); color: var(--paper); border: 1px solid var(--ink);
  border-radius: 2px; padding: .55rem .95rem; cursor: pointer;
}
.takecard .copy:hover { background: var(--accent); border-color: var(--accent); }
.takecard .note { margin: 0; font-size: .78rem; color: var(--muted); line-height: 1.6; }

.qfoot-space { height: clamp(40px, 7vw, 70px); }

/* 手机上：目录换行而不是横向裁切；事实层右侧来源让位给标题 */
@media (max-width: 620px) {
  .qpage .toc { position: static; backdrop-filter: none; }
  .qpage .toc-inner { flex-wrap: wrap; gap: .55rem 1.15rem; }
  .facts .fs { display: none; }
  .facts li { font-size: .84rem; }
}
</style>
</head>
<body class="daily-page qpage">
<a class="skip" href="#main">跳到正文</a>

<header class="site">
  <div class="wrap">
    <a class="brand" href="../../index.html">kaixinguor</a>
    <nav class="top">
      <a href="../../daily-ai/${date}.html">日报</a>
      <a href="${date}.html" aria-current="page">问题层</a>
      <a href="../../tools.html">工具</a>
      <a href="../../wish.html">许愿</a>
      <button class="icon-btn" type="button" data-theme-toggle aria-label="切换深浅色">◐</button>
    </nav>
  </div>
</header>

<header class="qhead">
  <div class="narrow">
    <div class="kicker">
      <span class="zh">问题层</span>
      <span class="sep"></span>
      <span>Question Layer</span>
      <span class="issue-tag">附于第 ${String(issue.issueNo).padStart(3, "0")} 期</span>
    </div>
    <h1>${escapeHtml(issue.dateDisplay)} · 今天值得带走的问题</h1>
    <p class="deck">${escapeHtml(data.issueNote || "")}</p>
    <div class="metabar">
      <span>${issue.count} 条事实</span><span class="dot"></span>
      <span>${data.questions.length} 问</span><span class="dot"></span>
      <span>判掉 ${(data.rejected || []).length} 条</span><span class="dot"></span>
      <span>不评分 · 不记录 · 不建库</span>
    </div>
  </div>
</header>

<nav class="toc" aria-label="问题索引">
  <div class="wrap">
    <div class="toc-inner">
${toc}
      <a href="#judge"><span class="n">—</span>判准</a>
    </div>
  </div>
</nav>

<main class="wrap" id="main">
  <div class="narrow qlayer">

    <section class="facts" aria-label="事实层">
      <h2>事实层 · 今天的 ${issue.count} 条</h2>
      <p class="fhint">下面是问题长出来的地方。点击任一条回到日报原文；问题层本身不写新闻、不补事实。</p>
      <ol>
${factRows}
      </ol>
    </section>

${data.questions.map(renderQuestion).join("\n")}

    <section class="judge" id="judge">
      <h2>为什么是这几问，为什么不是那几问</h2>
      <p class="lead"><b>深刻的问题，是一句话就能答、但答完之后你必须改口的问题。</b>
        一句话答得出来，才有得讨论；答完要改口，才不只是多知道了一个事实；
        改的还是那个学科里少数几条撑着别的东西的结论，才算摸到了底层。</p>
      <p class="lead">所以「深」不看题目大不大，看答完之后你的模型动没动。
        宏大而无法回答的问题，比具体而能改口的问题浅。</p>
${(data.rejected || []).length ? `
      <p class="lead" style="margin-top:1.2rem;color:var(--muted);font-size:.86rem">今天被判掉的 ${(data.rejected || []).length} 条，比上面那 ${data.questions.length} 条更能说明这条线在哪：</p>
      <ul class="rejected">
${rejectedRows}
      </ul>` : ""}
    </section>

    <div class="qfoot-space"></div>
  </div>
</main>

<footer class="site">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand"><b>kaixinguor</b><p>问题层 · 附于 ${escapeHtml(issue.dateDisplay)} 日报。不评分，不记录你带走了哪一问；刷新即忘。</p></div>
      <div class="foot-meta">SOURCE · daily-ai/${date}.html</div>
    </div>
    <div class="foot-links">
      <a href="../../daily-ai/${date}.html">回到事实层</a>
      <a href="../../index.html">首页</a>
      <span>判准全文：docs/问题层-判准.md</span>
    </div>
  </div>
</footer>

<div class="takebox" id="takebox" hidden>
  <div class="takecard" role="dialog" aria-modal="true" aria-labelledby="take-title">
    <div class="th">
      <span>带走 · TAKEAWAY</span>
      <button class="x" type="button" id="take-close" aria-label="关闭">✕</button>
    </div>
    <h3 id="take-title"></h3>
    <pre id="take-text"></pre>
    <div class="acts">
      <button class="copy" type="button" id="take-copy">复制</button>
      <p class="note">粘进你自己的 AI 对话框就行。这段文字没有发往任何服务器，关掉页面就没了。</p>
    </div>
  </div>
</div>

<script type="application/json" id="take-data">${JSON.stringify(takeData).replace(/</g, "\\u003c")}</script>
<script>
(function () {
  "use strict";
  var TAKE = JSON.parse(document.getElementById("take-data").textContent);
  var box = document.getElementById("takebox");
  var titleEl = document.getElementById("take-title");
  var preEl = document.getElementById("take-text");
  var copyBtn = document.getElementById("take-copy");

  function build(q) {
    return [
      "【问题】" + q.question,
      "",
      "【挂靠】" + q.title + "（" + q.issue + " · " + q.date + "）",
      q.anchorFact,
      "",
      "【最顺口的答案】" + q.quickAnswer,
      "【它不够的地方】" + q.quickAnswerGap,
      "",
      "【被撬开的假设】" + q.assumption,
      "【承重的概念】" + q.concept + "（" + q.discipline + "）—— " + q.conceptNote,
      "",
      "【答完可以改口说】" + q.turn,
      "",
      "【带回去问我的 AI】",
      "1. " + q.probes[0],
      "2. " + q.probes[1],
      "3. " + q.probes[2],
      "",
      "【这个答案什么时候不成立】" + q.boundary,
      "",
      "—— kaixinguor 问题层 · " + q.date,
      "（我自己选的这一问。请先别急着回答，先问我：我觉得最可能的答案是什么，为什么。）"
    ].join("\\n");
  }

  function open(id) {
    var q = TAKE[id];
    if (!q) return;
    titleEl.textContent = q.question;
    preEl.textContent = build(q);
    box.hidden = false;
    document.body.style.overflow = "hidden";
    var card = document.querySelector('[data-id="' + id + '"]');
    if (card) { card.classList.add("is-taken"); var t = card.querySelector(".taken"); if (t) t.hidden = false; }
    copyBtn.textContent = "复制";
  }

  function close() {
    box.hidden = true;
    document.body.style.overflow = "";
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-take]") : null;
    if (btn) { open(btn.getAttribute("data-take")); return; }
    if (e.target === box || e.target.id === "take-close") close();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !box.hidden) close();
  });

  copyBtn.addEventListener("click", function () {
    var text = preEl.textContent;
    function done() {
      copyBtn.textContent = "已复制";
      setTimeout(function () { copyBtn.textContent = "复制"; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (err) { copyBtn.textContent = "请手动选中"; }
      document.body.removeChild(ta);
    }
  });
})();
</script>
<script src="../../site.js?v=6"></script>
</body>
</html>
`;

if (DRY) {
  console.log(`（dry-run）会写 ${path.relative(ROOT, outFile)}`);
  console.log(`  事实层：${issue.count} 条 · 问题：${data.questions.length} 条 · 判掉：${(data.rejected || []).length} 条`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);

console.log(`✓ ${path.relative(ROOT, outFile)}`);
console.log(`  事实层 daily-ai/${date}.html（${issue.count} 条，未改动）`);
console.log(`  问题 ${data.questions.length} 条 · 判掉 ${(data.rejected || []).length} 条`);
