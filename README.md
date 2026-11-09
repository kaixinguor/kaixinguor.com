# kaixinguor.com

一个人做的小工具 + 四份中英双语日报。纯静态站点，报刊编辑风。

- 四个版块：**AI 日报**（首页 `/`）、**经济日报**（`/economy.html`）、**教育日报**（`/education.html`）与**心理学日报**（`/psychology.html`），导航里并列
- 首页 / 经济日报页 / 教育日报页 / 心理学日报页 = 当天整份日报全文（报头、目录、速览、全部栏目、期脚注）
- 最左侧贴边 ARCHIVE 抽屉 = 各自的往期（`archive.html` 只做旧链接跳转）
- `/tools.html` = 标签式工具列表
- `/daily-ai/YYYY-MM-DD.html`、`/daily-ai/YYYY-MM-DD-en.html` = AI 日报中英文
- `/daily-economy/YYYY-MM-DD.html`、`/daily-economy/YYYY-MM-DD-en.html` = 经济日报中英文
- `/daily-education/YYYY-MM-DD.html`、`/daily-education/YYYY-MM-DD-en.html` = 教育日报中英文
- `/daily-psychology/YYYY-MM-DD.html`、`/daily-psychology/YYYY-MM-DD-en.html` = 心理学日报中英文
- `/feed.xml` / `/feed-en.xml` = AI 日报 RSS；`/feed-economy.xml` / `/feed-economy-en.xml` = 经济日报 RSS；`/feed-education.xml` / `/feed-education-en.xml` = 教育日报 RSS；`/feed-psychology.xml` / `/feed-psychology-en.xml` = 心理学日报 RSS

视觉语言来自 `ai-daily/2026-10-26.html`，抽成了 `style.css`；日报、首页、工具、许愿共用同一套 tokens 和组件。

日报每期都有中文和英文两个页面；首页直接显示整份日报，并根据站点语言只显示中文或英文其中一版，不会上下堆叠。往期抽屉也同步切换。

---

## 本地预览

```bash
cd site
npm run preview        # http://127.0.0.1:8899/
```

不需要安装依赖，Node 20+ 即可。

> 改 `style.css` / `site.js` / `lang.js` 后，记得把页面里对应的 `?v=` 一起加一（例如 `style.css?v=7` → `?v=8`）；Cloudflare 对这些静态资源有 1 小时缓存，不换版本号浏览器可能继续用旧 CSS。

---

## 发布一期日报

四份日报用同一个流程，只是写到不同目录、更新不同首页与 RSS。

> 同一天四份一起更新时，按 [`docs/每日四报统一规则.md`](docs/每日四报统一规则.md) 执行：四份共用同一个窗口终点，按 **AI → 经济 → 教育 → 心理学** 发布，只有 AI 日报出 5 张公众号图；封面是「摘要 + 今日三条」，不再放大重复的头条标题。

```bash
cd site

# AI 日报 → daily-ai/ + index.html + feed.xml / feed-en.xml
node scripts/publish-daily.mjs daily-ai/2026-10-26.html \
  --en daily-ai/2026-10-26-en.html \
  --push

# 经济日报 → daily-economy/ + economy.html + feed-economy*.xml
node scripts/publish-economy.mjs daily-economy/2026-10-30.html \
  --en daily-economy/2026-10-30-en.html \
  --push

# 教育日报 → daily-education/ + education.html + feed-education*.xml
node scripts/publish-education.mjs daily-education/2026-11-03.html \
  --en daily-education/2026-11-03-en.html \
  --push

# 心理学日报 → daily-psychology/ + psychology.html + feed-psychology*.xml
node scripts/publish-psychology.mjs daily-psychology/2026-11-09.html \
  --en daily-psychology/2026-11-09-en.html \
  --push
```

它会：

1. 解析中文版和英文版 HTML（自包含母版或已套壳页面都行）
2. 套上 `templates/issue.html`，写到对应版块的 `YYYY-MM-DD.html` 与 `-en.html`
3. 重新生成对应版块首页的今日全文与往期抽屉、两套 RSS、`sitemap.xml`
4. 逐条检查原文链接（打不开就停，默认开启）
5. 可选：`git commit` + `git push`（只提交本版块相关的文件）

同一天重跑会覆盖，不会追加。`--social` 只属于 AI 日报。

源稿与成品同路径：`daily-ai/`、`daily-economy/`、`daily-education/`、`daily-psychology/` 里的 `YYYY-MM-DD.html` 既是源稿也是上线页。

---

## 生成公众号图片消息图（本地）

```bash
cd site
npm run social -- daily-ai/2026-10-29.html
# 或 node scripts/make-social.mjs daily-ai/2026-10-29.html
```

默认写到 `daily-ai/social/YYYY-MM-DD/`，已在 `.gitignore`，不会进 git、不会上线。经济日报自 2026-11-02 起不再生成配图，旧图保留在 `daily-economy/social/`：

- `wechat/`：**5 张** 1080×1440（3:4）：封面 → 3 条重点 → 速览，**没有尾页**
- `公众号-图片消息.md`：标题 / 描述 / 逐图说明 / 发布步骤，直接复制去发
- `README.txt`、`manifest.json`（`--zip` 时另出 `AI-Daily-YYYY-MM-DD-wechat.zip`）

标题固定为 `AI 日报 · M月D日`。**只做公众号，不再生成小红书图**——完整规则见 [`docs/社交配图规则.md`](docs/社交配图规则.md)。同一天重跑会覆盖。

需要 Python 3 + Playwright 的 Chromium：

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
```

---

## 目录

```
site/
├── index.html              首页 = AI 日报（完整一期 + 左侧往期抽屉）
├── economy.html            经济日报（完整一期 + 左侧往期抽屉）
├── education.html          教育日报（完整一期 + 左侧往期抽屉）
├── psychology.html         心理学日报（完整一期 + 左侧往期抽屉）
├── archive.html            旧 /archive.html 跳转到 /#archive
├── tools.html              工具（标签筛选）
├── wish.html               许愿
├── privacy.html / 404.html / download.html / changelog.html
├── daily-ai/YYYY-MM-DD.html        AI 日报（中/英）
├── daily-economy/YYYY-MM-DD.html   经济日报（中/英）
├── daily-education/YYYY-MM-DD.html 教育日报（中/英）
├── daily-psychology/YYYY-MM-DD.html 心理学日报（中/英）
├── hark/  snipread/        两个产品子站
├── style.css               全站唯一设计系统
├── site.js                 深浅色 / 进度条 / 目录 / 工具标签
├── lang.js                 站点框架 zh/en
├── templates/issue.html    日报外壳
├── scripts/
│   ├── build.mjs           生成四个首页、四套 RSS、sitemap
│   ├── build-economy.mjs   经济日报首页 economy.html（build.mjs 会调用）
│   ├── build-education.mjs 教育日报首页 education.html（build.mjs 会调用）
│   ├── build-psychology.mjs 心理学日报首页 psychology.html（build.mjs 会调用）
│   ├── publish-daily.mjs   发布一期 AI 日报
│   ├── publish-economy.mjs 发布一期经济日报
│   ├── publish-education.mjs 发布一期教育日报
│   ├── publish-psychology.mjs 发布一期心理学日报
│   ├── lib/publish.mjs     四个发布命令共用的流程
│   ├── make-social.mjs     生成公众号图片消息图（5 张，本地）
│   ├── social/             配图版式与 Playwright 截图
│   ├── check-links.mjs     原文链接逐条检查
│   └── stage.mjs           生成 dist/site/ 部署产物
├── feed.xml / feed-en.xml                  AI 日报 RSS（自动生成）
├── feed-economy.xml / feed-economy-en.xml  经济日报 RSS（自动生成）
├── feed-education.xml / feed-education-en.xml  教育日报 RSS（自动生成）
├── feed-psychology.xml / feed-psychology-en.xml  心理学日报 RSS（自动生成）
├── sitemap.xml             自动生成
├── docs/自动化与部署.md     更新链路、Cloudflare / 服务器部署
├── docs/每日生成任务.md     AI 日报的作业说明
├── docs/每日生成任务-经济日报.md  经济日报的作业说明
├── docs/每日生成任务-教育日报.md  教育日报的作业说明
├── docs/每日生成任务-心理学日报.md  心理学日报的作业说明
├── docs/社交配图规则.md     公众号图片消息的图数 / 标题 / 发布规则
└── .github/workflows/      CI：校验 + 可选 Cloudflare Pages 部署
```

---

## 检查

```bash
npm run build          # 生成
npm run check          # 生成文件是否最新（CI 用）
npm run check:links    # 最新一期中英文外链
npm run stage          # dist/site/
```

---

## 部署

推荐 **Cloudflare Pages + GitHub**：push 即上线，不需要服务器。

- 构建命令：`node scripts/stage.mjs`
- 输出目录：`dist/site`
- 环境变量：`NODE_VERSION=20`

完整方案（含 GitHub Actions、自有服务器 rsync / cron、nginx、RSS）见 [`docs/自动化与部署.md`](docs/自动化与部署.md)。

每日 09:00 / 09:30 / 10:00 / 10:30 依次生成并发布四份日报（Ubuntu + DSH 定时任务、开机补跑、手机通知）见 [`docs/每日定时任务.md`](docs/每日定时任务.md)。

---

## 这次改版的几个决定

- **首页就是整份日报**：报头 + 目录 + 速览 + 全部栏目 + 期脚注，不再有摘要和「读完整份日报」。往期收进最左侧贴边的 ARCHIVE 抽屉，点贴边把手打开；桌面是竖排标签，手机是窄条把手。顶栏和底栏不再放「归档」链接。
- **工具页用标签**：全部 / 听课 / 阅读 / 许愿，标签只列已经有内容的分类；计数从卡片自动算，加工具时只加一张卡。
- **全站一套视觉**：日报的纸张色、墨色、朱红、衬线/等宽三层字体、发丝线、栏目色条，全部收进 `style.css`；产品子站也换上了同一套页头和页脚。
- **日报双语**：每期同时生成中文页和英文页；英文不是逐字直译，按标准英语重写标题、导语、摘要和「看点」。首页、往期抽屉、RSS 都按语言分开。
- **页脚**：`源泉混混，不舍昼夜，盈科而后进，放乎四海。——《孟子·离娄下》`；英文用对应译文。
- **日报脚注**：固定声明（与配图封面底部、公众号文案里的一字不差）——本期内容由 AI Agent 搜索、整理并总结，所有条目均链接原文；事实与数字以原文为准，仅供参考。标题与点评由 AI 生成，不代表任何来源立场。
- **更新链路**：生成 → `publish-daily.mjs` → GitHub → Cloudflare Pages。RSS 兜底，不依赖任何推送服务。
