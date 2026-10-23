"""按文档 ID 保存阅读进度、题目与提交记录。

实际存储在 SQLite（app/store.py）；本模块保留服务层命名，避免路由直接
散落数据访问细节。
"""

from . import store


def get_selected_document_id():
    return store.get_selected_document_id()


def set_selected_document(doc_id):
    store.set_selected_document_id(doc_id)


def mark_read(doc_id: str, title: str) -> None:
    store.mark_read(doc_id, title)


def get_exercise(doc_id: str) -> dict:
    return store.get_exercise(doc_id)


def set_exercise(doc_id: str, question: str, difficulty: str = "") -> None:
    store.save_exercise(doc_id, question, difficulty)


def get_exercise_history(doc_id: str) -> list:
    return store.get_exercise_history(doc_id)


def append_exercise_history(doc_id: str, question: str) -> None:
    store.append_exercise_history(doc_id, question)


def get_last_submission(doc_id: str) -> dict:
    return store.get_last_submission(doc_id)


def set_last_submission(doc_id: str, title: str, question: str, answer: str, review: str) -> None:
    store.save_last_submission(doc_id, title, question, answer, review)


def overview() -> dict:
    return store.overview()


def reset() -> None:
    store.reset_learning()
