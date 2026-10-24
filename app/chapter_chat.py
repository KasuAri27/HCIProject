"""按文档 ID 的连续对话。

消息存 SQLite（chat_messages）；正式对话落库，现场提问不落盘。
上下文统一由 ai_context 构建，回答中的 [cite:<block_id>] 会校验后保留。
"""

from typing import Any, Optional

from . import ai_context, api_config, llm, store

_MAX_HISTORY = 20

_SYSTEM_PROMPT = (
    ai_context.SYSTEM_RULES
    + "\n\n你是学习助教。只依据当前资料、划选和对话上文回答；"
    "有划选时讲这一段，不要滑成整篇摘要；不要输出与问题无关的学习路径。"
)

_DEFAULT_QUOTE_QUESTION = "请结合当前资料上下文讲解这段选中的原文"


def _document(doc_id: str) -> dict:
    doc = store.get_document(doc_id)
    if doc is None:
        raise ValueError("资料不存在")
    if (doc.get("version_status") or "") != "ready":
        raise ValueError("资料尚未解析完成，请稍后再试")
    return doc


def get(doc_id: str) -> dict[str, Any]:
    doc = store.get_document(doc_id)
    title = (doc or {}).get("title") or ""
    return {"doc_id": doc_id, "title": title, "messages": store.get_chat(doc_id)}


def parse_body(raw: Any) -> tuple[Optional[dict], Optional[str]]:
    if not isinstance(raw, dict):
        return None, "请求体必须是 JSON 对象"
    doc_id = (raw.get("doc_id") or "").strip()
    if not doc_id:
        return None, "缺少 doc_id"
    doc = store.get_document(doc_id)
    if doc is None:
        return None, "资料不存在"
    title = raw.get("title")
    if title is not None and not isinstance(title, str):
        return None, "title 必须是字符串"
    block_id = raw.get("block_id")
    if block_id is not None and not isinstance(block_id, str):
        return None, "block_id 必须是字符串"
    question = (raw.get("question") or "").strip()
    quote = (raw.get("quote") or "").strip()
    if not question and not quote:
        return None, "question 与 quote 至少一个非空"
    return {
        "doc_id": doc_id,
        "title": (title or doc.get("title") or "").strip(),
        "block_id": (block_id or "").strip(),
        "question": question or _DEFAULT_QUOTE_QUESTION,
        "quote": quote,
    }, None


def _format_history_user(msg: dict) -> str:
    content = msg.get("content") or ""
    quote = (msg.get("quote") or "").strip()
    if quote:
        return f"{content}\n\n【当时划选】\n{quote}"
    return content


def _build_llm_messages(
    context_text: str,
    quote: str,
    history: list[dict],
    question: str,
) -> list[dict]:
    quote_block = quote if quote else "（无划选）"
    preamble = (
        f"【资料原文（引用编号）】\n{context_text}\n\n"
        f"【当前用户划选】\n{quote_block}"
    )
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": preamble},
        {"role": "assistant", "content": "已阅读当前资料与划选，请继续提问。"},
    ]
    for msg in (history[-_MAX_HISTORY:] if history else []):
        role = msg.get("role")
        if role == "user":
            messages.append({"role": "user", "content": _format_history_user(msg)})
        elif role == "assistant":
            messages.append({"role": "assistant", "content": msg.get("content") or ""})
    messages.append({"role": "user", "content": f"【本次提问】\n{question}"})
    return messages


def _invoke_llm(
    doc_id: str,
    quote: str,
    question: str,
    block_id: str = "",
) -> tuple[str, list[dict]]:
    _document(doc_id)
    context = ai_context.build_context(
        doc_id,
        question=question,
        quote=quote,
        focus_block_id=block_id,
    )
    history = store.get_chat(doc_id)
    messages = _build_llm_messages(context["text"], quote, history, question)
    reply = llm.chat(messages, **api_config.llm_kwargs())
    return ai_context.clean_citations(reply, context)


def chat(
    doc_id: str,
    title: str,
    question: str,
    quote: str,
    block_id: str = "",
) -> dict[str, Any]:
    """落库对话：LLM 成功后写入 user/assistant。"""
    reply, citations = _invoke_llm(doc_id, quote, question, block_id)
    store.append_chat(doc_id, "user", question, quote=quote, via="chat")
    store.append_chat(doc_id, "assistant", reply, quote="", via="chat")
    out = get(doc_id)
    out["reply"] = reply
    out["citations"] = citations
    return out


def spot(
    doc_id: str,
    title: str,
    question: str,
    quote: str,
    block_id: str = "",
) -> dict[str, Any]:
    """现场问：不写入对话历史。"""
    reply, citations = _invoke_llm(doc_id, quote, question, block_id)
    return {"doc_id": doc_id, "reply": reply, "citations": citations}


def reset(doc_id: Optional[str] = None) -> None:
    store.reset_chats(doc_id)
