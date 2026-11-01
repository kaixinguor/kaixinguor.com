#!/usr/bin/env node
/* 把当天生成的公众号「图片消息」图，自动填进微信公众号草稿箱（draft/add, article_type=newspic）。

   用法：
     node scripts/wechat-draft.mjs daily-ai/social/2026-11-01/manifest.json
     node scripts/wechat-draft.mjs daily-economy/social/2026-11-01/manifest.json --dry-run

   凭据：环境变量 WECHAT_APPID / WECHAT_APPSECRET；没有就读 ~/.env 里的同名变量。
   不做登录态模拟、不群发、不发表——只创建草稿，剩下的在 mp.weixin.qq.com 草稿箱里人工确认。

   需要公众号具备：认证主体 + 草稿/素材接口权限 + 本机出口 IP 在后台「IP 白名单」里。
   个人主体订阅号通常没有这些权限，接口会返回 48001（api unauthorized）。
*/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API = "https://api.weixin.qq.com";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const manifestPath = args.find((a) => !a.startsWith("--"));

if (!manifestPath) {
  console.error("用法：node scripts/wechat-draft.mjs <manifest.json> [--dry-run]");
  process.exit(1);
}

/* ---------- 凭据 ---------- */
function loadEnvFile() {
  const file = path.join(os.homedir(), ".env");
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const envFile = loadEnvFile();
const APPID = process.env.WECHAT_APPID || envFile.WECHAT_APPID;
const APPSECRET = process.env.WECHAT_APPSECRET || envFile.WECHAT_APPSECRET;

if (!APPID || !APPSECRET) {
  console.error("✗ 没有找到 WECHAT_APPID / WECHAT_APPSECRET（环境变量或 ~/.env）");
  process.exit(1);
}

/* ---------- manifest ---------- */
const base = path.dirname(path.resolve(manifestPath));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const images = (manifest.files?.wechat || []).map((rel) => path.join(base, rel));
const title = manifest.wechatTitle;
const storyBrief = (manifest.stories || [])
  .slice(0, 3)
  .map((s) => `· ${s.title}`)
  .join("\n");

const description = [
  manifest.deck,
  "",
  `窗口：${manifest.window}（北京时间）`,
  `本期 ${manifest.count} 条 · 阅读约 ${manifest.readMinutes} 分钟`,
  "",
  "声明 本期内容由 AI Agent 搜索、整理并总结，所有条目均链接原文；事实与数字以原文为准，仅供参考。标题与点评由 AI 生成，不代表任何来源立场。"
].join("\n");

if (!images.length) {
  console.error("✗ manifest 里没有 files.wechat");
  process.exit(1);
}
for (const file of images) {
  if (!fs.existsSync(file)) {
    console.error(`✗ 找不到图片：${file}`);
    process.exit(1);
  }
}

console.log(`准备草稿：${title}`);
console.log(`  图片 ${images.length} 张，标题 ${title.length} 字，描述 ${description.length} 字`);
if (dryRun) {
  console.log("\n--dry-run：只检查本地文件，不调用接口。");
  process.exit(0);
}

/* ---------- 接口 ---------- */
async function getToken() {
  const url = `${API}/cgi-bin/stable_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credential", appid: APPID, secret: APPSECRET, force_refresh: false })
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`取 access_token 失败：${data.errcode} ${data.errmsg}`);
  }
  return data.access_token;
}

async function uploadImage(token, file) {
  const form = new FormData();
  const buf = fs.readFileSync(file);
  form.append("media", new Blob([buf], { type: "image/png" }), path.basename(file));
  const res = await fetch(`${API}/cgi-bin/material/add_material?access_token=${token}&type=image`, {
    method: "POST",
    body: form
  });
  const data = await res.json();
  if (!data.media_id) {
    throw new Error(`上传失败 ${path.basename(file)}：${data.errcode} ${data.errmsg}`);
  }
  return { file: path.basename(file), media_id: data.media_id, url: data.url };
}

async function addDraft(token, list) {
  const body = {
    articles: [
      {
        article_type: "newspic",
        title,
        content: description,
        image_info: { image_list: list.map((x) => ({ image_media_id: x.media_id })) },
        need_open_comment: 0
      }
    ]
  };
  const res = await fetch(`${API}/cgi-bin/draft/add?access_token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

try {
  const token = await getToken();
  console.log("✓ access_token 已获取");

  const uploaded = [];
  for (const file of images) {
    const item = await uploadImage(token, file);
    uploaded.push(item);
    console.log(`  ↑ ${item.file}`);
  }

  const draft = await addDraft(token, uploaded);
  if (draft.media_id) {
    console.log(`\n✓ 草稿已创建：media_id=${draft.media_id}`);
    console.log("  去 mp.weixin.qq.com → 草稿箱 里确认标题、描述、图片顺序，再决定发不发。");
  } else {
    console.error(`\n✗ 建草稿失败：${draft.errcode} ${draft.errmsg}`);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  console.error("  如果错误码是 40164：把本机出口 IP 加进公众号后台的 IP 白名单。");
  console.error("  如果错误码是 48001：这个账号（多为个人主体订阅号）没有草稿/素材接口权限。");
  process.exitCode = 2;
}
