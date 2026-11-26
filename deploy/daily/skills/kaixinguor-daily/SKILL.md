---
name: kaixinguor-daily
description: 更新 kaixinguor.com 的四份中英双语日报（AI、经济、教育、心理学）：接上一期时间窗口，检索并核验原文，写中英双稿，按顺序发布，生成 AI 日报公众号配图并验收线上页面。用户说「更新今天日报」「出今天的日报」或点名某一版块时使用。
---

# 日报生成（kaixinguor.com）

四份日报共用一套流程：**AI → 经济 → 教育 → 心理学**。默认一次做四份，缺一不可；用户只点名一份时，只做那一份，但窗口、双语、校验、发布规则不变。

工作目录是仓库里的 `site/`：

```bash
cd /Users/or/deepseek-harness/web-kaixinguor.com/site
```

下文所有命令都在 `site/` 下执行。先读这几份仓库文档，它们比本 skill 更细，冲突时以仓库文档为准：

- `docs/每日四报统一规则.md`（四份一起做、共用窗口终点、发布顺序、验收）
- `docs/每日生成任务.md`（AI 日报）
- `docs/每日生成任务-经济日报.md`
- `docs/每日生成任务-教育日报.md`
- `docs/每日生成任务-心理学日报.md`
- `docs/社交配图规则.md`（只有 AI 日报出图）

## 0. 铁律

1. **四份都要中英双语**：`YYYY-MM-DD.html` 与 `YYYY-MM-DD-en.html` 成对。缺英文版会让整站构建失败。
2. **四份共用一个窗口终点**；起点分别接各自上一期的 `windowEnd`，不重叠、不留空档。
3. **只收发布时间落在窗口内的报道**，按北京时间记 `MM/DD HH:MM`。境外来源先换算时区；「近日 / 日前 / 当地时间 10 日」要打开原文确认。
4. **先打开原文再决定收**。403、登录墙、软 404、只有搜索摘要的，一律换源或删条；不猜数字、不补写正文。
5. **来源只收一级和二级**：官方博客 / 论文 / 公告 / 财报 / 监管文件优先；权威媒体原创报道可用并写「据……报道」；转载、聚合、自媒体不用。
6. **同一件事只写一次**。跨期重复会被 `coverage.mjs check` 拦下；确属追更，加 `data-followup="旧闻日期"` 并写出旧条目没有的新数字。
7. **不编造**。标题和「看点」可以加工，事实、数字、引语必须来自打开过的原文。

## 1. 开工检查

```bash
TZ=Asia/Shanghai date '+%F %T %Z'
git pull --ff-only
git status --short
```

- 先看 `git status`：只应有本次之前就存在、与日报无关的改动；不要把它们混进日报提交。
- 日期取北京时间 `DATE=$(TZ=Asia/Shanghai date +%F)`。
- 如果 `daily-<section>/$DATE.html` 已存在：**手动重跑是有意的**，沿用当天已记录的窗口，不要按当前时间重算；`publish-*` 会覆盖同一天，不会追加。

### 1.1 窗口

```bash
node scripts/coverage.mjs window --section ai
node scripts/coverage.mjs window --section economy
node scripts/coverage.mjs window --section education
node scripts/coverage.mjs window --section psychology
```

- `start` 就是上一期的 `windowEnd`；`end` 取四份中**同一个时刻**，记下来后面四份都用它。
- 页面里要逐字写入：
  - `<meta name="issue-window" content="START/END">`
  - metabar：`窗口 11/11 09:12 – 11/12 09:17`（英文 `Window Nov 11, 09:12 – Nov 12, 09:17`）
- 当天 09:30 有例行数据（CPI/PPI 等）且经济日报要写进头条时，等数据落地再统一收口；否则按实际完成时间收口。
- 窗口一旦写进页面就不要改；改了会被发布检查拒绝。

### 1.2 期号与模板

```bash
ls daily-ai daily-economy daily-education daily-psychology | tail
```

- 期号 = 该版块上一期 +1；中文 `第 018 期`，英文 `Issue 018`。
- **版式母版 = 该版块最近一期**（中英各一份）。复制它的 head、masthead、TOC、footer 结构，只换内容。
- 日期：`2026 年 11 月 12 日` + 星期 `THU`；英文 `November 12, 2026`。

## 2. 选题与检索

每个版块至少 **10 个不同角度**的检索、3 轮以上；对已发现的线索再做公司名 / 产品名 / 事件名的二次搜索。角度按该版块的作业说明铺（模型、产品、研究安全、具身、资本；宏观、价格、财政、能源、公司；政策、学校、职教、技术、国际；社会、临床、技术产业、方法、政策）。

每条候选都要：

1. `web_fetch` 打开原文，核对标题、发布时间、正文首段。
2. 记录 `MM/DD HH:MM`（北京时间）、来源名、原文链接。
3. 打不开就整条删掉，不拿转载顶替、不凭标题补写。
4. 同一事件最多一条；先看最近 7 期头条与卡片标题，`node scripts/coverage.mjs report` 会列相似对。
5. 条数：AI 5–9（建议 8–9）、经济 4–9（常态 5–9）、教育 3–9（常态 4–9）、心理 3–9（常态 4–9）。不够就按各自下限少发，并在交付里说明，不凑数。

**并行分工（可选，赶时间时）**：AI 日报自己写；经济 / 教育 / 心理各派一个 subagent 做「检索 + 中英双稿」，prompt 必须给死：窗口起止、期号、条数、栏目、来源分级、只写自己版块、写完跑 `coverage check` 与 `check-links`、**不许 publish、不许 git**。主 agent 必须逐份复核链接与头条事实后再发布。

## 3. 写稿

以母版为骨架，替换 masthead / deck / TL;DR / 各栏目卡片 / 页脚。发布脚本会重新套模板并生成首页与 RSS，但**源稿本身要能被 `parseIssue` 解析**。

### 3.0 文风（先读，再写）

四份的声音不同，统一按 `docs/写作风格.md` 执行，逐条示范见 `docs/写作风格-改写示例.md`：

| 日报 | 声音 | 第一句 | 看点回答 |
|---|---|---|---|
| AI | 工程师的现场笔记 | 能力或成本的变化 | 今天能不能用，差哪一步 |
| 经济 | 通讯社的冷静 | 最反常的那个数 | 谁的账变了，什么条件下反转 |
| 教育 | 政策与课堂之间的翻译 | 明天早上会发生什么 | 落地卡在哪，看哪个指标 |
| 心理学 | 科学的克制 | 一个反常识的比例或场景 | 这个研究能说 / 不能说什么 |

四条硬线：

1. 平均句长 ≤ 40 字，句长 p90 ≤ 60 字；一段承重数字不超过两个。
2. 「不是 A，而是 B」每期 ≤ 2 次；「口径 / 证据强度 / 谁付钱 / 可持续性」不作段首标签。
3. 作者名单、DOI、文件全名压到来源行或句末，第一段只给「发现了什么 / 什么变了」。
4. 写完跑 `npm run style -- daily-<section>/web/$DATE.html`，句长、标签、冒号三项有硬伤先改。

### 3.1 头部

- `<title>`、`description`、`og:title`、`og:description`、`og:url`、canonical、hreflang 全部改成当天。
- 英文版 `<html lang="en">`，中文版 `lang="zh-CN"`。
- masthead 的 kicker、`<h1 class="date">`、deck、metabar（期号 / 窗口 / 条数 / 阅读分钟）四处日期与数字必须一致。

### 3.2 栏目与双语标签（最容易错）

中文页：

```html
<h2>模型与能力</h2>
<span class="cen">Models &amp; Capability</span>
```

英文页：

```html
<h2>Models &amp; Capability</h2>
<span class="cen">模型与能力</span>
```

- `<h2>` 是当前语言的主标签，`span.cen` 是另一语言；**反了会导致英文页 TOC 显示中文**。
- TOC 里的栏目名跟当前语言走；英文页 TOC 写英文。
- 栏目没有合格内容就少一条，不要硬凑；解析器只收录有卡片的栏目。

### 3.3 卡片

每张卡片必须齐：

```html
<article class="card">
  <div class="cmeta">
    <span class="d">11/11 14:18</span>
    <a class="src" href="原文链接" target="_blank" rel="noopener noreferrer">来源名 ↗</a>
  </div>
  <h3>陈述句标题，不用「震惊」「炸裂」</h3>
  <p>2–4 段事实：时间、主体、动作、数字、口径。</p>
  <p class="why"><b>看点</b>为什么重要；不复述事实，给出判断依据。</p>
</article>
```

- 头条的「看点」可加一句副视角：`<br><b>另一个视角</b>……`，仍然写在同一个 `<p class="why">` 里；不要新开第二个 `why`。
- 英文版不是逐句直译：公司名、产品名、数字、引语准确，表达自然。
- 正文里的 `&` 写成 `&amp;`；引号、破折号用中文全角；不要引入 `<style>`。
- 标题里不要写「据知情人士」这类未官宣内容；传闻不进标题。

### 3.4 速览与页脚

- `<ol class="tldr">` 固定 3 条：头条、资本/产业（或政策/市场）、研究/安全。每条 `<li><span class="idx">01</span><p><b>…</b>…</p></li>`。
- 页脚：

```html
<p>本期收录 2026 年 11 月 11 日 09:12 至 11 月 12 日 09:17（北京时间）之间发布的报道，共 7 条。检索时间 11/12 09:17。</p>
<p class="disclaimer"><b>声明</b> 本期内容由 AI Agent 搜索、整理并总结，所有条目均链接原文；事实与数字以原文为准，仅供参考。标题与点评由 AI 生成，不代表任何来源立场。</p>
<p class="sig">AI Daily · Issue 018 · 24h window · Generated 2026-11-12 09:17</p>
```

声明段**逐字照抄**母版，中英各自一套。英文页脚：

```html
<p>This issue covers reports published between November 11, 09:12 and November 12, 09:17 (Beijing time): 7 stories. Compiled at 11/12 09:17.</p>
<p class="disclaimer"><b>Note</b> This issue was searched, assembled and summarised by an AI agent, and every item links to its original source. Facts and figures follow the originals and are for reference only. Headlines and commentary are AI-generated and do not represent the position of any source.</p>
<p class="sig">AI Daily · Issue 018 · 24h window · Generated 2026-11-12 09:17</p>
```

## 4. 自检（发布前必须全绿）

```bash
node -e "import('./scripts/lib/issue.mjs').then(m=>{for(const f of ['daily-ai/web/DATE.html','daily-ai/web/DATE-en.html']){const i=m.parseIssue(f);console.log(f,i.dateISO,i.issueNo,i.cards.length,i.windowStart,i.windowEnd,i.chapters.map(c=>c.cards.length).join('/'))}})"
node scripts/coverage.mjs check daily-ai/web/DATE.html
node scripts/check-links.mjs daily-ai/web/DATE.html
npm run style -- daily-ai/web/DATE.html
```

- `parseIssue`：日期、期号、条数、窗口、栏目数都对；英文版同样是当天、同期号、同条数。
- `coverage`：**不能有 error**。起点必须等于上一期 `windowEnd`；重叠会被拒。追更的 warn 要有 `data-followup` 和新数字。
- `check-links`：不能有 `✗`（4xx/5xx/软 404）。`⚠ 读不到标题` 不阻断，但必须自己在浏览器/`web_fetch` 核对标题、时间、首段；当天内尽量换成可读标题的等价来源。
- `style`：句长、模板标签、标题冒号三项有 `✗` 就先改；它是体检，不阻断发布，但连续几期不达标说明文风又滑回研究所备忘。
- 发布脚本默认会再跑一遍 `coverage check` 和 `check-links --strict`，所以上面的问题不要留到发布。

## 5. 发布（顺序固定）

```bash
node scripts/publish-daily.mjs      daily-ai/web/DATE.html         --en daily-ai/web/DATE-en.html         --push
node scripts/publish-economy.mjs    daily-economy/web/DATE.html    --en daily-economy/web/DATE-en.html    --push
node scripts/publish-education.mjs  daily-education/web/DATE.html  --en daily-education/web/DATE-en.html  --push
node scripts/publish-psychology.mjs daily-psychology/web/DATE.html --en daily-psychology/web/DATE-en.html --push
```

- 按 **AI → 经济 → 教育 → 心理学** 发；后一份先读前一版块写了什么，避免头条和角度撞车。
- 每份脚本会：套模板、写 `daily-<section>/*.html`、重建对应首页 + 两套 RSS + sitemap、链接检查、`git commit` + `push`。
- **构建会检查四份的成对情况**：如果当天某个版块只有中文稿、没有英文稿，任何一份的构建都会失败（报 `缺少英文版 …`）。所以要么四份都成对，要么先补齐再发。
- 失败时不要用 `--allow-bad-links` 硬发；先处理链接。只有排障才用 `--no-check-links`，并在交付里说明。
- 推送后 Cloudflare Pages 需要 1–2 分钟；刚发完出现 404 先等再重试，不要重复发布。

### 5.1 线上验收

```bash
for s in daily-ai daily-economy daily-education daily-psychology; do
  for u in "https://kaixinguor.com/$s/DATE" "https://kaixinguor.com/$s/DATE-en"; do
    node -e "fetch('$u',{signal:AbortSignal.timeout(20000)}).then(r=>console.log('$u',r.status)).catch(e=>console.log('$u','ERR',e.message))"
  done
done
```

四个首页（`/`、`/economy.html`、`/education.html`、`/psychology.html`）也要 200，并各自包含当天头条里的一个关键词。最后：

```bash
npm run check
git status --short
git log --oneline -5
```

- `npm run check` 应显示四份「已是最新」。
- `git status` 只应剩本次之前就存在的无关改动；四份日报与首页、RSS、sitemap 都应已提交并推送。

## 6. 公众号配图（只有 AI 日报）

```bash
node scripts/make-social.mjs daily-ai/web/DATE.html
```

产物在 `daily-ai/social/DATE/`：

- `wechat/01-cover.png` → `05-overview.png`，5 张 1080×1440（3:4），没有尾页；
- `公众号-图片消息.md`：标题 / 描述 / 逐图说明 / 发布步骤，可直接复制；
- `README.txt`、`manifest.json`；加 `--zip` 才打包。

当前版式（2026-11-12 起）：

- 封面 = 日期 + 摘要 + 「今日三条」+ 声明 + 统计条，**不放当天 headline**；
- 02–04 重点页 = 栏目条 + 标题 + 摘要 + 看点，**底部没有「本期还有」**；
- 05 速览 = 本期全部条目的标题清单；
- 标题、摘要、看点按整句 / 分句收尾，实在放不下用「……」；不要用 CSS 行数把句子从中间切断。

生成后逐张看一遍：标题是否完整、有没有句子被截断、「本期还有」是否已消失、5 张尺寸是否都是 1080×1440。经济 / 教育 / 心理三份**不出图**，不要对它们跑 `make-social`。

## 7. 交付

给用户的结果里至少包含：

- 四份的中英链接、期号、条数、头条；
- 统一窗口（起止，北京时间）；
- 校验结论：`coverage` 无重复/窗口相接、链接 0 条打不开（注明需人工确认的链接已核对）、`npm run check` 通过、线上 8 个页面 + 4 个首页 200；
- AI 日报 5 张图路径 + `公众号-图片消息.md` 路径；
- git 提交/推送情况，以及工作区里与本次无关的既有改动（不要擅自提交）。

## 8. 常见故障

| 现象 | 原因 / 处理 |
|---|---|
| 构建报 `缺少英文版 daily-X/DATE-en.html` | 当天该版块只有中文稿；先补英文版再发任何一份 |
| `coverage` 报窗口重叠 | 本期 `start` 没接上一期 `windowEnd`；照 `coverage.mjs window` 的输出改 |
| `check-links` 报 403 / 超时 | 换同事件的等价来源；确实只有这一家时，人工浏览器确认后再决定，不要默认 `--allow-bad-links` |
| `check-links` 报「读不到标题」 | 多为 JS 壳或分段响应，不等于失效；`web_fetch` 或浏览器核对标题/时间/首段 |
| 英文页 TOC 出现中文 | 英文页的 `<h2>` 写成了中文；`h2` 用英文、`span.cen` 用中文 |
| 首页/RSS 没更新 | 发布脚本在构建阶段失败（常见是缺英文版）；修好后重跑对应 `publish-*` |
| 刚 push 线上 404 | Cloudflare Pages 还在构建，等 1–2 分钟重试 |
| 旧闻被当成今天 | 「近日/日前」稿、外媒「当地时间 10 日」都要换算北京时间并确认网页发布时间；在窗口外就删 |
| 同一事件两份日报都写 | 允许，但角度和数字要各写各的；发布脚本只提示不拦，AI/经济/教育的头条不要逐字重复 |

## 9. 最小执行清单

- [ ] 窗口起点接上期、四份终点相同
- [ ] 四份中英成对、期号 +1、日期/星期正确
- [ ] 每条链接打开过、时间在窗口内、来源分级合格
- [ ] 3 条 TL;DR、栏目齐全、每卡有看点
- [ ] `coverage check` 无 error、`check-links` 无 ✗、`npm run style` 句长与标签无硬伤
- [ ] 按 AI→经济→教育→心理 发布并 push
- [ ] 8 个页面 + 4 个首页 200，`npm run check` 通过
- [ ] AI 5 张图齐全、尺寸正确、无「本期还有」、无半句截断
- [ ] `git status` 干净（除既有无关改动）
