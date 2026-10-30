#!/usr/bin/env node
/* 为 AI 日报生成公众号「图片消息」成品图（本地文件，不上线）。

   输入：一期中文日报 HTML（ai-daily/ 的源稿，或 site/daily/ 的成品页）
   输出：5 张 1080×1440（3:4）排版卡
     wechat/01-cover.png → 05-overview.png
   外加 zip、manifest.json、README.txt，以及可整段复制的
   `公众号-图片消息.md`（标题 / 描述 / 逐图说明 / 发布步骤）。

   规则（不要改回去做 6 张、不要加小红书）：
     - 只服务公众号，小红书图已停做；
     - 固定 5 张：封面 → 3 条重点 → 速览，没有尾页；
     - 标题固定为「AI 日报 · M月D日」，不写期号、不写当天 headline。
   细节见 docs/社交配图规则.md。

   用法：
     node scripts/make-social.mjs ../ai-daily/2026-10-29.html
     node scripts/make-social.mjs daily/2026-10-29.html --out ../ai-daily/social/2026-10-29
     node scripts/make-social.mjs daily/2026-10-29.html --no-zip

   依赖：Python 3 + playwright（chromium）。首次使用：
     python3 -m pip install playwright
     python3 -m playwright install chromium
*/

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseIssue, stripTags } from "./lib/issue.mjs";
import {
  CANVAS,
  WECHAT_SCALE,
  clipProse,
  clipTitle,
  renderCover,
  renderOverview,
  renderStory
} from "./social/template.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SHOT_PY = path.join(HERE, "social", "shot.py");

const args = process.argv.slice(2);
const flags = new Set();
const positional = [];
let outArg = "";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--out") { outArg = args[++i] || ""; continue; }
  if (arg === "--only") {
    const value = (args[++i] || "").toLowerCase();
    if (value === "xhs") {
      console.error(`✗ 小红书图已停做，现在只生成公众号图片消息（5 张）。去掉 --only 即可。`);
      process.exit(1);
    }
    if (!["both", "wechat"].includes(value)) {
      console.error(`✗ --only 现在只接受 wechat（或省略）`);
      process.exit(1);
    }
    continue;
  }
  if (arg.startsWith("--")) { flags.add(arg); continue; }
  positional.push(arg);
}

const sourceArg = positional[0];
if (!sourceArg) {
  console.error(`用法：node scripts/make-social.mjs <中文日报.html> [--out <目录>] [--no-zip] [--keep-html]`);
  process.exit(1);
}

const source = path.resolve(process.cwd(), sourceArg);
if (!fs.existsSync(source)) {
  console.error(`✗ 找不到日报：${source}`);
  process.exit(1);
}

let issue;
try {
  issue = parseIssue(source);
} catch (error) {
  console.error(`✗ 日报解析失败：${error.message}`);
  process.exit(1);
}
if (issue.lang !== "zh") {
  console.log(`! 这是英文版日报，成品图仍按中文版式生成。`);
}

/* 图片底部与图片消息描述里的声明，直接取自当天页面（含“声明”标签），保证和网页一字不差。 */
const DISCLAIMER_FALLBACK =
  "声明 本期内容由 AI Agent 搜索、整理并总结，所有条目均链接原文；事实与数字以原文为准，仅供参考。标题与点评为编辑加工，不代表任何来源立场。";

function readDisclaimer(file) {
  const html = fs.readFileSync(file, "utf8");
  const match = html.match(/<p class="disclaimer">([\s\S]*?)<\/p>/i);
  if (!match) return "";
  return stripTags(match[1]).replace(/\s+/g, " ").trim();
}

issue.disclaimer = readDisclaimer(source) || DISCLAIMER_FALLBACK;

/* ---------- 选 3 条重点：头条 + 与 TL;DR 最匹配的两条 ---------- */

function tokenSet(text) {
  const norm = String(text).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
  const out = new Set();
  for (const run of norm.match(/[\u4e00-\u9fff]+/g) || []) {
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  for (const word of norm.match(/[a-z0-9]{2,}/g) || []) out.add(word);
  return out;
}

function overlap(a, b) {
  let n = 0;
  for (const token of a) if (b.has(token)) n++;
  return n;
}

function tldrTail(html) {
  const bold = html.match(/<b>([\s\S]*?)<\/b>/i);
  return stripTags(html.replace(bold ? bold[0] : "", ""))
    .replace(/^[\s，。；：、,.;:]+/, "")
    .trim();
}

function pickStories(issue) {
  if (!issue.cards.length) return [];
  const tldrs = issue.tldr.map((item) => ({
    html: item.html,
    text: stripTags(item.html),
    tail: tldrTail(item.html)
  }));

  const cardTokens = issue.cards.map((card) => ({
    title: tokenSet(card.titleText),
    summary: tokenSet(card.summary)
  }));

  const scoreFor = (tldrTokens, index) =>
    2 * overlap(tldrTokens, cardTokens[index].title) + overlap(tldrTokens, cardTokens[index].summary);

  const picks = [];
  const usedCards = new Set();
  const usedTldrs = new Set();

  /* 头条永远是第 1 条；找一条最贴近它的 TL;DR 作为摘要。 */
  const headlineIndex = 0;
  let headlineTldr = 0;
  let headlineBest = -1;
  tldrs.forEach((tldr, t) => {
    const score = scoreFor(tokenSet(tldr.text), headlineIndex);
    if (score > headlineBest) { headlineBest = score; headlineTldr = t; }
  });
  picks.push({
    card: issue.cards[headlineIndex],
    tldr: tldrs[headlineTldr] || null
  });
  usedCards.add(headlineIndex);
  if (tldrs[headlineTldr]) usedTldrs.add(headlineTldr);

  /* 其余两条按 TL;DR 顺序找最匹配、且没有用过的卡片。 */
  for (let t = 0; t < tldrs.length && picks.length < 3; t++) {
    if (usedTldrs.has(t)) continue;
    const tokens = tokenSet(tldrs[t].text);
    let best = -1;
    let bestScore = 7;
    issue.cards.forEach((card, index) => {
      if (usedCards.has(index)) return;
      const score = scoreFor(tokens, index);
      if (score > bestScore) { bestScore = score; best = index; }
    });
    if (best !== -1) {
      picks.push({ card: issue.cards[best], tldr: tldrs[t] });
      usedCards.add(best);
      usedTldrs.add(t);
    }
  }

  /* 不够 3 条就按栏目优先级补，尽量分散。 */
  const priority = ["capital", "product", "research", "robot", "model"];
  while (picks.length < Math.min(3, issue.cards.length)) {
    const chaptersUsed = new Set(picks.map((p) => p.card.cat));
    const candidates = issue.cards
      .map((card, index) => ({ card, index }))
      .filter(({ index }) => !usedCards.has(index))
      .sort((a, b) => {
        const ca = chaptersUsed.has(a.card.cat) ? 1 : 0;
        const cb = chaptersUsed.has(b.card.cat) ? 1 : 0;
        if (ca !== cb) return ca - cb;
        return priority.indexOf(a.card.cat) - priority.indexOf(b.card.cat);
      });
    if (!candidates.length) break;
    const next = candidates[0];
    picks.push({ card: next.card, tldr: null });
    usedCards.add(next.index);
  }

  return picks.map(({ card, tldr }) => {
    let summary = stripTags(card.paras.slice(0, 2).join(" ")) || card.summary || "";
    if (summary.length < 90 && tldr && tldr.tail && !summary.includes(tldr.tail.slice(0, 24))) {
      summary = `${summary} ${tldr.tail}`.trim();
    }
    return { card, summary: clipProse(summary, 230) };
  });
}

const stories = pickStories(issue);

/* ---------- 输出目录 ---------- */

const defaultOut = path.resolve(ROOT, "..", "ai-daily", "social", issue.dateISO);
const outDir = outArg ? path.resolve(process.cwd(), outArg) : defaultOut;

if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) {
  const owned = ["manifest.json", "README.txt", "公众号-图片消息.md", "wechat"]
    .some((name) => fs.existsSync(path.join(outDir, name)));
  if (owned || flags.has("--force")) {
    fs.rmSync(outDir, { recursive: true, force: true });
  } else {
    console.error(`✗ 输出目录已存在且不是本工具生成的：${outDir}`);
    console.error(`  换一个 --out，或加 --force 覆盖。`);
    process.exit(1);
  }
}
fs.mkdirSync(outDir, { recursive: true });

const buildDir = path.join(outDir, ".build");
fs.mkdirSync(buildDir, { recursive: true });

/* ---------- 生成 5 张版式：封面 → 3 条重点 → 速览（没有尾页） ---------- */

const designs = [{ name: "01-cover", html: renderCover(issue) }];
stories.forEach((story, index) => {
  const others = stories
    .map((item, order) => ({ rank: order + 1, title: item.card.titleText }))
    .filter((_, order) => order !== index);
  designs.push({
    name: `0${index + 2}-story-${index + 1}`,
    html: renderStory(issue, story, index, stories.length, others)
  });
});
const overviewName = `${String(stories.length + 2).padStart(2, "0")}-overview`;
designs.push({ name: overviewName, html: renderOverview(issue) });

for (const design of designs) {
  fs.writeFileSync(path.join(buildDir, `${design.name}.html`), design.html, "utf8");
}

/* ---------- 调 Playwright 截图 ---------- */

const platforms = [
  { key: "wechat", dir: "wechat", width: CANVAS.width, height: CANVAS.height, scale: WECHAT_SCALE }
];

const jobs = [];
for (const platform of platforms) {
  const dir = path.join(outDir, platform.dir);
  fs.mkdirSync(dir, { recursive: true });
  for (const design of designs) {
    jobs.push({
      html: path.join(buildDir, `${design.name}.html`),
      out: path.join(dir, `${design.name}.png`),
      width: platform.width,
      height: platform.height,
      scale: platform.scale
    });
  }
}

console.log(`\nAI 日报 · ${issue.dateISO} · 第 ${issue.issueNo || "—"} 期`);
console.log(`  ${stories.length} 条重点：${stories.map((s) => clipTitle(s.card.titleText, 36)).join(" / ")}`);
console.log(`  输出：${outDir}`);
console.log(`  共 ${jobs.length} 张（公众号图片消息 1080×1440）`);

const manifestPath = path.join(outDir, ".build", "jobs.json");
fs.writeFileSync(manifestPath, JSON.stringify({ jobs }, null, 2), "utf8");

const render = spawnSync("python3", [SHOT_PY, manifestPath], { stdio: "inherit" });
if (render.error) {
  console.error(`\n✗ 无法启动 python3：${render.error.message}`);
  console.error(`  需要 Python 3 + playwright：python3 -m pip install playwright && python3 -m playwright install chromium`);
  process.exit(1);
}
if (render.status !== 0) {
  console.error(`\n✗ 截图失败。确认已安装 Playwright 的 Chromium：python3 -m playwright install chromium`);
  process.exit(render.status || 1);
}

/* ---------- 校验尺寸（直接读 PNG 头，不依赖 Pillow） ---------- */

function pngSize(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error(`${file} 不是 PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const bad = [];
for (const job of jobs) {
  const want = {
    width: Math.round(job.width * job.scale),
    height: Math.round(job.height * job.scale)
  };
  try {
    const size = pngSize(job.out);
    if (size.width !== want.width || size.height !== want.height) {
      bad.push(`${path.basename(job.out)}: ${size.width}×${size.height}，应为 ${want.width}×${want.height}`);
    }
  } catch (error) {
    bad.push(error.message);
  }
}
if (bad.length) {
  console.error(`\n✗ 图片尺寸校验失败：`);
  for (const line of bad) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`✓ ${jobs.length} 张图片尺寸正确`);

/* ---------- zip ---------- */

const zips = {};
if (!flags.has("--no-zip")) {
  for (const platform of platforms) {
    const dir = path.join(outDir, platform.dir);
    const files = designs.map((d) => `${d.name}.png`);
    const zipName = `AI-Daily-${issue.dateISO}-${platform.key}.zip`;
    const zipPath = path.join(outDir, zipName);
    fs.rmSync(zipPath, { force: true });
    const zip = spawnSync("zip", ["-q", "-j", zipPath, ...files], { cwd: dir });
    if (zip.status === 0) {
      zips[platform.key] = zipName;
      console.log(`✓ 已打包 ${zipName}`);
    } else {
      console.warn(`! zip 打包失败（${zipName}），图片本身已生成。`);
    }
  }
}

/* ---------- 说明文件与 manifest ---------- */

const [y, mo, da] = issue.dateISO.split("-").map(Number);
const wechatTitle = `AI 日报 · ${mo}月${da}日`;
const overviewNo = String(stories.length + 2).padStart(2, "0");

const publishSteps = [
  `1. 电脑端打开 mp.weixin.qq.com → 内容与互动 → 草稿箱 → 新建 → **图片消息**`,
  `2. 把 wechat/ 里的 ${designs.length} 张图一次拖进去，确认顺序是 01 → ${overviewNo}`,
  `3. 填标题和描述，再逐张填说明文字`,
  `4. 点预览，重点看封面裁切和字号是否可读`,
  `5. 选出口：**发表**（生成公开链接，不推送、不占群发次数）或 **群发**（推送粉丝，个人订阅号 1 天 1 次）`
];

const readme = [
  `AI 日报 · ${issue.dateISO} · 第 ${issue.issueNo || "—"} 期`,
  ``,
  `公众号图片消息 ${designs.length} 张（1080×1440，3:4）：wechat/01-cover.png → ${overviewNo}-overview.png`,
  ``,
  `发布顺序：`,
  `  01 封面`,
  ...stories.map((s, i) => `  0${i + 2} 重点 ${i + 1}：${s.card.titleText}`),
  `  ${overviewNo} 速览（${issue.count} 条）`,
  ``,
  `标题（固定格式）：${wechatTitle}`,
  `封面主标题：${issue.headline}`,
  `窗口：${issue.window}（北京时间）`,
  `条数：${issue.count} 条 · 阅读约 ${issue.readMinutes} 分钟`,
  ``,
  `文案见同目录「公众号-图片消息.md」，可直接复制。`,
  `说明：图片只在本地生成，不会提交到站点仓库。改版式后重跑本命令即可覆盖。`
].join("\n");
fs.writeFileSync(path.join(outDir, "README.txt"), `${readme}\n`, "utf8");

const files = designs.map((d) => `wechat/${d.name}.png`);

const captions = [
  `**01 · 封面**`,
  `> ${clipTitle(`AI 日报 · 第 ${issue.issueNo || "—"} 期｜${issue.headline}`, 60)}`,
  ``
];
stories.forEach((story, index) => {
  captions.push(`**0${index + 2} · 重点 ${index + 1}**`);
  captions.push(`> ${clipTitle(story.card.titleText, 60)}`);
  captions.push(``);
});
captions.push(`**${overviewNo} · 速览**`);
captions.push(`> 本期 ${issue.count} 条速览 · 窗口 ${issue.window}`);

const copyFile = [
  `# 公众号「图片消息」发布文案 · ${issue.dateISO}`,
  ``,
  `图片：${files[0]} → ${files[files.length - 1]}（1080×1440，共 ${designs.length} 张，首图自动成为封面）`,
  ``,
  `## 标题（固定格式，直接复制）`,
  ``,
  `\`\`\``,
  wechatTitle,
  `\`\`\``,
  ``,
  `## 描述（复制到正文框）`,
  ``,
  `\`\`\``,
  String(issue.deckText).replace(/\s+/g, " ").replace(/([；。，：、！？])\s+(?=[\u4e00-\u9fff])/g, "$1").trim(),
  ``,
  `窗口：${issue.window}（北京时间）`,
  `本期 ${issue.count} 条 · 阅读约 ${issue.readMinutes} 分钟`,
  ``,
  issue.disclaimer,
  `\`\`\``,
  ``,
  `## 每张图的说明文字`,
  ``,
  ...captions,
  ``,
  `## 发布步骤`,
  ``,
  ...publishSteps,
  ``,
  `## 两个坑`,
  ``,
  `1. **封面会被裁**：首图在信息流里按 1:1 / 16:9 之类的比例展示，原图是 3:4，发前一定在预览里看一眼，必要时调裁剪区。`,
  `2. **不要两版都群发**：个人订阅号一天只有 1 次群发额度；图片版群发，图文版走「发表」留链接。`,
  ``
].join("\n");
fs.writeFileSync(path.join(outDir, "公众号-图片消息.md"), copyFile, "utf8");

const manifest = {
  date: issue.dateISO,
  issue: issue.issueNo || "",
  issueLabel: issue.issueLabel || "",
  wechatTitle,
  platform: "wechat",
  channels: ["wechat-newspic"],
  headline: issue.headline,
  deck: issue.deckText,
  window: issue.window,
  count: issue.count,
  readMinutes: issue.readMinutes,
  stories: stories.map((story, index) => ({
    rank: index + 1,
    title: story.card.titleText,
    chapter: story.card.chapterName,
    source: story.card.sourceName,
    time: story.card.time,
    summary: story.summary,
    why: story.card.why ? stripTags(story.card.why.html) : ""
  })),
  files: {
    wechat: files
  },
  copy: "公众号-图片消息.md",
  zips
};
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

if (!flags.has("--keep-html")) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}

console.log(`\n✓ 成品目录：${outDir}`);
console.log(`  README.txt / manifest.json 已写好，可直接取图或发 zip。`);
