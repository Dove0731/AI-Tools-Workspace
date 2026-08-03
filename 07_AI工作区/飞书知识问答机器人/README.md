# 飞书知识问答机器人 MVP

## 当前结论

本项目已经把“飞书消息接收、受控知识检索、本人直答、其他会话送审、带来源回答、审计记录”串成一个本机服务。

当前业务状态必须分开记录：

- 飞书消息接收：已通过真实私聊事件验证。
- 本地知识问答程序：已创建，需完成本机测试后确认技术可用。
- 飞书云文档/Wiki 同步：接口已预留，具体空间和文档范围待确认。
- 机器人真实回复：本人私聊直接回复；其他会话先送到本人私人审核会话，只有本人回复“同意”后才发送到原会话。
- 无可靠参考答案：机器人不会编造；它会请本人补充标准答案，按本人回复原文发送，并把该问答录入本机场景库。
- 正式业务上线：未完成。

## 默认知识范围

当前只索引以下 Markdown/TXT 目录：

- `00_工作台与规则`
- `06_经验与模板`
- `09_产品开发管理`
- `10_采购与成本管理`
- `docs`

不索引 `97_待整理`、`98_AI输出暂存区`、`99_归档`、`07_AI工作区`、凭据、密钥、Codex 原始会话和隐藏工具目录。知识范围在 [config/config.json](./config/config.json) 中配置。

## 使用方法

在本目录打开 PowerShell。因为当前 PowerShell 会拦截 `npm.ps1`，直接使用 `node`，不需要安装第三方依赖。

### 1. 环境检查

```powershell
node src/main.mjs doctor
```

### 2. 建立索引

```powershell
node src/main.mjs index
```

也可双击 `重建知识索引.cmd`。

### 3. 离线提问

```powershell
node src/main.mjs ask "新品开发有哪些阶段？"
```

回答及来源会写入 `runtime/drafts/YYYY-MM-DD/`。运行数据均在 `.gitignore` 中排除。

### 4. 启动飞书监听

先停止之前手工运行的 `lark-cli.cmd event consume ...`，避免同一个事件被两个消费者重复处理，然后运行：

```powershell
node src/main.mjs listen
```

首次切换混合审核模式时先执行：

```powershell
node src/main.mjs configure-owner
```

该命令从最新已验证的本人私聊草稿提取身份，保存到已被 Git 排除的 `runtime/owner.json`，终端只显示掩码。

也可双击 `启动草稿监听.cmd`。看到“飞书事件监听已就绪”后：

- 你本人在机器人私聊中提问：机器人直接回复。
- 其他人私聊机器人：回答发送到你的机器人私聊中审核。
- 群聊：只有 @机器人消息进入审核流程。
- 你在私人审核会话回复 `同意`：发送最近一条待审核回答。
- 有多条待审时可回复 `同意 QA-编号` 精确指定。
- 回复 `驳回 QA-编号`：终止发送并留痕。
- 当知识库无可靠资料时，审核消息会显示“待补充知识回答”。你直接使用飞书的“回复”功能回答该消息，机器人会把回复原文发到原会话并录入场景库。
- 无法使用“回复”功能时，可发送 `补充 QA-编号：标准答案`。
- 只有本人私人会话中的 `sender_id + chat_id` 同时匹配，并且回复关联到指定待补充消息时，才会触发这条逻辑；普通私聊不会被误识别。

按 `Ctrl+C` 安全停止，不要强制结束进程。

### 5. 随飞书自动运行

已保存的自动运行设置位于 `config/config.json` 的 `autostart`：

- Windows 登录后，当前用户“启动”目录中的隐藏启动脚本会运行联动器。
- 联动器每 10 秒检查一次 `Feishu.exe`。
- 飞书打开且机器人未运行时，自动启动 `node src/main.mjs listen`。
- 已有手工监听时不会重复启动。
- 飞书退出时，只安全停止由联动器自己启动的监听，不强制结束手工监听。
- 运行日志写入 `runtime/autostart.log` 和 `runtime/autostart-listener.log`。

启动项名称：`Feishu Knowledge QA Autostart.vbs`。禁用自动联动可把 `autostart.enabled` 改为 `false`，或移除该启动项；这不会改变审核、发送或知识范围设置。系统拒绝了非管理员账户创建计划任务，因此当前使用无需提权的用户级启动项。

## 飞书云文档与 Wiki 同步

只有明确核准的资源才应写入配置：

```json
{
  "sources": {
    "feishuDocuments": [
      {
        "title": "已核准的制度文档",
        "doc": "飞书文档 URL 或 token"
      }
    ],
    "feishuWikiSpaces": [
      {
        "spaceId": "数字 space_id"
      }
    ]
  }
}
```

配置后执行：

```powershell
node src/main.mjs sync-feishu
```

该命令只使用 `docs +fetch`、`wiki +node-list` 读取，不创建、修改或删除飞书内容。Wiki 同步使用用户身份，因此必须等待相应只读授权通过，并且用户本身有权读取目标空间。

## 回答生成方式

默认 `answer.provider=extractive`：从命中的正式资料中提取相关句子，不调用外部模型，证据不足时返回“待确认”。

如果后续希望由 Codex 把检索结果组织成更自然的回答，可以将配置改为：

```json
"answer": {
  "provider": "codex"
}
```

Codex 模式采用临时会话、忽略项目规则和用户 MCP 配置，只把已检索片段放入提示词；失败时自动降级为资料摘录。启用前仍应先用真实问题检查准确性、成本和响应时间。

## 真实发送门禁

混合审核模式使用以下设置：

```json
"replyMode": "hybrid-review",
"sendingEnabled": true,
"allowedSenderIds": [],
"allowedChatIds": []
```

本人身份不写入本配置，而是保存在 `runtime/owner.json`。命令行批准入口已禁用；只有本人 `sender_id + 私聊 chat_id` 同时匹配时，飞书内的“同意/驳回”命令才有效。其他人的问题在本人同意前不会发回原会话。

## 运行证据

- `runtime/index.json`：当前知识索引。
- `runtime/drafts/`：待审核问题和回答。
- `runtime/qa-audit.jsonl`：事件、检索和发送审计记录。
- `runtime/processed-message-ids.json`：消息去重记录。
- `runtime/qa-knowledge.sqlite`：本人确认的问答场景库；同一规范化问题再次补充时更新标准答案。

场景入库后会立即重建索引，后续相似问题可检索到“本人确认的问答场景”。这个 SQLite 文件和其他 `runtime` 数据一样已被 Git 排除，不会写入 Obsidian 正式知识目录。

这些文件只能证明技术运行情况，不代表回答已获得业务确认，也不代表消息已经发送。
