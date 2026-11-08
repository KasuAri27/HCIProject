"""真实 PDF 手势与提问建议流程；模型仅在 HTTP 服务边界模拟。"""

import io
import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright
from reportlab.pdfgen import canvas

from scripts.ci_support import LiveServer, ROOT


class ReaderAgentTests(unittest.TestCase):
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
        self.context = self.browser.new_context(viewport={"width": 1007, "height": 956})
        self.addCleanup(self.context.close)
        self.context.route("**/favicon.ico", lambda route: route.fulfill(status=204))
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.goto(self.server.url, wait_until="networkidle")

    def tearDown(self):
        self.assertEqual(self.errors, [])

    def upload_and_open(self, name, content):
        response = self.context.request.post(self.server.url + "/api/import", multipart={
            "file": {"name": name, "mimeType": "application/octet-stream", "buffer": content},
        })
        self.assertTrue(response.ok)
        doc_id = response.json()["document_id"]
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            data = self.context.request.get(f"{self.server.url}/api/documents/{doc_id}").json()
            if data["status"] == "ready":
                break
            self.assertNotEqual(data["status"], "failed", data)
            time.sleep(0.05)
        else:
            self.fail("后台解析未完成")
        self.context.request.post(f"{self.server.url}/api/documents/{doc_id}/open")
        self.page.reload(wait_until="networkidle")
        return doc_id

    def test_default_suggestions_and_centered_sidebar_icon(self):
        suggestions = self.page.locator(".chat-suggestion")
        expect(suggestions).to_have_count(3)
        expect(self.page.locator("#chat-messages")).to_be_empty()
        expect(self.page.locator("#chat-input")).to_have_attribute("placeholder", "有疑惑？")
        for width in (1007, 1440, 390):
            self.page.set_viewport_size({"width": width, "height": 956})
            button = self.page.locator("#btn-chat-toggle").bounding_box()
            icon = self.page.locator("#btn-chat-toggle svg").bounding_box()
            self.assertAlmostEqual(button["x"] + button["width"] / 2, icon["x"] + icon["width"] / 2, delta=0.6)
            self.assertAlmostEqual(button["y"] + button["height"] / 2, icon["y"] + icon["height"] / 2, delta=0.6)

    def test_pdf_fits_resizes_zooms_and_shows_transient_page_number(self):
        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer)
        for page in range(1, 4):
            pdf.drawString(72, 720, f"Reading gesture fixture page {page}")
            pdf.showPage()
        pdf.save()
        self.upload_and_open("gesture.pdf", buffer.getvalue())
        paper = self.page.locator(".pdfViewer .page").first
        expect(paper.locator("canvas")).to_be_visible()
        expect(self.page.locator(".pdf-toolbar, #pdf-fit")).to_have_count(0)
        reader = self.page.locator("#pdf-viewer-container")
        initial = paper.bounding_box()["width"]
        self.assertLess(initial, reader.bounding_box()["width"])
        paper.click(position={"x": 150, "y": 200})
        self.page.wait_for_function("(width) => document.querySelector('.pdfViewer .page').getBoundingClientRect().width > width", arg=initial)
        larger = paper.bounding_box()["width"]
        paper.click(position={"x": 150, "y": 200}, button="right")
        self.page.wait_for_function("(width) => document.querySelector('.pdfViewer .page').getBoundingClientRect().width < width", arg=larger)
        self.page.locator("#btn-chat-toggle").click()
        self.page.wait_for_function("(width) => document.querySelector('.pdfViewer .page').getBoundingClientRect().width > width", arg=initial + 100)
        reader.evaluate("el => el.scrollTop = el.querySelectorAll('.page')[1].offsetTop")
        badge = self.page.locator("#pdf-page-status")
        expect(badge).to_be_visible()
        expect(badge).to_have_text("2 / 3")
        expect(badge).to_be_hidden(timeout=3000)
        reader.focus()
        reader.press("+")
        reader.press("0")
        self.page.locator("#btn-chat-toggle").click()
        artifacts = ROOT / ".uitest/agent-ui"
        artifacts.mkdir(parents=True, exist_ok=True)
        self.page.screenshot(path=str(artifacts / "reader.png"))

    def test_model_context_suggestions_send_once_and_refresh_after_reply(self):
        calls = []

        class ModelHandler(BaseHTTPRequestHandler):
            def do_POST(handler):
                request = json.loads(handler.rfile.read(int(handler.headers["Content-Length"])))
                calls.append(request)
                is_suggestion = '"suggestions"' in request["messages"][0]["content"]
                if is_suggestion:
                    followup = "assistant:" in request["messages"][-1]["content"]
                    reply = json.dumps({"suggestions": [
                        "再解释一下归一化" if followup else "查询向量决定什么？",
                        "给出一个计算例子", "出一道注意力练习题",
                    ]})
                else:
                    # 延迟用于验证连续点击不会重复发送。
                    time.sleep(0.3)
                    reply = "查询向量决定当前关注的内容。"
                body = json.dumps({"choices": [{"message": {"content": reply}}]}).encode()
                handler.send_response(200)
                handler.send_header("Content-Type", "application/json")
                handler.send_header("Content-Length", str(len(body)))
                handler.end_headers()
                handler.wfile.write(body)

            def log_message(self, *_args):
                pass

        model = ThreadingHTTPServer(("127.0.0.1", 0), ModelHandler)
        thread = threading.Thread(target=model.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(model.server_close)
        self.addCleanup(model.shutdown)
        configured = self.context.request.post(self.server.url + "/api/config", data={
            "api_base": f"http://127.0.0.1:{model.server_port}/v1",
            "api_key": "test-only", "model": "fixture", "timeout": 10,
        })
        self.assertTrue(configured.ok)
        doc_id = self.upload_and_open("attention.md", "# 注意力\n\n查询向量决定关注点。".encode())
        suggestion = self.page.get_by_role("button", name="查询向量决定什么？", exact=True)
        expect(suggestion).to_be_visible(timeout=10000)
        expect(self.page.locator(".chat-suggestion svg")).to_have_count(3)
        suggestion.click()
        expect(self.page.locator(".chat-suggestion").first).to_be_disabled()
        expect(self.page.locator("#chat-messages")).to_contain_text("查询向量决定当前关注的内容")
        expect(self.page.get_by_role("button", name="再解释一下归一化", exact=True)).to_be_visible(timeout=10000)
        history = self.context.request.get(f"{self.server.url}/api/chat?doc_id={doc_id}").json()["messages"]
        self.assertEqual([m["content"] for m in history if m["role"] == "user"], ["查询向量决定什么？"])
        suggestion_calls = [c for c in calls if '"suggestions"' in c["messages"][0]["content"]]
        self.assertGreaterEqual(len(suggestion_calls), 2)
        self.assertIn("查询向量决定关注点", suggestion_calls[0]["messages"][1]["content"])
        self.assertIn("assistant:", suggestion_calls[-1]["messages"][1]["content"])
