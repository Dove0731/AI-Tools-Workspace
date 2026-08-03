import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureRuntimeDirectories, runtimePath } from "./config.mjs";
import { listActiveScenarios } from "./scenario-db.mjs";

function slash(value) {
  return value.replaceAll("\\", "/");
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function shouldExclude(config, absolutePath) {
  const normalized = `/${slash(path.relative(config.vaultRoot, absolutePath)).toLowerCase()}`;
  return config.sources.excludedPathFragments.some((part) =>
    normalized.includes(slash(part).toLowerCase())
  );
}

function walkFiles(config, root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (shouldExclude(config, absolutePath)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...walkFiles(config, absolutePath));
    if (entry.isFile()) {
      const extension = path.extname(entry.name).toLowerCase();
      if (config.sources.extensions.includes(extension)) files.push(absolutePath);
    }
  }
  return files;
}

function stripMarkdown(text) {
  return text
    .replace(/^---\s*[\s\S]*?\s*---\s*/u, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionize(markdown) {
  const sections = [];
  let heading = "正文";
  let lines = [];
  const flush = () => {
    const text = stripMarkdown(lines.join("\n"));
    if (text) sections.push({ heading, text });
    lines = [];
  };
  for (const line of markdown.split(/\r?\n/u)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*$/u);
    if (match) {
      flush();
      heading = match[1].trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

function chunkText(text, maxCharacters, overlapCharacters) {
  if (text.length <= maxCharacters) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxCharacters);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf("。", end),
        text.lastIndexOf("\n", end),
        text.lastIndexOf("；", end)
      );
      if (boundary > start + Math.floor(maxCharacters * 0.55)) end = boundary + 1;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlapCharacters, start + 1);
  }
  return chunks.filter(Boolean);
}

function makeChunk({ sourceType, sourceId, sourceTitle, relativePath, sourceUrl, heading, text, modifiedAt }) {
  const id = crypto
    .createHash("sha256")
    .update(`${sourceType}\n${sourceId}\n${heading}\n${text}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return { id, sourceType, sourceId, sourceTitle, relativePath, sourceUrl, heading, text, modifiedAt };
}

function localChunks(config) {
  const chunks = [];
  const seen = new Set();
  for (const relativeDirectory of config.sources.localDirectories) {
    const root = path.resolve(config.vaultRoot, relativeDirectory);
    if (!isWithin(config.vaultRoot, root)) {
      throw new Error(`知识源越出工作库：${relativeDirectory}`);
    }
    for (const absolutePath of walkFiles(config, root)) {
      if (seen.has(absolutePath)) continue;
      seen.add(absolutePath);
      const stat = fs.statSync(absolutePath);
      if (stat.size > config.sources.maxFileBytes) continue;
      const relativePath = slash(path.relative(config.vaultRoot, absolutePath));
      const markdown = fs.readFileSync(absolutePath, "utf8");
      for (const section of sectionize(markdown)) {
        for (const text of chunkText(
          section.text,
          config.retrieval.chunkCharacters,
          config.retrieval.chunkOverlapCharacters
        )) {
          chunks.push(
            makeChunk({
              sourceType: "obsidian",
              sourceId: relativePath,
              sourceTitle: path.basename(relativePath, path.extname(relativePath)),
              relativePath,
              sourceUrl: "",
              heading: section.heading,
              text,
              modifiedAt: stat.mtime.toISOString()
            })
          );
        }
      }
    }
  }
  return chunks;
}

function feishuCacheChunks(config) {
  const cacheDir = runtimePath(config, "feishu-cache");
  if (!fs.existsSync(cacheDir)) return [];
  const chunks = [];
  for (const entry of fs.readdirSync(cacheDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const item = JSON.parse(fs.readFileSync(path.join(cacheDir, entry.name), "utf8"));
    if (!item.content || !item.sourceId) continue;
    for (const section of sectionize(item.content)) {
      for (const text of chunkText(
        section.text,
        config.retrieval.chunkCharacters,
        config.retrieval.chunkOverlapCharacters
      )) {
        chunks.push(
          makeChunk({
            sourceType: "feishu",
            sourceId: item.sourceId,
            sourceTitle: item.title || item.sourceId,
            relativePath: "",
            sourceUrl: item.sourceUrl || "",
            heading: section.heading,
            text,
            modifiedAt: item.syncedAt
          })
        );
      }
    }
  }
  return chunks;
}

function scenarioChunks(config) {
  return listActiveScenarios(config).map((scenario) =>
    makeChunk({
      sourceType: "learned-scenario",
      sourceId: scenario.id,
      sourceTitle: "本人确认的问答场景",
      relativePath: "",
      sourceUrl: "",
      heading: scenario.question,
      text: scenario.answer,
      modifiedAt: scenario.updated_at
    })
  );
}

export function buildIndex(config) {
  ensureRuntimeDirectories(config);
  const chunks = [...localChunks(config), ...feishuCacheChunks(config), ...scenarioChunks(config)];
  const sources = new Set(chunks.map((chunk) => `${chunk.sourceType}:${chunk.sourceId}`));
  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    sourceCount: sources.size,
    chunkCount: chunks.length,
    chunks
  };
  fs.writeFileSync(runtimePath(config, "index.json"), JSON.stringify(index, null, 2), "utf8");
  return index;
}

export function loadIndex(config) {
  const indexPath = runtimePath(config, "index.json");
  if (!fs.existsSync(indexPath)) return buildIndex(config);
  return JSON.parse(fs.readFileSync(indexPath, "utf8"));
}

export function saveFeishuCache(config, item) {
  ensureRuntimeDirectories(config);
  const fileName = `${crypto.createHash("sha256").update(item.sourceId).digest("hex").slice(0, 20)}.json`;
  const payload = { ...item, syncedAt: new Date().toISOString() };
  fs.writeFileSync(runtimePath(config, "feishu-cache", fileName), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export const __test = { sectionize, chunkText, shouldExclude, scenarioChunks };
