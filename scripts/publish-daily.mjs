#!/usr/bin/env node
/* 发布一期 AI 日报：daily-ai/ + index.html + feed.xml / feed-en.xml + sitemap.xml

   用法：
     node scripts/publish-daily.mjs daily-ai/2026-10-26.html
     node scripts/publish-daily.mjs daily-ai/2026-10-26.html --en ../ai-daily/2026-10-26-en.html
     node scripts/publish-daily.mjs daily-ai/2026-10-26.html --social --push

   选项：
     --en <file>        英文版；不写就找同目录的 YYYY-MM-DD-en.html
     --no-check-links   跳过原文链接检查（仅限排障）
     --allow-bad-links  链接检查失败也继续发布
     --social           发布后生成本地公众号配图（5 张，不上线）
     --push             git add + commit + push
     --dry-run          只解析和打印，不写文件
*/

import { publish } from "./lib/publish.mjs";

publish({ section: "ai", argv: process.argv.slice(2) });
