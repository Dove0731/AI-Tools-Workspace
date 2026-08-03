import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { loadConfig, runtimePath } from "./config.mjs";
import { buildIndex, loadIndex } from "./knowledge.mjs";
import { createQaService, configureOwnerFromLatestDraft, loadOwnerProfile } from "./service.mjs";
import { resolveLarkLaunch, startEventConsumer, syncConfiguredFeishuDocuments, syncConfiguredWikiSpaces } from "./lark.mjs";

const [command = "help", ...args] = process.argv.slice(2);
const config = loadConfig(process.env.FEISHU_QA_CONFIG);

function printHelp() {
  console.log(`飞书知识问答机器人 MVP\n\n命令：\n  doctor                 检查本机环境和安全开关\n  index                  重建本地及飞书缓存索引\n  ask <问题>             本地提问并生成待审核草稿\n  configure-owner        从最新已验证私聊草稿设置本人审核会话\n  listen                 本人直答，其他会话送审\n  sync-feishu            只读同步配置的飞书文档/Wiki，再重建索引\n`);
}

async function main() {
  if (command === "help" || command === "--help" || command === "-h") return printHelp();
  if (command === "doctor") {
    const node = process.version;
    let lark;
    try {
      const launch = resolveLarkLaunch(config);
      lark = spawnSync(launch.command, [...launch.prefixArgs, "--version"], { encoding: "utf8", windowsHide: true });
    } catch (error) {
      lark = { status: 1, stderr: error.message, stdout: "" };
    }
    const codex = spawnSync("codex", ["--version"], { encoding: "utf8", windowsHide: true });
    const indexPath = runtimePath(config, "index.json");
    console.log(JSON.stringify({
      ok: lark.status === 0,
      node,
      larkCli: lark.status === 0 ? (lark.stdout || lark.stderr).trim() : "不可用",
      codex: codex.status === 0 ? (codex.stdout || codex.stderr).trim() : "不可用（extractive 模式不受影响）",
      vaultRoot: config.vaultRoot,
      localSources: config.sources.localDirectories,
      replyMode: config.lark.replyMode,
      sendingEnabled: config.lark.sendingEnabled,
      ownerConfigured: Boolean(loadOwnerProfile(config)),
      indexExists: fs.existsSync(indexPath)
    }, null, 2));
    return;
  }
  if (command === "index") {
    const index = buildIndex(config);
    console.log(`索引完成：${index.sourceCount} 个来源，${index.chunkCount} 个片段。`);
    return;
  }
  if (command === "ask") {
    const question = args.join(" ").trim();
    if (!question) throw new Error("请提供问题，例如：node src/main.mjs ask \"新品开发有哪些阶段？\"");
    const result = await createQaService(config).answerQuestion(question);
    console.log(result.draft.answer);
    console.log(`\n草稿：${result.paths.markdownPath}`);
    return;
  }
  if (command === "sync-feishu") {
    const documents = await syncConfiguredFeishuDocuments(config);
    const wikiDocuments = await syncConfiguredWikiSpaces(config);
    const index = buildIndex(config);
    console.log(`飞书只读同步完成：直接文档 ${documents.length} 篇，Wiki 文档 ${wikiDocuments.length} 篇；索引 ${index.chunkCount} 个片段。`);
    return;
  }
  if (command === "configure-owner") {
    const owner = configureOwnerFromLatestDraft(config);
    console.log(`本人审核会话已配置：sender=${owner.senderId}，chat=${owner.chatId}，依据草稿=${owner.evidenceDraftId}`);
    return;
  }
  if (command === "approve") {
    throw new Error("命令行批准已禁用；请在本人私人审核会话中回复“同意”");
  }
  if (command === "listen") {
    if (config.lark.replyMode === "hybrid-review" && !loadOwnerProfile(config)) {
      throw new Error("尚未配置本人审核会话，请先运行 node src/main.mjs configure-owner");
    }
    const index = loadIndex(config);
    const service = createQaService(config);
    console.log(`已加载索引：${index.sourceCount} 个来源，${index.chunkCount} 个片段。`);
    console.log(`当前模式：${config.lark.replyMode}；真实发送：${config.lark.sendingEnabled ? "已开启" : "未开启"}。`);
    const consumer = startEventConsumer(config, {
      onReady() {
        console.log("飞书事件监听已就绪：本人私聊直接回复，其他会话送审。按 Ctrl+C 安全停止。");
      },
      onDiagnostic(line) {
        if (line.trim()) console.error(line);
      },
      onEvent(event) {
        service.enqueueEvent(event).then((result) => {
          if (result.ignored) console.log(`忽略事件：${result.reason}`);
          else if (result.action === "approved-and-sent") console.log(`本人已同意并发送：${result.draft.draftId}`);
          else if (result.action === "rejected") console.log(`本人已驳回：${result.draft.draftId}`);
          else if (result.action === "owner-answered-and-learned") console.log(`本人已补充回答并完成场景入库：${result.draft.draftId}`);
          else if (result.action === "no-pending-review") console.log("本人发出同意，但当前无待审核回答。");
          else if (result.route === "owner-direct" && result.draft.needsOwnerAnswer) console.log(`已请本人补充标准答案：${result.draft.draftId}`);
          else if (result.route === "owner-direct") console.log(`已直接回复本人：${result.draft.draftId}`);
          else if (result.route === "review") console.log(`已发送至本人审核：${result.draft.draftId}\n${result.paths.markdownPath}`);
          else console.log(`已生成待审核草稿：${result.draft.draftId}\n${result.paths.markdownPath}`);
        }).catch((error) => console.error(`处理事件失败：${error.message}`));
      },
      onError(error) {
        console.error(`监听失败：${error.message}`);
      },
      onClose(code) {
        console.log(`事件监听已退出，退出码：${code}`);
      }
    });
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      console.log("正在安全停止事件监听……");
      consumer.stop();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    if (!process.stdin.isTTY) {
      process.stdin.resume();
      process.stdin.on("end", stop);
    }
    return;
  }
  throw new Error(`未知命令：${command}`);
}

main().catch((error) => {
  console.error(`错误：${error.message}`);
  process.exitCode = 1;
});
