#!/usr/bin/env node
/* 发布一期经济日报：daily-economy/ + economy.html + feed-economy*.xml + sitemap.xml

   用法：
     node scripts/publish-economy.mjs ../economy-daily/2026-10-30.html
     node scripts/publish-economy.mjs ../economy-daily/2026-10-30.html --en ../economy-daily/2026-10-30-en.html
     node scripts/publish-economy.mjs ../economy-daily/2026-10-30.html --push

   选项与 publish-daily 一致；--social 只属于 AI 日报。
*/

import { publish } from "./lib/publish.mjs";

publish({ section: "economy", argv: process.argv.slice(2) });
