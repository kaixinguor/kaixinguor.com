#!/usr/bin/env node
/* 跨期内容去重：把「同一件事被不同媒体、在不同时间再写一遍」找出来。
   不依赖第三方包，也不调用模型：用 URL、标题、以及「旧卡片正文被新卡片覆盖多少」
   三个信号打分。覆盖度用 IDF 加权，越少见的词权重越高。 */

const STOP_BIGRAMS = new Set([
  "我们", "他们", "可以", "已经", "目前", "今天", "昨日", "表示", "认为", "一个", "这个",
  "没有", "不是", "以及", "但是", "因为", "所以", "如果", "对于", "通过", "进行", "发布",
  "宣布", "报道", "消息", "记者", "编辑", "来源", "点击", "查看", "图片", "视频", "相关",
  "阅读", "原文", "标题", "点评", "声明", "本期", "日报", "中国", "美国", "公司", "市场",
  "用户", "数据", "时间", "今年", "去年", "同比", "环比", "左右", "超过", "达到", "其中",
  "此外", "同时", "目前", "这一", "这些", "那些", "什么", "怎么", "为什么", "以及", "并且"
]);

const EN_STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "has", "are", "was", "were",
  "will", "its", "their", "http", "https", "www", "com", "html", "into", "than", "then",
  "they", "them", "but", "not", "you", "your", "our", "about", "after", "over", "under"
]);

export function normalizeUrl(url = "") {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const pathname = (u.pathname.replace(/\/+$/, "") || "/");
    const params = [...u.searchParams]
      .filter(([key]) => !/^(utm_|spm|from|source|share|ref|fbclid|gclid|yclid|mc_)/i.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";
    return `${host}${pathname}${query}`;
  } catch (e) {
    return String(url || "").trim();
  }
}

export function normalizeTitle(title = "") {
  return String(title)
    .toLowerCase()
    .replace(/[（(][^）)]{0,12}[)）]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function tokenize(text = "") {
  const lower = String(text).toLowerCase();
  const out = new Set();
  const numberRe = /(\d+(?:\.\d+)?)\s*(%|％|万亿|亿|万|千|百万|十亿|美元|元|日元|韩元|欧元|英镑|里亚尔|人民币|个百分点|个月|年|天|小时|分钟|条|家|台|倍|nm|gb|tb|tops|gwh|kw|w)?/g;
  let m;
  while ((m = numberRe.exec(lower)) !== null) {
    const unit = (m[2] || "").replace("％", "%");
    if (!unit && m[1].length < 2) continue;
    out.add(`N:${m[1]}${unit}`);
  }
  for (const word of lower.match(/[a-z][a-z0-9.\-]{2,}/g) || []) {
    if (EN_STOP.has(word)) continue;
    out.add(`L:${word}`);
  }
  for (const segment of lower.replace(/[^\u4e00-\u9fff]+/g, " ").split(/\s+/)) {
    for (let i = 0; i < segment.length - 1; i++) {
      const bigram = segment.slice(i, i + 2);
      if (!STOP_BIGRAMS.has(bigram)) out.add(`Z:${bigram}`);
    }
  }
  return out;
}

function bigrams(text = "") {
  const set = new Set();
  for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
  return set;
}

export function titleSimilarity(a = "", b = "") {
  const A = bigrams(normalizeTitle(a));
  const B = bigrams(normalizeTitle(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function makeStats(texts = []) {
  const df = new Map();
  for (const text of texts) for (const token of tokenize(text)) df.set(token, (df.get(token) || 0) + 1);
  const n = texts.length;
  const idf = (token) => Math.log((n + 1) / ((df.get(token) || 0) + 0.5));
  return { n, df, idf };
}

export function cardText(card) {
  return `${card.titleText || ""}。${(card.paras || []).join("。")}`;
}

export function tokenSet(card, cache) {
  if (cache && cache.has(card)) return cache.get(card);
  const set = tokenize(cardText(card));
  if (cache) cache.set(card, set);
  return set;
}

export function containment(aTokens, bTokens, stats) {
  let inter = 0;
  let total = 0;
  for (const token of aTokens) {
    const weight = stats.idf(token);
    total += weight;
    if (bTokens.has(token)) inter += weight;
  }
  return total ? inter / total : 0;
}

export function storyScore(a, b, stats, cache) {
  const urlA = normalizeUrl(a.sourceUrl);
  const urlB = normalizeUrl(b.sourceUrl);
  const titleSim = titleSimilarity(a.titleText, b.titleText);
  const ta = tokenSet(a, cache);
  const tb = tokenSet(b, cache);
  const cont = Math.max(containment(ta, tb, stats), containment(tb, ta, stats));
  return { urlA, urlB, titleSim, cont, coverage: Math.max(cont, titleSim) };
}

/* follow-up 卡片允许与旧条目同题，但必须带旧条目没有的数字/型号。 */
export function newFacts(newCard, oldCard, cache) {
  const A = tokenSet(newCard, cache);
  const B = tokenSet(oldCard, cache);
  return [...A]
    .filter((token) => {
      if (B.has(token)) return false;
      if (token.startsWith("L:")) return token.length >= 5; // 至少 3 个字符的型号/公司名
      if (token.startsWith("N:")) return /^[\d.]+[^\d.]/.test(token.slice(2)); // 必须带单位，纯年份不算
      return false;
    })
    .map((token) => token.slice(2));
}

export function compareCards(a, b, stats, cache) {
  const { urlA, urlB, titleSim, cont } = storyScore(a, b, stats, cache);
  const reasons = [];
  let level = null;
  let score = Math.max(titleSim, cont);

  if (urlA && urlA === urlB) {
    level = "duplicate";
    score = 1;
    reasons.push("原文链接相同");
  } else if (normalizeTitle(a.titleText) && normalizeTitle(a.titleText) === normalizeTitle(b.titleText) && normalizeTitle(a.titleText).length >= 8) {
    level = "duplicate";
    score = Math.max(score, 0.95);
    reasons.push("标题去掉标点后完全相同");
  } else if (cont >= 0.55) {
    level = "duplicate";
    reasons.push(`正文覆盖 ${(cont * 100).toFixed(0)}%`);
  } else if (titleSim >= 0.8) {
    level = "duplicate";
    reasons.push(`标题相似 ${(titleSim * 100).toFixed(0)}%`);
  } else if (cont >= 0.4 || titleSim >= 0.62) {
    level = "possible";
    reasons.push(cont >= 0.4 ? `正文覆盖 ${(cont * 100).toFixed(0)}%` : `标题相似 ${(titleSim * 100).toFixed(0)}%`);
  }

  if (level) {
    if (Math.abs(titleSim - cont) > 0.05 && titleSim >= 0.3) reasons.push(`标题相似 ${(titleSim * 100).toFixed(0)}%`);
  }
  return { level, score, reasons, titleSim, cont };
}

export function formatBJ(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function formatDuration(ms) {
  const minutes = Math.round(Math.abs(ms) / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} 小时 ${rest} 分`;
  if (hours) return `${hours} 小时`;
  return `${rest} 分钟`;
}
