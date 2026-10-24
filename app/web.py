"""Flask 学习应用后端。

文档、版本、章节、内容块、标注、阅读位置和全部学习记录都在 SQLite；
导入与解析在后台任务中执行，前端轮询进度。PDF/DOCX/PPTX 以 PDF 版面
播放，Markdown/TXT 渲染正文。
"""

import json
import threading
from pathlib import Path

from flask import Flask, abort, jsonify, render_template, request, send_file, send_from_directory

from . import (
    api_config,
    chapter_chat,
    config,
    explainer,
    imports,
    llm,
    migrate,
    notes,
    prereq,
    progress,
    render,
    search,
    source,
    store,
    tutor,
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = config.MAX_UPLOAD_MB * 1024 * 1024

_db_lock = threading.Lock()
_db_ready_path = ""


def _ensure_db() -> None:
    global _db_ready_path
    path = str(store.DB_PATH)
    if _db_ready_path == path:
        return
    with _db_lock:
        if _db_ready_path != path:
            store.init_db()
            _db_ready_path = path


@app.before_request
def _before_request():
    _ensure_db()


# ------------------------------------------------------------
# 页面与静态资源
# ------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/user")
def page_user():
    return render_template("user.html", active_page="user")


@app.route("/api-config")
def page_api_config():
    return render_template("api_config.html", active_page="api")


@app.route("/settings")
def page_settings():
    return render_template("settings.html", active_page="settings")


@app.route("/library-assets/<path:filename>")
def library_assets(filename: str):
    path = source.resolve_asset(filename)
    if path is None:
        abort(404)
    return send_file(path, conditional=True)


@app.errorhandler(413)
def _too_large(_error):
    return jsonify({"error": f"文件超过 {config.MAX_UPLOAD_MB} MB 限制"}), 413


# ------------------------------------------------------------
# 辅助
# ------------------------------------------------------------

def _llm_error(exc: Exception) -> tuple:
    return jsonify({"error": str(exc)}), 502


def _brief(doc: dict | None) -> dict | None:
    if not doc:
        return None
    return {
        "id": doc.get("id"),
        "title": doc.get("title") or "",
        "source_name": doc.get("source_name") or "",
        "source_format": doc.get("source_format") or "",
        "origin": doc.get("origin") or "",
        "source_path": doc.get("source_path") or "",
        "version_no": doc.get("version_no"),
        "version_status": doc.get("version_status") or "",
        "version_error": doc.get("version_error") or "",
        "read_level": doc.get("read_level") or "",
        "updated_at": doc.get("updated_at") or "",
    }


def _library_payload() -> dict:
    documents = store.list_document_summaries()
    latest_jobs: dict[str, dict] = {}
    for job in store.list_jobs(active_only=False):
        latest_jobs.setdefault(job.get("document_id") or "", job)
    for doc in documents:
        doc["job"] = latest_jobs.get(doc["id"])
    status = source.library_status()
    warnings = [
        w
        for w in status.get("warnings", [])
        if not (documents and "资料库为空" in w)
    ]
    return {
        "documents": documents,
        "overview": store.overview(),
        "library": {
            "path": status.get("path") or "",
            "exists": status.get("exists", False),
            "writable": status.get("writable", False),
            "warnings": warnings,
        },
        "jobs": store.list_jobs(active_only=True),
    }


def _session_payload() -> dict:
    doc_id = store.get_selected_document_id()
    doc = store.get_document(doc_id) if doc_id else None
    if doc_id and doc is None:
        store.set_selected_document_id(None)
        doc_id = None
    selected = _brief(doc)
    exercise = (
        progress.get_exercise(doc_id)
        if doc_id
        else {"question": "", "generated_at": "", "difficulty": ""}
    )
    last = (
        progress.get_last_submission(doc_id)
        if doc_id
        else {
            "rel": "",
            "title": "",
            "question": "",
            "code": "",
            "review": "",
            "submitted_at": "",
        }
    )
    return {
        "selected_document": selected,
        "exercise": exercise,
        "last_submission": last,
        "overview": store.overview(),
        "llm_configured": api_config.is_configured(),
        "active_jobs": store.list_jobs(active_only=True),
        "library": source.library_status(),
    }


def _asset_dir(doc: dict) -> str:
    raw = doc.get("source_path") or ""
    if not raw:
        return ""
    try:
        rel = Path(raw).resolve().relative_to(source.LIBRARY_DIR.resolve())
    except (OSError, ValueError):
        return ""
    parent = rel.parent.as_posix()
    return "" if parent == "." else parent


def _playable_pdf(version: dict | None) -> Path | None:
    """返回当前版本可播放的 PDF：PDF 用原文件，DOCX/PPTX 用转换产物。"""
    if not version:
        return None
    fmt = (version.get("source_format") or "").lower()
    if fmt == "pdf":
        path = Path(version.get("source_path") or "")
    elif fmt in ("docx", "pptx"):
        path = Path(version.get("rendered_path") or "")
    else:
        return None
    return path if path.is_file() else None


def _annotations_with_locators(doc_id: str, version_id: str, blocks: list[dict]) -> list[dict]:
    locators = {b.get("id"): b.get("locator_label") or "" for b in blocks}
    rows = store.list_annotations(doc_id, version_id)
    for row in rows:
        row["locator_label"] = locators.get(row.get("block_id"), "")
    return rows


# ------------------------------------------------------------
# 会话 / 资料库 / 导入
# ------------------------------------------------------------

@app.route("/api/health")
def api_health():
    return jsonify({"ok": True, "app": "local-learning-assistant"})


@app.route("/api/session")
def api_session():
    source.ensure_library()
    return jsonify(_session_payload())


@app.route("/api/library")
def api_library():
    source.ensure_library()
    return jsonify(_library_payload())


@app.route("/api/library/scan", methods=["POST"])
def api_library_scan():
    result = imports.scan_library(background=True)
    payload = _library_payload()
    payload["scan"] = {
        "registered": result.get("registered", 0),
        "jobs": len(result.get("jobs") or []),
    }
    return jsonify(payload)


@app.route("/api/import", methods=["POST"])
def api_import():
    uploaded = request.files.get("file")
    if uploaded is None or not uploaded.filename:
        return jsonify({"error": "缺少文件"}), 400
    try:
        result = imports.import_upload(uploaded)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, **result, "library": _library_payload()})


@app.route("/api/imports")
def api_imports():
    active = request.args.get("active") in ("1", "true", "yes")
    return jsonify({"jobs": store.list_jobs(active_only=active)})


@app.route("/api/imports/<job_id>")
def api_import_job(job_id: str):
    job = store.get_job(job_id)
    if job is None:
        return jsonify({"error": "任务不存在"}), 404
    return jsonify(job)


@app.route("/api/imports/<job_id>/retry", methods=["POST"])
def api_import_retry(job_id: str):
    job = imports.retry_job(job_id)
    if job is None:
        return jsonify({"error": "任务不存在"}), 404
    return jsonify({"ok": True, "job": job})


# ------------------------------------------------------------
# 文档内容 / 原文件 / 位置 / 标注
# ------------------------------------------------------------

@app.route("/api/documents/<doc_id>")
def api_document(doc_id: str):
    doc = store.get_document(doc_id)
    if doc is None:
        return jsonify({"error": "资料不存在"}), 404
    brief = _brief(doc)
    version_id = doc.get("current_version_id")
    versions = store.list_versions(doc_id)
    if not version_id:
        return jsonify(
            {
                "document": brief,
                "versions": versions,
                "status": "queued",
                "html": "",
                "blocks": [],
                "chapters": [],
                "annotations": [],
                "position": None,
                "view_mode": "markdown",
                "pdf_url": "",
                "pdf_missing": False,
                "original_url": f"/api/documents/{doc_id}/original",
            }
        )
    version = store.get_version(version_id)
    if version is None or version.get("status") != "ready":
        job = store.find_job_by_version(version_id)
        return jsonify(
            {
                "document": brief,
                "version": {
                    "id": version_id,
                    "number": (version or {}).get("version_no"),
                    "source_format": (version or {}).get("source_format"),
                },
                "versions": versions,
                "status": (version or {}).get("status") or "queued",
                "error": (version or {}).get("error") or "",
                "job": job,
                "html": "",
                "blocks": [],
                "chapters": [],
                "annotations": [],
                "position": None,
                "view_mode": "markdown",
                "pdf_url": "",
                "pdf_missing": False,
                "original_url": f"/api/documents/{doc_id}/original",
            }
        )

    content = store.get_document_content(doc_id)
    rendered = render.render_content(content, asset_dir=_asset_dir(doc))
    annotations = _annotations_with_locators(doc_id, version_id, rendered["blocks"])
    position = store.get_position(doc_id)
    if position and position.get("version_id") != version_id:
        position = None
    pdf_path = _playable_pdf(version)
    pdf_url = (
        f"/api/documents/{doc_id}/pdf?v={version_id}" if pdf_path is not None else ""
    )
    source_format = (version.get("source_format") or "").lower()
    return jsonify(
        {
            "document": brief,
            "version": rendered["version"],
            "versions": versions,
            "status": "ready",
            "html": rendered["html"],
            "blocks": rendered["blocks"],
            "chapters": rendered["chapters"],
            "annotations": annotations,
            "position": position,
            "view_mode": "pdf" if pdf_path is not None else "markdown",
            "pdf_url": pdf_url,
            "pdf_missing": source_format in ("pdf", "docx", "pptx") and pdf_path is None,
            "original_url": f"/api/documents/{doc_id}/original",
        }
    )


@app.route("/api/documents/<doc_id>/open", methods=["POST"])
def api_document_open(doc_id: str):
    doc = store.get_document(doc_id)
    if doc is None:
        return jsonify({"error": "资料不存在"}), 404
    store.set_selected_document_id(doc_id)
    if (doc.get("version_status") or "") == "ready":
        store.mark_read(doc_id, doc.get("title") or "")
    return jsonify(
        {
            "ok": True,
            "document": _brief(doc),
            "overview": store.overview(),
        }
    )


def _original_path(doc: dict) -> Path | None:
    raw = doc.get("source_path") or ""
    if not raw:
        return None
    try:
        path = Path(raw).resolve()
    except OSError:
        return None
    if not path.is_file():
        return None
    allowed = [config.ORIGINALS_DIR.resolve(), source.LIBRARY_DIR.resolve()]
    if not any(path.is_relative_to(root) for root in allowed):
        return None
    return path


@app.route("/api/documents/<doc_id>/pdf")
def api_document_pdf(doc_id: str):
    doc = store.get_document(doc_id)
    if doc is None:
        return jsonify({"error": "资料不存在"}), 404
    version = store.get_version(doc.get("current_version_id") or "")
    path = _playable_pdf(version)
    if path is None:
        return jsonify({"error": "播放文件不存在，请重新解析或转换"}), 404
    name = Path(doc.get("source_name") or path.name).stem + ".pdf"
    response = send_file(
        path,
        mimetype="application/pdf",
        as_attachment=False,
        download_name=name,
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/api/documents/<doc_id>/original")
def api_document_original(doc_id: str):
    doc = store.get_document(doc_id)
    if doc is None:
        return jsonify({"error": "资料不存在"}), 404
    path = _original_path(doc)
    if path is None:
        return jsonify({"error": "原文件不存在"}), 404
    suffix = path.suffix.lower()
    return send_file(
        path,
        as_attachment=suffix in (".docx", ".pptx"),
        download_name=doc.get("source_name") or path.name,
    )


@app.route("/api/documents/<doc_id>/assets/<path:name>")
def api_document_asset(doc_id: str, name: str):
    if store.get_document(doc_id) is None:
        return jsonify({"error": "资料不存在"}), 404
    folder = config.ORIGINALS_DIR / doc_id / "assets"
    if not folder.is_dir():
        return jsonify({"error": "图片不存在"}), 404
    return send_from_directory(str(folder), name)


@app.route("/api/documents/<doc_id>/position", methods=["GET", "POST"])
def api_document_position(doc_id: str):
    doc = store.get_document(doc_id)
    if doc is None:
        return jsonify({"error": "资料不存在"}), 404
    if request.method == "GET":
        return jsonify(store.get_position(doc_id) or {})
    data = request.get_json(silent=True) or {}
    version_id = (data.get("version_id") or doc.get("current_version_id") or "").strip()
    block_id = (data.get("block_id") or "").strip()
    if not version_id or not block_id:
        return jsonify({"error": "缺少 version_id 或 block_id"}), 400
    if version_id != doc.get("current_version_id"):
        return jsonify({"error": "阅读位置对应的版本已过期"}), 400
    if store.get_block(doc_id, block_id, version_id) is None:
        return jsonify({"error": "内容块不存在"}), 400
    try:
        block_offset = float(data.get("block_offset") or 0)
        scroll_ratio = float(data.get("scroll_ratio") or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "位置参数必须是数字"}), 400
    store.save_position(
        doc_id,
        version_id,
        block_id,
        max(0.0, min(1.0, block_offset)),
        max(0.0, min(1.0, scroll_ratio)),
    )
    return jsonify({"ok": True})


@app.route("/api/documents/<doc_id>/annotations", methods=["GET", "POST"])
def api_document_annotations(doc_id: str):
    doc = store.get_document(doc_id)
    if doc is None:
        return jsonify({"error": "资料不存在"}), 404
    version_id = request.args.get("version_id") or doc.get("current_version_id")
    if request.method == "GET":
        return jsonify({"annotations": store.list_annotations(doc_id, version_id)})

    data = request.get_json(silent=True) or {}
    block_id = (data.get("block_id") or "").strip()
    quote = (data.get("quote") or "").strip()
    try:
        start = int(data.get("start_offset"))
        end = int(data.get("end_offset"))
    except (TypeError, ValueError):
        return jsonify({"error": "标注范围必须是整数"}), 400
    if not block_id or not quote:
        return jsonify({"error": "缺少内容块或引文"}), 400
    if not version_id:
        return jsonify({"error": "资料尚未解析完成"}), 400
    try:
        annotation = store.create_annotation(
            doc_id,
            version_id,
            block_id,
            start,
            end,
            quote,
            note=(data.get("note") or "").strip(),
            color=(data.get("color") or "amber").strip(),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, "annotation": annotation})


@app.route("/api/annotations/<annotation_id>", methods=["PATCH", "DELETE"])
def api_annotation(annotation_id: str):
    if request.method == "DELETE":
        if not store.delete_annotation(annotation_id):
            return jsonify({"error": "标注不存在"}), 404
        return jsonify({"ok": True})
    data = request.get_json(silent=True) or {}
    note = data.get("note")
    color = data.get("color")
    if note is not None and not isinstance(note, str):
        return jsonify({"error": "note 必须是字符串"}), 400
    try:
        updated = store.update_annotation(annotation_id, note=note, color=color)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if updated is None:
        return jsonify({"error": "标注不存在"}), 404
    return jsonify({"ok": True, "annotation": updated})


# ------------------------------------------------------------
# 对话 / 笔记
# ------------------------------------------------------------

@app.route("/api/chat", methods=["GET"])
def api_chat_get():
    doc_id = (request.args.get("doc_id") or "").strip()
    if not doc_id:
        return jsonify({"error": "缺少 doc_id"}), 400
    return jsonify(chapter_chat.get(doc_id))


@app.route("/api/chat", methods=["POST"])
def api_chat_post():
    parsed, err = chapter_chat.parse_body(request.get_json(silent=True))
    if err:
        return jsonify({"error": err}), 400
    try:
        result = chapter_chat.chat(
            parsed["doc_id"],
            parsed["title"],
            parsed["question"],
            parsed["quote"],
            parsed["block_id"],
        )
    except (ValueError, llm.LLMError) as exc:
        return _llm_error(exc)
    return jsonify(result)


@app.route("/api/chat/spot", methods=["POST"])
def api_chat_spot():
    parsed, err = chapter_chat.parse_body(request.get_json(silent=True))
    if err:
        return jsonify({"error": err}), 400
    try:
        result = chapter_chat.spot(
            parsed["doc_id"],
            parsed["title"],
            parsed["question"],
            parsed["quote"],
            parsed["block_id"],
        )
    except (ValueError, llm.LLMError) as exc:
        return _llm_error(exc)
    return jsonify(result)


@app.route("/api/notes", methods=["GET"])
def api_notes_get():
    doc_id = (request.args.get("doc_id") or "").strip()
    if not doc_id:
        return jsonify({"error": "缺少 doc_id"}), 400
    if store.get_document(doc_id) is None:
        return jsonify({"error": "资料不存在"}), 404
    return jsonify(notes.get(doc_id))


@app.route("/api/notes", methods=["PUT"])
def api_notes_put():
    parsed, err = notes.parse_put_body(request.get_json(silent=True))
    if err:
        return jsonify({"error": err}), 400
    try:
        result = notes.put(parsed["doc_id"], parsed["content"], title=parsed.get("title"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    result["overview"] = store.overview()
    return jsonify(result)


@app.route("/api/notes/suggest", methods=["POST"])
def api_notes_suggest():
    parsed, err = notes.parse_suggest_body(request.get_json(silent=True))
    if err:
        return jsonify({"error": err}), 400
    try:
        result = notes.suggest(parsed["doc_id"], parsed.get("quote") or "")
    except (ValueError, llm.LLMError) as exc:
        return _llm_error(exc)
    return jsonify(result)


@app.route("/api/notes/draft", methods=["POST"])
def api_notes_draft():
    parsed, err = notes.parse_draft_body(request.get_json(silent=True))
    if err:
        return jsonify({"error": err}), 400
    try:
        result = notes.draft(
            parsed["doc_id"],
            parsed.get("instruction") or "",
            parsed.get("quote") or "",
        )
    except (ValueError, llm.LLMError) as exc:
        return _llm_error(exc)
    return jsonify(result)


# ------------------------------------------------------------
# 划段 AI 动作 / 理解检查 / 学习证据
# ------------------------------------------------------------

def _ready_doc(doc_id: str):
    doc = store.get_document(doc_id)
    if doc is None:
        return None, (jsonify({"error": "资料不存在"}), 404)
    if (doc.get("version_status") or "") != "ready":
        return None, (jsonify({"error": "资料尚未解析完成"}), 400)
    return doc, None


@app.route("/api/search")
def api_search():
    query = (request.args.get("q") or "").strip()
    doc_id = (request.args.get("doc_id") or "").strip()
    try:
        limit = int(request.args.get("limit") or 20)
    except ValueError:
        return jsonify({"error": "limit 必须是数字"}), 400
    if doc_id and store.get_document(doc_id) is None:
        return jsonify({"error": "资料不存在"}), 404
    if not query:
        return jsonify({"query": "", "keywords": [], "count": 0, "results": []})
    return jsonify(search.search(query, limit=limit, doc_id=doc_id))


@app.route("/api/ask", methods=["POST"])
def api_ask():
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or "").strip()
    doc_id = (data.get("doc_id") or "").strip()
    if not query:
        return jsonify({"error": "请输入问题"}), 400
    if doc_id and store.get_document(doc_id) is None:
        return jsonify({"error": "资料不存在"}), 404
    try:
        limit = int(data.get("limit") or 10)
    except (TypeError, ValueError):
        limit = 10
    try:
        result = search.ask(query, doc_id=doc_id, limit=limit)
    except llm.LLMError as exc:
        return _llm_error(exc)
    return jsonify(result)


@app.route("/api/selection/action", methods=["POST"])
def api_selection_action():
    data = request.get_json(silent=True) or {}
    doc_id = (data.get("doc_id") or "").strip()
    mode = (data.get("mode") or "").strip()
    quote = (data.get("quote") or "").strip()
    block_id = (data.get("block_id") or "").strip()
    question = (data.get("question") or "").strip()
    if not doc_id:
        return jsonify({"error": "缺少 doc_id"}), 400
    if mode not in tutor.MODE_TASKS:
        return jsonify({"error": "不支持的动作"}), 400
    if not quote and not question:
        return jsonify({"error": "缺少划选内容"}), 400
    doc, error = _ready_doc(doc_id)
    if error:
        return error
    if block_id and store.get_block(doc_id, block_id, doc.get("current_version_id")) is None:
        return jsonify({"error": "内容块不存在或版本已过期"}), 400
    try:
        result = tutor.selection_action(doc_id, mode, quote, block_id, question)
    except (ValueError, llm.LLMError) as exc:
        return _llm_error(exc)
    return jsonify({**result, "doc_id": doc_id})


@app.route("/api/understanding", methods=["POST"])
def api_understanding():
    data = request.get_json(silent=True) or {}
    doc_id = (data.get("doc_id") or "").strip()
    block_id = (data.get("block_id") or "").strip()
    quote = (data.get("quote") or "").strip()
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()
    if not doc_id:
        return jsonify({"error": "缺少 doc_id"}), 400
    if not question or not answer:
        return jsonify({"error": "检查题和回答都不能为空"}), 400
    doc, error = _ready_doc(doc_id)
    if error:
        return error
    if block_id and store.get_block(doc_id, block_id, doc.get("current_version_id")) is None:
        return jsonify({"error": "内容块不存在或版本已过期"}), 400
    try:
        result = tutor.evaluate_understanding(doc_id, block_id, quote, question, answer)
    except (ValueError, llm.LLMError) as exc:
        return _llm_error(exc)
    check_id = store.save_understanding(
        doc_id,
        doc.get("current_version_id") or "",
        block_id,
        quote,
        question,
        answer,
        result["feedback"],
        result["verdict"],
    )
    return jsonify({**result, "id": check_id, "doc_id": doc_id, "self_level": ""})


@app.route("/api/understanding/<check_id>", methods=["PATCH"])
def api_understanding_level(check_id: str):
    data = request.get_json(silent=True) or {}
    level = (data.get("self_level") or "").strip()
    if level not in store.READ_LEVELS:
        return jsonify({"error": "自评只能是：理解 / 模糊 / 不会"}), 400
    row = store.set_understanding_self_level(check_id, level)
    if row is None:
        return jsonify({"error": "理解检查不存在"}), 404
    return jsonify({"ok": True, "understanding": row})


@app.route("/api/exercise-evidence/<evidence_id>", methods=["PATCH"])
def api_exercise_evidence_level(evidence_id: str):
    data = request.get_json(silent=True) or {}
    level = (data.get("self_level") or "").strip()
    if level not in store.READ_LEVELS:
        return jsonify({"error": "自评只能是：理解 / 模糊 / 不会"}), 400
    row = store.set_exercise_self_level(evidence_id, level)
    if row is None:
        return jsonify({"error": "练习记录不存在"}), 404
    return jsonify({"ok": True, "evidence": row})


@app.route("/api/documents/<doc_id>/read-level", methods=["POST"])
def api_document_read_level(doc_id: str):
    doc = store.get_document(doc_id)
    if doc is None:
        return jsonify({"error": "资料不存在"}), 404
    data = request.get_json(silent=True) or {}
    level = (data.get("self_level") or "").strip()
    if level not in ("", *store.READ_LEVELS):
        return jsonify({"error": "自评只能是：理解 / 模糊 / 不会"}), 400
    store.set_read_level(doc_id, level)
    return jsonify({"ok": True, "read_level": level})


@app.route("/api/documents/<doc_id>/learning")
def api_document_learning(doc_id: str):
    if store.get_document(doc_id) is None:
        return jsonify({"error": "资料不存在"}), 404
    return jsonify(
        {
            "understanding": store.list_understanding(doc_id),
            "practice": store.list_exercise_evidence(doc_id),
        }
    )


# ------------------------------------------------------------
# 出题 / 前置自评
# ------------------------------------------------------------

@app.route("/api/exercise", methods=["POST"])
def api_exercise():
    data = request.get_json(silent=True) or {}
    doc_id = (data.get("doc_id") or store.get_selected_document_id() or "").strip()
    if not doc_id:
        return jsonify({"error": "请先打开一份资料"}), 400
    doc = store.get_document(doc_id)
    if doc is None:
        return jsonify({"error": "资料不存在"}), 404
    difficulty = (data.get("difficulty") or "").strip()
    if difficulty not in ("", "入门", "中等", "进阶"):
        return jsonify({"error": "难度参数仅支持：入门 / 中等 / 进阶"}), 400
    try:
        question, citations = explainer.generate_exercise(
            doc_id,
            source_title=doc.get("title") or "",
            difficulty=difficulty,
            prior_questions=progress.get_exercise_history(doc_id),
            chat_messages=store.get_chat(doc_id),
            last_submission=progress.get_last_submission(doc_id),
        )
    except (ValueError, llm.LLMError) as exc:
        return _llm_error(exc)
    progress.set_exercise(doc_id, question, difficulty)
    progress.append_exercise_history(doc_id, question)
    return jsonify(
        {
            "question": question,
            "citations": citations,
            "doc_id": doc_id,
            "difficulty": difficulty,
        }
    )


@app.route("/api/exercise/submit", methods=["POST"])
def api_exercise_submit():
    data = request.get_json(silent=True) or {}
    doc_id = (data.get("doc_id") or store.get_selected_document_id() or "").strip()
    if not doc_id:
        return jsonify({"error": "请先打开一份资料"}), 400
    doc = store.get_document(doc_id)
    if doc is None:
        return jsonify({"error": "资料不存在"}), 404
    answer = (data.get("code") or "").strip()
    if not answer:
        return jsonify({"error": "解答不能为空"}), 400
    exercise = progress.get_exercise(doc_id)
    question = (exercise.get("question") or "").strip()
    if not question:
        return jsonify({"error": "请先出题"}), 400
    try:
        review, citations = explainer.review_submission(
            doc_id,
            source_title=doc.get("title") or "",
            question=question,
            code=answer,
        )
    except (ValueError, llm.LLMError) as exc:
        return _llm_error(exc)
    progress.set_last_submission(doc_id, doc.get("title") or "", question, answer, review)
    evidence_id = store.add_exercise_evidence(
        doc_id,
        doc.get("current_version_id") or "",
        question,
        answer,
        review,
    )
    return jsonify(
        {
            "review": review,
            "citations": citations,
            "evidence_id": evidence_id,
            "doc_id": doc_id,
            "title": doc.get("title") or "",
        }
    )


@app.route("/api/prereq", methods=["GET"])
def api_prereq_get():
    doc_id = (request.args.get("doc_id") or "").strip()
    if not doc_id:
        return jsonify({"error": "缺少 doc_id"}), 400
    if store.get_document(doc_id) is None:
        return jsonify({"error": "资料不存在"}), 404
    cached = prereq.get(doc_id)
    if cached is not None:
        return jsonify({**cached, "doc_id": doc_id, "cached": True})
    return jsonify(
        {"doc_id": doc_id, "focus": "", "questions": [], "answers": {}, "cached": False}
    )


@app.route("/api/prereq", methods=["POST"])
def api_prereq_post():
    data = request.get_json(silent=True) or {}
    doc_id = (data.get("doc_id") or "").strip()
    if not doc_id:
        return jsonify({"error": "缺少 doc_id"}), 400
    if store.get_document(doc_id) is None:
        return jsonify({"error": "资料不存在"}), 404
    cached = prereq.get(doc_id)
    if cached is not None:
        return jsonify({**cached, "doc_id": doc_id, "cached": True})
    try:
        entry = prereq.generate(doc_id)
    except (ValueError, llm.LLMError) as exc:
        return _llm_error(exc)
    return jsonify({**entry, "doc_id": doc_id, "cached": False})


@app.route("/api/prereq/answer", methods=["POST"])
def api_prereq_answer():
    data = request.get_json(silent=True) or {}
    doc_id = (data.get("doc_id") or "").strip()
    if not doc_id:
        return jsonify({"error": "缺少 doc_id"}), 400
    try:
        updated = prereq.save_answers(doc_id, data.get("answers"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if updated is None:
        return jsonify({"error": "该资料尚未生成前置题"}), 400
    return jsonify({**updated, "doc_id": doc_id, "cached": True})


# ------------------------------------------------------------
# 配置 / 重置
# ------------------------------------------------------------

@app.route("/api/profile", methods=["GET", "POST"])
def api_profile():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        display_name = str(data.get("display_name") or "").strip()
        goal = str(data.get("goal") or "").strip()
        if len(display_name) > 40:
            return jsonify({"error": "称呼不超过 40 个字"}), 400
        if len(goal) > 200:
            return jsonify({"error": "学习目标不超过 200 个字"}), 400
        profile = {"display_name": display_name, "goal": goal}
        store.set_state("user_profile", json.dumps(profile, ensure_ascii=False))
        return jsonify({"ok": True, "profile": profile})
    try:
        profile = json.loads(store.get_state("user_profile", "{}") or "{}")
    except (TypeError, ValueError):
        profile = {}
    if not isinstance(profile, dict):
        profile = {}
    return jsonify(
        {
            "profile": {
                "display_name": str(profile.get("display_name") or ""),
                "goal": str(profile.get("goal") or ""),
            }
        }
    )


@app.route("/api/config", methods=["GET"])
def api_config_get():
    return jsonify(api_config.public())


@app.route("/api/providers")
def api_providers():
    return jsonify(api_config.public_state())


@app.route("/api/providers", methods=["POST"])
def api_provider_save():
    data = request.get_json(silent=True) or {}
    try:
        provider = api_config.upsert_provider(data)
    except api_config.APIError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(
        {"ok": True, "provider": provider, "state": api_config.public_state()}
    )


@app.route("/api/providers/<provider_id>", methods=["DELETE"])
def api_provider_delete(provider_id: str):
    try:
        deleted = api_config.delete_provider(provider_id)
    except api_config.APIError as exc:
        return jsonify({"error": str(exc)}), 400
    if not deleted:
        return jsonify({"error": "服务不存在"}), 404
    return jsonify({"ok": True, "state": api_config.public_state()})


@app.route("/api/providers/<provider_id>/scan", methods=["POST"])
def api_provider_scan(provider_id: str):
    try:
        provider = api_config.scan_models(provider_id)
    except api_config.APIError as exc:
        return jsonify({"error": str(exc)}), 502
    return jsonify(
        {"ok": True, "provider": provider, "state": api_config.public_state()}
    )


@app.route("/api/providers/<provider_id>/models", methods=["PATCH"])
def api_provider_model(provider_id: str):
    data = request.get_json(silent=True) or {}
    model_id = str(data.get("model") or "").strip()
    if not model_id or "enabled" not in data:
        return jsonify({"error": "缺少 model 或 enabled"}), 400
    try:
        provider = api_config.set_model_enabled(
            provider_id, model_id, bool(data.get("enabled"))
        )
    except api_config.APIError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(
        {"ok": True, "provider": provider, "state": api_config.public_state()}
    )


@app.route("/api/active-model", methods=["POST"])
def api_active_model():
    data = request.get_json(silent=True) or {}
    provider_id = str(data.get("provider_id") or "").strip()
    model = str(data.get("model") or "").strip()
    try:
        active = api_config.set_active(provider_id, model)
    except api_config.APIError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(
        {
            "ok": True,
            "active": active,
            "state": api_config.public_state(),
            "llm_configured": api_config.is_configured(),
        }
    )


@app.route("/api/models")
def api_models():
    state = api_config.public_state()
    state["llm_configured"] = api_config.is_configured()
    state["active_provider"] = api_config.effective()["provider_name"]
    return jsonify(state)


@app.route("/api/config", methods=["POST"])
def api_config_post():
    data = request.get_json(silent=True) or {}
    api_base = (data.get("api_base") or "").strip()
    api_key = (data.get("api_key") or "").strip()
    model = (data.get("model") or "").strip()
    clear_key = bool(data.get("clear_key"))
    if not api_base.startswith(("http://", "https://")):
        return jsonify({"error": "API 地址必须以 http:// 或 https:// 开头"}), 400
    if api_key.startswith(("http://", "https://")):
        return jsonify({"error": "API Key 是密钥，请不要把 API 地址填到 Key 框"}), 400
    if clear_key and api_key:
        return jsonify({"error": "不能同时清除并填写新的 API Key"}), 400
    try:
        raw_timeout = data.get("timeout")
        raw_temperature = data.get("temperature")
        timeout = float(raw_timeout) if raw_timeout not in (None, "") else 180.0
        temperature = (
            float(raw_temperature) if raw_temperature not in (None, "") else 0.7
        )
    except (TypeError, ValueError):
        return jsonify({"error": "超时与温度必须是数字"}), 400
    if timeout <= 0:
        return jsonify({"error": "超时必须大于 0"}), 400
    if not 0 <= temperature <= 2:
        return jsonify({"error": "温度必须在 0~2 之间"}), 400
    try:
        api_config.save(
            {
                "api_base": api_base,
                "api_key": api_key,
                "model": model or api_config.DEFAULT_CONFIG["model"],
                "timeout": timeout,
                "temperature": temperature,
            },
            clear_key=clear_key,
        )
    except api_config.APIError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"ok": True, "configured": api_config.is_configured(), "config": api_config.public()})


@app.route("/api/reset", methods=["POST"])
def api_reset():
    store.reset_learning()
    return jsonify({"ok": True})


# ------------------------------------------------------------
# 启动
# ------------------------------------------------------------

def bootstrap() -> dict:
    source.ensure_library()
    store.init_db()
    migration = migrate.migrate_if_needed()
    normalized = migrate.normalize_markdown()
    recovered = store.recover_interrupted_jobs()
    scan = imports.scan_library(background=True)
    renders = migrate.ensure_render_paths()
    stats = store.overview()
    print(f"学习数据库：{config.DB_PATH}")
    print(f"资料库：{config.LIBRARY_DIR}（{stats['document_count']} 份文档）")
    if migration.get("migrated"):
        print(f"已迁移旧数据；备份：{migration.get('backup') or '（无旧文件）'}")
    if normalized:
        print(f"已为 {normalized} 个旧版本补齐 Markdown 预览")
    if recovered:
        print(f"恢复了 {recovered} 个中断的解析任务")
    if scan.get("jobs"):
        print(f"正在解析 {len(scan['jobs'])} 个资料任务")
    if renders.get("updated"):
        print(f"已补齐 {renders['updated']} 份资料的 PDF 播放文件")
    for failure in renders.get("failed") or []:
        print(f"PDF 播放文件未生成：{failure}")
    return {"migration": migration, "scan": scan, "renders": renders, "overview": stats}


def run(host: str = "127.0.0.1", port: int = 5000, debug: bool = False) -> None:
    bootstrap()
    print(f"学习助手已启动：http://{host}:{port}")
    print("按 Ctrl+C 停止服务。")
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    run()
