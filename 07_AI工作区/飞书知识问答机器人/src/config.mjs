import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, "..");

export function loadConfig(configPath = path.join(projectRoot, "config", "config.json")) {
  const absoluteConfigPath = path.resolve(configPath);
  const raw = fs.readFileSync(absoluteConfigPath, "utf8");
  const config = JSON.parse(raw);
  config.configPath = absoluteConfigPath;
  config.projectRoot = projectRoot;
  config.vaultRoot = path.resolve(path.dirname(absoluteConfigPath), config.vaultRoot);
  config.runtimeDir = path.join(projectRoot, "runtime");
  validateConfig(config);
  return config;
}

export function validateConfig(config) {
  if (!fs.existsSync(config.vaultRoot)) {
    throw new Error(`知识库根目录不存在：${config.vaultRoot}`);
  }
  if (!Array.isArray(config.sources?.localDirectories)) {
    throw new Error("sources.localDirectories 必须是数组");
  }
  if (!["draft", "auto", "hybrid-review"].includes(config.lark?.replyMode)) {
    throw new Error("lark.replyMode 只能是 draft、auto 或 hybrid-review");
  }
  if (config.lark.replyMode === "auto" && !config.lark.sendingEnabled) {
    throw new Error("自动回复要求 lark.sendingEnabled=true");
  }
  if (config.lark.replyMode === "auto") {
    const hasAllowlist = config.lark.allowedSenderIds.length > 0 || config.lark.allowedChatIds.length > 0;
    if (!hasAllowlist) {
      throw new Error("自动回复必须配置 allowedSenderIds 或 allowedChatIds 白名单");
    }
  }
  if (config.lark.replyMode === "hybrid-review" && !config.lark.sendingEnabled) {
    throw new Error("本人直答与送审模式要求 lark.sendingEnabled=true");
  }
  return config;
}

export function ensureRuntimeDirectories(config) {
  for (const name of ["runtime", "drafts", "feishu-cache", "model-work"]) {
    const target = name === "runtime" ? config.runtimeDir : path.join(config.runtimeDir, name);
    fs.mkdirSync(target, { recursive: true });
  }
}

export function runtimePath(config, ...segments) {
  return path.join(config.runtimeDir, ...segments);
}
