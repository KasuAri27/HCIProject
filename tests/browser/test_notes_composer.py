"""笔记输入区的局部交互测试；模型只在 HTTP 边界模拟。"""

import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright

from scripts.ci_support import LiveServer, ROOT


class NotesComposerTests(unittest.TestCase):
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
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 1000})
        self.addCleanup(self.context.close)
        self.context.route("**/favicon.ico", lambda route: route.fulfill(status=204))
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        response = self.context.request.post(self.server.url + "/api/import", multipart={
            "file": {"name": "notes.md", "mimeType": "text/markdown", "buffer": "# 学习笔记\n\n注意力按相关性加权。".encode()},
        })
        self.doc_id = response.json()["document_id"]
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            data = self.context.request.get(f"{self.server.url}/api/documents/{self.doc_id}").json()
            if data["status"] == "ready":
                break
            time.sleep(0.05)
        else:
            self.fail("测试资料解析超时")
        self.context.request.post(f"{self.server.url}/api/documents/{self.doc_id}/open")
        self.context.request.put(self.server.url + "/api/notes", data={"doc_id": self.doc_id, "content": "我的原有笔记"})
        self.mode = "normal"
        self.disconnected = threading.Event()
        fixture = self

        class ModelHandler(BaseHTTPRequestHandler):
            def do_POST(handler):
                request = json.loads(handler.rfile.read(int(handler.headers["Content-Length"])))
                if not request.get("stream"):
                    system = request["messages"][0]["content"]
                    questions = ["问题一", "问题二", "问题三"] if "接下来可以直接发送" in system else []
                    body = json.dumps({"choices": [{"message": {"content": json.dumps({"suggestions": questions})}}]}).encode()
                    handler.send_response(200)
                    handler.send_header("Content-Type", "application/json")
                    handler.send_header("Content-Length", str(len(body)))
                    handler.end_headers()
                    handler.wfile.write(body)
                    return
                mode = fixture.mode
                handler.send_response(200)
                handler.send_header("Content-Type", "text/event-stream")
                handler.end_headers()

                def send(event):
                    handler.wfile.write(("data: " + json.dumps(event) + "\n\n").encode())
                    handler.wfile.flush()

                try:
                    parts = ["## 新草稿\n\n", "按相关性", "加权。"] if mode == "normal" else ["已收到的片段\n"] * 40
                    for part in parts:
                        send({"choices": [{"delta": {"content": part}}]})
                        time.sleep(0.12)
                        if mode == "error":
                            send({"error": {"message": "test failure"}})
                            return
                    handler.wfile.write(b"data: [DONE]\n\n")
                    handler.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    fixture.disconnected.set()

            def log_message(self, *_args):
                pass

        self.model = ThreadingHTTPServer(("127.0.0.1", 0), ModelHandler)
        threading.Thread(target=self.model.serve_forever, daemon=True).start()
        self.addCleanup(self.model.server_close)
        self.addCleanup(self.model.shutdown)

    def tearDown(self):
        self.assertEqual(self.errors, [])

    def open_notes(self, configured=True):
        if configured:
            self.context.request.post(self.server.url + "/api/config", data={
                "api_base": f"http://127.0.0.1:{self.model.server_port}/v1",
                "api_key": "test-only", "model": "fixture", "timeout": 10,
            })
        self.page.goto(self.server.url, wait_until="networkidle")
        if self.page.locator("#btn-chat-toggle").get_attribute("aria-expanded") == "false":
            self.page.locator("#btn-chat-toggle").click()
        self.page.locator("#tab-notes").click()
        expect(self.page.locator("#notes-content")).to_have_value("我的原有笔记")

    def test_layout_insets_and_send_button_on_desktop_and_mobile(self):
        self.open_notes(configured=False)
        for width in (1440, 725, 390):
            self.page.set_viewport_size({"width": width, "height": 1000})
            if self.page.locator("#btn-chat-toggle").get_attribute("aria-expanded") == "false":
                self.page.locator("#btn-chat-toggle").click()
            expect(self.page.locator(".notes-ai label")).to_have_text("让 AI 帮写点什么")
            self.page.locator("#notes-content").element_handle().wait_for_element_state("stable")
            area = self.page.locator("#notes-layout").bounding_box()
            editor = self.page.locator("#notes-content").bounding_box()
            self.assertGreaterEqual(editor["x"] - area["x"], 16)
            self.assertGreaterEqual(area["x"] + area["width"] - editor["x"] - editor["width"], 16)
            box = self.page.locator("#notes-composer").bounding_box()
            send = self.page.locator("#btn-notes-draft").bounding_box()
            self.assertLess(send["x"] + send["width"], box["x"] + box["width"])
            expect(self.page.get_by_role("button", name="发送笔记请求")).to_be_disabled()
            self.assertTrue(self.page.locator("#notes-layout").evaluate("el => el.scrollWidth <= el.clientWidth"))
            if width == 725:
                artifacts = ROOT / ".uitest/notes-composer"
                artifacts.mkdir(parents=True, exist_ok=True)
                self.page.screenshot(path=str(artifacts / "layout.png"))

    def test_stop_closes_model_stream_retains_partial_and_retry_can_save(self):
        self.mode = "slow"
        self.open_notes()
        instruction = self.page.locator("#notes-instruction")
        instruction.fill("整理这段的重点")
        self.page.get_by_role("button", name="发送笔记请求").click()
        expect(self.page.get_by_role("button", name="停止生成")).to_be_enabled()
        expect(self.page.locator("#notes-draft-body")).to_contain_text("已收到的片段")
        self.page.get_by_role("button", name="停止生成").click()
        expect(self.page.locator("#notes-generation-status")).to_have_text("已停止生成")
        expect(self.page.locator("#notes-draft-body")).to_contain_text("已收到的片段")
        expect(self.page.locator("#notes-content")).to_have_value("我的原有笔记")
        expect(instruction).to_have_value("整理这段的重点")
        self.assertTrue(self.disconnected.wait(3), "停止操作没有释放上游流连接")
        self.mode = "normal"
        instruction.press("Control+Enter")
        expect(self.page.locator("#notes-generation-status")).to_contain_text("已生成")
        expect(self.page.locator("#notes-draft-body")).to_contain_text("按相关性加权")
        expect(self.page.locator("#notes-content")).to_have_value("我的原有笔记")
        self.page.locator("#btn-notes-draft-apply").click()
        expect(self.page.locator("#notes-content")).to_have_value("我的原有笔记\n\n---\n\n## 新草稿\n\n按相关性加权。")
        saved = self.context.request.get(f"{self.server.url}/api/notes?doc_id={self.doc_id}").json()
        self.assertIn("按相关性加权", saved["content"])

    def test_stream_error_preserves_notes_and_restores_send(self):
        self.mode = "error"
        self.open_notes()
        self.page.locator("#notes-instruction").fill("测试错误恢复")
        self.page.get_by_role("button", name="发送笔记请求").click()
        expect(self.page.locator("#notes-generation-status")).to_contain_text("生成错误")
        expect(self.page.get_by_role("button", name="发送笔记请求")).to_be_enabled()
        expect(self.page.locator("#notes-draft-body")).to_contain_text("已收到的片段")
        expect(self.page.locator("#notes-content")).to_have_value("我的原有笔记")
