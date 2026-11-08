"""课程关联、独立会话与 v5 升级的隔离验收。"""

import sqlite3
from contextlib import closing
from unittest.mock import patch

from app import store
from test_phase2 import BaseTest


class CourseThreadTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.doc_id = self.upload("lesson.md", "# 课程资料\n\n注意力按相关性加权。".encode()).get_json()["document_id"]

    def course(self, title="机器学习"):
        response = self.client.post("/api/courses", json={"title": title})
        self.assertEqual(response.status_code, 200)
        return response.get_json()["course"]["id"]

    def thread(self, doc_id=None):
        response = self.client.post("/api/threads", json={"doc_id": doc_id or self.doc_id})
        self.assertEqual(response.status_code, 200)
        return response.get_json()["thread"]["id"]

    def test_course_validation_and_duplicate_file_association_preserve_notes(self):
        for data in ([], {}, {"title": []}, {"title": " "}, {"title": "长" * 81}):
            self.assertEqual(self.client.post("/api/courses", json=data).status_code, 400)
        course = self.course()
        store.save_note(self.doc_id, "我已有的笔记")
        import io
        result = self.client.post("/api/import", data={
            "course_id": course, "file": (io.BytesIO("# 课程资料\n\n注意力按相关性加权。".encode()), "lesson.md"),
        }, content_type="multipart/form-data")
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.get_json()["duplicate"])
        self.assertEqual(result.get_json()["document_id"], self.doc_id)
        self.assertEqual(store.list_courses()[0]["document_ids"], [self.doc_id])
        self.assertEqual(store.get_note(self.doc_id)["content"], "我已有的笔记")
        self.assertEqual(self.client.post(f"/api/courses/{course}/documents", json={"doc_id": self.doc_id}).status_code, 200)
        self.assertEqual(len(store.list_courses()[0]["document_ids"]), 1)

    def test_conversations_are_isolated_and_selected_thread_is_restored(self):
        first, second = self.thread(), self.thread()
        with patch("app.llm.chat", return_value="第一份回答"):
            self.assertEqual(self.client.post("/api/chat", json={"doc_id": self.doc_id, "thread_id": first, "question": "只在第一个会话的问题"}).status_code, 200)
        with patch("app.llm.chat", return_value="第二份回答") as model:
            response = self.client.post("/api/chat", json={"doc_id": self.doc_id, "thread_id": second, "question": "新会话的问题"})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("只在第一个会话的问题", str(model.call_args.args[0]))
        self.assertEqual(len(store.get_chat(self.doc_id, first)), 2)
        self.assertEqual(len(store.get_chat(self.doc_id, second)), 2)
        self.assertEqual(store.get_chat(self.doc_id), [])
        self.client.post(f"/api/threads/{first}/open")
        self.assertEqual(self.client.get("/api/session").get_json()["selected_thread_id"], first)
        self.assertEqual(self.client.get(f"/api/chat?doc_id={self.doc_id}&thread_id={first}").get_json()["messages"][0]["content"], "只在第一个会话的问题")

    def test_thread_cannot_be_used_with_another_document(self):
        thread = self.thread()
        other = self.upload("other.md", "# 另一份资料\n\n不同内容。".encode()).get_json()["document_id"]
        with patch("app.llm.chat") as model:
            result = self.client.post("/api/chat", json={"doc_id": other, "thread_id": thread, "question": "测试"})
            self.assertEqual(result.status_code, 400)
            model.assert_not_called()
        self.assertEqual(self.client.get(f"/api/chat?doc_id={other}&thread_id={thread}").status_code, 400)

    def test_legacy_client_keeps_a_stable_default_conversation(self):
        store.append_chat(self.doc_id, "user", "旧客户端问题")
        store.append_chat(self.doc_id, "assistant", "旧客户端回答")
        store.init_db()
        self.assertEqual(len(store.get_chat(self.doc_id)), 2)
        self.assertEqual(len(store.list_threads(self.doc_id)), 1)

    def test_note_draft_reads_only_the_requested_conversation(self):
        first, second = self.thread(), self.thread()
        store.append_chat(self.doc_id, "user", "会话一独有的问题", thread_id=first)
        store.append_chat(self.doc_id, "user", "会话二独有的问题", thread_id=second)
        with patch("app.llm.chat", return_value="笔记草稿") as model:
            response = self.client.post("/api/notes/draft", json={"doc_id": self.doc_id, "thread_id": second})
        self.assertEqual(response.status_code, 200)
        prompt = str(model.call_args.args[0])
        self.assertIn("会话二独有的问题", prompt)
        self.assertNotIn("会话一独有的问题", prompt)


class CourseMigrationTests(BaseTest):
    def legacy_database(self):
        path = self.tmp / "legacy-v5.db"
        schema = store.SCHEMA
        schema = schema.replace("    thread_id   TEXT REFERENCES chat_threads(id),\n", "")
        start = schema.index("CREATE TABLE IF NOT EXISTS courses")
        end = schema.index("CREATE TABLE IF NOT EXISTS prereq_cache")
        with closing(sqlite3.connect(path)) as conn, conn:
            conn.executescript(schema[:start] + schema[end:])
            conn.execute("INSERT INTO app_state VALUES ('schema_version', '5')")
            conn.execute("INSERT INTO documents(id,title,source_format,created_at,updated_at) VALUES ('doc','旧资料','md','old','old')")
            conn.execute("INSERT INTO notes(document_id,content,updated_at) VALUES ('doc','原有笔记','old')")
            conn.execute("INSERT INTO chat_messages(id,document_id,role,content,created_at) VALUES ('message','doc','user','旧问题','old')")
        return path

    def test_v5_is_backed_up_and_migrated_once_without_losing_records(self):
        path = self.legacy_database()
        with patch.object(store, "DB_PATH", path):
            store.init_db()
            store.init_db()
            self.assertEqual(store.get_state("schema_version"), "6")
            self.assertEqual(store.get_note("doc")["content"], "原有笔记")
            self.assertEqual(len(store.list_threads("doc")), 1)
            self.assertEqual(store.get_chat("doc")[0]["content"], "旧问题")
            with store._conn() as conn:
                self.assertEqual(conn.execute("SELECT id FROM chat_messages").fetchone()[0], "message")
        backups = list((self.tmp / "db/backups").glob("courses-v6-*.db"))
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(backups[0])) as conn:
            self.assertEqual(conn.execute("SELECT value FROM app_state WHERE key='schema_version'").fetchone()[0], "5")

    def test_failed_backup_prevents_schema_changes(self):
        path = self.legacy_database()
        with patch.object(store, "DB_PATH", path), patch.object(store, "_backup_database", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "备份失败"):
                store.init_db()
        with closing(sqlite3.connect(path)) as conn:
            self.assertNotIn("thread_id", {row[1] for row in conn.execute("PRAGMA table_info(chat_messages)")})
            self.assertIsNone(conn.execute("SELECT name FROM sqlite_master WHERE name='courses'").fetchone())
