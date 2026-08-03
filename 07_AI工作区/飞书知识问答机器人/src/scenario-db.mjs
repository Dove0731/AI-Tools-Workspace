import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { ensureRuntimeDirectories, runtimePath } from "./config.mjs";

function normalizeQuestion(question) {
  return String(question || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function scenarioId(question) {
  return `SCN-${crypto.createHash("sha256").update(normalizeQuestion(question), "utf8").digest("hex").slice(0, 20)}`;
}

function openDatabase(config) {
  ensureRuntimeDirectories(config);
  const database = new DatabaseSync(runtimePath(config, "qa-knowledge.sqlite"));
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS qa_scenarios (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      source_chat_type TEXT NOT NULL DEFAULT '',
      source_message_id TEXT NOT NULL DEFAULT '',
      approved_by TEXT NOT NULL DEFAULT 'owner',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_qa_scenarios_status ON qa_scenarios(status);
  `);
  return database;
}

export function addScenario(config, scenario) {
  const question = normalizeQuestion(scenario.question);
  const answer = String(scenario.answer || "").trim();
  if (!question) throw new Error("场景问题不能为空");
  if (!answer) throw new Error("场景标准答案不能为空");
  const id = scenarioId(question);
  const now = new Date().toISOString();
  const database = openDatabase(config);
  try {
    database.prepare(`
      INSERT INTO qa_scenarios (
        id, question, answer, source_chat_type, source_message_id,
        approved_by, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        question = excluded.question,
        answer = excluded.answer,
        source_chat_type = excluded.source_chat_type,
        source_message_id = excluded.source_message_id,
        approved_by = excluded.approved_by,
        status = 'active',
        updated_at = excluded.updated_at
    `).run(
      id,
      question,
      answer,
      scenario.sourceChatType || "",
      scenario.sourceMessageId || "",
      scenario.approvedBy || "owner",
      now,
      now
    );
    return database.prepare("SELECT * FROM qa_scenarios WHERE id = ?").get(id);
  } finally {
    database.close();
  }
}

export function listActiveScenarios(config) {
  const database = openDatabase(config);
  try {
    return database.prepare(`
      SELECT id, question, answer, created_at, updated_at
      FROM qa_scenarios
      WHERE status = 'active'
      ORDER BY updated_at DESC
    `).all();
  } finally {
    database.close();
  }
}

export const __test = { normalizeQuestion, scenarioId };
