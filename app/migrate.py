"""第一阶段 JSON 学习数据 → 第二阶段 SQLite 的迁移与备份。

迁移前会把 db/*.json 复制到 db/backups/phase2-<时间>/。
JSON 文件保留不删，作为额外保险；应用之后只读写 SQLite。
"""

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from . import config, converters, imports, parsers, store

LEGACY_FILES = (
    "progress.json",
    "chapter_notes.json",
    "chapter_chats.json",
    "prereq.json",
    "profile.json",
    "memory.json",
    "api_config.json",
)


def _load_json(path: Path) -> Any:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def backup_legacy_json() -> Optional[Path]:
    data_dir = config.APP_DIR / "db"
    existing = [data_dir / name for name in LEGACY_FILES if (data_dir / name).exists()]
    if not existing:
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = config.BACKUP_DIR / f"phase2-{stamp}"
    target.mkdir(parents=True, exist_ok=True)
    for path in existing:
        try:
            shutil.copy2(path, target / path.name)
        except OSError:
            continue
    return target


def migrate_if_needed() -> dict:
    """只在首次运行时迁移；返回迁移摘要。"""
    store.init_db()
    if store.get_state("legacy_migrated") == "1":
        return {"migrated": False, "reason": "already_migrated"}

    backup = backup_legacy_json()

    # 先登记 library/ 中的旧文件，才能把 rel 映射到稳定 doc_id
    imports.register_library_documents()
    mapping = store.legacy_document_map()
    data_dir = config.APP_DIR / "db"

    progress = _load_json(data_dir / "progress.json")
    notes = _load_json(data_dir / "chapter_notes.json")
    chats = _load_json(data_dir / "chapter_chats.json")
    prereq = _load_json(data_dir / "prereq.json")
    profile = _load_json(data_dir / "profile.json")

    counts = {"notes": 0, "chats": 0, "prereq": 0, "skipped": 0}

    selected = (progress.get("selected_source") or {}).get("rel") if isinstance(progress, dict) else None
    if selected and selected in mapping:
        store.set_selected_document_id(mapping[selected])

    read_rels = progress.get("read_rels") if isinstance(progress, dict) else {}
    if isinstance(read_rels, dict):
        for rel, item in read_rels.items():
            doc_id = mapping.get(rel)
            if not doc_id:
                counts["skipped"] += 1
                continue
            title = item.get("title") if isinstance(item, dict) else rel
            store.mark_read(doc_id, title or rel)

    exercise = progress.get("exercise") if isinstance(progress, dict) else {}
    if isinstance(exercise, dict) and exercise.get("question"):
        doc_id = mapping.get(exercise.get("rel") or "")
        if doc_id:
            store.save_exercise(doc_id, exercise.get("question") or "", exercise.get("difficulty") or "")

    history = progress.get("exercise_history") if isinstance(progress, dict) else {}
    if isinstance(history, dict):
        for rel, items in history.items():
            doc_id = mapping.get(rel)
            if not doc_id or not isinstance(items, list):
                continue
            for question in items:
                store.append_exercise_history(doc_id, str(question))

    last = progress.get("last_submission") if isinstance(progress, dict) else {}
    if isinstance(last, dict) and (last.get("review") or last.get("question")):
        doc_id = mapping.get(last.get("rel") or "")
        if doc_id:
            store.save_last_submission(
                doc_id,
                last.get("title") or "",
                last.get("question") or "",
                last.get("code") or "",
                last.get("review") or "",
            )

    if isinstance(notes, dict):
        for rel, item in notes.items():
            doc_id = mapping.get(rel)
            if not doc_id or not isinstance(item, dict):
                counts["skipped"] += 1
                continue
            content = item.get("content") or ""
            if not content.strip():
                continue
            store.save_note(doc_id, content, item.get("title") or "")
            counts["notes"] += 1

    if isinstance(chats, dict):
        for rel, item in chats.items():
            doc_id = mapping.get(rel)
            if not doc_id or not isinstance(item, dict):
                counts["skipped"] += 1
                continue
            messages = item.get("messages") or []
            if not isinstance(messages, list):
                continue
            for message in messages:
                if not isinstance(message, dict):
                    continue
                role = message.get("role")
                if role not in ("user", "assistant"):
                    continue
                store.append_chat(
                    doc_id,
                    role,
                    message.get("content") or "",
                    quote=message.get("quote") or "",
                    via=message.get("via") or "chat",
                )
                counts["chats"] += 1

    if isinstance(prereq, dict):
        for rel, payload in prereq.items():
            doc_id = mapping.get(rel)
            if not doc_id or not isinstance(payload, dict):
                counts["skipped"] += 1
                continue
            store.save_prereq(doc_id, payload)
            counts["prereq"] += 1

    # Phase 1 之前的 profile.json 也可能含按章前置题缓存
    course_prereq = profile.get("course_prereq") if isinstance(profile, dict) else None
    if isinstance(course_prereq, dict):
        for rel, payload in course_prereq.items():
            doc_id = mapping.get(rel)
            if doc_id and isinstance(payload, dict) and store.get_prereq(doc_id) is None:
                store.save_prereq(doc_id, payload)
                counts["prereq"] += 1

    store.set_state("legacy_migrated", "1")
    if backup is not None:
        store.set_state("legacy_migration_backup", str(backup))
    return {
        "migrated": True,
        "backup": str(backup) if backup else "",
        "documents_mapped": len(mapping),
        **counts,
    }

def ensure_render_paths() -> dict:
    """为已有 PDF/DOCX/PPTX 当前版本补齐 PDF 播放文件，不切换版本。"""
    updated = 0
    failed: list[str] = []
    for version in store.list_current_versions():
        fmt = (version.get("source_format") or "").lower()
        if fmt not in ("pdf", "docx", "pptx"):
            continue
        title = version.get("document_title") or version.get("document_id") or "未命名"
        source = Path(version.get("source_path") or "")
        if fmt == "pdf":
            if source.is_file():
                if version.get("rendered_path") != str(source):
                    store.set_version_render(version["id"], source)
                    updated += 1
            else:
                failed.append(f"{title}：原 PDF 不存在")
            continue

        rendered = Path(version.get("rendered_path") or "")
        if rendered.is_file():
            continue
        if not source.is_file():
            failed.append(f"{title}：原文件不存在，无法生成播放 PDF")
            continue
        try:
            target = (
                config.ORIGINALS_DIR
                / version["document_id"]
                / "rendered"
                / f"{version['id']}.pdf"
            )
            converters.convert_to_pdf(source, target)
            store.set_version_render(version["id"], target)
            updated += 1
        except Exception as exc:
            failed.append(f"{title}：{exc}")
    return {"updated": updated, "failed": failed}


def normalize_markdown() -> int:
    """给旧版本已解析的内容块补上 Markdown 预览字段，不重新解析、不丢标注。"""
    versions = store.versions_missing_markdown()
    normalized = 0
    for version in versions:
        content = store.get_version_content(version["id"])
        blocks = content.get("blocks") or []
        if not blocks:
            continue
        chapter_map: dict[str, dict] = {}
        parsed_chapters: list[dict] = []
        for chapter in content.get("chapters") or []:
            item = {
                "title": chapter.get("title") or "",
                "anchor": chapter.get("anchor") or "",
                "source_locator": chapter.get("source_locator") or {},
                "blocks": [],
            }
            chapter_map[chapter["id"]] = item
            parsed_chapters.append(item)
        for block in blocks:
            chapter = chapter_map.get(block.get("chapter_id"))
            if chapter is None:
                continue
            chapter["blocks"].append(
                {
                    "id": block["id"],
                    "type": block.get("block_type") or "paragraph",
                    "text": block.get("text") or "",
                    "level": block.get("level"),
                    "lang": block.get("lang"),
                    "rows": block.get("rows") or [],
                    "anchor": block.get("anchor") or "",
                    "source_locator": block.get("source_locator") or {},
                }
            )
        parsed = {"title": "", "chapters": parsed_chapters}
        parsers.attach_markdown(parsed, version.get("source_format") or "")
        block_markdowns = [
            (block["id"], block.get("markdown") or "")
            for chapter in parsed_chapters
            for block in chapter["blocks"]
        ]
        store.set_version_markdown(version["id"], parsed.get("markdown") or "", block_markdowns)
        normalized += 1
    return normalized

