#!/usr/bin/env node
/* 发布一期心理学日报：daily-psychology/ + psychology.html + feed-psychology*.xml + sitemap.xml

   用法：
     node scripts/publish-psychology.mjs daily-psychology/2026-11-09.html
     node scripts/publish-psychology.mjs daily-psychology/2026-11-09.html --push
     node scripts/publish-psychology.mjs daily-psychology/2026-11-09.html --no-check-links

   选项与 publish-daily 一致；--social 只属于 AI 日报。
*/

import { publish } from "./lib/publish.mjs";

publish({ section: "psychology", argv: process.argv.slice(2) });
