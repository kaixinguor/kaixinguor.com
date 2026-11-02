// POST /api/wish —— 许愿表单的收信逻辑（由 worker/index.js 路由进来）
//
// 发送方式按优先级（有哪个用哪个）：
//   1. env.EMAIL                              —— Workers 的 send_email 绑定（wrangler.jsonc 里配）
//   2. env.CF_API_TOKEN + env.CF_ACCOUNT_ID   —— Cloudflare Email Sending 的 REST API
//   3. env.RESEND_API_KEY                     —— Resend REST（第三方，免费 3000 封/月）
//   4. 都没有                                   —— 返回 501，前端自动降级成「复制 / 用邮件 App 打开」
//
// 环境变量：
//   WISH_TO        收信地址，默认 ling.wang.nj@gmail.com（必须是 Email Routing 里已验证的 destination）
//   WISH_FROM      发信人，默认 wish-form@kaixinguor.com（它的域必须已在 Email Sending 里 onboard）
//   CF_API_TOKEN   权限：Email Sending: Edit
//   CF_ACCOUNT_ID  Cloudflare 账号 ID
//   RESEND_API_KEY Resend 的 sending key
//
// 不落库、不写日志到外部服务，只做「校验 → 转发一封邮件」。

const DEFAULT_TO = "ling.wang.nj@gmail.com";
const DEFAULT_FROM = "wish-form@kaixinguor.com";
const CF_SEND_URL = "https://api.cloudflare.com/client/v4/accounts/{id}/email/sending/send";

const MAX_SUBJECT = 200;
const MAX_BODY = 20000;
const MAX_PAYLOAD_BYTES = 24 * 1024;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const hits = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

// 只接受自家域名（以及本地调试）发来的请求，挡掉别人的跨站调用
function allowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return true; // curl / 同源表单可能没有 Origin
  return (
    /^https:\/\/(www\.)?kaixinguor\.com$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.kaixinguor\.pages\.dev$/.test(origin) ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  );
}

function throttle(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 5000) hits.clear(); // 防止 Map 无限长
    return true;
  }
  rec.count += 1;
  return rec.count <= RATE_MAX;
}

function buildText({ body, request }) {
  const ua = (request.headers.get("user-agent") || "-").replace(/[\r\n]+/g, " ");
  const when = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  return [
    body,
    "",
    "—",
    "来源：https://kaixinguor.com/wish.html",
    "时间：" + when,
    "浏览器：" + ua.slice(0, 200)
  ].join("\n");
}

async function sendWithBinding(env, message) {
  return env.EMAIL.send(message);
}

async function sendWithResend(env, message) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: "Bearer " + env.RESEND_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: "kaixinguor 许愿 <" + message.from + ">",
      to: [message.to],
      subject: message.subject,
      text: message.text
    })
  });
  if (!res.ok) {
    throw new Error("resend " + res.status + ": " + (await res.text()).slice(0, 200));
  }
  return res.json();
}

// Cloudflare Email Sending 的 REST API —— 不依赖绑定，任何 JS 运行时都能调
async function sendWithCloudflareRest(env, message) {
  const url = CF_SEND_URL.replace("{id}", env.CF_ACCOUNT_ID);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + env.CF_API_TOKEN,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      to: message.to,
      from: message.from,
      subject: message.subject,
      text: message.text
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.success === false) {
    const detail = data && data.errors && data.errors[0]
      ? data.errors[0].code + " " + data.errors[0].message
      : "HTTP " + res.status;
    throw new Error("cloudflare: " + detail);
  }
  return data.result;
}

export async function handleWish(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }
  if (!allowedOrigin(request)) return json({ ok: false, error: "origin not allowed" }, 403);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!throttle(ip)) return json({ ok: false, error: "太多请求了，过一会儿再试" }, 429);

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_PAYLOAD_BYTES) return json({ ok: false, error: "内容太大" }, 413);

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_PAYLOAD_BYTES) return json({ ok: false, error: "内容太大" }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "body must be JSON" }, 400);
  }

  // 蜜罐：正常表单没有这个字段，填了就是机器人
  if (payload.website) return json({ ok: true });

  const subject = String(payload.subject || "").replace(/[\r\n]+/g, " ").trim();
  const body = String(payload.body || "").trim();

  if (!subject || !body) return json({ ok: false, error: "标题和正文不能为空" }, 400);
  if (subject.length > MAX_SUBJECT) return json({ ok: false, error: "标题太长" }, 400);
  if (body.length > MAX_BODY) return json({ ok: false, error: "正文太长" }, 400);

  const to = env.WISH_TO || DEFAULT_TO;
  const from = env.WISH_FROM || DEFAULT_FROM;
  const text = buildText({ body, request });

  try {
    if (env.EMAIL) {
      const result = await sendWithBinding(env, { to, from, subject, text });
      return json({ ok: true, id: result && result.messageId });
    }
    if (env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
      const result = await sendWithCloudflareRest(env, { to, from, subject, text });
      return json({ ok: true, delivered: (result && result.delivered) || [] });
    }
    if (env.RESEND_API_KEY) {
      const result = await sendWithResend(env, { to, from, subject, text });
      return json({ ok: true, id: result && result.id });
    }
    return json({ ok: false, error: "not_configured" }, 501);
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err).slice(0, 200) }, 502);
  }
}
