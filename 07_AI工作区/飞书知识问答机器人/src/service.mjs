import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureRuntimeDirectories, runtimePath } from "./config.mjs";
import { buildIndex, loadIndex } from "./knowledge.mjs";
import { searchIndex, sourceLabel } from "./retrieval.mjs";
import { generateAnswer } from "./answer.mjs";
import { sendBotMessage, sendDraft } from "./lark.mjs";
import { addScenario } from "./scenario-db.mjs";

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

export function parseOwnerAnswerCommand(content) {
  const match = String(content || "").trim().match(/^补充\s+(QA-[0-9A-Za-z-]+)\s*[：:]\s*([\s\S]+)$/u);
  if (!match || !match[2].trim()) return null;
  return { draftId: match[1], answer: match[2].trim() };
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
    const needsOwnerAnswer = results.length === 0;
    const createdAt = new Date().toISOString();
    const draftId = `QA-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
    const draft = {
      draftId,
      status: needsOwnerAnswer ? "待本人补充回答" : "待审核",
      createdAt,
      messageId: metadata.messageId || "",
      senderId: metadata.senderId || "",
      chatId: metadata.chatId || "",
      chatType: metadata.chatType || "local",
      question,
      answer: generated.answer,
      provider: generated.provider,
      warning: generated.warning || "",
      needsOwnerAnswer,
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
    if ((delivery === "direct" || config.lark.replyMode === "auto") && !needsOwnerAnswer) {
      const sent = await sendDraft(config, draft, { authorizedTarget: delivery === "direct" });
      draft.status = "已由机器人发送";
      draft.sentAt = new Date().toISOString();
      draft.sentMessageId = sent.data?.message_id || sent.message_id || "";
      writeDraft(config, draft);
      appendAudit(config, { at: new Date().toISOString(), action: "auto-sent", draftId, sentMessageId: draft.sentMessageId });
    }
    if (delivery === "direct" && needsOwnerAnswer) {
      const prompt = `知识库中没有找到可可靠引用的答案。\n\n请直接回复本消息，输入你认可的标准答案。机器人会把你的回复录入场景库，供以后相似问题使用。\n\n草稿编号：${draft.draftId}`;
      const sent = await sendBotMessage(config, {
        chatId: draft.chatId,
        text: prompt,
        idempotencySeed: `owner-answer-request:${draft.draftId}`
      });
      draft.status = "待本人补充回答（已通知本人）";
      draft.reviewNotifiedAt = new Date().toISOString();
      draft.reviewMessageId = sent.data?.message_id || sent.message_id || "";
      writeDraft(config, draft);
      appendAudit(config, { at: draft.reviewNotifiedAt, action: "owner-answer-requested", draftId, route: "owner-direct" });
    }
    if (delivery === "review") {
      const owner = loadOwnerProfile(config);
      if (!owner) throw new Error("尚未配置私人审核会话");
      const reviewMessage = needsOwnerAnswer
        ? `## 待补充知识回答\n\n**草稿编号：${draft.draftId}**\n\n**提问：** ${draft.question}\n\n知识库与已确认场景库中没有找到可可靠引用的答案。\n\n**请直接回复本消息，输入你认可的标准答案。** 机器人会按你的回复原文发送到原会话，并把“问题 + 标准答案”录入本机场景库，供以后相似问题使用。\n\n如果无法使用“回复消息”，也可发送：\n\`补充 ${draft.draftId}：标准答案\``
        : `## 待审核知识回答\n\n**草稿编号：${draft.draftId}**\n\n**提问：** ${draft.question}\n\n**建议回答：**\n\n${draft.answer}\n\n---\n发送最近一条待审：\`同意\`\n精确指定：\`同意 ${draft.draftId}\`\n驳回：\`驳回 ${draft.draftId}\`\n\n审核通过后，机器人将以应用身份发送到原会话。`;
      try {
        const sent = await sendBotMessage(config, {
          chatId: owner.chatId,
          markdown: reviewMessage,
          idempotencySeed: `review:${draft.draftId}`
        });
        draft.status = needsOwnerAnswer ? "待本人补充回答（已通知本人）" : "待审核（已通知本人）";
        draft.reviewNotifiedAt = new Date().toISOString();
        draft.reviewMessageId = sent.data?.message_id || sent.message_id || "";
      } catch (error) {
        draft.status = needsOwnerAnswer ? "待本人补充回答（私人通知失败）" : "待审核（私人通知失败）";
        draft.warning = [draft.warning, error.message].filter(Boolean).join("；");
      }
      writeDraft(config, draft);
      appendAudit(config, { at: new Date().toISOString(), action: "review-routed", draftId, status: draft.status });
    }
    return { draft, paths };
  }

  async function processEvent(event) {
    if (processed.has(event.message_id)) return { ignored: true, reason: "duplicate" };
    const owner = loadOwnerProfile(config);
    const ownerContent = String(event.content || "").trim();
    const explicitOwnerAnswer = isOwnerEvent(event, owner) ? parseOwnerAnswerCommand(ownerContent) : null;
    const isLinkedOwnerAnswer = isOwnerEvent(event, owner) && Boolean(event.reply_to || event.root_id);
    let decision = shouldAcceptEvent(config, event);
    if (!decision.accept && decision.reason === "question-too-long" && (explicitOwnerAnswer || isLinkedOwnerAnswer)) {
      if (ownerContent.length <= config.answer.maxAnswerCharacters) {
        decision = { accept: true, question: ownerContent };
      }
    }
    processed.add(event.message_id);
    saveProcessed(config, processed);
    if (!decision.accept) {
      appendAudit(config, { at: new Date().toISOString(), action: "event-ignored", messageId: event.message_id, reason: decision.reason });
      return { ignored: true, reason: decision.reason };
    }
    if (isOwnerEvent(event, owner)) {
      const explicitAnswer = explicitOwnerAnswer || parseOwnerAnswerCommand(ownerContent);
      const pendingAnswer = explicitAnswer
        ? loadDraft(config, explicitAnswer.draftId).draft
        : findPendingOwnerAnswerDraft(config, event);
      if (pendingAnswer) {
        if (!String(pendingAnswer.status || "").startsWith("待本人补充回答")) {
          throw new Error(`草稿 ${pendingAnswer.draftId} 当前不在待补充状态`);
        }
        const answer = explicitAnswer?.answer || ownerContent;
        const draft = await applyOwnerAnswer(config, pendingAnswer.draftId, answer, owner, event);
        await sendBotMessage(config, {
          chatId: owner.chatId,
          text: draft.chatId === owner.chatId
            ? `已录入场景库：${draft.draftId}`
            : `已按你的回复原文发送并录入场景库：${draft.draftId}`,
          idempotencySeed: `owner-answer-confirm:${event.message_id}`
        });
        return { action: "owner-answered-and-learned", draft };
      }
    }
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

export function findPendingOwnerAnswerDraft(config, event) {
  const replyIds = new Set([event.reply_to, event.root_id].filter(Boolean));
  if (!replyIds.size) return null;
  const draftsRoot = runtimePath(config, "drafts");
  if (!fs.existsSync(draftsRoot)) return null;
  const candidates = [];
  for (const day of fs.readdirSync(draftsRoot)) {
    const directory = path.join(draftsRoot, day);
    if (!fs.statSync(directory).isDirectory()) continue;
    for (const name of fs.readdirSync(directory).filter((item) => item.endsWith(".json"))) {
      const draft = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
      if (String(draft.status || "").startsWith("待本人补充回答") && replyIds.has(draft.reviewMessageId)) {
        candidates.push(draft);
      }
    }
  }
  candidates.sort((left, right) => Date.parse(right.reviewNotifiedAt || right.createdAt) - Date.parse(left.reviewNotifiedAt || left.createdAt));
  return candidates[0] || null;
}

export async function applyOwnerAnswer(config, draftId, answer, owner, event = {}) {
  const { draft } = loadDraft(config, draftId);
  if (!String(draft.status || "").startsWith("待本人补充回答")) {
    throw new Error(`草稿 ${draftId} 当前不在待补充状态`);
  }
  const exactAnswer = String(answer || "").trim();
  if (!exactAnswer) throw new Error("标准答案不能为空");
  if (exactAnswer.length > config.answer.maxAnswerCharacters) {
    throw new Error(`标准答案超过 ${config.answer.maxAnswerCharacters} 字限制`);
  }
  const scenario = addScenario(config, {
    question: draft.question,
    answer: exactAnswer,
    sourceChatType: draft.chatType,
    sourceMessageId: draft.messageId,
    approvedBy: "owner"
  });
  buildIndex(config);
  draft.answer = exactAnswer;
  draft.provider = "owner-supplied";
  draft.scenarioId = scenario.id;
  draft.ownerAnswerMessageId = event.message_id || "";
  const isOriginalOwnerConversation = draft.chatId === owner.chatId && draft.senderId === owner.senderId;
  try {
    if (!isOriginalOwnerConversation) {
      const sent = await sendBotMessage(config, {
        chatId: draft.chatId,
        text: exactAnswer,
        idempotencySeed: `owner-answer:${draft.draftId}`
      });
      draft.sentAt = new Date().toISOString();
      draft.sentMessageId = sent.data?.message_id || sent.message_id || "";
      draft.status = "已由本人补充并发送、入库";
    } else {
      draft.status = "已由本人补充并入库";
    }
  } catch (error) {
    draft.status = "已由本人补充并入库（原会话发送失败）";
    draft.warning = [draft.warning, error.message].filter(Boolean).join("；");
    writeDraft(config, draft);
    appendAudit(config, { at: new Date().toISOString(), action: "owner-answer-send-failed", draftId, scenarioId: scenario.id });
    throw error;
  }
  draft.reviewedAt = new Date().toISOString();
  writeDraft(config, draft);
  appendAudit(config, {
    at: draft.reviewedAt,
    action: isOriginalOwnerConversation ? "owner-answer-learned" : "owner-answer-sent-and-learned",
    draftId,
    scenarioId: scenario.id,
    sentMessageId: draft.sentMessageId || ""
  });
  return draft;
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
