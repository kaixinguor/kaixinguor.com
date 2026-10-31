/* 公众号「图片消息」成品图的 HTML 模板。
   设计语言与站点 style.css 同源：暖纸、墨色、朱红、衬线标题、等宽元信息、发丝线。
   画布固定 1242×1656（3:4），截图时缩放到 1080×1440 输出。 */

import { escapeHtml, stripTags } from "../lib/issue.mjs";

export const CANVAS = { width: 1242, height: 1656 };
export const WECHAT_SCALE = 1080 / 1242;

export const CHAPTER_COLORS = {
  model: "#a83a1e",
  product: "#2f5d8a",
  research: "#2e6b5e",
  robot: "#7a4553",
  capital: "#8a6a1f"
};

const WEEKDAY_ZH = {
  SUN: "周日",
  MON: "周一",
  TUE: "周二",
  WED: "周三",
  THU: "周四",
  FRI: "周五",
  SAT: "周六"
};

/** 把相邻的英文/数字词用不换行空格连起来，避免 "Gemini 4 / Carbon" 这种断行。 */
export function tightenLatin(text = "") {
  const word = "[A-Za-z0-9][A-Za-z0-9.+#%/–—-]*";
  const re = new RegExp(`(${word})\\s+(?=${word})`, "g");
  return String(text)
    .replace(re, "$1\u00a0")
    .replace(/([A-Za-z0-9])([-/–—])(?=[A-Za-z0-9])/g, "$1$2\u2060");
}

/** 给常用多字词加 word joiner，避免 "现金流 / 资本开 / 支" 这种断法。 */
const CJK_TERMS = [
  "自由现金流", "资本开支", "基础设施", "人工智能", "具身智能", "网络安全", "智能体", "大模型",
  "现金流", "机器人", "芯片", "模型", "收入", "利润", "融资", "投资", "数据",
  "安全", "能力", "市场", "财报", "股价", "发布", "计划", "采购", "收购",
  "转负", "营收", "增速", "净利"
];
const CJK_RE = new RegExp(CJK_TERMS.join("|"), "g");

export function protectCjk(text = "") {
  return String(text).replace(CJK_RE, (match) => Array.from(match).join("\u2060"));
}

/** 标题截断：不留半句和悬空标点，统一补省略号。 */
export function clipTitle(text = "", max = 60) {
  const src = String(text).replace(/\s+/g, " ").trim();
  if (src.length <= max) return src;
  return src.slice(0, max).replace(/[，。；：、,.;:\s]+$/, "") + "…";
}

/** 正文截断：优先在句号处收尾；做不到才补省略号，避免 "…认购，" 这种断法。 */
export function clipProse(text = "", max = 160) {
  const src = String(text).replace(/\s+/g, " ").trim();
  if (src.length <= max) return src;
  const head = src.slice(0, max);
  const marks = ["。", "！", "？", "!", "?"];
  let at = -1;
  for (const mark of marks) at = Math.max(at, head.lastIndexOf(mark));
  if (at > max * 0.55) return head.slice(0, at + 1);
  return head.replace(/[，。；：、,.;:\s]+$/, "") + "…";
}

/** 看点截断：优先在句号处收尾，其次在分号/逗号处收尾，最后才补省略号。
    上限按 4 行 × 约 29 字估算，保证排版不被 CSS 从句子中间切掉。 */
export function clipWhy(text = "", max = 172) {
  const src = String(text).replace(/\s+/g, " ").trim();
  if (src.length <= max) return src;
  const head = src.slice(0, max);
  const stops = ["。", "！", "？", "!", "?"];
  let at = -1;
  for (const mark of stops) at = Math.max(at, head.lastIndexOf(mark));
  if (at > max * 0.45) return head.slice(0, at + 1);
  const soft = ["；", ";", "，", ","];
  let softAt = -1;
  for (const mark of soft) softAt = Math.max(softAt, head.lastIndexOf(mark));
  if (softAt > max * 0.6) return head.slice(0, softAt).replace(/[，,；;\s]+$/, "") + "…";
  const cut = head.lastIndexOf(" ");
  return (cut > max * 0.6 ? head.slice(0, cut) : head).replace(/[，。；：、,.;:\s]+$/, "") + "…";
}

function dateParts(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return {
    year: String(year),
    month: String(month).padStart(2, "0"),
    day: String(day).padStart(2, "0"),
    dotted: `${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`,
    compact: `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`
  };
}

function weekdayZh(issue) {
  return WEEKDAY_ZH[issue.weekday] || issue.weekday;
}

function chapterColor(card) {
  return CHAPTER_COLORS[card.cat] || "#b23a1e";
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --paper:#f7f3ed;--paper-2:#fffdf9;--ink:#16120e;--ink-2:#413a33;--muted:#7d7368;
  --line:#ddd2c2;--line-soft:#e9e1d4;--accent:#b23a1e;
  --serif:"Songti SC","Noto Serif CJK SC","Source Han Serif SC","Noto Serif SC",Georgia,serif;
  --sans:"PingFang SC","Noto Sans CJK SC","Source Han Sans SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  --mono:"SF Mono",ui-monospace,Menlo,Consolas,"Liberation Mono",monospace;
}
html,body{width:1242px;height:1656px}
body{
  background:var(--paper);color:var(--ink);font-family:var(--sans);
  overflow:hidden;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;
}
.page{
  position:relative;width:1242px;height:1656px;padding:62px 78px 52px;
  display:flex;flex-direction:column;overflow:hidden;
}
.page::before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(900px 620px at 88% -6%, rgba(178,58,30,.05), transparent 62%),
    radial-gradient(700px 520px at -10% 104%, rgba(47,93,138,.035), transparent 64%);
}
.top{
  position:relative;z-index:3;display:flex;align-items:flex-end;justify-content:space-between;
  padding-bottom:15px;border-bottom:3px solid var(--ink);flex:none;
}
.brand{display:flex;align-items:baseline;gap:13px}
.brand .cn{font-family:var(--serif);font-weight:700;font-size:38px;letter-spacing:.05em;line-height:1}
.brand .en{font-family:var(--mono);font-size:14px;letter-spacing:.22em;color:var(--muted);text-transform:uppercase}
.issue{font-family:var(--mono);font-size:16px;letter-spacing:.13em;color:var(--ink-2);white-space:nowrap}
.issue b{color:var(--accent);font-weight:700}
.foot{
  position:relative;z-index:3;display:flex;justify-content:space-between;align-items:center;
  margin-top:18px;padding-top:15px;border-top:1px solid var(--line);
  font-family:var(--mono);font-size:15px;letter-spacing:.09em;color:var(--muted);flex:none;
}
.foot .url{color:var(--ink-2)}

/* ---------- 封面 ---------- */
.cover-main{position:relative;z-index:2;display:flex;flex-direction:column;flex:1;min-height:0;padding-top:40px}
.dateline{display:flex;align-items:baseline;gap:13px;font-family:var(--mono);font-size:20px;letter-spacing:.22em;color:var(--ink-2)}
.dateline .wd{color:var(--accent);font-weight:700}
.dateline .bar{display:inline-block;width:44px;height:2px;background:var(--accent);transform:translateY(-5px)}
.date-big{
  font-family:var(--serif);font-weight:700;font-size:300px;line-height:.9;letter-spacing:-.06em;
  margin:4px 0 28px;white-space:nowrap;
}
.date-big .dot{color:var(--accent)}
.date-big .small{font-size:96px;letter-spacing:0;color:var(--muted);margin-left:18px}
.rule{width:126px;height:9px;background:var(--accent);margin-bottom:32px;flex:none}
.headline{
  font-family:var(--serif);font-weight:700;font-size:82px;line-height:1.19;letter-spacing:-.012em;
  max-height:4.76em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;
  text-wrap:balance;
}
.deck{
  margin-top:28px;font-size:29px;line-height:1.72;color:var(--ink-2);
  max-height:12.04em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:7;
  text-wrap:pretty;
}
.cover-foot{margin-top:auto;flex:none}
.cover-note{
  margin:0 0 18px;padding-top:16px;border-top:1px solid var(--line);
  font-size:20px;line-height:1.62;color:var(--muted);max-width:1000px;
}
.cover-note b{
  margin-right:.5em;color:var(--accent);font-family:var(--mono);font-weight:400;
  font-size:.82em;letter-spacing:.12em;text-transform:uppercase;
}
.cover-stats{
  display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  font-family:var(--mono);font-size:16px;letter-spacing:.07em;color:var(--muted);
  padding-bottom:16px;
}
.cover-stats .pill{border:1px solid var(--line);background:rgba(255,253,249,.6);padding:8px 13px;border-radius:2px}
.cover-stats .sep{opacity:.5}
.watermark{
  position:absolute;z-index:0;right:-30px;bottom:88px;font-family:var(--serif);font-weight:700;
  font-size:430px;line-height:.8;letter-spacing:-.07em;color:rgba(178,58,30,.055);white-space:nowrap;
}

/* ---------- 重点新闻 ---------- */
.story-top{
  position:relative;z-index:3;display:flex;align-items:center;justify-content:space-between;
  margin-top:32px;padding-bottom:20px;border-bottom:1px solid var(--line);flex:none;
}
.chap{display:flex;align-items:center;gap:18px;min-width:0}
.chap .no{
  font-family:var(--mono);font-size:17px;letter-spacing:.08em;color:#fff;background:var(--c);
  padding:8px 10px;border-radius:2px;line-height:1;flex:none;
}
.chap .name{font-family:var(--serif);font-size:40px;font-weight:700;line-height:1;white-space:nowrap}
.chap .en{font-family:var(--mono);font-size:14px;letter-spacing:.18em;color:var(--muted);text-transform:uppercase;padding-top:5px;white-space:nowrap}
.story-idx{font-family:var(--mono);font-size:16px;letter-spacing:.13em;color:var(--muted);white-space:nowrap}
.story-body{position:relative;z-index:2;display:flex;flex-direction:column;flex:1;min-height:0;padding-top:34px}
.cmeta{display:flex;align-items:center;gap:12px;font-family:var(--mono);font-size:16px;letter-spacing:.08em;color:var(--muted)}
.cmeta .src{color:var(--ink-2)}
.cmeta .dot{width:4px;height:4px;border-radius:50%;background:var(--accent)}
.story-title{
  font-family:var(--serif);font-weight:700;font-size:76px;line-height:1.21;margin-top:16px;
  max-height:3.63em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;
  text-wrap:balance;
}
.story-sum{
  font-size:33px;line-height:1.78;color:var(--ink-2);margin-top:26px;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;
  text-wrap:pretty;
}
.why{
  margin-top:34px;background:rgba(255,253,249,.78);border-left:5px solid var(--c);
  padding:26px 30px 28px;border-radius:2px;
}
.why .lab{font-family:var(--mono);font-size:15px;letter-spacing:.2em;color:var(--c);font-weight:700;margin-bottom:10px}
.why p{
  font-size:30px;line-height:1.74;color:var(--ink-2);
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;
  text-wrap:pretty;
}
.also{margin-top:auto;padding-top:20px;border-top:1px solid var(--line)}
.also-h{font-family:var(--mono);font-size:14px;letter-spacing:.22em;color:var(--accent);font-weight:700;margin-bottom:12px}
.also-item{display:flex;gap:14px;align-items:baseline;padding:7px 0}
.also-item .k{font-family:var(--mono);font-size:14px;color:var(--muted);flex:none}
.also-item .t{
  font-family:var(--serif);font-size:25px;line-height:1.5;font-weight:600;color:var(--ink-2);
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;
}
.story-wm{
  position:absolute;z-index:0;right:-18px;bottom:118px;font-family:var(--serif);font-weight:700;
  font-size:520px;line-height:.78;letter-spacing:-.08em;color:rgba(22,18,14,.045);white-space:nowrap;
}

/* ---------- 速览 ---------- */
.overview-head{position:relative;z-index:2;padding-top:38px;flex:none}
.overview-head h1{font-family:var(--serif);font-weight:700;font-size:104px;line-height:1.04;letter-spacing:-.02em;text-wrap:balance}
.overview-head h1 em{font-style:normal;color:var(--accent)}
.overview-sub{margin-top:12px;font-family:var(--mono);font-size:16px;letter-spacing:.1em;color:var(--muted)}
.list{
  list-style:none;position:relative;z-index:2;display:flex;flex-direction:column;flex:1;min-height:0;margin-top:26px;
}
.list li{display:flex;align-items:stretch;gap:16px;padding:12px 0;border-top:1px solid var(--line);min-height:0;flex:1}
.list li:first-child{border-top:2px solid var(--ink)}
.list .n{font-family:var(--mono);font-size:16px;color:var(--muted);padding-top:5px;width:28px;flex:none;letter-spacing:.04em}
.list .bar{width:5px;background:var(--c);flex:none;border-radius:1px}
.list .body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
.list .lt{
  font-family:var(--serif);font-size:33px;line-height:1.42;font-weight:700;
  max-height:2.84em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  text-wrap:balance;
}
.list .lm{margin-top:7px;font-family:var(--mono);font-size:13px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
.list .lm .c{color:var(--c)}

`;

/** 把“声明 / Disclaimer”标签拆出来做朱红小字，正文保持与网页一字不差。 */
function disclaimerHtml(issue) {
  const text = String(issue.disclaimer || "").trim();
  if (!text) return "";
  const match = text.match(/^(声明|Disclaimer)\s*/i);
  if (!match) return escapeHtml(text);
  return `<b>${escapeHtml(match[1])}</b>${escapeHtml(text.slice(match[0].length))}`;
}

function shell(issue, { body, cat = "", cls = "", footLeft = "", footRight = "" }) {
  const color = CHAPTER_COLORS[cat] || "#b23a1e";
  const brandZh = issue.brandZh || "AI 日报";
  const brandEn = issue.brandEn || "Daily AI Brief";
  const foot = footLeft || footRight
    ? `<footer class="foot"><span>${footLeft}</span><span class="url">${footRight}</span></footer>`
    : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(brandZh)} ${escapeHtml(issue.dateISO)}</title>
<style>${CSS}</style>
</head>
<body style="--c:${color}">
<div class="page ${cls}">
  <header class="top">
    <div class="brand"><span class="cn">${escapeHtml(brandZh)}</span><span class="en">${escapeHtml(brandEn)}</span></div>
    <div class="issue">第 <b>${escapeHtml(issue.issueNo || "—")}</b> 期 · ${escapeHtml(issue.dateDot)}</div>
  </header>
  ${body}
  ${foot}
</div>
</body>
</html>`;
}

export function renderCover(issue) {
  const d = dateParts(issue.dateISO);
  const body = `
  <main class="cover-main">
    <div class="dateline"><span>${d.year}</span><span class="bar"></span><span>${d.month} / ${d.day}</span><span>·</span><span class="wd">${weekdayZh(issue)}</span></div>
    <div class="date-big">${d.month}<span class="dot">.</span>${d.day}<span class="small">${d.year}</span></div>
    <div class="rule"></div>
    <h1 class="headline">${escapeHtml(protectCjk(tightenLatin(clipTitle(issue.headline, 96))))}</h1>
    <p class="deck">${escapeHtml(tightenLatin(issue.deckText))}</p>
    <div class="cover-foot">
      <p class="cover-note">${disclaimerHtml(issue)}</p>
      <div class="cover-stats">
        <span class="pill">24 小时窗口</span>
        <span>${escapeHtml(issue.window)}</span>
        <span class="sep">/</span>
        <span>${issue.count} 条</span>
        <span class="sep">/</span>
        <span>阅读约 ${issue.readMinutes} 分钟</span>
      </div>
    </div>
  </main>
  <div class="watermark">${escapeHtml(issue.issueNo || "")}</div>`;
  return shell(issue, {
    body,
    cls: "cover",
    footLeft: `${issue.brandZh || "AI 日报"} · 第 ${issue.issueNo || "—"} 期`,
    footRight: `kaixinguor.com · ${d.compact}`
  });
}

export function renderStory(issue, story, index, total, others = []) {
  const d = dateParts(issue.dateISO);
  const { card, summary } = story;
  const why = card.why ? stripTags(card.why.html) : "";
  const color = chapterColor(card);
  const body = `
  <div class="story-top">
    <div class="chap">
      <span class="no">${escapeHtml(card.cnum)}</span>
      <span class="name">${escapeHtml(card.chapterName)}</span>
      <span class="en">${escapeHtml(card.chapterEn)}</span>
    </div>
    <div class="story-idx">重点 ${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
  </div>
  <main class="story-body">
    <div class="cmeta"><span>${escapeHtml(card.time || d.month + "/" + d.day)}</span><span class="dot"></span><span class="src">${escapeHtml(card.sourceName || "综合报道")}</span></div>
    <h1 class="story-title">${escapeHtml(protectCjk(tightenLatin(clipTitle(card.titleText, 64))))}</h1>
    <p class="story-sum">${escapeHtml(tightenLatin(clipProse(summary, 166)))}</p>
    ${why ? `<div class="why"><div class="lab">看点 / WHY IT MATTERS</div><p>${escapeHtml(tightenLatin(clipWhy(why, 172)))}</p></div>` : ""}
    ${others.length ? `<div class="also">
      <div class="also-h">本 期 还 有</div>
      ${others.map((item) => `<div class="also-item"><span class="k">${String(item.rank).padStart(2, "0")}</span><span class="t">${escapeHtml(protectCjk(tightenLatin(clipTitle(item.title, 40))))}</span></div>`).join("\n      ")}
    </div>` : ""}
  </main>
  <div class="story-wm">${escapeHtml(card.cnum)}</div>`;
  return shell(issue, {
    body,
    cat: card.cat,
    cls: "story",
    footLeft: `${issue.brandZh || "AI 日报"} · 第 ${issue.issueNo || "—"} 期 · ${escapeHtml(card.chapterName)}`,
    footRight: `重点 ${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")} · ${d.compact}`
  });
}

export function renderOverview(issue) {
  const d = dateParts(issue.dateISO);
  const rows = issue.cards.map((card, i) => {
    const color = chapterColor(card);
    return `<li style="--c:${color}">
      <span class="n">${String(i + 1).padStart(2, "0")}</span>
      <span class="bar"></span>
      <span class="body">
        <span class="lt">${escapeHtml(protectCjk(tightenLatin(clipTitle(card.titleText, 60))))}</span>
        <span class="lm"><span class="c">${escapeHtml(card.chapterName)}</span> · ${escapeHtml(card.time || d.month + "/" + d.day)} · ${escapeHtml(card.sourceName || "")}</span>
      </span>
    </li>`;
  }).join("\n");
  const body = `
  <div class="overview-head">
    <h1>今天，<em>${issue.count}</em> 条</h1>
    <div class="overview-sub">24 小时窗口 · ${escapeHtml(issue.window)} · 阅读约 ${issue.readMinutes} 分钟</div>
  </div>
  <ol class="list">${rows}</ol>`;
  return shell(issue, {
    body,
    cls: "overview",
    footLeft: `${issue.brandZh || "AI 日报"} · 第 ${issue.issueNo || "—"} 期`,
    footRight: `速览 · ${d.compact} · kaixinguor.com`
  });
}
