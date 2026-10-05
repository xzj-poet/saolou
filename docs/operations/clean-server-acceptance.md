# 干净 Ubuntu 服务器验收

本清单不自动创建或修改业务数据。请在独立浏览器会话中使用名称前缀为 `验收-<UTC时间>` 的学校、楼栋、宿舍和代理；验收结束后由管理员删除或停用这些夹具。

## 准备与首次部署

1. 准备干净的 Ubuntu 24.04、域名 DNS、SSH 密钥、Docker Engine、Docker Compose v2、Git 和 curl。
2. 克隆仓库并固定到将上线的 40 位提交：

```sh
git checkout <40位提交SHA>
./deploy.sh
```

3. 将 `.env.production` 的 `SITE_ADDRESS` 改为已解析的 HTTPS 域名后，再运行 `./deploy.sh`。保存首次管理员密码和备份恢复密钥，不要把它们写入验收记录。
4. 从 Windows 拉取一份备份并成功执行一次 `verify-backup.ps1` 恢复演练，再运行首次验收：

```sh
./ops/server/clean-server-acceptance.sh --base-url https://你的域名 --expected-commit <40位提交SHA> --phase first
```

该命令会记录非秘密证据到 `acceptance-evidence/first.json`：提交、镜像标签、容器健康、HTTPS/HSTS、数据库卷身份、关键表计数、备份状态和恢复报告状态。不要把该目录提交到 Git。

## 业务人工检查

1. 管理员登录，创建 `验收-<UTC时间>` 学校、楼栋和两间宿舍；确认基础数据页面可读取。
2. 创建并授权一个 `验收-<UTC时间>` 代理，在无痕窗口登录，读取楼栋矩阵。
3. 代理对一间宿舍做单条保存，再对另一间宿舍做批量保存；确认矩阵统计更新。
4. 用两个会话同时编辑同一间宿舍。后提交的一方必须看到冲突提示，原草稿仍可见，不能静默覆盖。
5. 管理员在扫楼数据中更正一条记录；确认审计记录显示操作和前后变化。
6. 删除或停用所有 `验收-` 夹具，避免长期污染业务数据。

## 重复部署验收

保持业务数据和数据库卷不变，再次运行部署命令：

```sh
./deploy.sh
./ops/server/clean-server-acceptance.sh --base-url https://你的域名 --expected-commit <40位提交SHA> --phase repeat
```

`repeat` 会拒绝数据库卷身份变化、关键表行数减少、应用镜像提交不匹配、容器不健康、HTTPS 缺少 HSTS、备份过期，或恢复报告不存在/失败/超过 35 天。通过后保留证据文件；任何失败都先停止上线，按备份恢复手册排查。
