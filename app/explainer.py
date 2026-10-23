"""出题与批改服务。

当前主流程围绕用户打开的一份资料：把资料原文、资料对话、已出题摘要和
上次批改要点组装成 prompt，调用 OpenAI 兼容接口生成题目或批改解答。
"""

from typing import Optional

from . import api_config, llm, text_budget

_SYSTEM_PROMPT = (
    "你是一位严谨的学习助教。\n"
    "你只能依据下方提供的『当前资料原文』行事，不得凭记忆编造；\n"
    "资料未覆盖的内容，明确说明『资料未覆盖』而不是编造；\n"
    "使用简体中文，Markdown 格式输出。"
)

_LAST_REVIEW_MAX_CHARS = 2000


def format_chat_tail(messages: list) -> str:
    """格式化最近若干条资料对话，供出题参考。"""
    if not messages:
        return "（当前资料暂无划选对话）"
    lines = []
    for msg in messages[-10:]:
        role = msg.get("role") or ""
        content = (msg.get("content") or "").strip()
        if role == "user":
            quote = (msg.get("quote") or "").strip()
            if quote:
                content = f"{content}\n【当时划选】\n{quote[:500]}"
        label = "学生" if role == "user" else "助教"
        lines.append(f"- {label}：{content[:800]}")
    return "\n".join(lines)


def format_last_submission_hint(last_submission: dict, doc_id: str) -> str:
    """同资料上一题批改要点（截断），供下一题避开重复考点。"""
    if not last_submission or last_submission.get("rel") != doc_id:
        return ""
    review = (last_submission.get("review") or "").strip()
    if not review:
        return ""
    if len(review) > _LAST_REVIEW_MAX_CHARS:
        review = review[:_LAST_REVIEW_MAX_CHARS] + "\n...(批改已截断)..."
    question = (last_submission.get("question") or "").strip()[:400]
    return (
        "## 上一题与批改（同资料，出题时请避开重复考点，可参考学生刚错在哪里）\n"
        f"题目摘要：{question or '（无）'}\n\n批改要点：\n{review}"
    )


def _difficulty_line(difficulty: str) -> str:
    if difficulty:
        return f"3. 难度控制在【{difficulty}】级别；"
    return "3. 难度由你根据资料内容把握，适中为宜；"


def generate_exercise(
    doc_id: str,
    source_title: str,
    source_text: str,
    difficulty: str = "",
    prior_questions: Optional[list] = None,
    chat_messages: Optional[list] = None,
    last_submission: Optional[dict] = None,
) -> str:
    """基于当前资料生成一道练习题（一次一题）。"""
    if not (source_text or "").strip():
        raise ValueError("资料内容为空，无法出题")

    sections = [
        f"## 当前资料（出题依据）\n来源：{source_title or doc_id}\n\n"
        f"{text_budget.truncate_source(source_text)}",
    ]
    prior = prior_questions or []
    if prior:
        numbered = "\n".join(f"{i}. {q}" for i, q in enumerate(prior, start=1))
        sections.append(f"## 当前资料已出过的题目摘要（请勿重复相同考点）\n{numbered}")
    sections.append(
        f"## 当前资料最近对话（学生问过什么）\n{format_chat_tail(chat_messages or [])}"
    )
    hint = format_last_submission_hint(last_submission or {}, doc_id)
    if hint:
        sections.append(hint)

    task = (
        "\n\n请基于上述资料出一道适合动手练习的题目：\n"
        "1. 题型由你根据资料内容判断：若核心是代码实现（如 CUDA 算子、"
        "PyTorch 实现、系统设计编码），必须出代码题；若偏理论/概念（推导、机制分析、"
        "设计决策），可以出非代码题（推导题、设计题、简答题）；\n"
        "2. 说明题目背景与目标、输入输出格式、示例；\n"
        f"{_difficulty_line(difficulty)}\n"
        "4. 不要给出完整答案，只给关键提示；\n"
        "5. 题目开头用一行【题型：代码题 / 非代码题】标注题型，并在结尾给出『思考要点』小节，"
        "指出解题时的易错点。"
    )
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": "\n\n".join(sections) + task},
    ]
    return llm.chat(messages, **api_config.llm_kwargs())


def review_submission(
    doc_id: str,
    source_title: str,
    source_text: str,
    question: str,
    code: str,
) -> str:
    """批改基于当前资料出的题目解答。"""
    if not (source_text or "").strip():
        raise ValueError("资料内容为空，无法批改")

    user_content = (
        f"## 当前资料（批改依据）\n来源：{source_title or doc_id}\n\n"
        f"{text_budget.truncate_source(source_text)}\n\n"
        f"【本题题目】\n{question}\n\n"
        f"【学生提交的解答】\n```\n{code}\n```\n\n"
        "请批改这份解答：\n"
        "1. 先判断对错，并指出资料哪一段能对上或哪里对不上；\n"
        "2. 给出正确理解；改进建议（代码题指运行/逻辑，理论题指推导/结论）；\n"
        "3. 不要贴完整参考答案，只给思路要点。"
    )
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
    return llm.chat(messages, **api_config.llm_kwargs())
