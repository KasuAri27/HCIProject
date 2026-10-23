"""本地资料库：扫描、读取与 Markdown 渲染。

第一阶段只支持 Markdown（.md/.markdown）和纯文本（.txt）。用户把文件放进
可写的 library/ 目录后，应用即可离线阅读；不依赖任何内置课程或外部仓库。

资料在界面与学习记录中的唯一键是相对路径 ``rel``（POSIX 风格）。
独立文档 ID、导入与版本管理将在第二阶段补充。
"""

import html
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import quote, unquote

from . import config

# 资料目录：用户放入本地文件即可
LIBRARY_DIR = config.LIBRARY_DIR

# 支持的文件类型（阅读）
DOCUMENT_KINDS = {
    ".md": "markdown",
    ".markdown": "markdown",
    ".txt": "text",
}

# 可导入的格式
IMPORT_FORMATS = {
    ".md": "md",
    ".markdown": "md",
    ".txt": "txt",
    ".docx": "docx",
    ".pdf": "pdf",
}

# 行内占位符（不可见字符，避免与正文冲突）
_PH_CODE = "\x01"
_PH_MATH = "\x02"
_PH_IMG = "\x03"
_PH_LINK = "\x04"
_PH_BR = "\x05"
_PH_ESC = ""


# ------------------------------------------------------------
# 资料库与文件
# ------------------------------------------------------------

def ensure_library() -> Path:
    """确保资料目录存在，返回目录路径。"""
    try:
        LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return LIBRARY_DIR


def library_status() -> dict:
    """返回资料库自检信息，供页面提示和启动自检使用。"""
    exists = LIBRARY_DIR.exists()
    is_dir = exists and LIBRARY_DIR.is_dir()
    writable = is_dir and os.access(LIBRARY_DIR, os.W_OK)
    warnings: list[str] = []
    if not exists:
        warnings.append("资料目录不存在，应用会尝试自动创建。")
    elif not is_dir:
        warnings.append("资料路径不是目录，请检查 LEARN_LIBRARY_DIR 配置。")
    elif not writable:
        warnings.append("资料目录不可写，放入文件后可能无法被应用读取。")

    documents = iter_library_files() if is_dir else []
    if is_dir and not documents:
        warnings.append("资料库为空：把资料放入该目录，或使用页面上的导入按钮。")

    return {
        "path": str(LIBRARY_DIR),
        "exists": exists,
        "is_dir": is_dir,
        "writable": writable,
        "document_count": len(documents),
        "warnings": warnings,
    }


def list_documents() -> list[dict]:
    """列出资料库中的 Markdown/TXT 文件，按相对路径排序。"""
    if not LIBRARY_DIR.is_dir():
        return []

    base = LIBRARY_DIR.resolve()
    documents: list[dict] = []
    try:
        candidates = sorted(LIBRARY_DIR.rglob("*"), key=lambda p: p.as_posix().casefold())
    except OSError:
        return []

    for path in candidates:
        if not path.is_file():
            continue
        try:
            resolved = path.resolve()
            resolved.relative_to(base)
        except (OSError, ValueError):
            continue
        suffix = path.suffix.lower()
        kind = DOCUMENT_KINDS.get(suffix)
        if kind is None:
            continue
        rel = path.relative_to(LIBRARY_DIR).as_posix()
        if any(part.startswith(".") for part in Path(rel).parts):
            continue
        try:
            stat = path.stat()
            modified_at = datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds")
            size = stat.st_size
        except OSError:
            modified_at = ""
            size = 0
        documents.append(
            {
                "id": rel,
                "rel": rel,
                "title": rel[: -len(suffix)],
                "kind": kind,
                "size": size,
                "modified_at": modified_at,
            }
        )

    return documents


def iter_library_files() -> list[Path]:
    """列出资料库中所有可导入文件（Markdown/TXT/DOCX/PDF）。"""
    if not LIBRARY_DIR.is_dir():
        return []
    base = LIBRARY_DIR.resolve()
    paths: list[Path] = []
    try:
        candidates = sorted(LIBRARY_DIR.rglob("*"), key=lambda p: p.as_posix().casefold())
    except OSError:
        return []
    for path in candidates:
        if not path.is_file() or path.suffix.lower() not in IMPORT_FORMATS:
            continue
        try:
            path.resolve().relative_to(base)
        except (OSError, ValueError):
            continue
        rel = path.relative_to(LIBRARY_DIR).as_posix()
        if any(part.startswith(".") for part in Path(rel).parts):
            continue
        paths.append(path)
    return paths


def library_rel(path: Path) -> str:
    """资料文件的资料库相对路径（POSIX）。"""
    try:
        return path.resolve().relative_to(LIBRARY_DIR.resolve()).as_posix()
    except (OSError, ValueError):
        return path.name


def _safe_relpath(rel: str) -> Optional[str]:
    """规范化资料相对路径；非法返回 None。"""
    raw = unquote((rel or "").strip()).replace("\\", "/").lstrip("/")
    if not raw:
        return None
    parts = raw.split("/")
    if any(part in ("", ".", "..") for part in parts):
        return None
    return "/".join(parts)


def resolve_document(rel: str) -> Optional[Path]:
    """把 rel 解析为资料库内的真实文件路径，阻止目录穿越。"""
    safe = _safe_relpath(rel)
    if safe is None:
        return None
    suffix = Path(safe).suffix.lower()
    if suffix not in DOCUMENT_KINDS:
        return None
    try:
        base = LIBRARY_DIR.resolve()
        target = (LIBRARY_DIR / safe).resolve()
        target.relative_to(base)
    except (OSError, ValueError):
        return None
    return target if target.is_file() else None


def resolve_asset(rel: str) -> Optional[Path]:
    """解析资料库内的插图等静态资源，阻止目录穿越。"""
    safe = _safe_relpath(rel)
    if safe is None:
        return None
    try:
        base = LIBRARY_DIR.resolve()
        target = (LIBRARY_DIR / safe).resolve()
        target.relative_to(base)
    except (OSError, ValueError):
        return None
    return target if target.is_file() else None


def title_for(rel: str) -> str:
    """资料显示标题：相对路径去掉扩展名。"""
    safe = _safe_relpath(rel) or (rel or "").strip()
    suffix = Path(safe).suffix
    return safe[: -len(suffix)] if suffix else safe


def document_kind(rel: str) -> Optional[str]:
    """返回资料类型（markdown/text），非法路径返回 None。"""
    safe = _safe_relpath(rel)
    if safe is None:
        return None
    return DOCUMENT_KINDS.get(Path(safe).suffix.lower())


def read_document(rel: str) -> Optional[str]:
    """读取资料正文；不存在、非法路径或读取失败返回 None。"""
    target = resolve_document(rel)
    if target is None:
        return None
    try:
        return target.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def render_document(rel: str) -> Optional[dict]:
    """读取并渲染一份资料，返回 {rel,title,kind,html}。"""
    target = resolve_document(rel)
    if target is None:
        return None
    kind = document_kind(rel)
    try:
        text = target.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    asset_dir = Path(rel).parent.as_posix()
    if asset_dir == ".":
        asset_dir = ""
    if kind == "text":
        body = f'<pre class="plain-text">{html.escape(text)}</pre>'
    else:
        body = render_markdown(text, asset_dir=asset_dir)
    return {
        "rel": rel,
        "title": title_for(rel),
        "kind": kind,
        "html": body,
    }


# ------------------------------------------------------------
# 资料内插图
# ------------------------------------------------------------

def library_asset_url(src: str, asset_dir: str = "") -> str:
    """把资料中的相对图片路径改写为 /library-assets/ URL。

    远程 URL、data URL、锚点保持原样；越界路径返回空串。
    """
    raw = (src or "").strip()
    if not raw or raw.startswith(("#", "http://", "https://", "//", "data:")):
        return raw
    path = unquote(raw).replace("\\", "/")
    if path.startswith("/"):
        combined = path.lstrip("/")
    else:
        combined = f"{asset_dir}/{path}" if asset_dir else path
    normalized = os.path.normpath(combined).replace("\\", "/")
    if normalized in (".", "..") or normalized.startswith("../") or "/../" in normalized:
        return ""
    return "/library-assets/" + quote(normalized, safe="/")


# ------------------------------------------------------------
# Markdown 预处理
# ------------------------------------------------------------

_EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000027BF"
    "\U0000FE00-\U0000FE0F"
    "\U0000200D"
    "]+",
    flags=re.UNICODE,
)


def strip_document_markup(text: str) -> str:
    """去掉 YAML frontmatter 与围栏外 HTML 注释。"""
    if not text:
        return text
    s = text
    if s.startswith("---"):
        end = s.find("\n---", 3)
        if end != -1:
            s = s[end + 4 :]
            if s.startswith("\n"):
                s = s[1:]
    lines = s.splitlines()
    out: list[str] = []
    in_code = False
    for line in lines:
        if re.match(r"^\s*(```+|~~~+)\s*(.*)$", line):
            in_code = not in_code
            out.append(line)
            continue
        if in_code:
            out.append(line)
        else:
            out.append(re.sub(r"<!--.*?-->", "", line))
    return "\n".join(out)


def _slugify_heading(raw: str) -> str:
    """标题锚点：去掉 emoji/标点，空格变连字符。"""
    t = _EMOJI_RE.sub("", raw.strip()).lower()
    kept: list[str] = []
    for ch in t:
        if ch.isalnum() or ("\u4e00" <= ch <= "\u9fff") or ch in " -_":
            kept.append(ch)
    t = "".join(kept)
    t = re.sub(r"\s+", "-", t)
    t = re.sub(r"-+", "-", t)
    return t.rstrip("-")


def _alloc_heading_id(raw: str, counts: dict[str, int]) -> str:
    base = _slugify_heading(raw) or "section"
    n = counts.get(base, 0)
    counts[base] = n + 1
    if n == 0:
        return base
    return f"{base}-{n}"


# ------------------------------------------------------------
# 简单 Markdown → HTML 渲染
# ------------------------------------------------------------

def render_markdown(text: str, asset_dir: str = "") -> str:
    """将 Markdown 渲染为 HTML 片段。

    支持：标题、代码块、行内代码、粗体、斜体、列表、引用、链接、GFM 表格、
    块级/行内数学（$$ / $ / \\(\\)）、HTML/Markdown 插图、段落。
    所有正文与公式内容都会经过 HTML 转义，再交给前端 KaTeX 排版。
    """
    text = strip_document_markup(text)
    lines = text.splitlines()
    out: list[str] = []
    i = 0
    in_code = False
    code_buf: list[str] = []
    heading_ids: dict[str, int] = {}

    def flush_code():
        nonlocal code_buf
        if code_buf:
            code = html.escape("\n".join(code_buf))
            out.append(f"<pre><code>{code}</code></pre>")
            code_buf = []

    while i < len(lines):
        line = lines[i]
        # 围栏代码块 ``` 或 ~~~
        m = re.match(r"^\s*(```+|~~~+)\s*(.*)$", line)
        if m:
            if in_code:
                flush_code()
                in_code = False
            else:
                flush_code()
                in_code = True
            i += 1
            continue
        if in_code:
            code_buf.append(line)
            i += 1
            continue

        # 块级数学：单独一行的 $$ … $$
        if line.strip() == "$$":
            parts: list[str] = []
            i += 1
            while i < len(lines) and lines[i].strip() != "$$":
                parts.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            out.append(_math_display_html("\n".join(parts).strip()))
            continue

        m_display = re.match(r"^\s*\$\$(.+)\$\$\s*$", line)
        if m_display:
            out.append(_math_display_html(m_display.group(1).strip()))
            i += 1
            continue

        # 原文中的 HTML 插图（整行 <img … />）
        img_html = _render_html_img_line(line, asset_dir)
        if img_html:
            out.append(img_html)
            i += 1
            continue

        # 标题 # ~ ######
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            raw_title = m.group(2)
            hid = html.escape(_alloc_heading_id(raw_title, heading_ids), quote=True)
            out.append(f'<h{level} id="{hid}">{_inline(raw_title, asset_dir)}</h{level}>')
            i += 1
            continue

        # 水平线
        if re.match(r"^\s*---\s*$", line):
            out.append("<hr>")
            i += 1
            continue

        # 表格（GFM）
        if line.lstrip().startswith("|") and i + 1 < len(lines) and _is_table_separator(lines[i + 1]):
            rows = [line]
            i += 1
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append(lines[i])
                i += 1
            out.append(_render_table(rows, asset_dir))
            continue

        # 无序/有序列表
        m = re.match(r"^\s*[-*+]\s+(.*)$", line)
        if m:
            out.append(f"<li>{_inline(m.group(1), asset_dir)}</li>")
            i += 1
            continue
        m = re.match(r"^\s*\d+\.\s+(.*)$", line)
        if m:
            out.append(f"<li>{_inline(m.group(1), asset_dir)}</li>")
            i += 1
            continue

        # 引用
        m = re.match(r"^\s*>\s?(.*)$", line)
        if m:
            out.append(f"<blockquote>{_inline(m.group(1), asset_dir)}</blockquote>")
            i += 1
            continue

        # 空行
        if not line.strip():
            out.append("")
            i += 1
            continue

        # 普通段落
        para = [line]
        i += 1
        while (
            i < len(lines)
            and lines[i].strip()
            and lines[i].strip() != "$$"
            and not lines[i].lstrip().startswith("|")
            and not re.match(r"^\s*<img\s", lines[i], re.I)
            and not lines[i].startswith(("#", "-", "*", ">", "```"))
        ):
            para.append(lines[i])
            i += 1
        out.append(f"<p>{_inline(' '.join(para), asset_dir)}</p>")

    if in_code:
        flush_code()

    # 把孤立的 <li> 包裹成 <ul>
    result = "\n".join(out)
    result = re.sub(r"(<li>.*?</li>\s*)+", lambda m: f"<ul>{m.group(0)}</ul>", result, flags=re.S)
    return result


def _is_table_separator(line: str) -> bool:
    """判断是否为 GFM 表格分隔行。"""
    s = line.strip()
    if not (s.startswith("|") and s.endswith("|")):
        return False
    cells = [c.strip() for c in s[1:-1].split("|")]
    if not cells:
        return False
    return all(c == "" or re.fullmatch(r":?-+:?", c) for c in cells)


def _split_cells(row_line: str) -> list:
    """按 | 拆分表格行单元格（先占位转义 \\|）。"""
    s = row_line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    s = s.replace("\\|", "\x00")
    return [c.strip().replace("\x00", "|") for c in s.split("|")]


def _render_table(rows: list, asset_dir: str = "") -> str:
    """把连续表格行渲染为 HTML 表格。rows[0] 为表头，rows[1] 为分隔行。"""
    header = _split_cells(rows[0])
    body = [_split_cells(r) for r in rows[2:]]
    parts = ["<table><thead><tr>"]
    for cell in header:
        parts.append(f"<th>{_inline(cell, asset_dir)}</th>")
    parts.append("</tr></thead><tbody>")
    for row in body:
        parts.append("<tr>")
        for cell in row:
            parts.append(f"<td>{_inline(cell, asset_dir)}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table>")
    return "".join(parts)


def _math_display_html(tex: str) -> str:
    """块级公式容器（转义后保留 $$ 供前端 KaTeX auto-render）。"""
    if not tex:
        return '<div class="math-display"></div>'
    return f'<div class="math-display">$${html.escape(tex, quote=False)}$$</div>'


def _render_html_img_line(line: str, asset_dir: str) -> Optional[str]:
    """解析整行 HTML <img>，重写本地相对 src 并做基本转义。"""
    s = line.strip()
    if not re.match(r"<img\s", s, re.I):
        return None
    src_m = re.search(r"""src\s*=\s*["']([^"']+)["']""", s, re.I)
    if not src_m:
        return None
    src = library_asset_url(src_m.group(1), asset_dir)
    alt_m = re.search(r"""alt\s*=\s*["']([^"']*)["']""", s, re.I)
    alt = alt_m.group(1) if alt_m else ""
    style_m = re.search(r"""style\s*=\s*["']([^"']*)["']""", s, re.I)
    style_attr = f' style="{html.escape(style_m.group(1))}"' if style_m else ""
    return (
        f'<img src="{html.escape(src, quote=True)}" alt="{html.escape(alt)}"{style_attr} />'
    )


def _inline(text: str, asset_dir: str = "") -> str:
    """渲染行内元素：行内代码、数学占位、粗体、斜体、链接、插图，并转义 HTML。"""
    code_slots: list[str] = []
    math_slots: list[str] = []
    img_slots: list[tuple[str, str]] = []
    link_slots: list[tuple[str, str]] = []
    escape_slots: list[str] = []

    def stash_escape(m: re.Match) -> str:
        escape_slots.append(m.group(1))
        return f"{_PH_ESC}{len(escape_slots) - 1}{_PH_ESC}"

    def stash_code(m: re.Match) -> str:
        code_slots.append(m.group(1))
        return f"{_PH_CODE}C{len(code_slots) - 1}{_PH_CODE}"

    def stash_dollar_math(m: re.Match) -> str:
        math_slots.append(f"${m.group(1)}$")
        return f"{_PH_MATH}{len(math_slots) - 1}{_PH_MATH}"

    def stash_paren_math(m: re.Match) -> str:
        math_slots.append(f"\\({m.group(1)}\\)")
        return f"{_PH_MATH}{len(math_slots) - 1}{_PH_MATH}"

    def stash_md_img(m: re.Match) -> str:
        alt = m.group(1)
        url = library_asset_url(m.group(2), asset_dir)
        img_slots.append((alt, url))
        return f"{_PH_IMG}{len(img_slots) - 1}{_PH_IMG}"

    def stash_link(m: re.Match) -> str:
        link_slots.append((m.group(1), m.group(2)))
        return f"{_PH_LINK}{len(link_slots) - 1}{_PH_LINK}"

    text = re.sub(r"`([^`]+)`", stash_code, text)
    text = re.sub(r"(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)", stash_dollar_math, text)
    text = re.sub(r"\\\((.+?)\\\)", stash_paren_math, text)
    text = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", stash_md_img, text)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", stash_link, text)
    text = re.sub(r"\\([\\`*_{}\[\]#+\-.!>|$~])", stash_escape, text)
    text = re.sub(r"<br\s*/?>", _PH_BR, text, flags=re.I)

    text = html.escape(text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"__([^_]+)__", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", text)
    text = text.replace(_PH_BR, "<br>")

    for i, (label, url) in enumerate(link_slots):
        lab = html.escape(label)
        u = url.strip()
        if u.lower().startswith("javascript:"):
            tag = lab
        elif u.startswith("#"):
            tag = f'<a href="{html.escape(u, quote=True)}">{lab}</a>'
        elif re.match(r"^https?://", u, re.I):
            tag = (
                f'<a href="{html.escape(u, quote=True)}" target="_blank" '
                f'rel="noopener">{lab}</a>'
            )
        else:
            tag = f'<a href="{html.escape(u, quote=True)}">{lab}</a>'
        text = text.replace(f"{_PH_LINK}{i}{_PH_LINK}", tag)

    for i, code in enumerate(code_slots):
        text = text.replace(f"{_PH_CODE}C{i}{_PH_CODE}", f"<code>{html.escape(code)}</code>")
    for i, raw in enumerate(math_slots):
        # 公式内容同样转义，浏览器解析后再交给 KaTeX，避免注入 HTML
        text = text.replace(f"{_PH_MATH}{i}{_PH_MATH}", html.escape(raw, quote=False))
    for i, (alt, url) in enumerate(img_slots):
        tag = (
            f'<img src="{html.escape(url, quote=True)}" alt="{html.escape(alt)}" />'
        )
        text = text.replace(f"{_PH_IMG}{i}{_PH_IMG}", tag)
    for i, ch in enumerate(escape_slots):
        text = text.replace(f"{_PH_ESC}{i}{_PH_ESC}", html.escape(ch, quote=False))
    return text
