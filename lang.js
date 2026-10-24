// 极简双语：中文写在 HTML 里，英文放这张表。
// <span data-i18n="key">中文</span> → 切换时替换成英文。
// 表里缺的键会保持中文（说明那段还没翻）。

const I18N = {
  en: {
    "nav.tools": "Tools",
    "nav.wish": "Wish",
    "footer.privacy": "Privacy",

    "home.h1": "I build the tool<br>you wish existed.",
    "home.sub": "One person, making tools. You say what you want, I build it.",
    "home.link.tools": "What's been made →",
    "home.link.wish": "Tell me what you want →",

    "tools.title": "Made",
    "tools.hark.name": "Hark",
    "tools.hark": "Live captions for online lectures, transcript when class ends.",
    "tools.snipread.name": "SnipRead",
    "tools.snipread": "Box text on a scanned PDF. Annotate, note, shelve.",
    "tools.wish": "Nothing yet. You decide →",

    "meta.internal": "Testing",
    "meta.testflight": "TestFlight",

    "wish.title": "What should it do?",
    "wish.q1": "What should it do for you?",
    "wish.q1.ph": "e.g. pull the key points out of a lecture and turn them into a list.",
    "wish.q2": "How do you cope today?",
    "wish.q2.ph": "e.g. type notes by hand while listening — four pages a class, still miss things.",
    "wish.q2.note": "A need with no workaround is rarely a real need.",
    "wish.q3": "How often?",
    "wish.q4": "If it already existed, what would you pay?",
    "wish.q5": "Which device?",
    "wish.q6": "How to reach you (optional)",
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
    "site.privacy.p1": "This site is a set of static pages. It has no account, no analytics, no ads, and no tracking scripts.",
    "site.privacy.p2": "No cookies. The only thing stored in your browser is your language choice (localStorage). Clear your browser data and it's gone.",
    "site.privacy.p3": "The wish form does not send anything by itself. It opens your mail app with the text filled in — you decide whether to send it.",
    "site.privacy.p4": "The site is served by Cloudflare, which keeps standard access logs for security and abuse prevention.",
    "site.privacy.p5": "For privacy of each app, see the page of that app.",

    "zhonly": "This page is in Chinese for now."
  }
};

(function () {
  const KEY = "kaixinguor.lang";

  function apply(lang) {
    const en = lang === "en";
    document.documentElement.lang = en ? "en" : "zh-CN";

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
