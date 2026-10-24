"""按文档 ID 的笔记与 AI 建议/草稿。

笔记存 SQLite（notes）。AI 建议/草稿只在响应中返回，不自动写入。
"""

from typing import Any, Optional

from . import ai_context, api_config, explainer, llm, progress, store

_MAX_CHAT_MESSAGES = 10

_DEFAULT_DRAFT_INSTRUCTION = (
    "按笔记模板整理当前资料：1 这份资料在解决什么问题 2 关键机制（用自己的话）"
    "3 容易混的概念 4 原文值得留的句子/公式/代码 5 还没问清楚的问题。"
    "结合用户已写笔记与对话，不要覆盖用户已写的观点，标出【建议新增】。"
)

_SUGGEST_SYSTEM = (
    "你是学习笔记助教。只依据提供的当前资料原文、用户已有笔记、"
    "当前对话与批改摘要，给出可粘贴进笔记的短片段建议。\n"
    "规则：\n"
    "1. 输出必须是合法 JSON 对象，且仅含键 suggestions（数组）。\n"
    "2. 每条含 id（如 s1）、reason（一句为何建议）、text（一小段 markdown）。\n"
    "3. 0～5 条；不要重复用户笔记已有意思；不要整篇摘要；原文没有的不要编。\n"
    "4. 不要 markdown 代码围栏，只输出 JSON。"
)

_DRAFT_SYSTEM = (
    "你是学习笔记助教。根据当前资料原文、用户已有笔记、对话与批改摘要，"
    "生成笔记草稿（Markdown）。\n"
    "规则：\n"
    "1. 只输出 Markdown 正文，不要 JSON，不要代码围栏包裹全文。\n"
    "2. 不要编造原文没有的内容；不要整篇照搬摘要。\n"
    "3. 尊重用户已写观点，新增内容用【建议新增】标出。"
)


def get(doc_id: str) -> dict[str, Any]:
    note = store.get_note(doc_id)
    return {
        "doc_id": doc_id,
        "title": note.get("title") or "",
        "content": note.get("content") or "",
        "updated_at": note.get("updated_at") or "",
    }


def put(doc_id: str, content: str, title: Optional[str] = None) -> dict[str, Any]:
    if store.get_document(doc_id) is None:
        raise ValueError("资料不存在")
    store.save_note(doc_id, content, title)
    return get(doc_id)


def parse_put_body(raw: Any) -> tuple[Optional[dict], Optional[str]]:
    if not isinstance(raw, dict):
        return None, "请求体必须是 JSON 对象"
    doc_id = (raw.get("doc_id") or "").strip()
    if not doc_id:
        return None, "缺少 doc_id"
    if store.get_document(doc_id) is None:
        return None, "资料不存在"
    if "content" not in raw:
        return None, "缺少 content"
    content = raw.get("content")
    if not isinstance(content, str):
        return None, "content 必须是字符串"
    title = raw.get("title")
    if title is not None and not isinstance(title, str):
        return None, "title 必须是字符串"
    return {"doc_id": doc_id, "title": title, "content": content}, None


def _parse_doc_quote(raw: Any) -> tuple[Optional[dict], Optional[str]]:
    if not isinstance(raw, dict):
        return None, "请求体必须是 JSON 对象"
    doc_id = (raw.get("doc_id") or "").strip()
    if not doc_id:
        return None, "缺少 doc_id"
    if store.get_document(doc_id) is None:
        return None, "资料不存在"
    quote = raw.get("quote")
    if quote is not None and not isinstance(quote, str):
        return None, "quote 必须是字符串"
    return {"doc_id": doc_id, "quote": (quote or "").strip()}, None


def parse_suggest_body(raw: Any) -> tuple[Optional[dict], Optional[str]]:
    return _parse_doc_quote(raw)


def parse_draft_body(raw: Any) -> tuple[Optional[dict], Optional[str]]:
    parsed, err = _parse_doc_quote(raw)
    if err:
        return None, err
    instruction = raw.get("instruction") if isinstance(raw, dict) else None
    if instruction is not None and not isinstance(instruction, str):
        return None, "instruction 必须是字符串"
    parsed["instruction"] = (instruction or "").strip() if isinstance(instruction, str) else ""
    return parsed, None


def _format_chat_excerpt(messages: list) -> str:
    if not messages:
        return "（无当前对话）"
    lines: list[str] = []
    for msg in messages[-_MAX_CHAT_MESSAGES:]:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        label = "用户" if role == "user" else "助教"
        quote = (msg.get("quote") or "").strip()
        if quote and role == "user":
            content = f"{content}\n【划选】{quote[:500]}"
        lines.append(f"- {label}：{content[:600]}")
    return "\n".join(lines) if lines else "（无当前对话）"


def _build_observation_context(doc_id: str, quote: str) -> str:
    context = ai_context.build_context(doc_id, question=quote, quote=quote)
    note = store.get_note(doc_id)
    messages = store.get_chat(doc_id)
    submission_hint = explainer.format_last_submission_hint(
        progress.get_last_submission(doc_id), doc_id
    )
    parts = [
        f"【当前资料原文（引用编号）】\n{context['text']}",
        f"【用户已写笔记标题】\n{note.get('title') or '（无）'}",
        f"【用户已写笔记正文】\n{note.get('content') or '（尚未写笔记）'}",
        f"【当前资料最近对话（最多 {_MAX_CHAT_MESSAGES} 条）】\n"
        f"{_format_chat_excerpt(messages)}",
    ]
    if submission_hint:
        parts.append(submission_hint)
    parts.append(f"【当前用户划选】\n{quote or '（无当前划选）'}")
    return "\n\n".join(parts)


def _normalize_suggestions(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, dict):
        raise ValueError("LLM 返回必须是 JSON 对象")
    items = raw.get("suggestions")
    if items is None:
        items = []
    if not isinstance(items, list):
        raise ValueError("suggestions 必须是数组")
    out: list[dict[str, str]] = []
    for i, item in enumerate(items[:5]):
        if not isinstance(item, dict):
            continue
        reason = item.get("reason")
        text = item.get("text")
        if not isinstance(reason, str) or not isinstance(text, str):
            continue
        reason = reason.strip()
        text = text.strip()
        if not text:
            continue
        out.append({"id": f"s{i + 1}", "reason": reason or "补充笔记", "text": text})
    return out


def suggest(doc_id: str, quote: str = "") -> dict[str, Any]:
    context = _build_observation_context(doc_id, quote)
    messages = [
        {"role": "system", "content": _SUGGEST_SYSTEM},
        {
            "role": "user",
            "content": f"{context}\n\n请根据上文给出 0～5 条可粘贴进笔记的短建议，只输出 JSON。",
        },
    ]
    reply = llm.chat(messages, **api_config.llm_kwargs())
    return {"doc_id": doc_id, "suggestions": _normalize_suggestions(llm.parse_json(reply))}


def draft(doc_id: str, instruction: str = "", quote: str = "") -> dict[str, Any]:
    context = _build_observation_context(doc_id, quote)
    instr = instruction or _DEFAULT_DRAFT_INSTRUCTION
    messages = [
        {"role": "system", "content": _DRAFT_SYSTEM},
        {
            "role": "user",
            "content": f"{context}\n\n【用户要求】\n{instr}\n\n请输出 Markdown 草稿。",
        },
    ]
    reply = llm.chat(messages, **api_config.llm_kwargs())
    text = (reply or "").strip()
    if text.startswith("```") and text.endswith("```"):
        lines = text.split("\n")
        if len(lines) >= 2:
            text = "\n".join(lines[1:-1]).strip()
    return {"doc_id": doc_id, "draft": text}
