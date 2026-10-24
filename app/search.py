"""跨文档检索与带来源引用的问答。

检索只覆盖每份资料当前版本的内容块；问答复用统一上下文的
``[B:<block_id>]`` 标记，返回可核对的引用元数据。
"""

import json
import re

from . import ai_context, api_config, llm, parsers, store

MAX_SCAN = 40000
MAX_KEYWORDS = 12
SNIPPET_PAD = 70

SYSTEM_RULES = (
    f"{ai_context.SYSTEM_RULES}\n\n"
    "这次资料来自多份文档。引用时必须使用资料中的 [B:<block_id>] 标记；"
    "回答开头用一句话说明覆盖了哪些资料，并在引用处保留来源位置。"
)


def keywords(query: str) -> list[str]:
    """把查询拆成可做子串匹配的关键词，兼顾中文短句与英文术语。"""
    text = (query or "").strip()
    if not text:
        return []
    tokens = re.findall(
        r"[A-Za-z_][A-Za-z0-9_.\-]{1,}|[0-9]+|[\u4e00-\u9fff]+", text
    )
    out: list[str] = []
    for token in tokens:
        if re.fullmatch(r"[\u4e00-\u9fff]+", token):
            if len(token) <= 6:
                pieces = [token]
            else:
                pieces = []
                for size in (3, 2):
                    for i in range(0, len(token) - size + 1):
                        pieces.append(token[i : i + size])
                    if len(out) + len(pieces) >= MAX_KEYWORDS:
                        break
        else:
            pieces = [token.lower()]
        for piece in pieces:
            if piece and piece not in out:
                out.append(piece)
            if len(out) >= MAX_KEYWORDS:
                return out
    return out


def _rows(doc_id: str = "") -> list[dict]:
    sql = (
        "SELECT b.id AS block_id, b.document_id, b.text, b.markdown, b.block_type, "
        "b.source_locator, d.title, d.source_name, d.source_format, c.title AS chapter_title "
        "FROM blocks b "
        "JOIN documents d ON d.id = b.document_id "
        "JOIN chapters c ON c.id = b.chapter_id "
        "WHERE d.current_version_id = b.version_id"
    )
    params: list = []
    if doc_id:
        sql += " AND b.document_id = ?"
        params.append(doc_id)
    sql += " ORDER BY d.title, b.idx LIMIT ?"
    params.append(MAX_SCAN)
    with store._conn() as conn:
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


def _body(row: dict) -> str:
    return (row.get("text") or row.get("markdown") or "").strip()


def _rows_by_ids(block_ids: list[str]) -> dict[str, dict]:
    if not block_ids:
        return {}
    placeholders = ",".join("?" for _ in block_ids)
    with store._conn() as conn:
        rows = conn.execute(
            "SELECT b.id AS block_id, b.document_id, b.text, b.markdown, "
            "b.source_locator, d.title, d.source_format "
            f"FROM blocks b JOIN documents d ON d.id = b.document_id "
            f"WHERE b.id IN ({placeholders})",
            block_ids,
        ).fetchall()
    return {row["block_id"]: dict(row) for row in rows}


def _snippet(text: str, hits: list[str]) -> str:
    lowered = text.lower()
    positions = [lowered.find(kw.lower()) for kw in hits]
    positions = [p for p in positions if p >= 0]
    pos = min(positions) if positions else 0
    start = max(0, pos - SNIPPET_PAD)
    end = min(len(text), pos + SNIPPET_PAD + 30)
    snippet = re.sub(r"\s+", " ", text[start:end]).strip()
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet += "…"
    return snippet


def search(query: str, limit: int = 20, doc_id: str = "") -> dict:
    """按关键词检索当前版本内容块，返回带来源位置的片段。"""
    query = (query or "").strip()[:2000]
    terms = keywords(query)
    limit = max(1, min(50, int(limit or 20)))
    if not terms:
        return {"query": query, "keywords": [], "count": 0, "results": []}

    results: list[dict] = []
    scanned = 0
    for row in _rows(doc_id):
        body = _body(row)
        if not body:
            continue
        scanned += 1
        lowered = body.lower()
        hits = [kw for kw in terms if kw.lower() in lowered]
        if not hits:
            continue
        score = sum(min(lowered.count(kw.lower()), 3) for kw in hits)
        title = (row.get("title") or "").lower()
        if any(kw.lower() in title for kw in hits):
            score += 5
        locator = parsers.locator_label(
            row.get("source_format") or "", _load_locator(row)
        )
        results.append(
            {
                "document_id": row["document_id"],
                "title": row.get("title") or "",
                "source_name": row.get("source_name") or "",
                "block_id": row["block_id"],
                "chapter_title": row.get("chapter_title") or "",
                "locator": locator,
                "snippet": _snippet(body, hits),
                "score": score,
                "hits": hits,
            }
        )

    results.sort(key=lambda item: (-item["score"], item["title"], item["block_id"]))
    results = results[:limit]
    return {
        "query": query,
        "keywords": terms,
        "count": len(results),
        "scanned": scanned,
        "results": results,
    }


def _load_locator(row: dict) -> dict:
    raw = row.get("source_locator")
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}


def _context(results: list[dict], max_chars: int = 50000) -> dict:
    pieces: list[str] = []
    citations: dict[str, dict] = {}
    used = 0
    for result in results:
        text = (result.get("text") or "").strip()
        if not text:
            continue
        label = f"《{result.get('title') or '未命名'}》 {result.get('locator') or ''}".strip()
        piece = f"[B:{result['block_id']}] {label}\n{text}"
        if used + len(piece) > max_chars and pieces:
            break
        pieces.append(piece)
        used += len(piece) + 2
        citations[result["block_id"]] = {
            "block_id": result["block_id"],
            "doc_id": result.get("document_id") or "",
            "title": result.get("title") or "",
            "locator": result.get("locator") or "",
        }
    return {
        "text": "\n\n".join(pieces),
        "block_ids": set(citations),
        "citations": citations,
    }


def ask(query: str, doc_id: str = "", limit: int = 10) -> dict:
    """检索多份资料后回答，返回答案、引用与来源列表。"""
    query = (query or "").strip()[:2000]
    found = search(query, limit=max(3, min(20, limit)), doc_id=doc_id)
    if not found["results"]:
        return {
            "query": query,
            "answer": "没有在当前资料中找到相关内容。可以换个关键词，或先导入更多资料。",
            "citations": [],
            "sources": [],
        }

    rows_by_id = _rows_by_ids([result["block_id"] for result in found["results"]])
    picked = []
    per_doc: dict[str, int] = {}
    for result in found["results"]:
        count = per_doc.get(result["document_id"], 0)
        if count >= 3:
            continue
        row = rows_by_id.get(result["block_id"])
        if row is None:
            continue
        picked.append({**result, "text": _body(row)})
        per_doc[result["document_id"]] = count + 1
    if not picked:
        picked = [
            {**result, "text": _body(rows_by_id.get(result["block_id"]) or {})}
            for result in found["results"][:5]
        ]

    context = _context(picked)
    user_content = (
        f"【资料原文（引用编号）】\n{context['text']}\n\n"
        f"【问题】\n{query}\n\n"
        "请只依据以上多份资料回答。引用原文时在句末加 [cite:<block_id>]；"
        "资料之间说法不一致时分别说明；资料未覆盖的部分明确说「资料未覆盖」。"
    )
    reply = llm.chat(
        [
            {"role": "system", "content": SYSTEM_RULES},
            {"role": "user", "content": user_content},
        ],
        **api_config.llm_kwargs(),
    )
    answer, citations = ai_context.clean_citations(reply, context)
    sources = []
    seen_docs: set[str] = set()
    for citation in citations:
        meta = context["citations"].get(citation["block_id"]) or {}
        doc_key = meta.get("doc_id") or ""
        if doc_key and doc_key not in seen_docs:
            seen_docs.add(doc_key)
            sources.append(
                {
                    "document_id": doc_key,
                    "title": meta.get("title") or "",
                    "locator": meta.get("locator") or "",
                }
            )
    return {
        "query": query,
        "answer": answer,
        "citations": citations,
        "sources": sources,
    }
