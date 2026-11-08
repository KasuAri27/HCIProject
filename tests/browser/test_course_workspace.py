"""课程工作台完整业务流；只在模型 HTTP 服务边界使用模拟。"""

import json
import re
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright

from scripts.ci_support import LiveServer, ROOT


class CourseWorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True, channel="chromium")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.server = LiveServer()
        self.addCleanup(self.server.close)

        fixture = self

        class Model(BaseHTTPRequestHandler):
            def do_POST(handler):
                data = json.loads(handler.rfile.read(int(handler.headers["Content-Length"])))
                fixture.model_requests.append(data)
                if "suggestions" in data["messages"][0]["content"]:
                    reply = json.dumps({"suggestions": []})
                else:
                    question = data["messages"][-1]["content"].split("【本次提问】\n")[-1]
                    if "慢请求" in question:
                        time.sleep(1.5)
                    reply = "回答：" + question
                body = json.dumps({"choices": [{"message": {"content": reply}}]}).encode()
                handler.send_response(200)
                handler.send_header("Content-Type", "application/json")
                handler.send_header("Content-Length", str(len(body)))
                handler.end_headers()
                handler.wfile.write(body)

            def log_message(self, *_args):
                pass

        self.model = ThreadingHTTPServer(("127.0.0.1", 0), Model)
        threading.Thread(target=self.model.serve_forever, daemon=True).start()
        self.addCleanup(self.model.server_close)
        self.addCleanup(self.model.shutdown)
        self.context = self.browser.new_context(viewport={"width": 1600, "height": 1000})
        self.addCleanup(self.context.close)
        self.context.route("**/favicon.ico", lambda route: route.fulfill(status=204))
        self.context.request.post(self.server.url + "/api/config", data={
            "api_base": f"http://127.0.0.1:{self.model.server_port}/v1", "api_key": "test-only", "model": "fixture",
        })
        self.page = self.context.new_page()
        self.errors = []
        self.model_requests = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.goto(self.server.url, wait_until="networkidle")

    def tearDown(self):
        self.assertEqual(self.errors, [])

    def create_and_import(self):
        self.page.locator("#btn-create-course").click()
        self.page.locator("#course-title").fill("人机交互")
        with self.page.expect_response(lambda r: r.url.endswith("/api/courses") and r.request.method == "POST") as response:
            self.page.locator("#btn-course-submit").click()
        self.course_id = response.value.json()["course"]["id"]
        group = self.page.locator(f'.course-group[data-course-id="{self.course_id}"]')
        expect(group).to_contain_text("人机交互")
        with self.page.expect_file_chooser() as chooser:
            group.locator(".course-import").click()
        with self.page.expect_response(lambda r: r.url.endswith("/api/import") and r.request.method == "POST") as imported:
            chooser.value.set_files({"name": "交互设计.md", "mimeType": "text/markdown", "buffer": "# 以人为中心的 AI\n\n解释需要可以核对的来源。".encode()})
        self.doc_id = imported.value.json()["document_id"]
        expect(self.page.locator("#doc-body")).to_contain_text("解释需要可以核对的来源", timeout=20000)
        expect(self.page.locator("#workspace-course-name")).to_have_text("人机交互")

    def new_thread(self):
        with self.page.expect_response(lambda r: r.url.endswith("/api/threads") and r.request.method == "POST") as response:
            self.page.locator("#btn-new-thread").click()
        thread = response.value.json()["thread"]["id"]
        expect(self.page.locator(f'.workspace-thread[data-thread-id="{thread}"]')).to_have_class("workspace-thread is-active")
        return thread

    def send(self, text):
        self.page.locator("#chat-input").fill(text)
        self.page.locator("#btn-chat-send").click()
        expect(self.page.locator("#chat-messages")).to_contain_text("回答：" + text)

    def test_course_import_independent_chats_notes_and_ai_collapse(self):
        self.create_and_import()
        expect(self.page.locator("#pane-notes")).to_be_visible()
        expect(self.page.locator("#pane-chat")).to_be_visible()
        self.page.locator("#notes-content").fill("自己整理的课程笔记")
        with self.page.expect_response(lambda r: r.url.endswith("/api/notes") and r.request.method == "PUT"):
            self.page.locator("#btn-notes-save").click()
        first = self.new_thread()
        self.send("第一段的问题")
        second = self.new_thread()
        expect(self.page.locator("#chat-messages")).to_be_empty()
        self.send("另一个问题")
        self.page.locator(f'.workspace-thread[data-thread-id="{first}"]').click()
        expect(self.page.locator("#chat-messages")).to_contain_text("第一段的问题")
        expect(self.page.locator("#chat-messages")).not_to_contain_text("另一个问题")
        expect(self.page.locator("#notes-content")).to_have_value("自己整理的课程笔记")
        # 核对确认后的空间顺序，避免只检查宽度而遗漏左右颠倒。
        source_box = self.page.locator("#reading").bounding_box()
        notes_box = self.page.locator("#notes-rail").bounding_box()
        chat_box = self.page.locator("#rail-right").bounding_box()
        self.assertLess(source_box["x"], notes_box["x"])
        self.assertLess(notes_box["x"], chat_box["x"])
        width = source_box["width"]
        notes_width = self.page.locator("#notes-rail").bounding_box()["width"]
        self.page.locator("#btn-close-chat").click()
        expect(self.page.locator("#pane-chat")).to_be_hidden()
        expect(self.page.locator("#pane-notes")).to_be_visible()
        self.assertAlmostEqual(self.page.locator("#reading").bounding_box()["width"], width, delta=1)
        self.assertGreater(self.page.locator("#notes-rail").bounding_box()["width"], notes_width)
        self.page.reload(wait_until="networkidle")
        expect(self.page.locator(f'.workspace-thread[data-thread-id="{first}"]')).to_have_class("workspace-thread is-active")
        expect(self.page.locator("#chat-messages")).to_contain_text("第一段的问题")
        expect(self.page.locator("#notes-content")).to_have_value("自己整理的课程笔记")
        self.assertNotEqual(first, second)
        artifacts = ROOT / ".uitest/course-workspace"
        artifacts.mkdir(parents=True, exist_ok=True)
        self.page.screenshot(path=str(artifacts / "desktop.png"))

    def test_late_chat_answer_stays_in_its_original_thread(self):
        self.create_and_import()
        old_thread = self.new_thread()
        self.page.locator("#chat-input").fill("慢请求，只给旧会话的回答")
        with self.page.expect_response(lambda r: r.url.endswith("/api/chat") and r.request.method == "POST"):
            self.page.locator("#btn-chat-send").click()
            new_thread = self.new_thread()
        expect(self.page.locator("#btn-chat-send")).to_be_enabled()
        expect(self.page.locator("#chat-messages")).to_be_empty()
        self.assertEqual(self.context.request.get(f"{self.server.url}/api/chat?doc_id={self.doc_id}&thread_id={new_thread}").json()["messages"], [])
        self.assertEqual(len(self.context.request.get(f"{self.server.url}/api/chat?doc_id={self.doc_id}&thread_id={old_thread}").json()["messages"]), 2)

    def test_mobile_drawers_and_knowledge_placeholder(self):
        self.create_and_import()
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.page.locator("#btn-rail-toggle").click()
        self.page.locator("#btn-knowledge-sky").click()
        expect(self.page.locator("#knowledge-dialog")).to_contain_text("后续开放")
        self.page.locator("#btn-knowledge-close").click()
        self.page.locator("#btn-sidebar-fold").click()
        expect(self.page.locator("#pane-notes")).to_be_visible()
        self.page.locator("#btn-source-toggle").click()
        expect(self.page.locator("#reading")).to_be_visible()
        self.page.locator("#btn-source-close").click()
        self.page.locator("#btn-chat-toggle").click()
        expect(self.page.locator("#pane-notes")).to_be_visible()
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def test_quiz_and_note_requests_share_the_chat(self):
        self.create_and_import()
        paths = []
        self.page.on("request", lambda request: paths.append(request.url.split(self.server.url)[-1]))
        expect(self.page.locator("#tab-exercise, #pane-exercise, .notes-ai, .suggest")).to_have_count(0)
        self.page.get_by_role("button", name="出个题考察一下", exact=True).click()
        expect(self.page.locator("#chat-messages")).to_contain_text("回答：出个题考察一下")
        self.page.locator("#notes-content").fill("这是一条刚刚修改、尚未手动保存的笔记")
        self.page.get_by_role("button", name="看看我的笔记还需要补充什么", exact=True).click()
        expect(self.page.locator("#chat-messages")).to_contain_text("回答：看看我的笔记还需要补充什么")
        chats = [request for request in self.model_requests if "suggestions" not in request["messages"][0]["content"]]
        self.assertIn("刚刚修改", chats[-1]["messages"][1]["content"])
        self.assertIn("出个题考察一下", str(chats[-1]["messages"]))
        self.assertFalse(any(path.startswith(("/api/exercise", "/api/notes/suggest", "/api/notes/draft")) for path in paths))
        expect(self.page.locator("#notes-content")).to_have_value("这是一条刚刚修改、尚未手动保存的笔记")
        self.page.get_by_role("button", name="将这条回答记入笔记", exact=True).last.click()
        expect(self.page.locator("#notes-content")).to_have_value(re.compile("回答：看看我的笔记还需要补充什么"))
