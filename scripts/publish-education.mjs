#!/usr/bin/env node
/* 发布一期教育日报：daily-education/ + education.html + feed-education*.xml + sitemap.xml

   用法：
     node scripts/publish-education.mjs daily-education/2026-11-03.html
     node scripts/publish-education.mjs daily-education/2026-11-03.html --en ../economy-daily/2026-10-30-en.html
     node scripts/publish-education.mjs daily-education/2026-11-03.html --push

   选项与 publish-daily 一致；--social 只属于 AI 日报。
*/

import { publish } from "./lib/publish.mjs";

publish({ section: "education", argv: process.argv.slice(2) });
