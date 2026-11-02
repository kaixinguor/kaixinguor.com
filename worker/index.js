// kaixinguor.com 的 Worker 入口。
//
// 站点本身是静态资源（assets.directory = "."，由 .assetsignore 过滤），
// 只有 /api/* 需要跑代码，其余一律交还给静态资源。
//
// 注册方式见 wrangler.jsonc 的 "main" 字段；`npx wrangler deploy` 会同时上传
// 这个 Worker 和静态资源，所以 /api/wish 和页面在同一个部署里生效。

import { handleWish } from "./wish.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/wish" || pathname === "/api/wish/") {
      return handleWish(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
