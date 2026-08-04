import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureRuntimeDirectories, runtimePath } from "./config.mjs";
import { loadIndex } from "./knowledge.mjs";
import { searchIndex, sourceLabel } from "./retrieval.mjs";
import { generateAnswer } from "./answer.mjs";
import { sendBotMessage, sendDraft } from "./lark.mjs";

function maskId(value = "") {
  if (value.length < 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function loadProcessed(config) {
  const file = runtimePath(config, "processed-message-ids.json");
  if (!fs.existsSync(file)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(file, "utf8")));
}

function saveProcessed(config, processed) {
  const values = [...processed].slice(-10000);
  fs.writeFileSync(runtimePath(config, "processed-message-ids.json"), JSON.stringify(values, null, 2), "utf8");
}

function appendAudit(config, entry) {
  fs.appendFileSync(runtimePath(config, "qa-audit.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
}

export function loadOwnerProfile(config) {
  const file = runtimePath(config, config.lark.ownerProfileFile || "owner.json");
  if (!fs.existsSync(file)) return null;
  const owner = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!owner.senderId?.startsWith("ou_") || !owner.chatId?.startsWith("oc_")) return null;
  return owner;
}

export function configureOwnerFromLatestDraft(config) {
  const draftsRoot = runtimePath(config, "drafts");
  if (!fs.existsSync(draftsRoot)) throw new Error("没有可用于识别本人的已验证草稿");
  const candidates = [];
  for (const day of fs.readdirSync(draftsRoot)) {
    const directory = path.join(draftsRoot, day);
    if (!fs.statSync(directory).isDirectory()) continue;
    for (const name of fs.readdirSync(directory).filter((item) => item.endsWith(".json"))) {
      const file = path.join(directory, name);
      const draft = JSON.parse(fs.readFileSync(file, "utf8"));
      if (draft.chatType === "p2p" && draft.senderId?.startsWith("ou_") && draft.chatId?.startsWith("oc_")) {
        candidates.push({ draft, mtimeMs: fs.statSync(file).mtimeMs });
      }
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (!candidates.length) throw new Error("没有包含有效本人私聊身份的草稿");
  const latest = candidates[0].draft;
  const owner = {
    senderId: latest.senderId,
    chatId: latest.chatId,
    configuredAt: new Date().toISOString(),
    evidenceDraftId: latest.draftId
  };
  fs.writeFileSync(runtimePath(config, config.lark.ownerProfileFile || "owner.json"), JSON.stringify(owner, null, 2), "utf8");
  appendAudit(config, { at: owner.configuredAt, action: "owner-configured", evidenceDraftId: latest.draftId });
  return { senderId: maskId(owner.senderId), chatId: maskId(owner.chatId), evidenceDraftId: owner.evidenceDraftId };
}

function writeDraft(config, draft) {
  const day = draft.createdAt.slice(0, 10);
  const directory = runtimePath(config, "drafts", day);
  fs.mkdirSync(directory, { recursive: true });
  const jsonPath = path.join(directory, `${draft.draftId}.json`);
  const markdownPath = path.join(directory, `${draft.draftId}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(draft, null, 2), "utf8");
  const sources = draft.results.map((result, index) => `${index + 1}. ${sourceLabel(result)}`).join("\n");
  const markdown = `# 飞书知识问答待审核草稿\n\n- 草稿编号：${draft.draftId}\n- 状态：${draft.status}\n- 创建时间：${draft.createdAt}\n- 提问人：${maskId(draft.senderId)}\n- 会话：${maskId(draft.chatId)}\n- 生成方式：${draft.provider}\n\n## 问题\n\n${draft.question}\n\n## 待审核回答\n\n${draft.answer}\n\n## 检索来源\n\n${sources || "未命中可靠来源"}\n`;
  fs.writeFileSync(markdownPath, markdown, "utf8");
  return { jsonPath, markdownPath };
}

export function shouldAcceptEvent(config, event) {
  if (!event?.message_id || !event?.sender_id || !event?.chat_id) return { accept: false, reason: "missing-fields" };
  if (!config.lark.acceptedChatTypes.includes(event.chat_type)) return { accept: false, reason: "chat-type" };
  if (!config.lark.acceptedMessageTypes.includes(event.message_type)) return { accept: false, reason: "message-type" };
  if (event.chat_type === "group" && config.lark.requireMentionInGroups) {
    const hasMention = Array.isArray(event.mentions) ? event.mentions.length > 0 : Boolean(event.mentions);
    if (!hasMention) return { accept: false, reason: "group-without-mention" };
  }
  const content = cleanIncomingQuestion(event.content);
  if (!content) return { accept: false, reason: "empty-content" };
  if (content.length > config.lark.maximumQuestionCharacters) return { accept: false, reason: "question-too-long" };
  return { accept: true, question: content };
}

export function cleanIncomingQuestion(content) {
  return String(content || "")
    .trim()
    .replace(/^@.+?\s{2,}/u, "")
    .replace(/^@\S+\s*/u, "")
    .trim();
}

export function parseReviewCommand(content) {
  const normalized = String(content || "").trim();
  const match = normalized.match(/^(同意|批准|驳回|拒绝)(?:\s*[：:]?\s*(QA-[0-9A-Za-z-]+))?\s*$/u);
  if (!match) return null;
  return {
    action: ["同意", "批准"].includes(match[1]) ? "approve" : "reject",
    draftId: match[2] || ""
  };
}

function isOwnerEvent(event, owner) {
  return Boolean(owner)
    && event.sender_id === owner.senderId
    && event.chat_id === owner.chatId
    && event.chat_type === "p2p";
}

export function routeEvent(event, owner) {
  if (!owner) return "draft";
  const isOwner = isOwnerEvent(event, owner);
  if (isOwner && parseReviewCommand(event.content)) return "review-command";
  if (isOwner) return "owner-direct";
  return "review";
}

export function createQaService(config) {
  ensureRuntimeDirectories(config);
  const processed = loadProcessed(config);
  let queue = Promise.resolve();

  async function answerQuestion(question, metadata = {}, delivery = "draft") {
    const index = loadIndex(config);
    const results = searchIndex(index, question, config.retrieval);
    const generated = await generateAnswer(config, question, results);
    const createdAt = new Date().toISOString();
    const draftId = `QA-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
    const draft = {
      draftId,
      status: "待审核",
      createdAt,
      messageId: metadata.messageId || "",
      senderId: metadata.senderId || "",
      chatId: metadata.chatId || "",
      chatType: metadata.chatType || "local",
      question,
      answer: generated.answer,
      provider: generated.provider,
      warning: generated.warning || "",
      results
    };
    const paths = writeDraft(config, draft);
    appendAudit(config, {
      at: createdAt,
      action: "draft-created",
      draftId,
      messageId: draft.messageId,
      senderHash: draft.senderId ? crypto.createHash("sha256").update(draft.senderId).digest("hex").slice(0, 16) : "",
      question,
      provider: draft.provider,
      resultIds: results.map((item) => item.id)
    });
    if (delivery === "direct" || config.lark.replyMode === "auto") {
      const sent = await sendDraft(config, draft, { authorizedTarget: delivery === "direct" });
      draft.status = "已由机器人发送";
      draft.sentAt = new Date().toISOString();
      draft.sentMessageId = sent.data?.message_id || sent.message_id || "";
      writeDraft(config, draft);
      appendAudit(config, { at: new Date().toISOString(), action: "auto-sent", draftId, sentMessageId: draft.sentMessageId });
    }
    if (delivery === "review") {
      const owner = loadOwnerProfile(config);
      if (!owner) throw new Error("尚未配置私人审核会话");
      const reviewMessage = `## 待审核知识回答\n\n**草稿编号：${draft.draftId}**\n\n**提问：** ${draft.question}\n\n**建议回答：**\n\n${draft.answer}\n\n---\n发送最近一条待审：\`同意\`\n精确指定：\`同意 ${draft.draftId}\`\n驳回：\`驳回 ${draft.draftId}\`\n\n审核通过后，机器人将以应用身份发送到原会话。`;
      try {
        const sent = await sendBotMessage(config, {
          chatId: owner.chatId,
          markdown: reviewMessage,
          idempotencySeed: `review:${draft.draftId}`
        });
        draft.status = "待审核（已通知本人）";
        draft.reviewNotifiedAt = new Date().toISOString();
        draft.reviewMessageId = sent.data?.message_id || sent.message_id || "";
      } catch (error) {
        draft.status = "待审核（私人通知失败）";
        draft.warning = [draft.warning, error.message].filter(Boolean).join("；");
      }
      writeDraft(config, draft);
      appendAudit(config, { at: new Date().toISOString(), action: "review-routed", draftId, status: draft.status });
    }
    return { draft, paths };
  }

  async function processEvent(event) {
    if (processed.has(event.message_id)) return { ignored: true, reason: "duplicate" };
    const decision = shouldAcceptEvent(config, event);
    processed.add(event.message_id);
    saveProcessed(config, processed);
    if (!decision.accept) {
      appendAudit(config, { at: new Date().toISOString(), action: "event-ignored", messageId: event.message_id, reason: decision.reason });
      return { ignored: true, reason: decision.reason };
    }
    const owner = loadOwnerProfile(config);
    const route = config.lark.replyMode === "hybrid-review" ? routeEvent(event, owner) : "draft";
    if (route === "review-command") {
      const command = parseReviewCommand(decision.question);
      const selected = command.draftId ? loadDraft(config, command.draftId).draft : findLatestPendingDraft(config);
      if (!selected) {
        await sendBotMessage(config, {
          chatId: owner.chatId,
          text: "当前没有待审核回答。",
          idempotencySeed: `review-empty:${event.message_id}`
        });
        return { action: "no-pending-review" };
      }
      if (command.action === "approve") {
        const draft = await approveAndSend(config, selected.draftId, { approvedByOwner: true });
        await sendBotMessage(config, {
          chatId: owner.chatId,
          text: `已同意并发送：${draft.draftId}`,
          idempotencySeed: `approve-confirm:${event.message_id}`
        });
        return { action: "approved-and-sent", draft };
      }
      const draft = rejectDraft(config, selected.draftId);
      await sendBotMessage(config, {
        chatId: owner.chatId,
        text: `已驳回：${draft.draftId}，未向原会话发送。`,
        idempotencySeed: `reject-confirm:${event.message_id}`
      });
      return { action: "rejected", draft };
    }
    const delivery = route === "owner-direct" ? "direct" : route === "review" ? "review" : "draft";
    const result = await answerQuestion(decision.question, {
      messageId: event.message_id,
      senderId: event.sender_id,
      chatId: event.chat_id,
      chatType: event.chat_type
    }, delivery);
    return { ...result, route };
  }

  function enqueueEvent(event) {
    queue = queue.then(() => processEvent(event));
    return queue;
  }

  return { answerQuestion, processEvent, enqueueEvent };
}

export function loadDraft(config, draftId) {
  const draftsRoot = runtimePath(config, "drafts");
  if (!fs.existsSync(draftsRoot)) throw new Error("尚无草稿");
  for (const day of fs.readdirSync(draftsRoot)) {
    const file = path.join(draftsRoot, day, `${draftId}.json`);
    if (fs.existsSync(file)) return { draft: JSON.parse(fs.readFileSync(file, "utf8")), file };
  }
  throw new Error(`未找到草稿：${draftId}`);
}

export function findLatestPendingDraft(config) {
  const draftsRoot = runtimePath(config, "drafts");
  if (!fs.existsSync(draftsRoot)) return null;
  const candidates = [];
  for (const day of fs.readdirSync(draftsRoot)) {
    const directory = path.join(draftsRoot, day);
    if (!fs.statSync(directory).isDirectory()) continue;
    for (const name of fs.readdirSync(directory).filter((item) => item.endsWith(".json"))) {
      const file = path.join(directory, name);
      const draft = JSON.parse(fs.readFileSync(file, "utf8"));
      if (String(draft.status || "").startsWith("待审核") && draft.reviewNotifiedAt) {
        candidates.push({ draft, time: Date.parse(draft.reviewNotifiedAt || draft.createdAt) || 0 });
      }
    }
  }
  candidates.sort((left, right) => right.time - left.time);
  return candidates[0]?.draft || null;
}

export async function approveAndSend(config, draftId, { approvedByOwner = false } = {}) {
  const { draft } = loadDraft(config, draftId);
  if (draft.status === "已由机器人发送") throw new Error("该草稿已经发送");
  if (!approvedByOwner) throw new Error("必须由私人审核会话中的本人批准");
  const result = await sendDraft(config, draft, { authorizedTarget: true });
  draft.status = "已由机器人发送";
  draft.sentAt = new Date().toISOString();
  draft.sentMessageId = result.data?.message_id || result.message_id || "";
  writeDraft(config, draft);
  appendAudit(config, { at: draft.sentAt, action: "approved-and-sent", draftId, sentMessageId: draft.sentMessageId });
  return draft;
}

export function rejectDraft(config, draftId) {
  const { draft } = loadDraft(config, draftId);
  if (draft.status === "已由机器人发送") throw new Error("该草稿已发送，不能驳回");
  draft.status = "已驳回";
  draft.reviewedAt = new Date().toISOString();
  writeDraft(config, draft);
  appendAudit(config, { at: draft.reviewedAt, action: "rejected", draftId });
  return draft;
}

export const __test = { maskId, writeDraft, isOwnerEvent };
