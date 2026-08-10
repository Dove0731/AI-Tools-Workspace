#!/usr/bin/env python3
"""Extract Codex/ChatGPT conversations into an Obsidian vault (stdlib only)."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

CATEGORIES = [
    ("新品开发", ("新品", "配方", "打样", "原料", "包材", "oem", "odm", "上市", "稳定性")),
    ("采购与成本", ("采购", "报价", "比价", "成本", "降本", "moq", "付款", "账期", "现金流")),
    ("供应商管理", ("供应商", "准入", "分级", "淘汰", "工厂", "供应链")),
    ("订单与交付", ("订单", "交付", "交期", "排产", "库存", "到货")),
    ("质量与异常", ("质量", "异常", "投诉", "返工", "不良", "复盘")),
    ("经营与汇报", ("经营", "毛利", "老板", "张总", "周报", "日报", "月报", "汇报")),
    ("会议与协同", ("会议", "纪要", "沟通", "协同", "待办")),
    ("系统与自动化", ("codex", "chatgpt", "obsidian", "github", "自动化", "脚本", "系统", "同步")),
]

INVALID_FILENAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_-]{16,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"(?i)(api[_ -]?key|access[_ -]?token|password)\s*[:=]\s*\S+"),
]


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def save_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_text(text: str) -> str:
    text = text.replace("\x00", "").strip()
    # Codex Desktop may prepend workspace policy/context to the first user item.
    previous = None
    while text != previous:
        previous = text
        text = re.sub(r"(?s)^<recommended_plugins>.*?</recommended_plugins>\s*", "", text)
        text = re.sub(r"(?s)^# AGENTS\.md instructions.*?</INSTRUCTIONS>\s*", "", text)
        text = re.sub(r"(?s)^<environment_context>.*?</environment_context>\s*", "", text)
        text = text.strip()
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("[敏感信息已隐藏]", text)
    return text


def safe_name(value: str, fallback: str) -> str:
    value = INVALID_FILENAME.sub("_", value).strip(" ._")[:80]
    return value or fallback


def category_for(title: str, messages: list[tuple[str, str]]) -> str:
    corpus = (title + " " + " ".join(text for _, text in messages)).lower()
    scored = [(sum(corpus.count(k) for k in keys), name) for name, keys in CATEGORIES]
    score, name = max(scored)
    return name if score else "其他待整理"


def iso_date(value) -> str:
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, timezone.utc).astimezone().date().isoformat()
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone().date().isoformat()
    except (ValueError, TypeError, OSError):
        return datetime.now().date().isoformat()


def write_note(vault: Path, project: str, source: str, item_id: str, title: str,
               updated, messages: list[tuple[str, str]], state: dict) -> bool:
    messages = [(role, clean_text(text)) for role, text in messages if clean_text(text)]
    if not messages:
        return False
    digest = hashlib.sha256(json.dumps(messages, ensure_ascii=False).encode()).hexdigest()
    state_key = f"{source}:{item_id}"
    if state.get(state_key) == digest:
        return False
    category = category_for(title, messages)
    date = iso_date(updated)
    note_dir = vault / "07_AI工作区" / "AI知识同步" / project / category
    note_dir.mkdir(parents=True, exist_ok=True)
    note = note_dir / f"{date}_{source}_{safe_name(title, item_id[:8])}_{item_id[:8]}.md"
    body = [
        "---", f"project: {json.dumps(project, ensure_ascii=False)}",
        f"source: {source}", f"source_id: {item_id}", f"category: {category}",
        f"updated: {date}", "sync_status: synced", "tags: [AI知识同步]", "---", "",
        f"# {title}", "", "> 自动提取的核心会话正文；涉及业务数据时仍以正式台账和原始凭证为准。", "",
    ]
    for role, text in messages:
        body.extend([f"## {'用户需求' if role == 'user' else 'AI输出'}", "", text, ""])
    note.write_text("\n".join(body).rstrip() + "\n", encoding="utf-8")
    state[state_key] = digest
    return True


def codex_title_index(codex_home: Path) -> dict[str, dict]:
    result = {}
    index = codex_home / "session_index.jsonl"
    if not index.exists():
        return result
    for line in index.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            row = json.loads(line)
            result[row["id"]] = row
        except (json.JSONDecodeError, KeyError):
            continue
    return result


def extract_codex(codex_home: Path, vault: Path, project: str, state: dict) -> int:
    titles = codex_title_index(codex_home)
    count = 0
    for path in (codex_home / "sessions").rglob("*.jsonl"):
        session_id, updated, cwd, messages = path.stem[-36:], None, None, []
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            payload = row.get("payload", {})
            if row.get("type") == "session_meta":
                session_id = payload.get("id", session_id)
                cwd = payload.get("cwd")
                updated = row.get("timestamp")
            if row.get("type") != "response_item" or payload.get("type") != "message":
                continue
            role = payload.get("role")
            if role not in ("user", "assistant"):
                continue
            parts = []
            for part in payload.get("content", []):
                text = part.get("text")
                if text:
                    parts.append(text)
            if parts:
                messages.append((role, "\n\n".join(parts)))
                updated = row.get("timestamp", updated)
        if cwd and Path(cwd).name.lower() != vault.name.lower():
            continue
        info = titles.get(session_id, {})
        cleaned_users = [clean_text(t) for r, t in messages if r == "user" and clean_text(t)]
        indexed_title = info.get("thread_name") or ""
        if "AGENTS.md instructions" in indexed_title or indexed_title.startswith("#"):
            indexed_title = ""
        title = indexed_title or (cleaned_users[0][:60] if cleaned_users else session_id)
        if title.startswith("The following is the Codex agent history"):
            continue
        updated = info.get("updated_at", updated)
        count += write_note(vault, project, "Codex", session_id, title, updated, messages, state)
    return count


def chatgpt_messages(conversation: dict) -> list[tuple[str, str]]:
    rows = []
    for node in conversation.get("mapping", {}).values():
        msg = node.get("message") or {}
        role = (msg.get("author") or {}).get("role")
        if role not in ("user", "assistant"):
            continue
        content = msg.get("content") or {}
        parts = content.get("parts") or []
        text_parts = [p for p in parts if isinstance(p, str)]
        if text_parts:
            rows.append((msg.get("create_time") or 0, role, "\n\n".join(text_parts)))
    rows.sort(key=lambda x: x[0])
    return [(role, text) for _, role, text in rows]


def extract_chatgpt_file(path: Path, vault: Path, project: str, state: dict) -> int:
    docs = []
    if path.suffix.lower() == ".zip":
        try:
            with zipfile.ZipFile(path) as zf:
                for name in zf.namelist():
                    if re.search(r"(^|/)conversations(?:-\d+)?\.json$", name):
                        docs.extend(json.loads(zf.read(name).decode("utf-8")))
        except (zipfile.BadZipFile, json.JSONDecodeError, UnicodeDecodeError):
            return 0
    elif path.suffix.lower() == ".json":
        data = load_json(path, [])
        docs = data if isinstance(data, list) else []
    count = 0
    for conv in docs:
        cid = conv.get("id") or conv.get("conversation_id")
        if not cid:
            continue
        count += write_note(vault, project, "ChatGPT", cid, conv.get("title") or "未命名会话",
                            conv.get("update_time") or conv.get("create_time"),
                            chatgpt_messages(conv), state)
    return count


def find_chatgpt_exports(vault: Path) -> list[Path]:
    inbox = vault / "97_待整理" / "ChatGPT导出投递箱"
    inbox.mkdir(parents=True, exist_ok=True)
    paths = list(inbox.glob("*.zip")) + list(inbox.glob("conversations*.json"))
    downloads = Path.home() / "Downloads"
    if downloads.exists():
        paths += list(downloads.glob("*chatgpt*.zip")) + list(downloads.glob("*export*.zip"))
    return sorted(set(paths))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vault", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--codex-home", default=os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    args = parser.parse_args()
    vault = Path(args.vault).resolve()
    project = vault.name
    state_path = vault / ".ai-sync" / "state.json"
    state = load_json(state_path, {})
    codex_count = extract_codex(Path(args.codex_home), vault, project, state)
    chatgpt_count = sum(extract_chatgpt_file(p, vault, project, state) for p in find_chatgpt_exports(vault))
    save_json(state_path, state)
    print(json.dumps({"project": project, "codex_updated": codex_count,
                      "chatgpt_updated": chatgpt_count}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
