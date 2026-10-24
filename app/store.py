"""SQLite 学习数据层。

第二阶段把“文档结构”和“学习记录”收到一个本地数据库：
- documents / document_versions / chapters / blocks：统一文档结构，与来源格式无关；
- annotations / reading_positions：高亮、批注与阅读位置；
- notes / chat_messages / prereq_cache / exercise_* / last_submissions：按文档 ID 保存；
- import_jobs：后台解析任务与进度。

所有记录使用文档 UUID 关联，资料改名不会让笔记失联。
"""

import contextlib
import json
import sqlite3
import threading
import uuid
from datetime import datetime
from typing import Any, Optional

from . import config

DB_PATH = config.DB_PATH

_init_lock = threading.Lock()

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
    id                 TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    source_name        TEXT,
    source_format      TEXT NOT NULL,
    source_path        TEXT,
    origin             TEXT NOT NULL DEFAULT 'import',
    legacy_rel         TEXT,
    current_version_id TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_source_path ON documents(source_path);
CREATE INDEX IF NOT EXISTS idx_documents_source_name ON documents(source_name);
CREATE INDEX IF NOT EXISTS idx_documents_legacy_rel ON documents(legacy_rel);

CREATE TABLE IF NOT EXISTS document_versions (
    id            TEXT PRIMARY KEY,
    document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_no    INTEGER NOT NULL,
    source_path   TEXT,
    source_format TEXT NOT NULL,
    content_hash  TEXT,
    markdown      TEXT,
    status        TEXT NOT NULL DEFAULT 'queued',
    error         TEXT,
    created_at    TEXT NOT NULL,
    parsed_at     TEXT,
    UNIQUE(document_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_versions_doc ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_versions_hash ON document_versions(content_hash);

CREATE TABLE IF NOT EXISTS chapters (
    id             TEXT PRIMARY KEY,
    document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_id     TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    idx            INTEGER NOT NULL,
    title          TEXT,
    anchor         TEXT,
    source_locator TEXT,
    UNIQUE(version_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_chapters_version ON chapters(version_id);

CREATE TABLE IF NOT EXISTS blocks (
    id             TEXT PRIMARY KEY,
    document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_id     TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    chapter_id     TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    idx            INTEGER NOT NULL,
    block_type     TEXT NOT NULL,
    text           TEXT,
    markdown       TEXT,
    level          INTEGER,
    lang           TEXT,
    rows           TEXT,
    source_locator TEXT,
    anchor         TEXT,
    UNIQUE(version_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_blocks_version ON blocks(version_id);
CREATE INDEX IF NOT EXISTS idx_blocks_chapter ON blocks(chapter_id);

CREATE TABLE IF NOT EXISTS annotations (
    id           TEXT PRIMARY KEY,
    document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_id   TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    block_id     TEXT NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset   INTEGER NOT NULL,
    quote        TEXT NOT NULL,
    note         TEXT NOT NULL DEFAULT '',
    color        TEXT NOT NULL DEFAULT 'amber',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_doc ON annotations(document_id, version_id);

CREATE TABLE IF NOT EXISTS reading_positions (
    document_id  TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    version_id   TEXT,
    block_id     TEXT,
    block_offset REAL NOT NULL DEFAULT 0,
    scroll_ratio REAL NOT NULL DEFAULT 0,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    title       TEXT,
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    quote       TEXT NOT NULL DEFAULT '',
    via         TEXT NOT NULL DEFAULT 'chat',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_doc ON chat_messages(document_id, created_at);

CREATE TABLE IF NOT EXISTS prereq_cache (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    payload     TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS read_records (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    title       TEXT,
    read_at     TEXT NOT NULL,
    read_count  INTEGER NOT NULL DEFAULT 1,
    self_level  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS exercise_state (
    document_id  TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    question     TEXT NOT NULL DEFAULT '',
    difficulty   TEXT NOT NULL DEFAULT '',
    generated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise_history (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    summary     TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY(document_id, idx)
);

CREATE TABLE IF NOT EXISTS last_submissions (
    document_id  TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    title        TEXT,
    question     TEXT,
    answer       TEXT,
    review       TEXT,
    submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS understanding_checks (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_id  TEXT,
    block_id    TEXT,
    quote       TEXT NOT NULL DEFAULT '',
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    feedback    TEXT NOT NULL DEFAULT '',
    verdict     TEXT NOT NULL DEFAULT '',
    self_level  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_understanding_doc ON understanding_checks(document_id, created_at);

CREATE TABLE IF NOT EXISTS exercise_evidence (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_id  TEXT,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    review      TEXT NOT NULL DEFAULT '',
    self_level  TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_doc ON exercise_evidence(document_id, created_at);

CREATE TABLE IF NOT EXISTS import_jobs (
    id            TEXT PRIMARY KEY,
    document_id   TEXT,
    version_id    TEXT,
    source_name   TEXT,
    source_format TEXT,
    source_path   TEXT,
    status        TEXT NOT NULL DEFAULT 'queued',
    progress      INTEGER NOT NULL DEFAULT 0,
    stage         TEXT NOT NULL DEFAULT '',
    error         TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON import_jobs(status, updated_at);

CREATE TABLE IF NOT EXISTS app_state (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _uid() -> str:
    return uuid.uuid4().hex


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextlib.contextmanager
def _conn():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, decl: str) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def init_db() -> None:
    """建表；可重复调用，并为旧库补列。"""
    with _init_lock:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with _conn() as conn:
            conn.executescript(SCHEMA)
            _ensure_column(conn, "document_versions", "markdown", "TEXT")
            _ensure_column(conn, "blocks", "markdown", "TEXT")
            _ensure_column(conn, "read_records", "self_level", "TEXT NOT NULL DEFAULT ''")
            conn.execute(
                "INSERT INTO app_state(key, value) VALUES('schema_version', '4') "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
            )


def get_state(key: str, default: Optional[str] = None) -> Optional[str]:
    with _conn() as conn:
        row = conn.execute("SELECT value FROM app_state WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_state(key: str, value: str) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO app_state(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def _dict(row: Any) -> Optional[dict]:
    return dict(row) if row is not None else None


# ------------------------------------------------------------
# 文档与版本
# ------------------------------------------------------------

def create_document(
    title: str,
    source_name: str,
    source_format: str,
    source_path: Optional[str] = None,
    origin: str = "import",
) -> str:
    doc_id = _uid()
    now = _now()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO documents(id, title, source_name, source_format, source_path, origin, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (doc_id, title, source_name, source_format, source_path, origin, now, now),
        )
    return doc_id


def get_document(doc_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT d.*, v.version_no, v.status AS version_status, v.error AS version_error, "
            "v.parsed_at, v.content_hash, v.source_path AS version_source_path, "
            "(SELECT self_level FROM read_records r WHERE r.document_id = d.id) AS read_level "
            "FROM documents d LEFT JOIN document_versions v ON v.id = d.current_version_id "
            "WHERE d.id = ?",
            (doc_id,),
        ).fetchone()
    return _dict(row)


def list_document_summaries() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT d.id, d.title, d.source_name, d.source_format, d.origin, d.source_path, "
            "d.created_at, d.updated_at, v.version_no, v.status AS version_status, "
            "v.error AS version_error, "
            "(SELECT COUNT(*) FROM document_versions vv WHERE vv.document_id = d.id) AS version_count, "
            "(SELECT COUNT(*) FROM notes n WHERE n.document_id = d.id AND trim(n.content) <> '') AS has_note, "
            "(SELECT COUNT(*) FROM read_records r WHERE r.document_id = d.id) AS is_read, "
            "(SELECT self_level FROM read_records r WHERE r.document_id = d.id) AS read_level, "
            "(SELECT COUNT(*) FROM exercise_history eh WHERE eh.document_id = d.id) AS has_exercise, "
            "(SELECT COUNT(*) FROM annotations a WHERE a.document_id = d.id "
            " AND a.version_id = d.current_version_id) AS annotation_count "
            "FROM documents d LEFT JOIN document_versions v ON v.id = d.current_version_id "
            "ORDER BY d.updated_at DESC, d.title COLLATE NOCASE"
        ).fetchall()
    return [dict(r) for r in rows]


def find_document_by_source_path(path: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM documents WHERE source_path = ? ORDER BY updated_at DESC LIMIT 1",
            (path,),
        ).fetchone()
    return _dict(row)


def find_document_by_source_name(name: str, origin: Optional[str] = None) -> Optional[dict]:
    sql = "SELECT * FROM documents WHERE source_name = ?"
    params: list = [name]
    if origin:
        sql += " AND origin = ?"
        params.append(origin)
    sql += " ORDER BY updated_at DESC LIMIT 1"
    with _conn() as conn:
        row = conn.execute(sql, params).fetchone()
    return _dict(row)


def find_documents_by_hash(content_hash: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT d.*, v.content_hash, v.source_path AS version_source_path "
            "FROM documents d JOIN document_versions v ON v.document_id = d.id "
            "WHERE v.content_hash = ? ORDER BY d.updated_at DESC",
            (content_hash,),
        ).fetchall()
    return [dict(r) for r in rows]


def update_document_source(
    doc_id: str,
    source_path: Optional[str] = None,
    source_name: Optional[str] = None,
    legacy_rel: Optional[str] = None,
) -> None:
    fields = ["updated_at = ?"]
    params: list = [_now()]
    if source_path is not None:
        fields.append("source_path = ?")
        params.append(source_path)
    if source_name is not None:
        fields.append("source_name = ?")
        params.append(source_name)
    if legacy_rel is not None:
        fields.append("legacy_rel = ?")
        params.append(legacy_rel)
    params.append(doc_id)
    with _conn() as conn:
        conn.execute(f"UPDATE documents SET {', '.join(fields)} WHERE id = ?", params)


def create_version(
    doc_id: str,
    source_path: str,
    source_format: str,
    content_hash: str,
    status: str = "queued",
) -> str:
    version_id = _uid()
    now = _now()
    with _conn() as conn:
        row = conn.execute(
            "SELECT COALESCE(MAX(version_no), 0) AS n FROM document_versions WHERE document_id = ?",
            (doc_id,),
        ).fetchone()
        version_no = int(row["n"]) + 1
        conn.execute(
            "INSERT INTO document_versions(id, document_id, version_no, source_path, source_format, "
            "content_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (version_id, doc_id, version_no, source_path, source_format, content_hash, status, now),
        )
        conn.execute(
            "UPDATE documents SET source_format = ?, updated_at = ?, "
            "current_version_id = COALESCE(current_version_id, ?) WHERE id = ?",
            (source_format, now, version_id, doc_id),
        )
        if version_no > 1:
            conn.execute("DELETE FROM prereq_cache WHERE document_id = ?", (doc_id,))
    return version_id


def get_version(version_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM document_versions WHERE id = ?", (version_id,)
        ).fetchone()
    return _dict(row)


def latest_version(doc_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM document_versions WHERE document_id = ? "
            "ORDER BY version_no DESC LIMIT 1",
            (doc_id,),
        ).fetchone()
    return _dict(row)


def list_versions(doc_id: str) -> list[dict]:
    """按版本号倒序列出资料版本（旧版本保留用于核对引用）。"""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, version_no, status, source_format, created_at, parsed_at, error "
            "FROM document_versions WHERE document_id = ? ORDER BY version_no DESC",
            (doc_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def set_version_status(version_id: str, status: str, error: Optional[str] = None) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE document_versions SET status = ?, error = ?, "
            "parsed_at = CASE WHEN ? = 'ready' THEN ? ELSE parsed_at END "
            "WHERE id = ?",
            (status, error, status, _now(), version_id),
        )


def set_current_version(doc_id: str, version_id: str) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE documents SET current_version_id = ?, updated_at = ? WHERE id = ?",
            (version_id, _now(), doc_id),
        )


def update_version_source_path(version_id: str, source_path: str) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE document_versions SET source_path = ? WHERE id = ?",
            (source_path, version_id),
        )


def save_parsed(version_id: str, parsed: dict) -> None:
    """写入章节/内容块，并把该版本设为当前版本。"""
    version = get_version(version_id)
    if version is None:
        raise ValueError("版本不存在")
    doc_id = version["document_id"]
    now = _now()
    with _conn() as conn:
        conn.execute("DELETE FROM blocks WHERE version_id = ?", (version_id,))
        conn.execute("DELETE FROM chapters WHERE version_id = ?", (version_id,))
        conn.execute("DELETE FROM annotations WHERE version_id = ?", (version_id,))
        conn.execute(
            "DELETE FROM reading_positions WHERE document_id = ? AND version_id = ?",
            (doc_id, version_id),
        )
        chapter_ids: list[str] = []
        global_idx = 0
        for c_idx, chapter in enumerate(parsed.get("chapters") or []):
            chapter_id = _uid()
            chapter_ids.append(chapter_id)
            conn.execute(
                "INSERT INTO chapters(id, document_id, version_id, idx, title, anchor, source_locator) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    chapter_id,
                    doc_id,
                    version_id,
                    c_idx,
                    chapter.get("title") or f"第 {c_idx + 1} 节",
                    chapter.get("anchor") or "",
                    json.dumps(chapter.get("source_locator") or {}, ensure_ascii=False),
                ),
            )
            for block in chapter.get("blocks") or []:
                conn.execute(
                    "INSERT INTO blocks(id, document_id, version_id, chapter_id, idx, block_type, "
                    "text, markdown, level, lang, rows, source_locator, anchor) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        _uid(),
                        doc_id,
                        version_id,
                        chapter_id,
                        global_idx,
                        block.get("type") or "paragraph",
                        block.get("text") or "",
                        block.get("markdown") or "",
                        block.get("level"),
                        block.get("lang"),
                        json.dumps(block.get("rows") or [], ensure_ascii=False),
                        json.dumps(block.get("source_locator") or {}, ensure_ascii=False),
                        block.get("anchor") or "",
                    ),
                )
                global_idx += 1
        conn.execute(
            "UPDATE document_versions SET status = 'ready', error = NULL, parsed_at = ?, "
            "markdown = ? WHERE id = ?",
            (now, parsed.get("markdown") or "", version_id),
        )
        conn.execute(
            "UPDATE documents SET current_version_id = ?, title = COALESCE(NULLIF(?, ''), title), "
            "updated_at = ? WHERE id = ?",
            (version_id, parsed.get("title") or "", now, doc_id),
        )


def get_document_content(doc_id: str) -> Optional[dict]:
    doc = get_document(doc_id)
    if doc is None:
        return None
    version_id = doc.get("current_version_id")
    if not version_id:
        return {"document": doc, "version": None, "chapters": [], "blocks": []}
    with _conn() as conn:
        chapters = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM chapters WHERE version_id = ? ORDER BY idx", (version_id,)
            ).fetchall()
        ]
        blocks = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM blocks WHERE version_id = ? ORDER BY idx", (version_id,)
            ).fetchall()
        ]
    for c in chapters:
        try:
            c["source_locator"] = json.loads(c.get("source_locator") or "{}")
        except (TypeError, ValueError):
            c["source_locator"] = {}
    for b in blocks:
        try:
            b["rows"] = json.loads(b.get("rows") or "[]")
        except (TypeError, ValueError):
            b["rows"] = []
        try:
            b["source_locator"] = json.loads(b.get("source_locator") or "{}")
        except (TypeError, ValueError):
            b["source_locator"] = {}
    version = get_version(version_id)
    return {
        "document": doc,
        "version": version,
        "chapters": chapters,
        "blocks": blocks,
    }


def get_block(doc_id: str, block_id: str, version_id: Optional[str] = None) -> Optional[dict]:
    sql = "SELECT * FROM blocks WHERE id = ? AND document_id = ?"
    params: list = [block_id, doc_id]
    if version_id:
        sql += " AND version_id = ?"
        params.append(version_id)
    with _conn() as conn:
        row = conn.execute(sql, params).fetchone()
    return _dict(row)


def document_text(doc_id: str) -> str:
    content = get_document_content(doc_id)
    if not content or not content["blocks"]:
        return ""
    lines: list[str] = []
    for block in content["blocks"]:
        btype = block.get("block_type")
        text = (block.get("text") or "").strip()
        if not text:
            continue
        if btype == "heading":
            lines.append("#" * max(1, min(6, int(block.get("level") or 2))) + " " + text)
        elif btype == "table":
            for row in block.get("rows") or []:
                lines.append(" | ".join(str(cell) for cell in row))
        else:
            lines.append(text)
    return "\n\n".join(lines)


# ------------------------------------------------------------
# 导入任务
# ------------------------------------------------------------

def create_job(
    document_id: str,
    version_id: str,
    source_name: str,
    source_format: str,
    source_path: str,
    status: str = "queued",
) -> str:
    job_id = _uid()
    now = _now()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO import_jobs(id, document_id, version_id, source_name, source_format, "
            "source_path, status, progress, stage, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
            (
                job_id,
                document_id,
                version_id,
                source_name,
                source_format,
                source_path,
                status,
                "等待解析" if status == "queued" else "",
                now,
                now,
            ),
        )
    return job_id


def update_job(
    job_id: str,
    status: Optional[str] = None,
    progress: Optional[int] = None,
    stage: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    fields = ["updated_at = ?"]
    params: list = [_now()]
    if status is not None:
        fields.append("status = ?")
        params.append(status)
    if progress is not None:
        fields.append("progress = ?")
        params.append(max(0, min(100, int(progress))))
    if stage is not None:
        fields.append("stage = ?")
        params.append(stage)
    if error is not None:
        fields.append("error = ?")
        params.append(error)
    params.append(job_id)
    with _conn() as conn:
        conn.execute(f"UPDATE import_jobs SET {', '.join(fields)} WHERE id = ?", params)


def get_job(job_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM import_jobs WHERE id = ?", (job_id,)).fetchone()
    return _dict(row)


def list_jobs(active_only: bool = False) -> list[dict]:
    sql = "SELECT * FROM import_jobs"
    if active_only:
        sql += " WHERE status IN ('queued', 'parsing')"
    sql += " ORDER BY created_at DESC"
    with _conn() as conn:
        rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]


def reset_job_for_retry(job_id: str) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE import_jobs SET status = 'queued', progress = 0, stage = '等待重试', "
            "error = NULL, updated_at = ? WHERE id = ?",
            (_now(), job_id),
        )


def find_job_by_version(version_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM import_jobs WHERE version_id = ? ORDER BY created_at DESC LIMIT 1",
            (version_id,),
        ).fetchone()
    return _dict(row)


def pending_versions() -> list[dict]:
    """返回尚未解析完成的版本（含文档标题）。"""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT v.*, d.title AS document_title, d.origin "
            "FROM document_versions v JOIN documents d ON d.id = v.document_id "
            "WHERE v.status IN ('queued', 'parsing') ORDER BY v.created_at"
        ).fetchall()
    return [dict(r) for r in rows]


def recover_interrupted_jobs() -> int:
    """启动时把上次中断的解析任务恢复为可重试状态。"""
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE import_jobs SET status = 'queued', progress = 0, stage = '等待继续解析', "
            "updated_at = ? WHERE status = 'parsing'",
            (_now(),),
        )
        conn.execute(
            "UPDATE document_versions SET status = 'queued' WHERE status = 'parsing'"
        )
        return cur.rowcount


# ------------------------------------------------------------
# 笔记 / 对话 / 前置题
# ------------------------------------------------------------

def get_note(doc_id: str) -> dict:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM notes WHERE document_id = ?", (doc_id,)).fetchone()
    if row is None:
        return {"document_id": doc_id, "title": "", "content": "", "updated_at": ""}
    return dict(row)


def save_note(doc_id: str, content: str, title: Optional[str] = None) -> dict:
    now = _now()
    with _conn() as conn:
        current = conn.execute(
            "SELECT title FROM notes WHERE document_id = ?", (doc_id,)
        ).fetchone()
        final_title = title if title is not None else (current["title"] if current else "")
        conn.execute(
            "INSERT INTO notes(document_id, title, content, updated_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(document_id) DO UPDATE SET title = excluded.title, "
            "content = excluded.content, updated_at = excluded.updated_at",
            (doc_id, final_title or "", content, now),
        )
    return get_note(doc_id)


def list_note_doc_ids() -> list[str]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT document_id FROM notes WHERE trim(content) <> ''"
        ).fetchall()
    return [r["document_id"] for r in rows]


def get_chat(doc_id: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT role, content, quote, via, created_at FROM chat_messages "
            "WHERE document_id = ? ORDER BY created_at, id",
            (doc_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def append_chat(doc_id: str, role: str, content: str, quote: str = "", via: str = "chat") -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO chat_messages(id, document_id, role, content, quote, via, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (_uid(), doc_id, role, content, quote or "", via or "", _now()),
        )


def reset_chats(doc_id: Optional[str] = None) -> None:
    with _conn() as conn:
        if doc_id:
            conn.execute("DELETE FROM chat_messages WHERE document_id = ?", (doc_id,))
        else:
            conn.execute("DELETE FROM chat_messages")


def get_prereq(doc_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT payload FROM prereq_cache WHERE document_id = ?", (doc_id,)
        ).fetchone()
    if row is None:
        return None
    try:
        data = json.loads(row["payload"])
    except (TypeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def save_prereq(doc_id: str, payload: dict) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO prereq_cache(document_id, payload, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(document_id) DO UPDATE SET payload = excluded.payload, "
            "updated_at = excluded.updated_at",
            (doc_id, json.dumps(payload, ensure_ascii=False), _now()),
        )


# ------------------------------------------------------------
# 阅读进度 / 题目 / 提交
# ------------------------------------------------------------

def get_selected_document_id() -> Optional[str]:
    value = get_state("selected_document_id", "")
    return value or None


def set_selected_document_id(doc_id: Optional[str]) -> None:
    set_state("selected_document_id", doc_id or "")


def mark_read(doc_id: str, title: str) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO read_records(document_id, title, read_at, read_count) VALUES (?, ?, ?, 1) "
            "ON CONFLICT(document_id) DO UPDATE SET read_at = excluded.read_at, "
            "read_count = read_records.read_count + 1, title = excluded.title",
            (doc_id, title, _now()),
        )


def get_exercise(doc_id: str) -> dict:
    with _conn() as conn:
        row = conn.execute(
            "SELECT question, difficulty, generated_at FROM exercise_state WHERE document_id = ?",
            (doc_id,),
        ).fetchone()
    if row is None:
        return {"question": "", "generated_at": "", "difficulty": ""}
    return dict(row)


def save_exercise(doc_id: str, question: str, difficulty: str) -> None:
    if not (question or "").strip():
        with _conn() as conn:
            conn.execute("DELETE FROM exercise_state WHERE document_id = ?", (doc_id,))
        return
    with _conn() as conn:
        conn.execute(
            "INSERT INTO exercise_state(document_id, question, difficulty, generated_at) "
            "VALUES (?, ?, ?, ?) ON CONFLICT(document_id) DO UPDATE SET "
            "question = excluded.question, difficulty = excluded.difficulty, "
            "generated_at = excluded.generated_at",
            (doc_id, question, difficulty or "", _now()),
        )


def get_exercise_history(doc_id: str) -> list[str]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT summary FROM exercise_history WHERE document_id = ? ORDER BY idx",
            (doc_id,),
        ).fetchall()
    return [r["summary"] for r in rows]


def append_exercise_history(doc_id: str, question: str, max_items: int = 12) -> None:
    summary = (question or "").strip()[:300]
    if not summary:
        return
    with _conn() as conn:
        rows = conn.execute(
            "SELECT idx, summary FROM exercise_history WHERE document_id = ? ORDER BY idx",
            (doc_id,),
        ).fetchall()
        items = [r["summary"] for r in rows] + [summary]
        items = items[-max_items:]
        conn.execute("DELETE FROM exercise_history WHERE document_id = ?", (doc_id,))
        for idx, item in enumerate(items):
            conn.execute(
                "INSERT INTO exercise_history(document_id, idx, summary, created_at) "
                "VALUES (?, ?, ?, ?)",
                (doc_id, idx, item, _now()),
            )


def get_last_submission(doc_id: str) -> dict:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM last_submissions WHERE document_id = ?", (doc_id,)
        ).fetchone()
    if row is None:
        return {
            "rel": "",
            "title": "",
            "question": "",
            "code": "",
            "review": "",
            "submitted_at": "",
        }
    data = dict(row)
    return {
        "rel": doc_id,
        "title": data.get("title") or "",
        "question": data.get("question") or "",
        "code": data.get("answer") or "",
        "review": data.get("review") or "",
        "submitted_at": data.get("submitted_at") or "",
    }


def save_last_submission(
    doc_id: str, title: str, question: str, answer: str, review: str
) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO last_submissions(document_id, title, question, answer, review, submitted_at) "
            "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(document_id) DO UPDATE SET "
            "title = excluded.title, question = excluded.question, answer = excluded.answer, "
            "review = excluded.review, submitted_at = excluded.submitted_at",
            (doc_id, title, question, answer, review, _now()),
        )


# ------------------------------------------------------------
# 标注与阅读位置
# ------------------------------------------------------------

def list_annotations(doc_id: str, version_id: Optional[str] = None) -> list[dict]:
    sql = "SELECT * FROM annotations WHERE document_id = ?"
    params: list = [doc_id]
    if version_id:
        sql += " AND version_id = ?"
        params.append(version_id)
    sql += " ORDER BY created_at"
    with _conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def create_annotation(
    doc_id: str,
    version_id: str,
    block_id: str,
    start_offset: int,
    end_offset: int,
    quote: str,
    note: str = "",
    color: str = "amber",
) -> dict:
    block = get_block(doc_id, block_id, version_id)
    if block is None:
        raise ValueError("内容块不存在")
    if end_offset <= start_offset:
        raise ValueError("标注范围无效")
    annotation_id = _uid()
    now = _now()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO annotations(id, document_id, version_id, block_id, start_offset, end_offset, "
            "quote, note, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                annotation_id,
                doc_id,
                version_id,
                block_id,
                int(start_offset),
                int(end_offset),
                quote,
                note or "",
                color or "amber",
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM annotations WHERE id = ?", (annotation_id,)).fetchone()
    return dict(row)


def update_annotation(annotation_id: str, note: Optional[str] = None, color: Optional[str] = None) -> Optional[dict]:
    fields = ["updated_at = ?"]
    params: list = [_now()]
    if note is not None:
        fields.append("note = ?")
        params.append(note)
    if color is not None:
        fields.append("color = ?")
        params.append(color)
    params.append(annotation_id)
    with _conn() as conn:
        conn.execute(f"UPDATE annotations SET {', '.join(fields)} WHERE id = ?", params)
        row = conn.execute("SELECT * FROM annotations WHERE id = ?", (annotation_id,)).fetchone()
    return _dict(row)


def delete_annotation(annotation_id: str) -> bool:
    with _conn() as conn:
        cur = conn.execute("DELETE FROM annotations WHERE id = ?", (annotation_id,))
        return cur.rowcount > 0


def get_position(doc_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM reading_positions WHERE document_id = ?", (doc_id,)
        ).fetchone()
    return _dict(row)


def save_position(
    doc_id: str,
    version_id: str,
    block_id: str,
    block_offset: float,
    scroll_ratio: float,
) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO reading_positions(document_id, version_id, block_id, block_offset, "
            "scroll_ratio, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(document_id) DO UPDATE SET version_id = excluded.version_id, "
            "block_id = excluded.block_id, block_offset = excluded.block_offset, "
            "scroll_ratio = excluded.scroll_ratio, updated_at = excluded.updated_at",
            (doc_id, version_id, block_id, float(block_offset), float(scroll_ratio), _now()),
        )


# ------------------------------------------------------------
# 汇总 / 重置
# ------------------------------------------------------------

READ_LEVELS = ("理解", "模糊", "不会")


def set_read_level(doc_id: str, level: str) -> None:
    """保存阅读后的理解自评（理解 / 模糊 / 不会，空串表示未评）。"""
    doc = get_document(doc_id)
    if doc is None:
        raise ValueError("资料不存在")
    level = level if level in READ_LEVELS else ""
    with _conn() as conn:
        conn.execute(
            "INSERT INTO read_records(document_id, title, read_at, read_count, self_level) "
            "VALUES (?, ?, ?, 0, ?) ON CONFLICT(document_id) DO UPDATE SET "
            "self_level = excluded.self_level",
            (doc_id, doc.get("title") or "", _now(), level),
        )


def save_understanding(
    doc_id: str,
    version_id: str,
    block_id: str,
    quote: str,
    question: str,
    answer: str,
    feedback: str,
    verdict: str,
) -> str:
    check_id = _uid()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO understanding_checks(id, document_id, version_id, block_id, quote, "
            "question, answer, feedback, verdict, self_level, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)",
            (
                check_id,
                doc_id,
                version_id,
                block_id,
                quote,
                question,
                answer,
                feedback,
                verdict,
                _now(),
            ),
        )
    return check_id


def set_understanding_self_level(check_id: str, level: str) -> Optional[dict]:
    level = level if level in READ_LEVELS else ""
    with _conn() as conn:
        conn.execute(
            "UPDATE understanding_checks SET self_level = ? WHERE id = ?",
            (level, check_id),
        )
        row = conn.execute(
            "SELECT * FROM understanding_checks WHERE id = ?", (check_id,)
        ).fetchone()
    return _dict(row)


def list_understanding(doc_id: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM understanding_checks WHERE document_id = ? ORDER BY created_at DESC",
            (doc_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def add_exercise_evidence(
    doc_id: str,
    version_id: str,
    question: str,
    answer: str,
    review: str,
) -> str:
    evidence_id = _uid()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO exercise_evidence(id, document_id, version_id, question, answer, "
            "review, self_level, created_at) VALUES (?, ?, ?, ?, ?, ?, '', ?)",
            (evidence_id, doc_id, version_id, question, answer, review, _now()),
        )
    return evidence_id


def set_exercise_self_level(evidence_id: str, level: str) -> Optional[dict]:
    level = level if level in READ_LEVELS else ""
    with _conn() as conn:
        conn.execute(
            "UPDATE exercise_evidence SET self_level = ? WHERE id = ?",
            (level, evidence_id),
        )
        row = conn.execute(
            "SELECT * FROM exercise_evidence WHERE id = ?", (evidence_id,)
        ).fetchone()
    return _dict(row)


def list_exercise_evidence(doc_id: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM exercise_evidence WHERE document_id = ? ORDER BY created_at DESC",
            (doc_id,),
        ).fetchall()
    return [dict(r) for r in rows]



def overview() -> dict:
    with _conn() as conn:
        document_count = conn.execute("SELECT COUNT(*) AS n FROM documents").fetchone()["n"]
        read_count = conn.execute("SELECT COUNT(*) AS n FROM read_records").fetchone()["n"]
        note_count = conn.execute(
            "SELECT COUNT(*) AS n FROM notes WHERE trim(content) <> ''"
        ).fetchone()["n"]
        exercise_count = conn.execute(
            "SELECT COUNT(DISTINCT document_id) AS n FROM exercise_history"
        ).fetchone()["n"]
        understanding_count = conn.execute(
            "SELECT COUNT(*) AS n FROM understanding_checks"
        ).fetchone()["n"]
        practice_count = conn.execute(
            "SELECT COUNT(*) AS n FROM exercise_evidence"
        ).fetchone()["n"]
    return {
        "document_count": document_count,
        "read_count": read_count,
        "note_count": note_count,
        "exercise_count": exercise_count,
        "understanding_count": understanding_count,
        "practice_count": practice_count,
    }


def reset_learning() -> None:
    with _conn() as conn:
        for table in (
            "notes",
            "chat_messages",
            "read_records",
            "exercise_state",
            "exercise_history",
            "last_submissions",
            "prereq_cache",
            "annotations",
            "reading_positions",
            "understanding_checks",
            "exercise_evidence",
        ):
            conn.execute(f"DELETE FROM {table}")
        conn.execute("DELETE FROM app_state WHERE key = 'selected_document_id'")


def delete_document(doc_id: str) -> None:
    """只删除数据库记录，不删除原始文件。"""
    with _conn() as conn:
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))



def versions_missing_markdown() -> list[dict]:
    """旧版本升级后，返回还没有 Markdown 预览的已解析版本。"""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM document_versions WHERE status = 'ready' AND markdown IS NULL"
        ).fetchall()
    return [dict(r) for r in rows]


def get_version_content(version_id: str) -> dict:
    """按版本读取章节与内容块，供 Markdown 归一化迁移使用。"""
    with _conn() as conn:
        chapters = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM chapters WHERE version_id = ? ORDER BY idx", (version_id,)
            ).fetchall()
        ]
        blocks = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM blocks WHERE version_id = ? ORDER BY idx", (version_id,)
            ).fetchall()
        ]
    for c in chapters:
        try:
            c["source_locator"] = json.loads(c.get("source_locator") or "{}")
        except (TypeError, ValueError):
            c["source_locator"] = {}
    for b in blocks:
        try:
            b["rows"] = json.loads(b.get("rows") or "[]")
        except (TypeError, ValueError):
            b["rows"] = []
        try:
            b["source_locator"] = json.loads(b.get("source_locator") or "{}")
        except (TypeError, ValueError):
            b["source_locator"] = {}
    return {"chapters": chapters, "blocks": blocks}


def set_version_markdown(version_id: str, markdown: str, block_markdowns: list[tuple[str, str]]) -> None:
    with _conn() as conn:
        conn.executemany(
            "UPDATE blocks SET markdown = ? WHERE id = ? AND version_id = ?",
            [(md or "", block_id, version_id) for block_id, md in block_markdowns],
        )
        conn.execute(
            "UPDATE document_versions SET markdown = ? WHERE id = ?",
            (markdown or "", version_id),
        )


def legacy_document_map() -> dict[str, str]:
    """返回 legacy_rel -> document_id。"""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT legacy_rel, id FROM documents WHERE legacy_rel IS NOT NULL AND legacy_rel <> ''"
        ).fetchall()
    return {r["legacy_rel"]: r["id"] for r in rows}
