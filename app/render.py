"""把统一内容块渲染成带 block id 的 HTML。

每个块都输出为 ``.doc-block[data-block-id]``，前端据此做高亮、标注、
阅读位置恢复。来源位置放在 data-locator 与 blocks 元数据里。
"""

import html

from . import parsers, source


def _plain_paragraph(text: str) -> str:
    return "<p>" + html.escape(text or "").replace("\n", "<br>") + "</p>"


def _plain_list(text: str) -> str:
    items = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    if not items:
        return ""
    return "<ul>" + "".join(f"<li>{html.escape(item)}</li>" for item in items) + "</ul>"


def _table_html(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    header = rows[0]
    body = rows[1:]
    parts = ["<table><thead><tr>"]
    for cell in header:
        parts.append(f"<th>{html.escape(str(cell))}</th>")
    parts.append("</tr></thead><tbody>")
    for row in body:
        parts.append("<tr>")
        for cell in row:
            parts.append(f"<td>{html.escape(str(cell))}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table>")
    return "".join(parts)


def _block_html(block: dict, source_format: str, asset_dir: str) -> str:
    btype = block.get("block_type") or "paragraph"
    text = block.get("text") or ""
    markdown = block.get("markdown") or ""
    is_markdown = source_format in ("md", "markdown")

    if markdown:
        if btype in ("heading", "paragraph", "list", "quote", "image"):
            return source.render_markdown(markdown, asset_dir=asset_dir)

    if btype == "heading":
        level = max(1, min(6, int(block.get("level") or 2)))
        return (
            source.render_markdown(f"{'#' * level} {text}", asset_dir=asset_dir)
            if is_markdown
            else f"<h{level}>{html.escape(text)}</h{level}>"
        )

    if btype == "code":
        lang = (block.get("lang") or "").strip()
        cls = f' class="language-{html.escape(lang)}"' if lang else ""
        return f"<pre><code{cls}>{html.escape(text)}</code></pre>"

    if btype == "math":
        return f'<div class="math-display">$${html.escape(text)}$$</div>'

    if btype == "table":
        return _table_html(block.get("rows") or [])

    if btype == "list":
        return (
            source.render_markdown(text, asset_dir=asset_dir)
            if is_markdown
            else _plain_list(text)
        )

    if btype == "quote":
        if is_markdown:
            quoted = "\n".join("> " + line for line in text.splitlines())
            return source.render_markdown(quoted, asset_dir=asset_dir)
        return f"<blockquote>{html.escape(text).replace(chr(10), '<br>')}</blockquote>"

    if btype == "hr":
        return "<hr>"

    return (
        source.render_markdown(text, asset_dir=asset_dir)
        if is_markdown
        else _plain_paragraph(text)
    )


def render_content(content: dict, asset_dir: str = "") -> dict:
    """返回 {html, blocks, chapters}；调用方负责版本与状态判断。"""
    doc = content.get("document") or {}
    version = content.get("version") or {}
    source_format = (doc.get("source_format") or "").lower()
    blocks_html: list[str] = []
    block_meta: list[dict] = []

    for block in content.get("blocks") or []:
        locator = block.get("source_locator") or {}
        label = parsers.locator_label(source_format, locator)
        body = _block_html(block, source_format, asset_dir)
        block_id = block.get("id") or ""
        anchor = block.get("anchor") or ""
        blocks_html.append(
            f'<section class="doc-block md-block" id="block-{html.escape(block_id)}" '
            f'data-block-id="{html.escape(block_id)}" data-type="{html.escape(block.get("block_type") or "")}" '
            f'data-anchor="{html.escape(anchor)}" data-locator="{html.escape(label)}" '
            f'title="{html.escape(label)}">{body}</section>'
        )
        block_meta.append(
            {
                "id": block_id,
                "type": block.get("block_type"),
                "locator": locator,
                "locator_label": label,
                "chapter_id": block.get("chapter_id"),
            }
        )

    chapters = [
        {
            "id": chapter.get("id"),
            "title": chapter.get("title"),
            "anchor": chapter.get("anchor"),
            "locator": chapter.get("source_locator") or {},
            "locator_label": parsers.locator_label(
                source_format, chapter.get("source_locator") or {}
            ),
        }
        for chapter in content.get("chapters") or []
    ]
    return {
        "html": "\n".join(blocks_html),
        "blocks": block_meta,
        "chapters": chapters,
        "version": {
            "id": version.get("id"),
            "number": version.get("version_no"),
            "parsed_at": version.get("parsed_at"),
            "source_format": version.get("source_format") or source_format,
        },
    }
