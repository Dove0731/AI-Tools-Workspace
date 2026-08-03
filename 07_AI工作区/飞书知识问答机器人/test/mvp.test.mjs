import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tokenize, searchIndex } from "../src/retrieval.mjs";
import { __test as answerTest } from "../src/answer.mjs";
import { applyOwnerAnswer, cleanIncomingQuestion, findPendingOwnerAnswerDraft, loadDraft, parseOwnerAnswerCommand, parseReviewCommand, routeEvent, shouldAcceptEvent, __test as serviceTest } from "../src/service.mjs";
import { addScenario, listActiveScenarios } from "../src/scenario-db.mjs";

test("中文检索会生成双字词", () => {
  const tokens = tokenize("供应商交期风险");
  assert(tokens.includes("供应"));
  assert(tokens.includes("交期"));
  assert(tokens.includes("风险"));
});

test("检索优先返回匹配标题和正文", () => {
  const index = {
    chunks: [
      { id: "1", sourceTitle: "供应商管理", heading: "交期风险", text: "供应商延期会影响项目上市和收入确认。" },
      { id: "2", sourceTitle: "模板", heading: "会议", text: "会议纪要应记录行动项。" }
    ]
  };
  const results = searchIndex(index, "供应商交期风险", { topK: 2, minimumScore: 0 });
  assert.equal(results[0].id, "1");
});

test("阶段问题会展开同一正式文件的阶段目录", () => {
  const index = {
    chunks: [
      { id: "intro", sourceId: "sop", sourceTitle: "新品流程", heading: "目的", text: "新品开发采用阶段管理。", relativePath: "sop.md" },
      { id: "g0", sourceId: "sop", sourceTitle: "新品流程", heading: "G0 需求入池", text: "记录需求。", relativePath: "sop.md" },
      { id: "g1", sourceId: "sop", sourceTitle: "新品流程", heading: "G1 立项评审", text: "评估立项。", relativePath: "sop.md" },
      { id: "g2", sourceId: "sop", sourceTitle: "新品流程", heading: "G2 产品定位", text: "确定定位。", relativePath: "sop.md" }
    ]
  };
  const results = searchIndex(index, "新品开发有哪些阶段", { topK: 5, minimumScore: 0 });
  assert.deepEqual(results[0].outlineItems, ["G0 需求入池", "G1 立项评审", "G2 产品定位"]);
  const answer = answerTest.extractiveAnswer("新品开发有哪些阶段", results);
  assert.match(answer, /G2 产品定位/u);
});

test("无命中时明确标记待确认", () => {
  const answer = answerTest.extractiveAnswer("未知问题", []);
  assert.match(answer, /待确认/u);
});

test("事件仅接受受控类型和长度", () => {
  const config = {
    lark: {
      acceptedChatTypes: ["p2p"],
      acceptedMessageTypes: ["text"],
      maximumQuestionCharacters: 20
    }
  };
  const accepted = shouldAcceptEvent(config, {
    message_id: "om_1",
    sender_id: "ou_1",
    chat_id: "oc_1",
    chat_type: "p2p",
    message_type: "text",
    content: "测试"
  });
  assert.equal(accepted.accept, true);
  const rejected = shouldAcceptEvent(config, {
    message_id: "om_2",
    sender_id: "ou_1",
    chat_id: "oc_1",
    chat_type: "group",
    message_type: "text",
    content: "测试"
  });
  assert.equal(rejected.accept, false);
});

test("只有本人私聊可用同意口令触发审核", () => {
  const owner = { senderId: "ou_owner", chatId: "oc_owner" };
  const command = { sender_id: "ou_owner", chat_id: "oc_owner", chat_type: "p2p", content: "同意" };
  assert.deepEqual(parseReviewCommand(command.content), { action: "approve", draftId: "" });
  assert.equal(routeEvent(command, owner), "review-command");
  assert.equal(routeEvent({ ...command, sender_id: "ou_other" }, owner), "review");
});

test("同意可精确指定草稿编号", () => {
  assert.deepEqual(parseReviewCommand("同意 QA-20260803-abc"), {
    action: "approve",
    draftId: "QA-20260803-abc"
  });
});

test("群聊必须包含 mention", () => {
  const config = {
    lark: {
      acceptedChatTypes: ["p2p", "group"],
      acceptedMessageTypes: ["text"],
      maximumQuestionCharacters: 100,
      requireMentionInGroups: true
    }
  };
  const base = { message_id: "om_group", sender_id: "ou_other", chat_id: "oc_group", chat_type: "group", message_type: "text", content: "请查询" };
  assert.equal(shouldAcceptEvent(config, base).accept, false);
  assert.equal(shouldAcceptEvent(config, { ...base, mentions: [{ id: "bot" }] }).accept, true);
});

test("群聊问题会剥离机器人 mention 前缀", () => {
  assert.equal(cleanIncomingQuestion("@曾德炜的飞书CLI  你吃饭了没"), "你吃饭了没");
});

test("本人可用草稿编号补充多行标准答案", () => {
  assert.deepEqual(parseOwnerAnswerCommand("补充 QA-20260803-abc：第一行\n第二行"), {
    draftId: "QA-20260803-abc",
    answer: "第一行\n第二行"
  });
});

test("只把回复到指定审核消息的本人消息关联为待补充答案", () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "feishu-qa-draft-"));
  const config = { runtimeDir, lark: { ownerProfileFile: "owner.json" } };
  serviceTest.writeDraft(config, {
    draftId: "QA-20260803-linked",
    createdAt: new Date().toISOString(),
    status: "待本人补充回答（已通知本人）",
    senderId: "ou_other",
    chatId: "oc_other",
    chatType: "p2p",
    question: "未收录问题",
    answer: "",
    provider: "extractive",
    reviewMessageId: "om_review",
    reviewNotifiedAt: new Date().toISOString(),
    results: []
  });
  assert.equal(findPendingOwnerAnswerDraft(config, { reply_to: "om_review" })?.draftId, "QA-20260803-linked");
  assert.equal(findPendingOwnerAnswerDraft(config, { reply_to: "om_other" }), null);
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});

test("场景库按问题更新标准答案且不重复建场景", () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "feishu-qa-db-"));
  const config = { runtimeDir };
  addScenario(config, { question: "  这个场景怎么处理？ ", answer: "答案一" });
  addScenario(config, { question: "这个场景怎么处理？", answer: "答案二" });
  const scenarios = listActiveScenarios(config);
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0].answer, "答案二");
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});

test("本人回复可完成草稿入库并立即进入知识索引", async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "feishu-qa-flow-"));
  const config = {
    runtimeDir,
    vaultRoot: runtimeDir,
    sources: {
      localDirectories: [],
      excludedPathFragments: [],
      extensions: [".md"],
      maxFileBytes: 1024
    },
    retrieval: { chunkCharacters: 500, chunkOverlapCharacters: 50 },
    answer: { maxAnswerCharacters: 3500 },
    lark: { ownerProfileFile: "owner.json" }
  };
  serviceTest.writeDraft(config, {
    draftId: "QA-20260803-flow",
    createdAt: new Date().toISOString(),
    status: "待本人补充回答（已通知本人）",
    senderId: "ou_owner",
    chatId: "oc_owner",
    chatType: "p2p",
    messageId: "om_question",
    question: "样品泄漏时如何处理？",
    answer: "",
    provider: "extractive",
    reviewMessageId: "om_review",
    reviewNotifiedAt: new Date().toISOString(),
    results: []
  });
  const draft = await applyOwnerAnswer(
    config,
    "QA-20260803-flow",
    "先隔离样品并保留证据，责任与放行结论待确认。",
    { senderId: "ou_owner", chatId: "oc_owner" },
    { message_id: "om_answer" }
  );
  assert.equal(draft.status, "已由本人补充并入库");
  assert.equal(loadDraft(config, draft.draftId).draft.answer, "先隔离样品并保留证据，责任与放行结论待确认。");
  const index = JSON.parse(fs.readFileSync(path.join(runtimeDir, "index.json"), "utf8"));
  assert.equal(index.chunks.some((chunk) => chunk.sourceType === "learned-scenario"), true);
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});
