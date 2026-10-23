"""LLM 上下文截断策略。

同一条资料在不同功能（对话、出题、笔记、前置自评）中应使用一致的截断规则，
避免长文档在不同入口下表现不一致或超出模型上下文。
"""

MAX_SOURCE_CHARS = 80_000
HEAD_TAIL_CHARS = 4_000
QUOTE_CONTEXT = 2_000


def truncate_source(
    text: str,
    quote: str = "",
    max_chars: int = MAX_SOURCE_CHARS,
) -> str:
    """超长资料截断：保留开头、结尾与选区附近内容。"""
    text = text or ""
    if len(text) <= max_chars:
        return text

    head = text[:HEAD_TAIL_CHARS]
    tail = text[-HEAD_TAIL_CHARS:]
    mid = ""
    if quote:
        idx = text.find(quote)
        if idx >= 0:
            start = max(0, idx - QUOTE_CONTEXT)
            end = min(len(text), idx + len(quote) + QUOTE_CONTEXT)
            mid = text[start:end]

    parts = [f"【资料原文·开头】\n{head}"]
    if mid:
        parts.append(f"【资料原文·选区附近】\n{mid}")
    parts.append(f"【资料原文·结尾】\n{tail}")
    combined = "\n\n...(资料已截断，仅保留首尾与选区附近)...\n\n".join(parts)
    if len(combined) > max_chars:
        return combined[:max_chars] + "\n...(截断)..."
    return combined
