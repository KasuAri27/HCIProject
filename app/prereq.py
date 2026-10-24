"""按文档 ID 生成、缓存可跳过的前置自评题。

前置自评是可选功能：阅读、笔记、出题和对话都不依赖它。
"""

import datetime
from typing import Any, Optional

from . import ai_context, api_config, llm, store

FOUR_LEVELS = ["不会", "了解", "能用", "熟悉"]

PREREQ_SYSTEM = """你是学习助手。用户即将阅读一份资料。
请根据资料内容，列出阅读这份资料之前应当具备的前置基础，并生成简短自评问卷。

必须遵守：
1. 只问「读这份资料之前就该有的基础」，不要问资料本身将要讲解的新概念。
   反例：资料在讲 FlashAttention，不要问「你会不会 FlashAttention」。
   正例：可以问 tiling、softmax 数值稳定、GPU 存储层次等资料会用到的前置。
2. 题目 0～5 道；若这份资料几乎不需要额外基础，questions 为空数组，focus 可写「无需补问」。
3. 每题必须用四档：不会 / 了解 / 能用 / 熟悉。不要改成考试题、计算题或开放问答题。
4. 每题包含 id（q1、q2…）、prompt（题干）、why（为何读这份资料需要它，不超过一句）。
5. 用简体中文。不要讲解资料正文、不要总结全文、不要推荐学习路径。
6. 只输出 JSON，不要其它文字，格式：
{
  "focus": "不超过 20 字",
  "questions": [{"id":"q1","prompt":"...","why":"..."}]
}"""


def _now_iso() -> str:
    return datetime.datetime.now().isoformat(timespec="seconds")


def get(doc_id: str) -> Optional[dict]:
    return store.get_prereq(doc_id)


def _normalize_questions(questions: Any) -> list[dict]:
    if not isinstance(questions, list):
        raise ValueError("questions 必须是数组")
    out: list[dict] = []
    for q in questions[:5]:
        if not isinstance(q, dict):
            continue
        prompt = (q.get("prompt") or "").strip()
        why = (q.get("why") or "").strip()
        if not prompt:
            continue
        out.append(
            {
                "id": f"q{len(out) + 1}",
                "prompt": prompt,
                "why": why,
                "options": FOUR_LEVELS,
            }
        )
    return out


def _validate_payload(data: Any) -> dict:
    if not isinstance(data, dict):
        raise ValueError("前置题必须是 JSON 对象")
    focus = (data.get("focus") or "").strip()
    if len(focus) > 20:
        focus = focus[:20]
    return {
        "focus": focus,
        "questions": _normalize_questions(data.get("questions", [])),
        "answers": {},
        "generated_at": _now_iso(),
    }


def validate_answers(questions: list[dict], answers: Any) -> tuple[Optional[dict], Optional[str]]:
    if not isinstance(answers, dict):
        return None, "answers 必须是对象"
    if not questions:
        if answers:
            return None, "无题目时不应提交答案"
        return {}, None
    norm: dict[str, str] = {}
    for q in questions:
        qid = q.get("id")
        if qid not in answers:
            return None, f"缺少题目 {qid} 的答案"
        val = answers[qid]
        if val not in FOUR_LEVELS:
            return None, f"题目 {qid} 的答案必须是四档之一"
        norm[qid] = val
    for key in answers:
        if key not in norm:
            return None, f"未知题目 id：{key}"
    return norm, None


def generate(doc_id: str) -> dict:
    doc = store.get_document(doc_id)
    if doc is None:
        raise ValueError("资料不存在")
    context = ai_context.build_context(doc_id, question="前置基础")
    user_content = (
        f"【当前资料（引用编号）】\n标题：{doc.get('title') or ''}\n\n{context['text']}"
    )
    reply = llm.chat(
        [
            {"role": "system", "content": PREREQ_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        **api_config.llm_kwargs(),
    )
    entry = _validate_payload(llm.parse_json(reply))
    store.save_prereq(doc_id, entry)
    return entry


def save_answers(doc_id: str, answers: dict) -> Optional[dict]:
    entry = store.get_prereq(doc_id)
    if entry is None:
        return None
    validated, err = validate_answers(entry.get("questions") or [], answers)
    if err:
        raise ValueError(err)
    entry["answers"] = validated or {}
    entry["answered_at"] = _now_iso()
    store.save_prereq(doc_id, entry)
    return entry
