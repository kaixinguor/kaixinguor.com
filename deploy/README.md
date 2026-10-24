# 部署到国内服务器（阿里云 / 宝塔）

> 目标：同一套静态文件，既能放 Cloudflare，也能放你自己的 ECS。
> 放在国内的前提是**域名已备案**。

---

## 一、要传哪些文件

只传这些（其余的是开发用的，别传）：

```
index.html        wish.html        404.html
style.css         favicon.svg
hark/             snipread/
assets/
_headers          robots.txt       sitemap.xml
```

**不要传**：`docs/`（内部笔记）、`deploy/`、`preview.sh`、`wrangler.jsonc`、`.assetsignore`、`.gitignore`

打包一条命令：

```bash
cd site
./pack.sh          # 生成 dist/kaixinguor-site.zip
```

---

## 二、宝塔里的操作

1. **网站 → 添加站点**
   - 域名：`tools.mathster.cn`（子域不用单独备案）
   - PHP 版本：**纯静态**
2. 进站点目录，把 zip 解压进去，保证 `index.html` 在根目录
3. **SSL → Let's Encrypt → 申请**（自动续期）
4. **配置文件**里加上 `deploy/nginx.conf` 中 comment 标注的那几段

---

## 三、nginx 关键配置

```nginx
server {
    listen 80;
    server_name tools.mathster.cn;
    root /www/wwwroot/tools.mathster.cn;
    index index.html;

    # /hark/ 这种目录要能找到里面的 index.html
    location / {
        try_files $uri $uri/ $uri/index.html =404;
    }

    error_page 404 /404.html;

    # 静态资源缓存
    location ~* \.(css|js|svg|png|jpg|jpeg|webp|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    # HTML 不缓存，改完立刻生效
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache";
    }
}
```

宝塔的图形界面里，对应的是「配置文件」标签页，把 `server { }` 的内容替换成上面这段（保留宝塔自动加的 include 行）。

---

## 四、验证

```bash
curl -I https://tools.mathster.cn/            # 200
curl -I https://tools.mathster.cn/hark/       # 200，不能是 403
curl -I https://tools.mathster.cn/wish.html   # 200
curl -I https://tools.mathster.cn/nope        # 404，且返回你自己的 404 页
```

第四条最容易被忽略：nginx 默认的 404 是它自己的白页，不是你的。

---

## 五、以后把主域切过来

备案下来之后：

1. Cloudflare 里把 `kaixinguor.com` 的 DNS 改成「仅 DNS」，A 记录指向 ECS 的公网 IP
2. 或者直接去阿里云云解析加 A 记录，把 NS 改回阿里云
3. ECS 上再加一个站点，`server_name kaixinguor.com www.kaixinguor.com`
4. 把同样的文件解压进去

**内容一份，两处都能跑。** Cloudflare 那边留着当海外入口，随时能关。
