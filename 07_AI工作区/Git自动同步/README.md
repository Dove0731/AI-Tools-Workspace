# GitHub Markdown 自动同步

## 当前配置

| 项目 | 当前值 |
|---|---|
| 工作区 | `E:\新AI工具人` |
| GitHub 仓库 | `Dove0731/AI-Tools-Workspace` |
| 仓库可见性 | 私有 |
| 上传范围 | 工作区内正式目录的 `.md` 文件 |
| 排除范围 | PNG、TXT、Excel、Word、PDF、脚本、JSON、凭证、`.codex_tmp`、运行时草稿及其他被 `.gitignore` 排除的临时资料 |
| 同步方向 | 本地 Markdown → GitHub |
| 自动频率 | 每 10 分钟检查一次 |
| 启动方式 | 当前 Windows 用户登录后自动启动后台同步 |

## 安全边界

1. 同步使用独立的 `.md-sync.git` 元数据，不改变现有业务 Git 仓库及历史。
2. 每次提交前检查暂存区，发现任何非 Markdown 文件立即停止。
3. 每次提交前扫描高置信度凭证格式，发现疑似令牌或私钥立即停止。
4. 远端出现本机未知提交时自动停止，不覆盖远端内容。
5. GitHub 提交仅代表文件已同步，不代表业务资料已确认、发送或闭环。
6. 临时缓存和飞书机器人运行时草稿不作为正式知识上传；确认后的 Markdown 应移动到正式业务目录。

## ChatGPT 与 Codex 内容如何同步

ChatGPT 或 Codex 的对话不会自动从平台读取。需要沉淀的内容应先保存为本工作区内的 Markdown 文件；保存后将由本流程自动同步。

## 本地文件

- 同步脚本：`sync-markdown.ps1`，只在本机运行，不上传。
- 后台监控：`watch-markdown-sync.ps1`，只在本机运行，不上传。
- 运行日志：`auto-sync.log`，只在本机保存，不上传。
- 独立 Git 数据：根目录 `.md-sync.git`，只在本机保存，不上传。

## 手动执行

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "E:\新AI工具人\07_AI工作区\Git自动同步\sync-markdown.ps1"
```
