# kaixinguor.com

一个人做的小工具 + 中英双语每日 AI 日报。纯静态站点，报刊编辑风。

- 首页 = 当天 AI 日报全文（报头、目录、速览、全部栏目、期脚注；不再分摘要和「读全文」）
- 首页最左侧贴边 ARCHIVE 抽屉 = 往期（点贴边把手打开；`archive.html` 只做旧链接跳转）
- `/tools.html` = 标签式工具列表
- `/daily/YYYY-MM-DD.html` = 每一期中文日报
- `/daily/YYYY-MM-DD-en.html` = 每一期英文日报
- `/feed.xml` / `/feed-en.xml` = 中英文 RSS

视觉语言来自 `ai-daily/2026-10-26.html`，抽成了 `style.css`；日报、首页、工具、许愿共用同一套 tokens 和组件。

日报每期都有中文和英文两个页面；首页直接显示整份日报，并根据站点语言只显示中文或英文其中一版，不会上下堆叠。往期抽屉也同步切换。

---

## 本地预览

```bash
cd site
npm run preview        # http://127.0.0.1:8899/
```

不需要安装依赖，Node 20+ 即可。

> 改 `style.css` / `site.js` / `lang.js` 后，记得把页面里的 `?v=6` 一起加一（例如 `?v=7`）；Cloudflare 对这些静态资源有 1 小时缓存，不换版本号浏览器可能继续用旧 CSS。

---

## 发布一期日报

```bash
cd site
node scripts/publish-daily.mjs ../ai-daily/2026-10-26.html \
  --en ../ai-daily/2026-10-26-en.html \
  --check-links --push
```

它会：

1. 解析中文版和英文版 HTML（自包含母版或已套壳页面都行）
2. 套上 `templates/issue.html`，分别写到 `daily/YYYY-MM-DD.html` 和 `daily/YYYY-MM-DD-en.html`
3. 重新生成首页中英文全文、往期抽屉、`feed.xml`、`feed-en.xml`、`sitemap.xml`
4. 可选：逐条检查原文链接（非 2xx 停止）
5. 可选：`git commit` + `git push`

同一天重跑会覆盖，不会追加。

---

## 目录

```
site/
├── index.html              首页（完整日报 + 左侧往期抽屉）
├── archive.html            旧 /archive.html 跳转到 /#archive
├── tools.html              工具（标签筛选）
├── wish.html               许愿
├── privacy.html / 404.html / download.html / changelog.html
├── daily/YYYY-MM-DD.html   每一期中文日报
├── daily/YYYY-MM-DD-en.html 每一期英文日报
├── hark/  snipread/        两个产品子站
├── style.css               全站唯一设计系统
├── site.js                 深浅色 / 进度条 / 目录 / 工具标签
├── lang.js                 站点框架 zh/en
├── templates/issue.html    日报外壳
├── scripts/
│   ├── build.mjs           由 daily/ 生成首页全文、往期抽屉、RSS、sitemap
│   ├── publish-daily.mjs   发布一期（解析 → 落盘 → 构建 → push）
│   ├── check-links.mjs     原文链接逐条检查
│   └── stage.mjs           生成 dist/site/ 部署产物
├── feed.xml                RSS（中文，自动生成）
├── feed-en.xml             RSS（英文，自动生成）
├── sitemap.xml             自动生成
├── docs/自动化与部署.md     更新链路、Cloudflare / 服务器部署
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

每日 09:00 自动生成并发布（Ubuntu + DSH 定时任务、开机补跑、手机通知）见 [`docs/每日定时任务.md`](docs/每日定时任务.md)。

---

## 这次改版的几个决定

- **首页就是整份日报**：报头 + 目录 + 速览 + 全部栏目 + 期脚注，不再有摘要和「读完整份日报」。往期收进最左侧贴边的 ARCHIVE 抽屉，点贴边把手打开；桌面是竖排标签，手机是窄条把手。顶栏和底栏不再放「归档」链接。
- **工具页用标签**：全部 / 听课 / 阅读 / 许愿，标签只列已经有内容的分类；计数从卡片自动算，加工具时只加一张卡。
- **全站一套视觉**：日报的纸张色、墨色、朱红、衬线/等宽三层字体、发丝线、栏目色条，全部收进 `style.css`；产品子站也换上了同一套页头和页脚。
- **日报双语**：每期同时生成中文页和英文页；英文不是逐字直译，按标准英语重写标题、导语、摘要和「看点」。首页、往期抽屉、RSS 都按语言分开。
- **页脚**：`源泉混混，不舍昼夜，盈科而后进，放乎四海。——《孟子·离娄下》`；英文用对应译文。
- **日报脚注**：声明本期由 AI Agent 搜索、整理并总结，条目均链接原文，事实与数字以原文为准，仅供参考。
- **更新链路**：生成 → `publish-daily.mjs` → GitHub → Cloudflare Pages。RSS 兜底，不依赖任何推送服务。
