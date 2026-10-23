"""按文档 ID 的连续对话。

消息存 SQLite（chat_messages）；正式对话落库，现场提问不落盘。
上下文来自当前版本的统一内容块，不依赖原始文件格式。
"""

from typing import Any, Optional

from . import api_config, llm, store, text_budget

_MAX_HISTORY = 20

_SYSTEM_PROMPT = (
    "你是学习助教。只依据「当前资料原文」「用户划选的选区」「当前对话上文」回答。\n"
    "1. 有选区时：讲这一段，不要滑成整篇摘要。\n"
    "2. 原文没写的明说「这份资料没覆盖」，不要编造。\n"
    "3. 可引原文关键句但必须解释。\n"
    "4. 简体中文，Markdown。\n"
    "5. 不要输出与问题无关的学习路径。"
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
    question = (raw.get("question") or "").strip()
    quote = (raw.get("quote") or "").strip()
    if not question and not quote:
        return None, "question 与 quote 至少一个非空"
    return {
        "doc_id": doc_id,
        "title": (title or doc.get("title") or "").strip(),
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
    source_text: str,
    quote: str,
    history: list[dict],
    question: str,
) -> list[dict]:
    truncated = text_budget.truncate_source(source_text, quote)
    quote_block = quote if quote else "（无划选）"
    preamble = f"【当前资料原文】\n{truncated}\n\n【当前用户划选】\n{quote_block}"
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


def _invoke_llm(doc_id: str, quote: str, question: str) -> str:
    _document(doc_id)
    text = store.document_text(doc_id)
    if not text.strip():
        raise ValueError("资料内容为空，无法对话")
    history = store.get_chat(doc_id)
    messages = _build_llm_messages(text, quote, history, question)
    return llm.chat(messages, **api_config.llm_kwargs())


def chat(doc_id: str, title: str, question: str, quote: str) -> dict[str, Any]:
    """落库对话：LLM 成功后写入 user/assistant。"""
    reply = _invoke_llm(doc_id, quote, question)
    store.append_chat(doc_id, "user", question, quote=quote, via="chat")
    store.append_chat(doc_id, "assistant", reply, quote="", via="chat")
    out = get(doc_id)
    out["reply"] = reply
    return out


def spot(doc_id: str, title: str, question: str, quote: str) -> dict[str, Any]:
    """现场问：不写入对话历史。"""
    reply = _invoke_llm(doc_id, quote, question)
    return {"doc_id": doc_id, "reply": reply}


def reset(doc_id: Optional[str] = None) -> None:
    store.reset_chats(doc_id)
