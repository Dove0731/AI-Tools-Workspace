# AI 知识自动同步

项目名、Codex 工作目录、Obsidian 库目录统一为：`新AI工具人`。

## 自动链路

1. 从本机 Codex 会话中只读取用户/助手正文，排除系统提示和工具输出。
2. 识别 ChatGPT 官方导出包中的 `conversations.json`；导出包可放入 `97_待整理/ChatGPT导出投递箱`，同步器也会检查当前用户的 Downloads 目录。
3. 按业务关键词存入 `07_AI工作区/AI知识同步/新AI工具人/<分类>`。
4. 使用源会话 ID 和内容哈希增量更新，避免重复。
5. Git 拉取、提交并推送到 `origin/main`，GitHub 与本地 Obsidian 共用同一事实源。

## 安全边界

- 自动隐藏常见 API Key、GitHub Token 和明文密码。
- `.env`、证书/密钥文件及超过 20MB 的文件会阻断推送。
- ChatGPT 没有面向个人历史会话的持续导出接口；需先在 ChatGPT 的“设置 → 数据控制 → 导出数据”发起官方导出。导出包下载后，其后的抓取、分类、入库和推送均自动完成。

## 手动立即执行

```powershell
powershell -ExecutionPolicy Bypass -File ".\00_工作台与规则\AI知识自动同步\sync_to_github.ps1"
```
