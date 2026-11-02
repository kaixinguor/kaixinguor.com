# 部署到阿里云 ECS（与 mathster.cn 共存）

把 `kaixinguor.com` 静态站放到 `39.107.233.27`，和同机上的 `mathster.cn`（Aiseum）并存。

- 两个站点 = 两个独立 vhost，nginx 按 Host / SNI 分流，互不影响。
- 站点根目录 `/home/project/kaixinguor.com`，与 `/home/project/aiseum` 平级。
- Cloudflare Pages 保持不动，作为回滚方案。

---

## 0. 备案状态（决定现在能不能切 DNS）

**当前：`kaixinguor.com` 在管局审核中。**

这台是**华北 2（北京）** ECS，未备案域名解析过来会被拦截 80/443。

> ⚠️ 审核期间**不要**把 `kaixinguor.com` 的 A 记录指到 `39.107.233.27`。
> 阿里云对未备案域名的拦截有时并非只拦该域名，而是**封整机 80 端口直到整改**——
> 那会连累正在提供服务的 `mathster.cn`。等备案号下来再切，只差几分钟。

- **审核中（现在）** → 只做第 1～3 步：传文件、配 80 的 vhost、在服务器本机验证。
  全程不碰 DNS，线上继续走 Cloudflare Pages，两边互不影响。
- **备案通过** → 按第 9 节的切换清单操作。

需要外部预览（手机、别人看）时，可以临时加 `kg.mathster.cn`：`mathster.cn` 已备案，
子域名随主域、不用单独备案。

---

## 1. 服务器准备（一次性）

```bash
# 目录（与 aiseum 平级）
sudo mkdir -p /home/project/kaixinguor.com

# 装 nginx / certbot（若已装，apt 会跳过）
sudo apt update
sudo apt install -y nginx rsync certbot python3-certbot-nginx
```

---

## 2. 本地构建并上传

```bash
cd ~/deepseek-harness/web-kaixinguor.com/site

bash deploy/server/deploy.sh --dry-run   # 先看会传什么
bash deploy/server/deploy.sh             # 构建 + 同步
```

约 1.2 MB、30 来个文件。首次跑完检查：

```bash
ssh root@39.107.233.27 'ls /home/project/kaixinguor.com | head; du -sh /home/project/kaixinguor.com'
```

---

## 3. 配 nginx

```bash
# 本机把配置传上去
scp ~/deepseek-harness/web-kaixinguor.com/site/deploy/server/kaixinguor.com.nginx.conf \
    root@39.107.233.27:/tmp/kaixinguor.com.conf
```

```bash
# 服务器上
sudo cp /tmp/kaixinguor.com.conf /etc/nginx/sites-available/kaixinguor.com
sudo ln -sf /etc/nginx/sites-available/kaixinguor.com /etc/nginx/sites-enabled/kaixinguor.com
sudo nginx -t && sudo systemctl reload nginx
```

先用 Host 头验证，不依赖 DNS、也不依赖证书：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: kaixinguor.com' http://127.0.0.1/
# 期望 200（走 80 会 301，若只配了 80 则直接 200）
```

> `/etc/nginx/sites-available/mathster.cn` 全程不要动。

---

## 4. DNS + 证书

**4.1 改 DNS（Cloudflare）**

| 类型 | 名称 | 内容 | 代理状态 |
|---|---|---|---|
| A | `kaixinguor.com` | `39.107.233.27` | **仅 DNS（灰云）** |
| CNAME | `www` | `kaixinguor.com` | **仅 DNS（灰云）** |

先灰云：一是让 certbot 的 HTTP-01 校验走通，二是 Cloudflare 免费节点到国内 ECS 反而更慢。
确认稳定后想开代理，再把 SSL/TLS 模式设成 **Full (strict)**。

**4.2 签证书**

```bash
# 等 DNS 生效（dig +short kaixinguor.com 返回 39.107.233.27）
sudo certbot --nginx -d kaixinguor.com -d www.kaixinguor.com --redirect
sudo systemctl list-timers | grep certbot     # 确认自动续期
```

certbot 会自己往 vhost 里写 443 块和证书路径，**不要再用仓库里的模板覆盖它**。

---

## 5. 验收

```bash
curl -I https://kaixinguor.com/                       # 200
curl -I https://kaixinguor.com/hark/                  # 200，不能是 403
curl -I https://kaixinguor.com/daily-ai/2026-10-30.html  # 200
curl -I https://kaixinguor.com/feed.xml               # 200，application/rss+xml
curl -I https://kaixinguor.com/assets/hark-icon.png   # 200，Cache-Control: max-age=604800
curl -I https://kaixinguor.com/daily/2026-10-26.html  # 301 → /daily-ai/2026-10-26.html
curl -s -o /dev/null -w '%{http_code}\n' https://kaixinguor.com/nope   # 404 且是站内 404 页
```

顺手确认两边互不影响：

```bash
curl -I https://mathster.cn/        # 仍是 Aiseum
curl -I https://mathster.cn/cs.html # 200
```

---

## 6. 日常更新

```bash
cd ~/deepseek-harness/web-kaixinguor.com/site
bash deploy/server/deploy.sh
```

发布日报的流程不变（`publish-daily.mjs` / `publish-economy.mjs --push`），
`--push` 只推 GitHub，之后跑一次 `deploy.sh` 才落到服务器。

### 可选：push 后自动同步

在 `.github/workflows/deploy.yml` 里加一个 job（不改动现有 Pages job）：

```yaml
  deploy-server:
    needs: build
    if: ${{ vars.SERVER_DEPLOY == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: site-build
          path: dist/site
      - name: rsync
        uses: burnett01/rsync-deployments@7.0.1
        with:
          switches: -avzr --delete --exclude=_headers --exclude=_redirects --exclude=.nojekyll
          path: dist/site/
          remote_path: /home/project/kaixinguor.com/
          remote_host: ${{ secrets.SSH_HOST }}
          remote_user: ${{ secrets.SSH_USER }}
          remote_key: ${{ secrets.SSH_PRIVATE_KEY }}
```

Secrets 配 `SSH_HOST` / `SSH_USER` / `SSH_PRIVATE_KEY`，Variables 里把 `SERVER_DEPLOY` 设为 `true` 才启用。

---

## 7. 回滚

- **回到 Cloudflare**：DNS 的 A 记录改回 Cloudflare 代理（橙云），或恢复 Pages 的 CNAME，站点立刻回到 CF。
- **只回滚内容**：服务器目录是独立的，`rsync` 再推一版旧的即可（`--delete` 只作用于该目录）。
- **彻底撤掉**：停用 vhost 即可，`mathster.cn` 不受影响。

```bash
sudo rm /etc/nginx/sites-enabled/kaixinguor.com && sudo nginx -t && sudo systemctl reload nginx
```

---

## 8. 踩过的坑（继承自 aiseum）

1. **别手敲 rsync**：`--delete` 少了排除项会删掉别的东西。这里目录独立，但仍只用 `deploy.sh`。
2. **别用模板覆盖 certbot 改过的配置**：会退回不存在的证书路径，HTTPS 直接 502/证书错误。
3. **站点内部是根路径绝对引用**（`/style.css`、`/feed.xml`），只能挂域名根，不能挂子目录。
4. **`www` 也要解析**，否则证书签不下来（`-d www.kaixinguor.com` 校验会失败）。

---

## 9. 备案通过当天：切换清单

前置：第 1～3 步已经做完，`curl -H 'Host: kaixinguor.com' http://127.0.0.1/` 在服务器上返回 200。

1. **Cloudflare 改 DNS**（两条，都要「仅 DNS」灰云）

   | 类型 | 名称 | 内容 |
   |---|---|---|
   | A | `kaixinguor.com` | `39.107.233.27` |
   | CNAME | `www` | `kaixinguor.com` |

2. **等生效**（通常 1～5 分钟）

   ```bash
   dig +short kaixinguor.com        # 应返回 39.107.233.27
   dig +short www.kaixinguor.com
   ```

3. **签证书**

   ```bash
   sudo certbot --nginx -d kaixinguor.com -d www.kaixinguor.com --redirect
   ```

4. **验收**：跑第 5 节的全部命令，另加一条反向确认

   ```bash
   curl -I https://mathster.cn/     # Aiseum 仍正常，未被波及
   ```

5. **挂备案号 + 公安备案**：见第 10 节。

> 想让切换瞬间就带 HTTPS（不出现“证书签发中”的空窗），可以用附录 A 的 DNS-01 预签证书。

---

## 10. 备案号上页脚（法定义务）

备案通过后，首页底部必须展示备案号并链接到工信部，否则可能被抽查整改。

站点目前 **32 个 HTML 页面都没有备案号**。位置在页脚的 `.foot-meta`：

```html
<div class="foot-meta">© 2026 kaixinguor<br><span data-i18n="footer.daily">AI 日报 · 每天更新</span></div>
```

要加的是（编号换成实际拿到的）：

```html
<a class="beian" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">京ICP备XXXXXXXX号-2</a>
```

注意两点：

- `daily-ai/*.html` 是 `templates/issue.html` 生成的，**改模板**，否则下一期日报就把备案号冲掉；
- 首页 / 经济日报页的页脚由 `scripts/build.mjs` 维护，改完跑一次 `node scripts/build.mjs --check` 确认没被覆盖。

**公安联网备案**：网站上线后 30 日内到 <https://beian.mps.gov.cn/> 办理，通过后页脚同样要挂公安备案号（`mathster.cn` 的 Aiseum 页脚已有示例）。

---

## 附录 A：提前用 DNS-01 预签证书（可选）

HTTP-01 需要域名先解析到本机，所以正常流程必须等备案通过、DNS 切过来才能签。
想省掉这一步，可以用 Cloudflare API 走 DNS-01，**域名还没解析过来也能签**，证书直接落在
`/etc/letsencrypt/live/kaixinguor.com/`。

```bash
sudo apt install -y certbot python3-certbot-dns-cloudflare
sudo install -d -m 700 /root/.secrets
sudo tee /root/.secrets/cloudflare.ini >/dev/null <<'EOF'
dns_cloudflare_api_token = 你的Cloudflare_API_Token   # 权限：Zone.DNS:Edit，范围限 kaixinguor.com
EOF
sudo chmod 600 /root/.secrets/cloudflare.ini

sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d kaixinguor.com -d www.kaixinguor.com
```

之后把 vhost 的 443 块写好指向上面这两个路径（`fullchain.pem` / `privkey.pem`），
DNS 一改完 `reload` 就是 HTTPS，不必再跑 `certbot --nginx`。
续期也走同一个 DNS 插件，`systemctl list-timers | grep certbot` 可确认。

代价：多一个 API Token 要保管、配置要自己写 443 块。**嫌麻烦就等备案通过再跑 `certbot --nginx`，多花两分钟而已。**
