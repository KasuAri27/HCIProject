"""统一的 AI 上下文构建与引用处理。

所有 AI 功能共享同一套“带 block id 的资料摘录”：
- 上下文里每个内容块标成 [B:<block_id>]，同时带来源位置；
- 提示词要求模型引用原文时写 [cite:<block_id>]，补充解释单独标注；
- 返回前校验引用 id，只保留当前上下文里存在的块。
"""

import re
from typing import Any

from . import parsers, store

MAX_CONTEXT_CHARS = 60_000
MAX_BLOCK_CHARS = 4_000
CITE_RE = re.compile(r"\[cite:([0-9a-fA-F]{8,})\]", re.IGNORECASE)

SYSTEM_RULES = (
    "你必须遵守以下资料使用规则：\n"
    "1. 只依据【资料原文】回答，不得凭记忆编造；原文没有的内容明确说「资料未覆盖」。\n"
    "2. 引用原文依据时，在相应句子末尾加 [cite:<block_id>]，block_id 必须取自资料中的 [B:...] 标记，不要伪造。\n"
    "3. 你自己的补充、推断或类比另起一段，以「补充：」开头，并且不要给补充内容加 cite。\n"
    "4. 用简体中文和 Markdown 回答。"
)


def _block_text(block: dict) -> str:
    text = (block.get("text") or "").strip()
    if text:
        return text
    if block.get("block_type") == "table":
        return "\n".join(" | ".join(str(c) for c in row) for row in block.get("rows") or [])
    return (block.get("markdown") or "").strip()


def _keywords(text: str) -> list[str]:
    tokens = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z_][A-Za-z0-9_]{2,}", text or "")
    seen: list[str] = []
    for token in sorted(tokens, key=len, reverse=True):
        if token.lower() not in {t.lower() for t in seen}:
            seen.append(token)
        if len(seen) >= 8:
            break
    return seen


def _format_block(block: dict, source_format: str) -> str:
    text = _block_text(block)
    if len(text) > MAX_BLOCK_CHARS:
        text = text[:MAX_BLOCK_CHARS] + "\n...（本块已截断）"
    label = parsers.locator_label(source_format, block.get("source_locator") or {})
    return f"[B:{block['id']}] {label}\n{text}"


def _pick_blocks(
    blocks: list[dict],
    question: str,
    quote: str,
    focus_block_id: str,
    max_chars: int,
) -> list[dict]:
    if not blocks:
        return []
    total = sum(len(_block_text(b)) for b in blocks)
    if total <= max_chars:
        return blocks

    focus_index = 0
    if focus_block_id:
        for i, block in enumerate(blocks):
            if block.get("id") == focus_block_id:
                focus_index = i
                break
    elif quote:
        needle = quote.strip()[:80]
        for i, block in enumerate(blocks):
            if needle and needle in _block_text(block):
                focus_index = i
                break

    selected: set[int] = set()
    focus_chapter = blocks[focus_index].get("chapter_id")
    for i, block in enumerate(blocks):
        if block.get("chapter_id") == focus_chapter and abs(i - focus_index) <= 7:
            selected.add(i)

    for i, block in enumerate(blocks):
        if block.get("block_type") == "heading":
            selected.add(i)

    keywords = _keywords(f"{question}\n{quote}")
    if keywords:
        scored: list[tuple[int, int]] = []
        for i, block in enumerate(blocks):
            if i in selected:
                continue
            text = _block_text(block)
            score = sum(1 for kw in keywords if kw.lower() in text.lower())
            if score:
                scored.append((score, i))
        scored.sort(reverse=True)
        for _, i in scored[:8]:
            selected.add(i)

    ordered = [blocks[i] for i in sorted(selected)]
    lines: list[str] = []
    used = 0
    for block in ordered:
        piece = _format_block(block, "")
        if used + len(piece) > max_chars and lines:
            break
        lines.append(piece)
        used += len(piece) + 2
    return ordered[: len(lines)]


def build_context(
    doc_id: str,
    question: str = "",
    quote: str = "",
    focus_block_id: str = "",
    max_chars: int = MAX_CONTEXT_CHARS,
) -> dict[str, Any]:
    """构建带 block id 的资料上下文与引用白名单。"""
    content = store.get_document_content(doc_id)
    if not content or not content.get("blocks"):
        raise ValueError("资料内容为空或尚未解析完成")
    doc = content.get("document") or {}
    blocks = content.get("blocks") or []
    source_format = (doc.get("source_format") or "").lower()
    selected = _pick_blocks(blocks, question, quote, focus_block_id, max_chars)

    pieces = [_format_block(block, source_format) for block in selected]
    text = "\n\n".join(pieces)
    citations = {
        block["id"]: {
            "block_id": block["id"],
            "locator": parsers.locator_label(source_format, block.get("source_locator") or {}),
        }
        for block in selected
    }
    return {
        "doc_id": doc_id,
        "title": doc.get("title") or "",
        "source_format": source_format,
        "text": text,
        "block_ids": set(citations),
        "citations": citations,
    }


def clean_citations(markdown: str, context: dict) -> tuple[str, list[dict]]:
    """校验并清理模型输出中的 [cite:id]，返回正文和引用条。"""
    allowed = context.get("block_ids") or set()
    citations_meta = context.get("citations") or {}
    found: list[str] = []

    def replace(match: re.Match) -> str:
        block_id = match.group(1)
        if block_id not in allowed:
            return ""
        if block_id not in found:
            found.append(block_id)
        return match.group(0)

    cleaned = CITE_RE.sub(replace, markdown or "")
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    citations = [
        {
            "block_id": block_id,
            "locator": (citations_meta.get(block_id) or {}).get("locator", ""),
        }
        for block_id in found
    ]
    return cleaned, citations
