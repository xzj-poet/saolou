# 备份、恢复与迁移手册

这套流程适用于 Ubuntu 24.04 服务器和一台由管理员掌控的 Windows 10/11 电脑。它不依赖阿里云、腾讯云或任何对象存储服务：服务器保存 7 天加密备份，Windows 电脑主动拉取并保存 30 天。

## 首次部署与密钥保管

在服务器的 Git 仓库目录执行：

```sh
./deploy.sh
```

首次部署会生成 `.env.production`，其中的 `BACKUP_ENCRYPTION_PASSWORD` 是备份恢复密钥。将它交给指定管理员，保存在密码管理器和 Windows 客户端的 DPAPI 配置中；不要把它发到聊天群、放进 Git、写进工单或粘贴到终端记录。`.env.production`、备份文件、私钥和恢复报告都不应提交。

对全新服务器而言，**Git 仓库、备份文件和恢复密钥**足以完成数据恢复；同时仍应保留域名/DNS 和 SSH 访问资料。

## 服务器日常操作

立即创建一份加密备份：

```sh
./ops/server/backup.sh --reason manual
```

查看备份、磁盘空间、每日定时器和最近恢复演练：

```sh
./ops/server/backup-status.sh --json
systemctl status campus-sweep-backup.timer
```

部署脚本会在应用健康后安装或更新每日定时器。状态为 `fresh` 表示最新备份在 48 小时内；`overdue`、`absent` 或 `corrupt` 都应先排查，再做迁移或升级。先查看日志，确认磁盘空间、Docker 和密钥配置：

```sh
journalctl -u campus-sweep-backup.service -n 100 --no-pager
docker compose --env-file .env.production logs --tail 100 db
```

不要手工删除 `backups/` 中的单个文件；一个可用备份由 `.dump.enc`、`.dump.enc.sha256` 和 `.manifest.json` 三个同名文件组成，最后一个是完成标记。

## Windows 异机副本

1. 在 Windows 上以管理员账户以外的日常管理员账户生成或导入 SSH 密钥，例如 `ssh-keygen -t ed25519`；把公钥放入服务器部署用户的 `~/.ssh/authorized_keys`。私钥不传给服务器，也不设置 SSH 登录密码给脚本。
2. 在 Windows PowerShell 输入恢复密钥；此命令会提示安全输入，随后用当前 Windows 用户的 DPAPI 保存：

```powershell
$key = Read-Host '输入备份恢复密钥' -AsSecureString
./ops/windows/setup-backup-client.ps1 -Server '服务器域名或IP' -SshUser '部署用户' -IdentityFile "$HOME\.ssh\id_ed25519" -RemoteDirectory '/服务器仓库/backups' -LocalDirectory 'D:\CampusSweepBackups' -RecoveryKey $key
```

3. 先手工拉取一次并确认输出没有 `Quarantined`：

```powershell
./ops/windows/pull-backups.ps1
```

4. 安装每日拉取和每四周恢复演练任务：

```powershell
./ops/windows/install-backup-task.ps1
```

任务使用 Windows 当前用户身份，因此该用户至少应每 48 小时登录或开机一次。出现提示或脚本返回失败时，先检查 SSH 连通性、磁盘空间和本地 `quarantine` 文件；不要删除唯一的有效本地备份。

## 隔离恢复演练

Windows 每四周会自动选择最新的已校验副本，上传到服务器专用临时目录，并让服务器恢复到一次性 PostgreSQL 18 容器。也可以人工执行：

```powershell
./ops/windows/verify-backup.ps1
```

该命令不会把数据写回生产数据卷。成功后查看 Windows 状态中的 `lastRestoreSuccessAt`，以及服务器 `restore-reports/` 中的 JSON 报告。报告失败或超过 35 天没有成功演练，都应在下一次部署前处理。

服务器端只用于本地隔离核对时可执行：

```sh
./ops/server/restore-backup.sh verify --backup /绝对路径/campus-sweep-YYYYMMDDTHHMMSSZ.dump.enc
```

不要尝试解密或恢复到正在运行的 `campus_sweep_pgdata` 卷。

## 全新服务器灾难恢复

此过程只适用于尚未创建生产数据库卷的新 Ubuntu 服务器。它不会、也不能覆盖旧服务器数据。

1. 安装 Docker Engine、Docker Compose v2、Git、OpenSSL，并克隆确认过提交的 Git 仓库。
2. 恢复 `.env.production`：可从安全保管处取回，或先运行一次 `./deploy.sh` 生成新文件后，把 `BACKUP_ENCRYPTION_PASSWORD` 替换为原备份的恢复密钥。检查权限为 `0600`。
3. 从 Windows 复制一整组已校验备份到服务器的临时目录；必须同时复制加密归档、校验文件和清单文件。
4. 确认这是一台空服务器后执行：

```sh
./ops/server/restore-backup.sh disaster-recovery --backup /绝对路径/campus-sweep-YYYYMMDDTHHMMSSZ.dump.enc --confirm-empty-server
```

5. 等待迁移、最小权限账号和应用健康检查完成，再按 [干净服务器验收](clean-server-acceptance.md) 做登录、扫楼和并发冲突冒烟测试，最后才切换域名或公网流量。

如果命令提示已有卷、容器或数据库，立即停止：这不是可安全覆盖的恢复目标。保留旧服务器和备份，改用另一台干净服务器排查。

## 服务器续费失败或迁移供应商

先从 Windows 确认有一份校验通过的副本，并记录恢复密钥。新供应商只要提供 Ubuntu 24.04、SSH 和 Docker 所需端口即可；不需要任何供应商专有 API。按“全新服务器灾难恢复”完成后，进行隔离恢复报告和业务验收，再修改 DNS。旧服务器在新站稳定前不要关机或删除数据卷。
