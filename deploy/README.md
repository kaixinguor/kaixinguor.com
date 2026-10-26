# 部署到自有服务器（阿里云 / 宝塔）

> 目标：同一份 `dist/site/`，既能放 Cloudflare，也能放你自己的 ECS。
> 放国内的前提是**域名已备案**。
> 自动更新的完整方案见 [`docs/自动化与部署.md`](../docs/自动化与部署.md)。

---

## 一、先生成产物

```bash
cd site
npm run build     # 首页 / 往期侧栏 / RSS / sitemap
npm run stage     # 生成 dist/site/
./pack.sh         # 或者生成 dist/kaixinguor-site.zip
```

上传 `dist/site/` 里的内容。**不要**直接上传仓库根目录——`scripts/`、`docs/`、`deploy/` 是开发文件。

`dist/site/` 里应该有：

```
index.html  archive.html  tools.html  wish.html  privacy.html  404.html
daily/      hark/         snipread/   assets/
style.css   site.js       lang.js     favicon.svg
feed.xml    sitemap.xml   robots.txt  _headers
```

---

## 二、宝塔里的操作

1. **网站 → 添加站点**
   - 域名：`tools.mathster.cn`（子域不用单独备案）
   - PHP 版本：**纯静态**
2. 把 `dist/site/` 里的文件解压/上传到站点根目录，保证 `index.html` 在最外层
3. **SSL → Let's Encrypt → 申请**（自动续期）
4. 配置文件里用下面这段

---

## 三、nginx 关键配置

```nginx
server {
    listen 80;
    server_name tools.mathster.cn;
    root /www/wwwroot/tools.mathster.cn;
    index index.html;

    # /hark/、/daily/ 这种目录要能找到里面的 index.html
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

    # RSS 也别缓存太久
    location = /feed.xml {
        expires -1;
        add_header Cache-Control "no-cache";
    }
}
```

宝塔的图形界面里，对应「配置文件」标签页，把 `server { }` 的内容替换成上面这段（保留宝塔自动加的 include 行）。

---

## 四、自动更新到服务器

### 推荐：GitHub Actions 构建 + rsync（服务器不装 Node）

在 `.github/workflows/deploy.yml` 里加一个 job，构建后把 `dist/site/` 同步到服务器：

```yaml
  deploy-server:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: site-build
          path: dist/site
      - name: rsync
        uses: burnett01/rsync-deployments@7.0.1
        with:
          switches: -avzr --delete
          path: dist/site/
          remote_path: /www/wwwroot/tools.mathster.cn/
          remote_host: ${{ secrets.SSH_HOST }}
          remote_user: ${{ secrets.SSH_USER }}
          remote_key: ${{ secrets.SSH_PRIVATE_KEY }}
```

触发仍然是 `git push`。Secrets 配 `SSH_HOST`、`SSH_USER`、`SSH_PRIVATE_KEY`。

### 简单：服务器 cron 自己拉

```bash
# /etc/cron.d/kaixinguor  （每 5 分钟）
*/5 * * * * root cd /opt/kaixinguor-src && git pull --ff-only && node scripts/stage.mjs && rsync -a --delete dist/site/ /www/wwwroot/tools.mathster.cn/
```

前提：服务器装了 Node 20+，并且 `/opt/kaixinguor-src` 是仓库克隆。日志要能看见（`>> /var/log/kaixinguor.log 2>&1`）。

**不推荐**再做一个公网 webhook 接口：增益只有「实时几秒」，维护成本却是鉴权 + 公网入口 + 防刷。

---

## 五、验证

```bash
curl -I https://tools.mathster.cn/            # 200
curl -I https://tools.mathster.cn/hark/       # 200，不能是 403
curl -I https://tools.mathster.cn/daily/2026-10-26.html   # 200
curl -I https://tools.mathster.cn/feed.xml    # 200，Content-Type: application/rss+xml 或 xml
curl -I https://tools.mathster.cn/nope        # 404，且返回你自己的 404 页
```

第四条最容易被忽略：nginx 默认的 404 是它自己的白页，不是你的。

---

## 六、以后把主域切过来

备案下来之后：

1. Cloudflare 里把 `kaixinguor.com` 的 DNS 改成「仅 DNS」，A 记录指向 ECS 的公网 IP
2. 或者直接去阿里云云解析加 A 记录，把 NS 改回阿里云
3. ECS 上再加一个站点，`server_name kaixinguor.com www.kaixinguor.com`
4. 把同样的 `dist/site/` 解压进去

**内容一份，两处都能跑。** Cloudflare 那边留着当海外入口，随时能关。
