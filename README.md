# kaixinguor.com

一个人做的小工具 + 每日 AI 日报。纯静态站点，报刊编辑风。

- 首页 = 当天 AI 日报（报头、导语、三条速览、今日头条）
- 首页左侧 ARCHIVE 侧栏 = 往期（可展开；`archive.html` 只做旧链接跳转）
- `/tools.html` = 标签式工具列表
- `/daily/YYYY-MM-DD.html` = 每一期日报
- `/feed.xml` = RSS

视觉语言来自 `ai-daily/2026-10-26.html`，抽成了 `style.css`；日报、首页、工具、许愿共用同一套 tokens 和组件。

---

## 本地预览

```bash
cd site
npm run preview        # http://127.0.0.1:8899/
```

不需要安装依赖，Node 20+ 即可。

---

## 发布一期日报

```bash
cd site
node scripts/publish-daily.mjs ../ai-daily/2026-10-26.html --check-links --push
```

它会：

1. 解析日报 HTML（自包含母版或已套壳页面都行）
2. 套上 `templates/issue.html`，写到 `daily/YYYY-MM-DD.html`
3. 重新生成首页今日区、往期侧栏、`feed.xml`、`sitemap.xml`
4. 可选：逐条检查原文链接（非 2xx 停止）
5. 可选：`git commit` + `git push`

同一天重跑会覆盖，不会追加。

---

## 目录

```
site/
├── index.html              首页（今日日报 + 往期侧栏）
├── archive.html            旧 /archive.html 跳转到 /#archive
├── tools.html              工具（标签筛选）
├── wish.html               许愿
├── privacy.html / 404.html / download.html / changelog.html
├── daily/YYYY-MM-DD.html   每一期日报
├── hark/  snipread/        两个产品子站
├── style.css               全站唯一设计系统
├── site.js                 深浅色 / 进度条 / 目录 / 工具标签
├── lang.js                 站点框架 zh/en（日报正文只做中文）
├── templates/issue.html    日报外壳
├── scripts/
│   ├── build.mjs           由 daily/ 生成首页今日区、往期侧栏、RSS、sitemap
│   ├── publish-daily.mjs   发布一期（解析 → 落盘 → 构建 → push）
│   ├── check-links.mjs     原文链接逐条检查
│   └── stage.mjs           生成 dist/site/ 部署产物
├── feed.xml                RSS（自动生成）
├── sitemap.xml             自动生成
├── docs/自动化与部署.md     更新链路、Cloudflare / 服务器部署
└── .github/workflows/      CI：校验 + 可选 Cloudflare Pages 部署
```

---

## 检查

```bash
npm run build          # 生成
npm run check          # 生成文件是否最新（CI 用）
npm run check:links    # 最新一期外链
npm run stage          # dist/site/
```

---

## 部署

推荐 **Cloudflare Pages + GitHub**：push 即上线，不需要服务器。

- 构建命令：`node scripts/stage.mjs`
- 输出目录：`dist/site`
- 环境变量：`NODE_VERSION=20`

完整方案（含 GitHub Actions、自有服务器 rsync / cron、nginx、RSS）见 [`docs/自动化与部署.md`](docs/自动化与部署.md)。

---

## 这次改版的几个决定

- **首页就是当天日报**：报头 + 导语 + 三条速览 + 今日头条；首页底部不再放「最新三期」和「工具」，往期收进左侧可展开的 ARCHIVE 侧栏。
- **工具页用标签**：全部 / 听课 / 阅读 / 许愿，标签只列已经有内容的分类；计数从卡片自动算，加工具时只加一张卡。
- **全站一套视觉**：日报的纸张色、墨色、朱红、衬线/等宽三层字体、发丝线、栏目色条，全部收进 `style.css`；产品子站也换上了同一套页头和页脚。
- **双语只做框架**：导航、工具页、许愿、隐私、404 继续 zh/en；日报正文只做中文，日报页不放语言开关（翻译成本和校对成本翻倍）。
- **更新链路**：生成 → `publish-daily.mjs` → GitHub → Cloudflare Pages。RSS 兜底，不依赖任何推送服务。
