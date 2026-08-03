import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { saveFeishuCache } from "./knowledge.mjs";

export function resolveLarkLaunch(config) {
  const configured = config.lark.executable;
  if (!configured.toLowerCase().endsWith(".cmd")) return { command: configured, prefixArgs: [] };
  const candidates = [];
  if (path.isAbsolute(configured)) candidates.push(configured);
  else {
    for (const directory of String(process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
      candidates.push(path.join(directory.replace(/^"|"$/g, ""), configured));
    }
  }
  const wrapper = candidates.find((candidate) => fs.existsSync(candidate));
  if (!wrapper) throw new Error(`找不到 ${configured}`);
  const script = path.join(path.dirname(wrapper), "node_modules", "@larksuite", "cli", "scripts", "run.js");
  if (!fs.existsSync(script)) throw new Error(`找不到飞书 CLI Node 入口：${script}`);
  return { command: process.execPath, prefixArgs: [script] };
}

function runCli(config, args, { input = "", timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    env.LARKSUITE_CLI_NO_UPDATE_NOTIFIER = "1";
    env.LARKSUITE_CLI_NO_SKILLS_NOTIFIER = "1";
    if (config.lark.ignoreProxy) env.LARK_CLI_NO_PROXY = "1";
    const launch = resolveLarkLaunch(config);
    const child = spawn(launch.command, [...launch.prefixArgs, ...args], {
      cwd: config.projectRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.stdin.end();
      child.kill();
      reject(new Error(`lark-cli 超时：${args.slice(0, 3).join(" ")}`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`lark-cli 退出码 ${code}：${stderr.slice(-1200)}`));
      resolve({ stdout, stderr });
    });
    child.stdin.end(input, "utf8");
  });
}

function parseCliJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("lark-cli 未返回 JSON");
  const payload = JSON.parse(trimmed);
  if (payload.ok !== true) throw new Error(`lark-cli 返回失败：${trimmed.slice(0, 800)}`);
  return payload;
}

export async function syncConfiguredFeishuDocuments(config) {
  const synced = [];
  for (const source of config.sources.feishuDocuments) {
    const doc = typeof source === "string" ? source : source.doc;
    if (!doc) continue;
    const result = await runCli(config, [
      "docs",
      "+fetch",
      "--doc",
      doc,
      "--doc-format",
      "markdown",
      "--detail",
      "simple",
      "--as",
      "user",
      "--format",
      "json"
    ]);
    const payload = parseCliJson(result.stdout);
    const document = payload.data?.document || {};
    synced.push(
      saveFeishuCache(config, {
        sourceId: document.document_id || doc,
        sourceUrl: doc.startsWith("http") ? doc : "",
        title: document.title || (typeof source === "object" ? source.title : "") || doc,
        content: document.content || ""
      })
    );
  }
  return synced;
}

async function listWikiNodes(config, spaceId, parentNodeToken = "") {
  const args = ["wiki", "+node-list", "--space-id", String(spaceId), "--page-all", "--page-limit", "30", "--as", "user", "--format", "json"];
  if (parentNodeToken) args.push("--parent-node-token", parentNodeToken);
  const payload = parseCliJson((await runCli(config, args)).stdout);
  const nodes = payload.data?.nodes || [];
  const all = [...nodes];
  for (const node of nodes) {
    if (node.has_child) all.push(...(await listWikiNodes(config, spaceId, node.node_token)));
  }
  return all;
}

export async function syncConfiguredWikiSpaces(config) {
  const synced = [];
  for (const space of config.sources.feishuWikiSpaces) {
    const spaceId = typeof space === "string" ? space : space.spaceId;
    if (!spaceId) continue;
    const nodes = await listWikiNodes(config, spaceId);
    for (const node of nodes) {
      if (node.obj_type !== "docx") continue;
      const result = await runCli(config, [
        "docs",
        "+fetch",
        "--doc",
        node.node_token,
        "--doc-format",
        "markdown",
        "--detail",
        "simple",
        "--as",
        "user",
        "--format",
        "json"
      ]);
      const payload = parseCliJson(result.stdout);
      const document = payload.data?.document || {};
      synced.push(
        saveFeishuCache(config, {
          sourceId: document.document_id || node.obj_token || node.node_token,
          sourceUrl: "",
          title: node.title || document.title || node.node_token,
          content: document.content || "",
          wikiSpaceId: String(spaceId),
          wikiNodeToken: node.node_token
        })
      );
    }
  }
  return synced;
}

export async function sendBotMessage(config, { chatId, markdown, text, idempotencySeed, dryRun = false }) {
  if (!config.lark.sendingEnabled) throw new Error("真实发送开关未开启：lark.sendingEnabled=false");
  if (!chatId?.startsWith("oc_")) throw new Error("无效的目标 chat_id");
  if (!markdown && !text) throw new Error("消息内容不能为空");
  const idempotencyKey = crypto.createHash("sha256").update(idempotencySeed).digest("hex").slice(0, 40);
  const args = [
    "im",
    "+messages-send",
    "--chat-id",
    chatId,
    markdown ? "--markdown" : "--text",
    markdown || text,
    "--idempotency-key",
    idempotencyKey,
    "--as",
    "bot",
    "--format",
    "json"
  ];
  if (dryRun) args.push("--dry-run");
  const result = await runCli(config, args);
  return parseCliJson(result.stdout);
}

export async function sendDraft(config, draft, { authorizedTarget = false } = {}) {
  const senderAllowed = config.lark.allowedSenderIds.includes(draft.senderId);
  const chatAllowed = config.lark.allowedChatIds.includes(draft.chatId);
  if (!authorizedTarget && !senderAllowed && !chatAllowed) {
    throw new Error("目标未通过本人直答或人工审核授权");
  }
  return sendBotMessage(config, {
    chatId: draft.chatId,
    markdown: draft.answer,
    idempotencySeed: `answer:${draft.draftId}`
  });
}

export function startEventConsumer(config, handlers) {
  const env = { ...process.env };
  env.LARKSUITE_CLI_NO_UPDATE_NOTIFIER = "1";
  env.LARKSUITE_CLI_NO_SKILLS_NOTIFIER = "1";
  if (config.lark.ignoreProxy) env.LARK_CLI_NO_PROXY = "1";
  const launch = resolveLarkLaunch(config);
  const child = spawn(
    launch.command,
    [...launch.prefixArgs, "event", "consume", config.lark.eventKey, "--as", config.lark.identity],
    { cwd: config.projectRoot, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
  );
  let stdoutBuffer = "";
  let stderrBuffer = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (data) => {
    stdoutBuffer += data;
    const lines = stdoutBuffer.split(/\r?\n/u);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines.map((item) => item.trim()).filter(Boolean)) {
      try {
        handlers.onEvent?.(JSON.parse(line));
      } catch (error) {
        handlers.onError?.(new Error(`事件 JSON 解析失败：${error.message}`));
      }
    }
  });
  child.stderr.on("data", (data) => {
    stderrBuffer += data;
    const lines = stderrBuffer.split(/\r?\n/u);
    stderrBuffer = lines.pop() || "";
    for (const line of lines) {
      if (line.includes(`[event] ready event_key=${config.lark.eventKey}`)) handlers.onReady?.();
      else handlers.onDiagnostic?.(line);
    }
  });
  child.on("error", (error) => handlers.onError?.(error));
  child.on("close", (code) => handlers.onClose?.(code));
  return {
    child,
    stop() {
      if (!child.killed) child.stdin.end();
    }
  };
}
