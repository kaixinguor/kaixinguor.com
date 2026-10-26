// 极简双语：中文写在 HTML 里，英文放这张表。
// <span data-i18n="key">中文</span> → 切换时替换成英文。
// 表里缺的键会保持中文（说明那段还没翻）。
// 日报正文只做中文：首页/归档里的日报内容不参与切换，页面外壳参与。

const I18N = {
  en: {
    "nav.daily": "Daily",
    "nav.tools": "Tools",
    "nav.archive": "Archive",
    "nav.wish": "Wish",
    "nav.theme": "Theme",
    "footer.privacy": "Privacy",
    "footer.tagline": "Small tools, made by one person.",
    "footer.daily": "AI Daily · updated whenever there is news",
    "footer.built": "Static site · built with DeepSeek Harness",

    "home.lead": "Today's lead",
    "home.readall": "Read the full issue",
    "home.latest": "Latest issues",
    "home.archive": "All issues",
    "home.tools": "Tools already built",
    "home.tools.all": "All tools",
    "home.tools.deck": "Two small macOS tools. Both work locally first.",
    "home.zhonly": "The daily brief is in Chinese for now.",

    "tools.title": "Tools",
    "tools.deck": "A small, growing shelf. Tabs are for the categories that already have something in them.",
    "tools.tab.all": "All",
    "tools.tab.listen": "Listening",
    "tools.tab.read": "Reading",
    "tools.tab.wish": "Wish",
    "tools.empty": "Nothing in this tab yet.",
    "tools.count": "items",
    "tools.hark.name": "Hark",
    "tools.hark": "Live captions for online lectures. A timestamped transcript when class ends.",
    "tools.hark.cat": "Listening",
    "tools.snipread.name": "SnipRead",
    "tools.snipread": "Box text on a scanned PDF. Highlight, annotate, note, shelve.",
    "tools.snipread.cat": "Reading",
    "tools.wish": "Nothing yet. You decide",
    "tools.wish.sub": "Tell me what to build next",
    "tools.wish.cta": "Not here yet? Say the word",
    "tools.wish.note": "No account, and nothing is sent until you send it.",
    "tools.view": "Open",

    "meta.internal": "Testing",
    "meta.testflight": "TestFlight",
    "meta.macos": "macOS",
    "meta.free": "Free",
    "meta.beta": "Beta",

    "archive.title": "Archive",
    "archive.label": "Issues",
    "archive.deck": "Every issue of the AI Daily, newest first. Each one covers a strict 24-hour window.",
    "archive.empty": "No issues yet.",
    "archive.read": "Read",

    "wish.title": "What should it do?",
    "wish.deck": "A tool starts with one concrete annoyance. Tell me yours.",
    "wish.q1": "What should it do for you?",
    "wish.q1.ph": "e.g. pull the key points out of a lecture and turn them into a list.",
    "wish.q2": "How do you cope today?",
    "wish.q2.ph": "e.g. type notes by hand while listening — four pages a class, still miss things.",
    "wish.q2.note": "A need with no workaround is rarely a real need.",
    "wish.q3": "How often?",
    "wish.q4": "If it already existed, what would you pay?",
    "wish.q5": "Which device?",
    "wish.q6": "How to reach you (optional)",
    "wish.q6.ph": "Email or WeChat",
    "wish.send": "Send",
    "wish.note": "Opens your mail app, already filled in.",
    "wish.f1": "Daily",
    "wish.f2": "Weekly",
    "wish.f3": "Monthly",
    "wish.f4": "A few times a year",
    "wish.p0": "Only if free",
    "wish.p1": "Under ¥50",
    "wish.p2": "¥50 – ¥200",
    "wish.p3": "¥200 – ¥1000",
    "wish.p4": "Over ¥1000 — I'd pay for custom",
    "wish.d2": "Mac + iPhone",
    "wish.d3": "iPad",
    "wish.d4": "Mostly Windows",

    "site.privacy.title": "Privacy",
    "site.privacy.sub": "This is the privacy note for <strong>this website</strong>, not for an app.",
    "site.privacy.apps": "For each app's privacy policy, see that app's page:",
    "site.privacy.p1": "This site is a set of static pages. It has no account, no analytics, no ads, and no tracking scripts.",
    "site.privacy.p2": "No cookies. The only things stored in your browser are your language and theme choices (localStorage). Clear your browser data and they're gone.",
    "site.privacy.p3": "The wish form does not send anything by itself. It opens your mail app with the text filled in — you decide whether to send it.",
    "site.privacy.p4": "The site is served by Cloudflare, which keeps standard access logs for security and abuse prevention.",
    "site.privacy.p5": "For privacy of each app, see the page of that app.",

    "e404.title": "Page not found.",
    "e404.lead": "The link may have changed, or I typed it wrong.",
    "e404.home": "Back home",
    "zhonly": "This page is in Chinese for now."
  }
};

(function () {
  const KEY = "kaixinguor.lang";
  const titleZh = document.title;
  const titleEn = document.documentElement.getAttribute("data-title-en") || "";

  function apply(lang) {
    const en = lang === "en";
    document.documentElement.lang = en ? "en" : "zh-CN";
    if (titleEn) document.title = en ? titleEn : titleZh;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      if (!el.dataset.zh) el.dataset.zh = el.innerHTML;
      const key = el.dataset.i18n;
      el.innerHTML = (en && I18N.en[key]) ? I18N.en[key] : el.dataset.zh;
    });

    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      if (!el.dataset.zhPh) el.dataset.zhPh = el.placeholder || "";
      const key = el.dataset.i18nPh;
      el.placeholder = (en && I18N.en[key]) ? I18N.en[key] : el.dataset.zhPh;
    });

    document.querySelectorAll("[data-zh-only]").forEach(function (el) {
      el.hidden = !en;
    });

    const btn = document.getElementById("lang-toggle");
    if (btn) btn.textContent = en ? "中文" : "EN";

    document.documentElement.removeAttribute("data-pending");

    // 通知 site.js：主题按钮的英文/中文 aria-label 也要跟着切
    try {
      document.dispatchEvent(new CustomEvent("kaixinguor:lang", { detail: { lang: document.documentElement.lang } }));
    } catch (e) {}
  }

  window.toggleLang = function () {
    const next = localStorage.getItem(KEY) === "en" ? "zh" : "en";
    localStorage.setItem(KEY, next);
    apply(next);
  };

  const saved = localStorage.getItem(KEY) || "zh";
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { apply(saved); });
  } else {
    apply(saved);
  }
})();
