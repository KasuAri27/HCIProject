"""划段 AI 动作与理解检查。"""

import re

from . import ai_context, api_config, llm, store

MODE_TASKS = {
    "explain": (
        "请解释这段选中原文：先说清它在讲什么，再分点讲机制、原因或上下文中的作用。"
        "尽量贴近原文，不要扩写成整章摘要。"
    ),
    "example": (
        "请针对这段选中原文给一个具体、可验证的例子或类比，说明它如何体现原文的机制。"
        "例子属于补充解释，请用「补充：」开头。"
    ),
    "prereq": (
        "请列出理解这段原文所需的前置概念，并逐个用一两句话解释。"
        "能对应原文的地方加引用；原文没写的前置说明用「补充：」开头。"
    ),
    "check": (
        "请基于这段原文出 1 道理解检查题，只给题目，不要给答案或评分标准。"
        "题目要能检验读者是否真正理解这段的机制，而不是只背结论。"
    ),
}

VERDICT_RE = re.compile(r"【结论[：:]\s*(理解|部分理解|需要复习)】")


def _require_document(doc_id: str) -> dict:
    doc = store.get_document(doc_id)
    if doc is None:
        raise ValueError("资料不存在")
    if (doc.get("version_status") or "") != "ready":
        raise ValueError("资料尚未解析完成，请稍后再试")
    return doc


def selection_action(
    doc_id: str,
    mode: str,
    quote: str,
    block_id: str = "",
    question: str = "",
) -> dict:
    """执行划段动作，返回带引用的 Markdown。"""
    _require_document(doc_id)
    if mode not in MODE_TASKS:
        raise ValueError("不支持的动作")
    quote = (quote or "").strip()
    if not quote and not question:
        raise ValueError("缺少划选内容")
    context = ai_context.build_context(
        doc_id,
        question=question or quote,
        quote=quote,
        focus_block_id=block_id,
    )
    user_content = (
        f"【资料原文（引用编号）】\n{context['text']}\n\n"
        f"【当前划选】\n{quote or '（无，按问题处理）'}\n\n"
        f"【任务】\n{MODE_TASKS[mode]}"
    )
    if question:
        user_content += f"\n\n【用户补充问题】\n{question}"
    system = f"{ai_context.SYSTEM_RULES}\n\n当前只执行一个动作，不要输出无关内容。"
    reply = llm.chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        **api_config.llm_kwargs(),
    )
    cleaned, citations = ai_context.clean_citations(reply, context)
    return {"mode": mode, "markdown": cleaned, "citations": citations}


def evaluate_understanding(
    doc_id: str,
    block_id: str,
    quote: str,
    question: str,
    answer: str,
) -> dict:
    """批改用户对理解检查题的回答，并返回结论。"""
    _require_document(doc_id)
    answer = (answer or "").strip()
    if not answer:
        raise ValueError("解答不能为空")
    context = ai_context.build_context(
        doc_id,
        question=question,
        quote=quote,
        focus_block_id=block_id,
    )
    user_content = (
        f"【资料原文（引用编号）】\n{context['text']}\n\n"
        f"【划选内容】\n{quote or '（无）'}\n\n"
        f"【检查题】\n{question}\n\n"
        f"【学生回答】\n{answer}\n\n"
        "请批改这份回答：\n"
        "1. 第一行只输出结论：【结论：理解】/【结论：部分理解】/【结论：需要复习】；\n"
        "2. 说明对在哪里、缺了什么，能对应原文的地方加 [cite:<block_id>]；\n"
        "3. 给出一个改进后的简短答案，原文没覆盖的部分用「补充：」开头；\n"
        "4. 不要重出整道题。"
    )
    system = f"{ai_context.SYSTEM_RULES}\n\n你是批改理解检查的助教。"
    reply = llm.chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        **api_config.llm_kwargs(),
    )
    cleaned, citations = ai_context.clean_citations(reply, context)
    match = VERDICT_RE.search(cleaned)
    verdict = match.group(1) if match else "部分理解"
    return {"feedback": cleaned, "citations": citations, "verdict": verdict}
