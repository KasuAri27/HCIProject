"""资料导入、资料库扫描与后台解析任务。

原文件保留在 db/originals/<document_id>/ 下；library/ 中已有的文件
保留在原位。后台线程解析并写入统一文档结构，前端轮询任务进度。
"""

import hashlib
import re
import threading
import uuid
from pathlib import Path
from typing import Optional

from . import config, converters, parsers, source, store

ALLOWED_FORMATS = {
    ".md": "md",
    ".markdown": "md",
    ".txt": "txt",
    ".docx": "docx",
    ".pptx": "pptx",
    ".pdf": "pdf",
}

_active_lock = threading.Lock()
_active_jobs: set[str] = set()


def _now_name(name: str) -> str:
    safe = Path(name or "upload").name
    safe = re.sub(r'[\x00-\x1f<>:"/\\|?*]', "_", safe).strip().strip(".")
    if not safe:
        safe = "upload"
    if len(safe) > 120:
        suffix = Path(safe).suffix[:12]
        safe = safe[: 120 - len(suffix)] + suffix
    return safe


def format_for_name(name: str) -> Optional[str]:
    return ALLOWED_FORMATS.get(Path(name or "").suffix.lower())


def title_for_name(name: str) -> str:
    stem = Path(name or "").stem.strip()
    return stem or "未命名资料"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_original(doc_id: str, filename: str, data: bytes) -> Path:
    folder = config.ORIGINALS_DIR / doc_id
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{uuid.uuid4().hex[:10]}_{_now_name(filename)}"
    tmp = target.with_suffix(target.suffix + ".tmp")
    with tmp.open("wb") as fh:
        fh.write(data)
    tmp.replace(target)
    return target


# ------------------------------------------------------------
# 上传导入
# ------------------------------------------------------------

def import_upload(file_storage) -> dict:
    """保存上传文件并启动后台解析。返回任务信息。"""
    store.init_db()
    original_name = _now_name(getattr(file_storage, "filename", "") or "upload")
    fmt = format_for_name(original_name)
    if fmt is None:
        raise ValueError("只支持 Markdown、TXT、DOCX、PPTX 和 PDF")

    data = file_storage.read()
    if not data:
        raise ValueError("文件为空")
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise ValueError(f"文件超过 {config.MAX_UPLOAD_MB} MB 限制")

    digest = _sha256(data)
    duplicates = store.find_documents_by_hash(digest)
    if duplicates:
        doc = duplicates[0]
        return {
            "duplicate": True,
            "document_id": doc["id"],
            "version_id": None,
            "job_id": None,
            "title": doc["title"],
        }

    doc = store.find_document_by_source_name(original_name, origin="import")
    if doc is None:
        doc_id = store.create_document(
            title_for_name(original_name),
            original_name,
            fmt,
            origin="import",
        )
    else:
        doc_id = doc["id"]

    try:
        stored = _write_original(doc_id, original_name, data)
        version_id = store.create_version(
            doc_id, str(stored.resolve()), fmt, digest, status="queued"
        )
        store.update_document_source(
            doc_id,
            source_path=str(stored.resolve()),
            source_name=original_name,
        )
        job_id = store.create_job(
            doc_id,
            version_id,
            original_name,
            fmt,
            str(stored.resolve()),
            status="queued",
        )
    except OSError as exc:
        raise ValueError(f"保存原文件失败：{exc}") from exc

    start_job(job_id)
    return {
        "duplicate": False,
        "document_id": doc_id,
        "version_id": version_id,
        "job_id": job_id,
        "title": title_for_name(original_name),
    }


# ------------------------------------------------------------
# 资料库扫描
# ------------------------------------------------------------

def _ensure_library_doc(path: Path, digest: str, current_paths: set[str]) -> Optional[dict]:
    resolved = str(path.resolve())
    rel = source.library_rel(path)
    name = path.name
    fmt = format_for_name(name)
    if fmt is None:
        return None

    doc = store.find_document_by_source_path(resolved)
    if doc:
        latest = store.latest_version(doc["id"])
        if latest and latest.get("content_hash") == digest:
            store.update_document_source(doc["id"], resolved, name, rel)
            if latest.get("status") in ("queued", "parsing"):
                return {
                    "document_id": doc["id"],
                    "version_id": latest["id"],
                    "source_name": name,
                    "source_format": fmt,
                    "source_path": resolved,
                    "needs_job": latest.get("status") == "queued",
                }
            return None
        version_id = store.create_version(
            doc["id"], resolved, fmt, digest, status="queued"
        )
        store.update_document_source(doc["id"], resolved, name, rel)
        return {
            "document_id": doc["id"],
            "version_id": version_id,
            "source_name": name,
            "source_format": fmt,
            "source_path": resolved,
            "needs_job": True,
        }

    # 改名/移动：同内容、旧路径已不在资料库中的 library 文档
    for candidate in store.find_documents_by_hash(digest):
        old_path = candidate.get("source_path") or ""
        if candidate.get("origin") != "library" or old_path in current_paths:
            continue
        store.update_document_source(candidate["id"], resolved, name, rel)
        latest = store.latest_version(candidate["id"])
        if latest:
            store.update_version_source_path(latest["id"], resolved)
        return None

    doc_id = store.create_document(
        title_for_name(name),
        name,
        fmt,
        source_path=resolved,
        origin="library",
    )
    store.update_document_source(doc_id, resolved, name, rel)
    version_id = store.create_version(doc_id, resolved, fmt, digest, status="queued")
    return {
        "document_id": doc_id,
        "version_id": version_id,
        "source_name": name,
        "source_format": fmt,
        "source_path": resolved,
        "needs_job": True,
    }


def register_library_documents() -> list[dict]:
    """把 library/ 中的新文件/改动登记为文档和版本（不启动解析）。"""
    store.init_db()
    source.ensure_library()
    files = source.iter_library_files()
    current_paths = {str(p.resolve()) for p in files}
    entries: list[dict] = []
    for path in files:
        try:
            digest = _sha256_file(path)
            entry = _ensure_library_doc(path, digest, current_paths)
            if entry:
                entries.append(entry)
        except OSError:
            continue
    return entries


def _job_for_entry(entry: dict) -> str:
    existing = store.find_job_by_version(entry["version_id"])
    if existing and existing.get("status") in ("queued", "parsing"):
        return existing["id"]
    if existing and existing.get("status") == "failed":
        return existing["id"]
    return store.create_job(
        entry["document_id"],
        entry["version_id"],
        entry.get("source_name") or "",
        entry.get("source_format") or "",
        entry.get("source_path") or "",
        status="queued",
    )


def resume_pending(background: bool = True) -> list[str]:
    """为尚未完成的版本补建任务，并在后台启动。"""
    started: list[str] = []
    for version in store.pending_versions():
        job = store.find_job_by_version(version["id"])
        if job is None:
            job_id = store.create_job(
                version["document_id"],
                version["id"],
                Path(version.get("source_path") or "").name,
                version.get("source_format") or "",
                version.get("source_path") or "",
                status="queued",
            )
        else:
            job_id = job["id"]
            if job.get("status") == "failed":
                continue
        if background:
            start_job(job_id)
        started.append(job_id)
    return started


def scan_library(background: bool = True) -> dict:
    """扫描资料库并启动解析任务。"""
    entries = register_library_documents()
    jobs: list[dict] = []
    for entry in entries:
        if not entry.get("needs_job"):
            continue
        job_id = _job_for_entry(entry)
        job = store.get_job(job_id)
        if job and job.get("status") in ("queued", "parsing"):
            if background:
                start_job(job_id)
            jobs.append(job)
    jobs.extend(
        store.get_job(job_id)
        for job_id in resume_pending(background)
        if store.get_job(job_id)
    )
    return {
        "jobs": [j for j in jobs if j],
        "registered": len(entries),
        "document_count": len(store.list_document_summaries()),
    }


# ------------------------------------------------------------
# 后台任务
# ------------------------------------------------------------

def start_job(job_id: str) -> None:
    with _active_lock:
        if job_id in _active_jobs:
            return
        _active_jobs.add(job_id)

    def runner():
        try:
            process_job(job_id)
        finally:
            with _active_lock:
                _active_jobs.discard(job_id)

    threading.Thread(target=runner, daemon=True, name=f"import-{job_id[:8]}").start()


def process_job(job_id: str) -> None:
    job = store.get_job(job_id)
    if job is None:
        return
    if job.get("status") == "ready":
        return
    version_id = job.get("version_id")
    if not version_id:
        store.update_job(job_id, status="failed", stage="解析失败", error="任务缺少版本", progress=100)
        return

    store.update_job(job_id, status="parsing", progress=8, stage="读取文件")
    store.set_version_status(version_id, "parsing")
    source_path = job.get("source_path") or ""
    try:
        path = Path(source_path)
        if not path.is_file():
            raise parsers.ParseError("原文件不存在")
        store.update_job(job_id, progress=25, stage="解析内容")
        doc_id = job.get("document_id") or ""
        parsed = parsers.parse_document(
            path,
            job.get("source_format") or path.suffix.lstrip("."),
            title_for_name(job.get("source_name") or path.name),
            asset_dir=(config.ORIGINALS_DIR / doc_id / "assets") if doc_id else None,
            asset_url_prefix=f"/api/documents/{doc_id}/assets/" if doc_id else "",
        )
        fmt = (job.get("source_format") or path.suffix.lstrip(".")).lower()
        render_path = None
        if fmt in ("docx", "pptx"):
            store.update_job(job_id, progress=55, stage="生成 PDF 播放文件")
            render_path = converters.convert_to_pdf(
                path,
                config.ORIGINALS_DIR / doc_id / "rendered" / f"{version_id}.pdf",
            )
        elif fmt == "pdf":
            render_path = path.resolve()
        store.update_job(job_id, progress=68, stage="建立章节与内容块")
        store.set_version_render(version_id, render_path)
        store.save_parsed(version_id, parsed)
        store.update_job(job_id, status="ready", progress=100, stage="完成", error=None)
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        store.set_version_status(version_id, "failed", message[:800])
        store.update_job(
            job_id,
            status="failed",
            progress=100,
            stage="解析失败",
            error=message[:800],
        )


def retry_job(job_id: str) -> Optional[dict]:
    job = store.get_job(job_id)
    if job is None:
        return None
    if job.get("status") in ("queued", "parsing"):
        return job
    if job.get("version_id"):
        store.set_version_status(job["version_id"], "queued")
    store.reset_job_for_retry(job_id)
    start_job(job_id)
    return store.get_job(job_id)
