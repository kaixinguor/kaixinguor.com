/* kaixinguor · 全站共用的小脚本
   1. 深浅色切换（跟随系统 + localStorage）
   2. 日报阅读进度条
   3. 目录锚点兜底滚动
   4. 工具页标签筛选
   没有依赖，任何一页缺少对应元素都会安静跳过。 */
(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "kaixinguor.theme";
  var mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  /* ---------- 1. 深浅色 ---------- */
  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function preferredTheme() {
    var saved = storedTheme();
    if (saved === "dark" || saved === "light") return saved;
    return mql && mql.matches ? "dark" : "light";
  }

  function paintTheme(mode) {
    if (mode === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");

    var btn = document.querySelector("[data-theme-toggle]");
    if (btn) {
      var dark = mode === "dark";
      btn.textContent = dark ? "◑" : "◐";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? "切换到日间模式" : "切换到夜间模式");
      btn.setAttribute("title", dark ? "日间模式" : "夜间模式");
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#14110f" : "#f7f3ed");
  }

  function setTheme(mode, persist) {
    paintTheme(mode);
    if (persist) {
      try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
    }
  }

  // 首屏由 <head> 里的内联脚本先定好，避免闪白/闪黑。
  paintTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-theme-toggle]") : null;
    if (!btn) return;
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(next, true);
  });

  if (mql) {
    var onChange = function () {
      if (!storedTheme()) setTheme(mql.matches ? "dark" : "light", false);
    };
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else if (mql.addListener) mql.addListener(onChange);
  }

  window.addEventListener("storage", function (e) {
    if (e.key === THEME_KEY) paintTheme(e.newValue === "dark" ? "dark" : "light");
  });

  /* ---------- 2. 阅读进度条 ---------- */
  var bar = document.getElementById("progress");
  if (bar) {
    var ticking = false;
    var update = function () {
      var max = root.scrollHeight - root.clientHeight;
      var p = max > 0 ? (root.scrollTop || document.body.scrollTop) / max : 0;
      bar.style.width = (p * 100).toFixed(2) + "%";
      ticking = false;
    };
    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  /* ---------- 3. 目录锚点兜底 ---------- */
  document.querySelectorAll('.toc a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").slice(1);
      var target = id && document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (history.replaceState) history.replaceState(null, "", "#" + id);
    });
  });

  /* ---------- 3b. 首页往期侧栏 ---------- */
  var rail = document.querySelector("[data-archive-rail]");
  if (rail) {
    var railMq = window.matchMedia ? window.matchMedia("(max-width: 1120px)") : null;
    var openArchive = function () { rail.setAttribute("open", ""); };
    var syncRail = function (e) {
      if (e.matches) {
        if (location.hash !== "#archive") rail.removeAttribute("open");
      } else {
        openArchive();
      }
    };

    // 桌面默认展开，手机默认收起；带 #archive 进来时始终展开。
    if (railMq && railMq.matches && location.hash !== "#archive") {
      rail.removeAttribute("open");
    }
    if (location.hash === "#archive") openArchive();

    if (railMq) {
      if (railMq.addEventListener) railMq.addEventListener("change", syncRail);
      else if (railMq.addListener) railMq.addListener(syncRail);
    }
    window.addEventListener("hashchange", function () {
      if (location.hash === "#archive") openArchive();
    });
    document.querySelectorAll('a[href="#archive"]').forEach(function (a) {
      a.addEventListener("click", openArchive);
    });
  }

  /* ---------- 4. 工具页标签筛选 ---------- */
  var tablist = document.querySelector("[data-tool-tabs]");
  if (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll("[data-filter]"));
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-tool-card]"));
    var empty = document.querySelector("[data-tool-empty]");

    var select = function (value, updateHash, focus) {
      var visible = 0;
      tabs.forEach(function (tab) {
        var on = tab.getAttribute("data-filter") === value;
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.setAttribute("tabindex", on ? "0" : "-1");
        if (on && focus) tab.focus();
      });
      cards.forEach(function (card) {
        var show = value === "all" || card.getAttribute("data-cat") === value;
        card.hidden = !show;
        if (show) visible++;
      });
      if (empty) empty.hidden = visible !== 0;
      if (updateHash) {
        var next = value === "all" ? location.pathname + location.search : "#" + value;
        if (history.replaceState) history.replaceState(null, "", next);
      }
    };

    // 计数从卡片算，不依赖手写数字。加一张卡只要写 data-cat。
    tabs.forEach(function (tab) {
      var filter = tab.getAttribute("data-filter");
      var n = filter === "all" ? cards.length : cards.filter(function (card) {
        return card.getAttribute("data-cat") === filter;
      }).length;
      var badge = tab.querySelector(".n");
      if (badge) badge.textContent = String(n).padStart(2, "0");
    });

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () {
        select(tab.getAttribute("data-filter"), true, false);
      });
      tab.addEventListener("keydown", function (e) {
        var key = e.key;
        var next = null;
        if (key === "ArrowRight" || key === "ArrowDown") next = (i + 1) % tabs.length;
        if (key === "ArrowLeft" || key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
        if (key === "Home") next = 0;
        if (key === "End") next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        select(tabs[next].getAttribute("data-filter"), true, true);
      });
    });

    var initial = location.hash ? location.hash.slice(1) : "all";
    if (!tabs.some(function (t) { return t.getAttribute("data-filter") === initial; })) initial = "all";
    select(initial, false, false);
  }
})();
