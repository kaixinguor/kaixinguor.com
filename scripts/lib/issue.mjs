/* 日报内容解析与渲染。
   输入：一期日报 HTML（可以是 ai-daily/ 里自包含的母版，也可以是 daily/ 里已生成的页面）。
   输出：统一结构 + 站点版本的日报页 / 首页今日区 / 归档行 / RSS。
   只依赖 Node 内置模块，不需要安装任何东西。 */

import fs from "node:fs";
import path from "node:path";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  mdash: "—", ndash: "–", hellip: "…", middot: "·", times: "×",
  copy: "©", reg: "®", trade: "™", deg: "°", euro: "€", pound: "£", yen: "¥"
};

export function decodeEntities(str = "") {
  return String(str).replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (m, code) => {
    if (code[0] === "#") {
      const n = code[1] && code[1].toLowerCase() === "x"
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      if (Number.isFinite(n)) {
        try { return String.fromCodePoint(n); } catch (e) { return m; }
      }
      return m;
    }
    const named = NAMED_ENTITIES[code.toLowerCase()];
    return named === undefined ? m : named;
  });
}

export function stripTags(html = "") {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      // 块级标签换成空格；<em>/<b> 这类行内标签直接去掉，避免中文里多出空格
      .replace(/<\/(p|div|li|h[1-6]|section|article|blockquote|tr|td|th|ul|ol)>/gi, " ")
      .replace(/<[^>]+>/g, "")
  ).replace(/\s+/g, " ").trim();
}

export function cleanInline(html = "") {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(str = "", max = 160) {
  const text = String(str).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  // 英文尽量在空格处断，别把单词切成 "mem..."
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  return cut.replace(/[，。；：、,.;:\s]+$/, "") + "…";
}

function firstMatch(re, str) {
  const m = re.exec(str);
  return m ? m[1] : "";
}

function allMatches(re, str) {
  const out = [];
  let m;
  while ((m = re.exec(str)) !== null) out.push(m);
  return out;
}

function weekdayFor(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function displayDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

function displayDateEn(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS_EN[m - 1]} ${d}, ${y}`;
}

function dotDate(iso) {
  return iso.replace(/-/g, ".");
}

function monthLabel(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${y} 年 ${m} 月`;
}

function monthLabelEn(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS_EN[m - 1]} ${y}`;
}

function isoFromFilename(file) {
  const base = path.basename(file);
  const m = base.match(/(20\d{2}-\d{2}-\d{2})/);
  if (!m) return null;
  const iso = m[1];
  const [y, mo, d] = iso.split("-").map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return iso;
}

function extractPillText(metabar) {
  const m = metabar.match(/<span class="pill">([\s\S]*?)<\/span>/);
  return m ? stripTags(m[1]) : "";
}

function parseIssueNumber(text, iso) {
  const zh = String(text).match(/第\s*0*(\d+)\s*期/);
  if (zh) {
    const no = String(Number(zh[1])).padStart(3, "0");
    return { issueNo: no, issueLabel: `第 ${no} 期` };
  }
  const en = String(text).match(/\bIssue\s*#?\s*0*(\d+)/i);
  if (en) {
    const no = String(Number(en[1])).padStart(3, "0");
    return { issueNo: no, issueLabel: `Issue ${no}` };
  }
  return { issueNo: null, issueLabel: "" };
}

function parseFooter(html) {
  let block = firstMatch(/<footer[^>]*class="[^"]*issue-footer[^"]*"[^>]*>([\s\S]*?)<\/footer>/i, html);
  if (!block) block = firstMatch(/<footer(?![^>]*class="[^"]*site[^"]*")[^>]*>([\s\S]*?)<\/footer>/i, html);
  if (!block) return "";
  const inner = firstMatch(/<div class="wrap">([\s\S]*?)<\/div>/i, block) || block;
  return cleanInline(inner).trim();
}

function parseTldr(html) {
  const block = firstMatch(/<ol class="tldr"[^>]*>([\s\S]*?)<\/ol>/i, html);
  if (!block) return [];
  const items = [];
  const re = /<li>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    const li = m[1];
    const idx = stripTags(firstMatch(/<span class="idx">([\s\S]*?)<\/span>/i, li));
    const body = firstMatch(/<p>([\s\S]*?)<\/p>/i, li) || li;
    if (stripTags(body)) items.push({ idx: idx || String(items.length + 1).padStart(2, "0"), html: cleanInline(body).trim() });
  }
  return items;
}

function parseCard(raw, chapter) {
  const classAttr = raw.attr || "";
  const extraClass = classAttr
    .replace(/\bcard\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const cmeta = firstMatch(/<div class="cmeta">([\s\S]*?)<\/div>/i, raw.body);
  const time = stripTags(firstMatch(/<span class="d">([\s\S]*?)<\/span>/i, cmeta));
  const srcMatch = cmeta.match(/<a class="src" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
  const sourceUrl = srcMatch ? decodeEntities(srcMatch[1]).trim() : "";
  const sourceName = srcMatch ? stripTags(srcMatch[2]).replace(/[↗↑→\s]+$/g, "").trim() : "";

  const titleHtml = cleanInline(firstMatch(/<h3>([\s\S]*?)<\/h3>/i, raw.body)).trim();
  const titleText = stripTags(titleHtml);

  let why = null;
  const whyMatch = raw.body.match(/<p class="why">([\s\S]*?)<\/p>/i);
  if (whyMatch) {
    const whyRaw = whyMatch[1];
    const label = stripTags(firstMatch(/<b>([\s\S]*?)<\/b>/i, whyRaw)) || "看点";
    const whyHtml = cleanInline(whyRaw.replace(/<b>[\s\S]*?<\/b>/i, "")).trim();
    if (stripTags(whyHtml)) why = { label, html: whyHtml };
  }

  const bodyNoWhy = whyMatch ? raw.body.replace(whyMatch[0], "") : raw.body;
  const paras = allMatches(/<p>([\s\S]*?)<\/p>/gi, bodyNoWhy)
    .map((m) => cleanInline(m[1]).trim())
    .filter((p) => stripTags(p));

  const summary = stripTags(paras[0] || "");

  return {
    extraClass,
    cat: chapter.cat,
    chapterName: chapter.name,
    chapterEn: chapter.en,
    cnum: chapter.cnum,
    time,
    sourceUrl,
    sourceName,
    titleHtml,
    titleText,
    paras,
    summary,
    why
  };
}

function parseChapters(html) {
  const chapters = [];
  const re = /<section class="chapter"([^>]*)>([\s\S]*?)<\/section>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const id = firstMatch(/\bid="([^"]*)"/i, attrs) || `chapter-${chapters.length + 1}`;
    const cat = firstMatch(/\bdata-c="([^"]*)"/i, attrs) || "";
    const cnum = stripTags(firstMatch(/<span class="cnum">([\s\S]*?)<\/span>/i, body)) || String(chapters.length + 1).padStart(2, "0");
    const name = stripTags(firstMatch(/<h2>([\s\S]*?)<\/h2>/i, body));
    const en = stripTags(firstMatch(/<span class="cen">([\s\S]*?)<\/span>/i, body));
    const chapter = { id, cat, cnum, name, en, cards: [] };

    // 不能先截 <div class="items">：卡片内部还有 <div class="cmeta">，
    // 非贪婪匹配会在第一个 </div> 处截断。直接在整段 chapter 里找 <article>。
    const cardRe = /<article class="card([^"]*)"([^>]*)>([\s\S]*?)<\/article>/gi;
    let cm;
    while ((cm = cardRe.exec(body)) !== null) {
      chapter.cards.push(parseCard({ attr: cm[1], body: cm[3] }, chapter));
    }
    if (chapter.cards.length) chapters.push(chapter);
  }
  return chapters;
}

export function parseIssue(file) {
  const html = fs.readFileSync(file, "utf8");
  const iso = isoFromFilename(file);
  if (!iso) throw new Error(`${file}: 文件名里找不到 YYYY-MM-DD 日期`);

  const htmlLang = firstMatch(/<html[^>]*\blang="([^"]+)"/i, html);
  const lang = /^en\b/i.test(htmlLang) || /-en\.html$/i.test(file) ? "en" : "zh";
  const isEn = lang === "en";

  const title = stripTags(firstMatch(/<title>([\s\S]*?)<\/title>/i, html)) ||
    (isEn ? `AI Daily · ${displayDateEn(iso)}` : `AI 日报 · ${displayDate(iso)}`);
  const description = decodeEntities(firstMatch(/<meta name="description" content="([^"]*)"/i, html));

  const masthead = firstMatch(/<header class="masthead"[^>]*>([\s\S]*?)<\/header>/i, html);
  const kickerHtml = cleanInline(firstMatch(/<div class="kicker">([\s\S]*?)<\/div>/i, masthead)).trim();
  const dateHtml = firstMatch(/<h1 class="date">([\s\S]*?)<\/h1>/i, masthead);
  const weekday = stripTags(firstMatch(/<span class="weekday">([\s\S]*?)<\/span>/i, dateHtml)).toUpperCase();
  const sourceDateDisplay = stripTags(dateHtml.replace(/<span class="weekday">[\s\S]*?<\/span>/i, ""));
  const dateDisplay = sourceDateDisplay || (isEn ? displayDateEn(iso) : displayDate(iso));
  const deckHtml = cleanInline(firstMatch(/<p class="deck">([\s\S]*?)<\/p>/i, masthead)).trim();
  const deckText = stripTags(deckHtml);
  const metabarHtml = cleanInline(firstMatch(/<div class="metabar">([\s\S]*?)<\/div>/i, masthead)).trim();

  const pillText = extractPillText(metabarHtml);
  const parsedNo = parseIssueNumber(pillText || title, iso);
  const issueNo = parsedNo.issueNo;
  const issueLabel = parsedNo.issueLabel;

  const window = stripTags(firstMatch(/<span>(?:窗口|Window)\s*([\s\S]*?)<\/span>/i, metabarHtml)) ||
    stripTags(firstMatch(/(?:窗口|Window)\s*([^<]+)/i, metabarHtml));
  const readMinutesMatch = metabarHtml.match(/阅读约\s*(\d+)\s*分钟|(\d+)\s*min(?:ute)?s?\s+read/i);
  const readMinutes = readMinutesMatch ? Number(readMinutesMatch[1] || readMinutesMatch[2]) : 0;

  let tldr = parseTldr(html);
  const chapters = parseChapters(html);
  const cards = chapters.flatMap((chapter) => chapter.cards);

  if (!cards.length) throw new Error(`${file}: 没有解析到任何 <article class="card">，是不是版式变了？`);

  if (!tldr.length) {
    const period = isEn ? "." : "。";
    tldr = cards.slice(0, 3).map((card, i) => ({
      idx: String(i + 1).padStart(2, "0"),
      html: `<b>${escapeHtml(card.titleText)}${period}</b>${escapeHtml(truncate(card.summary, isEn ? 120 : 96))}`
    }));
  }

  const footerHtml = parseFooter(html);
  const sigText = stripTags(firstMatch(/<p class="sig">([\s\S]*?)<\/p>/i, footerHtml));
  const generatedAt = firstMatch(/Generated\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})/i, sigText) || "";

  const links = [...new Set(
    allMatches(/href="(https?:\/\/[^"]+)"/gi, html).map((m) => decodeEntities(m[1]))
  )];

  const count = cards.length;
  const fallbackRead = Math.max(1, Math.round(count * 0.7));
  const finalRead = readMinutes || fallbackRead;

  const metaWindow = window || (isEn ? `${dateDisplay} ± 24 hours` : `${dateDisplay} 前后 24 小时`);
  const finalMetabar = metabarHtml || (isEn ? [
    issueLabel ? `<span class="pill">${escapeHtml(issueLabel)}</span>` : "",
    issueLabel ? `<span class="dot"></span>` : "",
    `<span>Window ${escapeHtml(metaWindow)}</span>`,
    `<span class="dot"></span>`,
    `<span>${count} items</span>`,
    `<span class="dot"></span>`,
    `<span>${finalRead} min read</span>`
  ].filter(Boolean).join("") : [
    issueLabel ? `<span class="pill">${escapeHtml(issueLabel)}</span>` : "",
    issueLabel ? `<span class="dot"></span>` : "",
    `<span>窗口 ${escapeHtml(metaWindow)}</span>`,
    `<span class="dot"></span>`,
    `<span>${count} 条</span>`,
    `<span class="dot"></span>`,
    `<span>阅读约 ${finalRead} 分钟</span>`
  ].filter(Boolean).join(""));

  const finalFooter = footerHtml || (isEn ? [
    `<p>This issue covers reports published between ${escapeHtml(metaWindow)} (UTC+8): ${count} items.</p>`,
    `<p>Every item links to the original report; facts and figures follow the original. Headlines and commentary are edited.</p>`,
    `<p class="sig">AI Daily · Issue ${issueNo || "—"} · 24h window · Generated ${escapeHtml(generatedAt || dateDisplay)}</p>`
  ].join("\n    ") : [
    `<p>本期收录 ${escapeHtml(metaWindow)}（北京时间）之间发布的报道，共 ${count} 条。</p>`,
    `<p>所有条目均链接原文，事实与数字以原文为准。标题与点评为编辑加工。</p>`,
    `<p class="sig">AI Daily · Issue ${issueNo || "—"} · 24h window · Generated ${escapeHtml(generatedAt || dateDisplay)}</p>`
  ].join("\n    "));

  return {
    file,
    lang,
    dateISO: iso,
    dateDisplay,
    dateDot: dotDate(iso),
    monthLabel: monthLabel(iso),
    monthLabelEn: monthLabelEn(iso),
    weekday: weekday || weekdayFor(iso),
    title,
    description: description || deckText,
    kickerHtml,
    deckHtml,
    deckText,
    metabarHtml: finalMetabar,
    issueNo,
    issueLabel,
    window: metaWindow,
    count,
    readMinutes: finalRead,
    generatedAt,
    tldr,
    chapters,
    cards,
    footerHtml: finalFooter,
    links,
    headline: cards[0] ? cards[0].titleText : ""
  };
}

/* ---------- 渲染 ---------- */

function renderCard(card) {
  const source = card.sourceName
    ? `<a class="src" href="${escapeHtml(card.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.sourceName)} ↗</a>`
    : "";
  const paras = card.paras.map((p) => `        <p>${p}</p>`).join("\n");
  const why = card.why
    ? `\n        <p class="why"><b>${escapeHtml(card.why.label)}</b>${card.why.html}</p>`
    : "";
  const extra = card.extraClass ? ` ${card.extraClass}` : "";
  return `      <article class="card${extra}">
        <div class="cmeta">
          <span class="d">${escapeHtml(card.time)}</span>
          ${source}
        </div>
        <h3>${card.titleHtml}</h3>
${paras}${why}
      </article>`;
}

export function renderChapters(issue, suffix = "") {
  const idSuffix = escapeHtml(suffix);
  return issue.chapters.map((chapter) => `  <section class="chapter" id="${escapeHtml(chapter.id)}${idSuffix}" data-c="${escapeHtml(chapter.cat)}">
    <div class="chead">
      <span class="cnum">${escapeHtml(chapter.cnum)}</span>
      <h2>${escapeHtml(chapter.name)}</h2>
      <span class="cen">${escapeHtml(chapter.en)}</span>
      <span class="crule"></span>
    </div>
    <div class="items">

${chapter.cards.map(renderCard).join("\n\n")}

    </div>
  </section>`).join("\n\n");
}

const LOCALES = {
  zh: {
    htmlLang: "zh-CN",
    navDaily: "日报",
    navTools: "工具",
    navArchive: "归档",
    navWish: "许愿",
    themeToggle: "切换深浅色",
    skip: "跳到正文",
    kicker: "AI 日报",
    kickerEn: "Daily AI Brief",
    tocLabel: "栏目",
    tldr: "速览",
    lead: "今日头条",
    leadEn: "Today's Lead",
    readFull: "读完整份日报",
    itemsLabel: (n) => `${n} 条`,
    readLabel: (n) => `约 ${n} 分钟`,
    archiveEmpty: "还没有往期。",
    footTagline: "一个人做的小工具。从许愿到交付。",
    footPrivacy: "隐私",
    footDaily: "AI 日报 · 每天更新",
    switchLabel: "EN",
    switchLang: "en",
    switchHreflang: "en",
    rssZh: "AI 日报（中文）",
    rssEn: "AI Daily (English)"
  },
  en: {
    htmlLang: "en",
    navDaily: "Daily",
    navTools: "Tools",
    navArchive: "Archive",
    navWish: "Wish",
    themeToggle: "Toggle theme",
    skip: "Skip to content",
    kicker: "AI DAILY",
    kickerEn: "Daily AI Brief",
    tocLabel: "Sections",
    tldr: "At a glance",
    lead: "Today's lead",
    leadEn: "Today's Lead",
    readFull: "Read the full issue",
    itemsLabel: (n) => `${n} items`,
    readLabel: (n) => `${n} min read`,
    archiveEmpty: "No English editions yet.",
    footTagline: "Small tools, made by one person.",
    footPrivacy: "Privacy",
    footDaily: "AI Daily · updated whenever there is news",
    switchLabel: "中文",
    switchLang: "zh",
    switchHreflang: "zh-CN",
    rssZh: "AI Daily (Chinese)",
    rssEn: "AI Daily (English)"
  }
};

export function renderToc(issue, tldrId = "tldr", suffix = "") {
  const loc = LOCALES[issue.lang] || LOCALES.zh;
  const idSuffix = escapeHtml(suffix);
  const tldr = `<a href="#${escapeHtml(tldrId)}"><span class="n">00</span>${loc.tldr}</a>`;
  const chapters = issue.chapters.map((chapter) =>
    `<a href="#${escapeHtml(chapter.id)}${idSuffix}"><span class="n">${escapeHtml(chapter.cnum)}</span>${escapeHtml(chapter.name)}</a>`
  );
  return [tldr, ...chapters].join("\n        ");
}

export function renderTldr(issue) {
  return issue.tldr.map((item, i) => `    <li>
      <span class="idx">${escapeHtml(item.idx || String(i + 1).padStart(2, "0"))}</span>
      <p>${item.html}</p>
    </li>`).join("\n");
}

let issueTemplate = null;
function getIssueTemplate(templatePath) {
  if (!issueTemplate) issueTemplate = fs.readFileSync(templatePath, "utf8");
  return issueTemplate;
}

export function renderIssuePage(issue, opts = {}) {
  const templatePath = opts.templatePath;
  const template = getIssueTemplate(templatePath);
  const lang = issue.lang || "zh";
  const loc = LOCALES[lang] || LOCALES.zh;
  const suffix = lang === "en" ? "-en" : "";
  const stem = `daily/${issue.dateISO}${suffix}.html`;
  const canonical = `https://kaixinguor.com/${stem}`;
  const switchHref = `${issue.dateISO}${lang === "en" ? "" : "-en"}.html`;
  const langKey = lang === "en" ? "en" : "zh";
  const values = {
    HTML_LANG: loc.htmlLang,
    TITLE: escapeHtml(issue.title),
    DESCRIPTION: escapeHtml(issue.description),
    CANONICAL: canonical,
    ALT_ZH: `https://kaixinguor.com/daily/${issue.dateISO}.html`,
    ALT_EN: `https://kaixinguor.com/daily/${issue.dateISO}-en.html`,
    RSS_ZH_TITLE: escapeHtml(loc.rssZh),
    RSS_EN_TITLE: escapeHtml(loc.rssEn),
    RSS_HREF: lang === "en" ? "../feed-en.xml" : "../feed.xml",
    NAV_DAILY: loc.navDaily,
    NAV_TOOLS: loc.navTools,
    NAV_ARCHIVE: loc.navArchive,
    NAV_WISH: loc.navWish,
    THEME_LABEL: loc.themeToggle,
    SKIP: loc.skip,
    KICKER: loc.kicker,
    KICKER_EN: loc.kickerEn,
    TOC_LABEL: loc.tocLabel,
    ISSUE_LABEL: escapeHtml(issue.issueLabel),
    DATE_DISPLAY: escapeHtml(issue.dateDisplay),
    WEEKDAY: escapeHtml(issue.weekday),
    DECK: issue.deckHtml,
    METABAR: issue.metabarHtml,
    TOC: renderToc(issue),
    TLDR: renderTldr(issue),
    CHAPTERS: renderChapters(issue),
    FOOTER: issue.footerHtml,
    SWITCH_HREF: switchHref,
    SWITCH_LABEL: loc.switchLabel,
    SWITCH_HREFLANG: loc.switchHreflang,
    FOOT_TAGLINE: loc.footTagline,
    FOOT_PRIVACY: loc.footPrivacy,
    FOOT_DAILY: loc.footDaily,
    LANG_SCRIPT: `try { localStorage.setItem("kaixinguor.lang", "${langKey}"); } catch (e) {}`
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m
  );
}

/* 首页直接放整份日报：报头 + 目录 + 速览 + 全部栏目 + 期脚注。
   不再区分「摘要」和「读完整份日报」。 */
export function renderHomeIssue(issue, lang = "zh") {
  const loc = LOCALES[lang] || LOCALES.zh;
  const suffix = `-${lang}`;

  return `    <header class="masthead">
      <div class="wrap">
        <div class="kicker">
          <span class="zh">${escapeHtml(loc.kicker)}</span>
          <span class="sep"></span>
          <span>${escapeHtml(loc.kickerEn)}</span>
          ${issue.issueLabel ? `<span class="issue-tag">${escapeHtml(issue.issueLabel)}</span>` : ""}
        </div>
        <h1 class="date">${escapeHtml(issue.dateDisplay)}<span class="weekday">${escapeHtml(issue.weekday)}</span></h1>
        <p class="deck">${issue.deckHtml}</p>
        <div class="metabar">${issue.metabarHtml}</div>
      </div>
    </header>

    <nav class="toc" aria-label="${escapeHtml(loc.tocLabel)}">
      <div class="wrap">
        <div class="toc-inner">
          ${renderToc(issue, `tldr${suffix}`, suffix)}
        </div>
      </div>
    </nav>

    <div class="wrap today-body">
      <ol class="tldr" id="tldr${suffix}">
${renderTldr(issue)}
      </ol>

${renderChapters(issue, suffix)}
    </div>

    <footer class="issue-footer">
      <div class="wrap">
        ${issue.footerHtml}
      </div>
    </footer>`;
}

export function renderArchiveSidebar(issues, lang = "zh") {
  const loc = LOCALES[lang] || LOCALES.zh;
  const entries = issues
    .map((issue) => ({ issue, view: lang === "en" ? issue.en : issue }))
    .filter((entry) => entry.view);

  if (!entries.length) {
    return `      <p class="archive-empty">${escapeHtml(loc.archiveEmpty)}</p>`;
  }

  const groups = [];
  let current = null;
  for (const entry of entries) {
    const label = lang === "en" ? entry.view.monthLabelEn : entry.view.monthLabel;
    if (!current || current.label !== label) {
      current = { label, items: [] };
      groups.push(current);
    }
    current.items.push(entry);
  }

  return groups.map((group, gi) => {
    const open = gi === 0 ? " open" : "";
    const links = group.items.map((entry, i) => `        <a class="archive-link${gi === 0 && i === 0 ? " is-current" : ""}" href="daily/${entry.issue.dateISO}${lang === "en" ? "-en" : ""}.html" title="${escapeHtml(entry.view.headline)}">
          <span class="a-date">${escapeHtml(entry.view.dateDot)} <em>${escapeHtml(entry.view.weekday)}</em></span>
          <span class="a-head">${escapeHtml(entry.view.headline)}</span>
        </a>`).join("\n");
    return `      <details class="archive-month"${open}>
        <summary><span>${escapeHtml(group.label)}</span><span class="am-count">${String(group.items.length).padStart(2, "0")}</span></summary>
${links}
      </details>`;
  }).join("\n");
}

export function renderFeed(issues, lang = "zh", siteUrl = "https://kaixinguor.com") {
  const isEn = lang === "en";
  const views = isEn ? issues.filter((issue) => issue.en).map((issue) => issue.en) : issues;
  const items = views.slice(0, 20).map((issue) => {
    const link = `${siteUrl}/daily/${issue.dateISO}${isEn ? "-en" : ""}.html`;
    const pub = new Date(`${issue.dateISO}T09:00:00+08:00`).toUTCString();
    const desc = [issue.deckText, issue.headline].filter(Boolean).join(" ");
    return `    <item>
      <title>${escapeHtml(issue.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <pubDate>${pub}</pubDate>
      <description>${escapeHtml(desc)}</description>
    </item>`;
  }).join("\n");

  const latestDate = views[0] ? new Date(`${views[0].dateISO}T09:00:00+08:00`).toUTCString() : new Date().toUTCString();
  const feedName = isEn ? "feed-en.xml" : "feed.xml";
  const channelTitle = isEn ? "AI Daily · kaixinguor" : "AI 日报 · kaixinguor";
  const channelDesc = isEn
    ? "A strict 24-hour AI daily. Updated whenever there is news."
    : "严格 24 小时窗口的 AI 日报，每天更新。";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${channelTitle}</title>
    <link>${siteUrl}/</link>
    <description>${channelDesc}</description>
    <language>${isEn ? "en" : "zh-CN"}</language>
    <atom:link href="${siteUrl}/${feedName}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${latestDate}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

export function renderSitemap(issues, siteUrl = "https://kaixinguor.com") {
  const latest = issues[0] ? issues[0].dateISO : "2026-10-26";
  const staticPages = [
    ["/", "1.0", latest],
    ["/tools.html", "0.9", latest],
    ["/hark/", "0.8", "2026-10-24"],
    ["/snipread/", "0.8", "2026-10-24"],
    ["/wish.html", "0.5", "2026-10-24"],
    ["/download.html", "0.5", "2026-10-24"],
    ["/changelog.html", "0.4", "2026-10-24"],
    ["/privacy.html", "0.2", "2026-10-24"],
    ["/hark/privacy.html", "0.2", "2026-10-24"],
    ["/snipread/support.html", "0.2", "2026-10-24"],
    ["/snipread/privacy.html", "0.2", "2026-10-24"]
  ];
  const daily = [];
  for (const issue of issues) {
    daily.push([`/daily/${issue.dateISO}.html`, "0.9", issue.dateISO]);
    if (issue.en) daily.push([`/daily/${issue.dateISO}-en.html`, "0.9", issue.dateISO]);
  }
  const rows = [...staticPages, ...daily].map(([loc, priority, lastmod]) => `  <url>
    <loc>${siteUrl}${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>
`;
}

export function applyMarkers(html, replacements) {
  let out = html;
  for (const [name, content] of Object.entries(replacements)) {
    const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
    if (!re.test(out)) throw new Error(`缺少标记 <!-- ${name}:START --> / <!-- ${name}:END -->`);
    out = out.replace(re, (m, start, end) => `${start}\n${content}\n${end}`);
  }
  return out;
}

export function writeIfChanged(file, content) {
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (previous === content) return { changed: false, file };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return { changed: true, file };
}

export function readIssues(dir) {
  const files = fs.readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.html$/.test(name))
    .sort();

  const issues = files.map((name) => {
    const issue = parseIssue(path.join(dir, name));
    const enPath = path.join(dir, name.replace(/\.html$/, "-en.html"));
    issue.en = fs.existsSync(enPath) ? parseIssue(enPath) : null;
    if (issue.en) {
      issue.en.dateISO = issue.dateISO;
      issue.en.en = null;
    }
    return issue;
  });

  issues.sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
  let seq = 0;
  for (const issue of issues) {
    seq += 1;
    if (!issue.issueNo) {
      issue.issueNo = String(seq).padStart(3, "0");
      issue.issueLabel = `第 ${issue.issueNo} 期`;
    }
    if (issue.en) {
      issue.en.issueNo = issue.en.issueNo || issue.issueNo;
      issue.en.issueLabel = issue.en.issueLabel || `Issue ${issue.en.issueNo}`;
    }
  }
  issues.sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
  return issues;
}

export { displayDate, dotDate, weekdayFor };
