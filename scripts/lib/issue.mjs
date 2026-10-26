/* 日报内容解析与渲染。
   输入：一期日报 HTML（可以是 ai-daily/ 里自包含的母版，也可以是 daily/ 里已生成的页面）。
   输出：统一结构 + 站点版本的日报页 / 首页今日区 / 归档行 / RSS。
   只依赖 Node 内置模块，不需要安装任何东西。 */

import fs from "node:fs";
import path from "node:path";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
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
  return text.slice(0, max).replace(/[，。；：、,.;:\s]+$/, "") + "…";
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

function dotDate(iso) {
  return iso.replace(/-/g, ".");
}

function monthLabel(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${y} 年 ${m} 月`;
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
  const m = String(text).match(/第\s*0*(\d+)\s*期/);
  if (m) return { issueNo: String(Number(m[1])).padStart(3, "0"), issueLabel: `第 ${String(Number(m[1])).padStart(3, "0")} 期` };
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

  const title = stripTags(firstMatch(/<title>([\s\S]*?)<\/title>/i, html)) || `AI 日报 · ${displayDate(iso)}`;
  const description = decodeEntities(firstMatch(/<meta name="description" content="([^"]*)"/i, html));

  const masthead = firstMatch(/<header class="masthead"[^>]*>([\s\S]*?)<\/header>/i, html);
  const kickerHtml = cleanInline(firstMatch(/<div class="kicker">([\s\S]*?)<\/div>/i, masthead)).trim();
  const dateHtml = firstMatch(/<h1 class="date">([\s\S]*?)<\/h1>/i, masthead);
  const weekday = stripTags(firstMatch(/<span class="weekday">([\s\S]*?)<\/span>/i, dateHtml)).toUpperCase();
  const sourceDateDisplay = stripTags(dateHtml.replace(/<span class="weekday">[\s\S]*?<\/span>/i, ""));
  const dateDisplay = sourceDateDisplay || displayDate(iso);
  const deckHtml = cleanInline(firstMatch(/<p class="deck">([\s\S]*?)<\/p>/i, masthead)).trim();
  const deckText = stripTags(deckHtml);
  const metabarHtml = cleanInline(firstMatch(/<div class="metabar">([\s\S]*?)<\/div>/i, masthead)).trim();

  const pillText = extractPillText(metabarHtml);
  const parsedNo = parseIssueNumber(pillText || title, iso);
  const issueNo = parsedNo.issueNo;
  const issueLabel = parsedNo.issueLabel;

  const window = stripTags(firstMatch(/<span>窗口\s*([\s\S]*?)<\/span>/i, metabarHtml)) ||
    stripTags(firstMatch(/窗口\s*([^<]+)/i, metabarHtml));
  const readMinutes = Number(firstMatch(/阅读约\s*(\d+)\s*分钟/i, metabarHtml)) || 0;

  let tldr = parseTldr(html);
  const chapters = parseChapters(html);
  const cards = chapters.flatMap((chapter) => chapter.cards);

  if (!cards.length) throw new Error(`${file}: 没有解析到任何 <article class="card">，是不是版式变了？`);

  if (!tldr.length) {
    tldr = cards.slice(0, 3).map((card, i) => ({
      idx: String(i + 1).padStart(2, "0"),
      html: `<b>${escapeHtml(card.titleText)}。</b>${escapeHtml(truncate(card.summary, 96))}`
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

  const metaWindow = window || `${dateDisplay} 前后 24 小时`;
  const finalMetabar = metabarHtml || [
    issueLabel ? `<span class="pill">${escapeHtml(issueLabel)}</span>` : "",
    issueLabel ? `<span class="dot"></span>` : "",
    `<span>窗口 ${escapeHtml(metaWindow)}</span>`,
    `<span class="dot"></span>`,
    `<span>${count} 条</span>`,
    `<span class="dot"></span>`,
    `<span>阅读约 ${finalRead} 分钟</span>`
  ].filter(Boolean).join("");

  const finalFooter = footerHtml || [
    `<p>本期收录 ${escapeHtml(metaWindow)}（北京时间）之间发布的报道，共 ${count} 条。</p>`,
    `<p>所有条目均链接原文，事实与数字以原文为准。标题与点评为编辑加工。</p>`,
    `<p class="sig">AI Daily · Issue ${issueNo || "—"} · 24h window · Generated ${escapeHtml(generatedAt || dateDisplay)}</p>`
  ].join("\n    ");

  return {
    file,
    dateISO: iso,
    dateDisplay,
    dateDot: dotDate(iso),
    monthLabel: monthLabel(iso),
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

export function renderChapters(issue) {
  return issue.chapters.map((chapter) => `  <section class="chapter" id="${escapeHtml(chapter.id)}" data-c="${escapeHtml(chapter.cat)}">
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

export function renderToc(issue) {
  const tldr = `<a href="#tldr"><span class="n">00</span>速览</a>`;
  const chapters = issue.chapters.map((chapter) =>
    `<a href="#${escapeHtml(chapter.id)}"><span class="n">${escapeHtml(chapter.cnum)}</span>${escapeHtml(chapter.name)}</a>`
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
  const values = {
    TITLE: escapeHtml(issue.title),
    DESCRIPTION: escapeHtml(issue.description),
    ISSUE_LABEL: escapeHtml(issue.issueLabel),
    DATE_DISPLAY: escapeHtml(issue.dateDisplay),
    WEEKDAY: escapeHtml(issue.weekday),
    DECK: issue.deckHtml,
    METABAR: issue.metabarHtml,
    TOC: renderToc(issue),
    TLDR: renderTldr(issue),
    CHAPTERS: renderChapters(issue),
    FOOTER: issue.footerHtml
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m
  );
}

/* 首页今日区：报头 + 3 条速览 + 3 条头条 + 读全文 */
export function renderHomeToday(issue) {
  const flat = issue.chapters.flatMap((chapter) =>
    chapter.cards.map((card) => ({ ...card, chapter }))
  );
  const picks = flat.slice(0, 3);
  const href = `daily/${issue.dateISO}.html`;

  const headCards = picks.map((card, i) => {
    const lead = i === 0;
    const summary = truncate(card.summary, lead ? 230 : 118);
    const why = lead && card.why
      ? `
        <p class="why head-why"><b>${escapeHtml(card.why.label)}</b>${card.why.html}</p>`
      : "";
    return `      <a class="card head-card${lead ? " head-lead" : ""}" data-c="${escapeHtml(card.cat)}" href="${href}">
        <div class="cmeta">
          <span class="d">${escapeHtml(card.time)}</span>
          <span class="src">${escapeHtml(card.sourceName || card.chapter.name)}</span>
        </div>
        <span class="head-cat">${escapeHtml(card.chapter.cnum)} ${escapeHtml(card.chapter.name)}</span>
        <h3>${card.titleHtml}</h3>
        <p>${escapeHtml(summary)}</p>${why}
        <div class="head-foot">
          <span>${escapeHtml(issue.issueLabel || "AI 日报")}</span>
          <span class="arrow" aria-hidden="true">→</span>
        </div>
      </a>`;
  }).join("\n");

  return `    <header class="masthead">
      <div class="kicker">
        <span class="zh">AI 日报</span>
        <span class="sep"></span>
        <span>Daily AI Brief</span>
        ${issue.issueLabel ? `<span class="issue-tag">${escapeHtml(issue.issueLabel)}</span>` : ""}
      </div>
      <h1 class="date">${escapeHtml(issue.dateDisplay)}<span class="weekday">${escapeHtml(issue.weekday)}</span></h1>
      <p class="deck">${issue.deckHtml}</p>
      <div class="metabar">${issue.metabarHtml}</div>
    </header>

    <ol class="tldr" id="tldr">
${renderTldr(issue)}
    </ol>

    <section class="headlines" aria-labelledby="headlines-title">
      <div class="chead">
        <span class="cnum">00</span>
        <h2 id="headlines-title" data-i18n="home.lead">今日头条</h2>
        <span class="cen">Today's Lead</span>
        <span class="crule"></span>
      </div>
      <div class="head-grid">
${headCards}
      </div>
      <div class="read-all">
        <a class="read-all-link" href="${href}"><span data-i18n="home.readall">读完整份日报</span><span class="arrow" aria-hidden="true">→</span></a>
        <span class="read-all-meta">${issue.count} 条 · 约 ${issue.readMinutes} 分钟</span>
      </div>
    </section>`;
}

function issueRow(issue) {
  return `      <li>
        <a class="issue-row" href="daily/${issue.dateISO}.html">
          <span class="issue-no">${escapeHtml(issue.issueLabel || "AI 日报")}</span>
          <span class="issue-date">${escapeHtml(issue.dateDot)} <em>${escapeHtml(issue.weekday)}</em></span>
          <span class="issue-head">${escapeHtml(issue.headline)}</span>
          <span class="issue-meta">${issue.count} 条</span>
          <span class="issue-arrow" aria-hidden="true">→</span>
        </a>
      </li>`;
}

export function renderLatest(issues, limit = 3) {
  return issues.slice(0, limit).map(issueRow).join("\n");
}

export function renderArchive(issues) {
  if (!issues.length) {
    return `      <p class="archive-empty" data-i18n="archive.empty">还没有往期。</p>`;
  }
  const groups = [];
  let current = null;
  for (const issue of issues) {
    if (!current || current.label !== issue.monthLabel) {
      current = { label: issue.monthLabel, items: [] };
      groups.push(current);
    }
    current.items.push(issue);
  }
  return groups.map((group) => `      <div class="archive-month">${escapeHtml(group.label)}</div>
${group.items.map((issue) => `      <a class="issue-row" href="daily/${issue.dateISO}.html">
        <span class="issue-no">${escapeHtml(issue.issueLabel || "AI 日报")}</span>
        <span class="issue-date">${escapeHtml(issue.dateDot)} <em>${escapeHtml(issue.weekday)}</em></span>
        <span class="issue-head">${escapeHtml(issue.headline)}</span>
        <span class="issue-meta">${issue.count} 条 · ${issue.readMinutes} 分钟</span>
        <span class="issue-arrow" aria-hidden="true">→</span>
      </a>`).join("\n")}`).join("\n");
}

/* 归档页的行是 <a>，不能套在 <li> 里；上面的 issueRow 只给首页用。 */

export function renderFeed(issues, siteUrl = "https://kaixinguor.com") {
  const items = issues.slice(0, 20).map((issue) => {
    const link = `${siteUrl}/daily/${issue.dateISO}.html`;
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

  const latestDate = issues[0] ? new Date(`${issues[0].dateISO}T09:00:00+08:00`).toUTCString() : new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI 日报 · kaixinguor</title>
    <link>${siteUrl}/</link>
    <description>严格 24 小时窗口的 AI 日报，每天更新。</description>
    <language>zh-CN</language>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
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
    ["/archive.html", "0.9", latest],
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
  const daily = issues.map((issue) => [`/daily/${issue.dateISO}.html`, "0.9", issue.dateISO]);
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
  const issues = files.map((name) => parseIssue(path.join(dir, name)));
  issues.sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
  let seq = 0;
  for (const issue of issues) {
    seq += 1;
    if (!issue.issueNo) {
      issue.issueNo = String(seq).padStart(3, "0");
      issue.issueLabel = `第 ${issue.issueNo} 期`;
    }
  }
  issues.sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
  return issues;
}

export { displayDate, dotDate, weekdayFor };
