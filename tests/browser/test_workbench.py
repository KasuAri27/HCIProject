"""浏览器门禁：真实 HTTP/导入/存储；AI 响应仅在传输边界模拟。"""

import io
import os
from pathlib import Path
import re
import time
import unittest
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from reportlab.pdfgen import canvas

from scripts.ci_support import LiveServer, ROOT


class WorkbenchBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        try:
            cls.browser = cls.playwright.chromium.launch(headless=True, channel="chromium")
        except Exception:
            cls.playwright.stop()
            raise

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.server = LiveServer()
        self.addCleanup(self.server.close)
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 1000})
        self.addCleanup(self.context.close)
        self.context.tracing.start(screenshots=True, snapshots=True, sources=True)
        self.addCleanup(self.save_trace)
        self.errors = []
        self.expected_failures = set()
        self.expected_pdf_cancellations = set()
        self.page = self.context.new_page()
        self.page.on("pageerror", lambda error: self.errors.append(f"pageerror: {error}"))
        self.page.on("console", self.console_message)
        self.page.on("response", self.response)
        self.page.on("requestfailed", self.request_failed)
        self.context.route("**/*", self.only_local_requests)
        self.context.route("**/favicon.ico", lambda route: route.fulfill(status=204))
        self.page.goto(self.server.url, wait_until="networkidle")
        self.assertEqual(self.errors, [], "启动阶段出现浏览器错误")
        expect(self.page.locator("#library-tree")).not_to_contain_text("正在扫描")

    def only_local_requests(self, route):
        url = route.request.url
        if url.startswith(self.server.url + "/") or urlparse(url).scheme in {"data", "about", "chrome", "chrome-extension"}:
            route.continue_()
        else:
            self.errors.append(f"未预期外部请求: {url}")
            route.abort()

    def console_message(self, message):
        if message.type != "error":
            return
        path = urlparse(message.location.get("url", "")).path
        if message.text.startswith("Failed to load resource:") and any(
            path == expected_path for expected_path, _ in self.expected_failures
        ):
            return
        self.errors.append(f"console.error: {message.text}")

    def response(self, response):
        path = urlparse(response.url).path
        if response.status >= 400 and (path, response.status) not in self.expected_failures:
            self.errors.append(f"HTTP {response.status}: {path}")

    def request_failed(self, request):
        # PDF.js 可取消该文档的初始整文件请求；实际画布和 PDF 字节仍须验收。
        if request.failure == "net::ERR_ABORTED" and urlparse(request.url).path in self.expected_pdf_cancellations:
            return
        self.errors.append(f"requestfailed: {request.url} {request.failure}")

    def save_trace(self):
        artifacts = Path(os.environ.get("HCI_TEST_ARTIFACTS", ROOT / ".uitest/browser"))
        artifacts.mkdir(parents=True, exist_ok=True)
        self.context.tracing.stop(path=str(artifacts / f"{self._testMethodName}.zip"))

    def tearDown(self):
        self.assertEqual(self.errors, [], "浏览器出现未预期错误")

    def upload(self, name, content):
        with self.page.expect_response(lambda r: r.url.endswith("/api/import") and r.request.method == "POST") as response:
            self.page.locator("#import-input").set_input_files({
                "name": name, "mimeType": "application/octet-stream", "buffer": content,
            })
        self.assertTrue(response.value.ok, response.value.text())
        doc_id = response.value.json()["document_id"]
        if name.lower().endswith(".pdf"):
            self.expected_pdf_cancellations.add(f"/api/documents/{doc_id}/pdf")
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            data = self.context.request.get(f"{self.server.url}/api/documents/{doc_id}").json()
            if data["status"] == "ready":
                break
            self.assertNotEqual(data["status"], "failed", data)
            self.page.wait_for_timeout(75)
        else:
            self.fail("真实后台导入超时")
        expect(self.page.locator(f'.file[data-doc-id="{doc_id}"]')).to_be_attached()
        self.open_document(doc_id)
        return doc_id

    def open_document(self, doc_id):
        row = self.page.locator(f'.file[data-doc-id="{doc_id}"]')
        if "rail-left-open" not in (self.page.locator("body").get_attribute("class") or "").split():
            self.page.locator("#btn-rail-toggle").click()
        row.click()
        expect(self.page.locator("#topbar-crumb")).to_be_attached()
        if "rail-left-open" in (self.page.locator("body").get_attribute("class") or "").split():
            self.page.locator("#btn-rail-toggle").click()
        expect(self.page.locator(f'.file[data-doc-id="{doc_id}"]')).to_have_class("file is-active")

    def test_no_api_startup_and_secondary_pages(self):
        expect(self.page.locator(".chat-suggestion")).to_have_count(3)
        expect(self.page.locator("#btn-chat-send")).to_be_disabled()
        self.assertEqual(self.context.request.get(self.server.url + "/api/health").json()["app"], "local-learning-assistant")
        # 独立工作台页面存在于后续功能分支；main 基线的阅读器仍用设置弹窗。
        paths = ("/user", "/settings", "/api-config")
        for path in paths:
            self.page.goto(self.server.url + path, wait_until="networkidle")
            expect(self.page.locator("body")).to_be_visible()
        self.page.goto(self.server.url, wait_until="networkidle")
        expect(self.page.locator("#import-input")).to_be_enabled()

    def test_import_notes_refresh_and_document_isolation(self):
        first = self.upload("first.md", "# 第一份资料\n\n注意力按权重聚合。".encode())
        expect(self.page.locator("#doc-body")).to_be_visible()
        expect(self.page.locator("#doc-body")).to_contain_text("注意力按权重聚合")
        self.page.locator("#tab-notes").click()
        self.page.locator("#notes-content").fill("只属于第一份资料的笔记")
        self.page.locator("#btn-notes-save").click()
        expect(self.page.locator("#notes-save-status")).to_contain_text("已保存")
        self.page.reload(wait_until="networkidle")
        self.page.locator("#tab-notes").click()
        expect(self.page.locator("#notes-content")).to_have_value("只属于第一份资料的笔记")
        second = self.upload("second.txt", "另一份资料的正文".encode())
        self.assertNotEqual(first, second)
        self.page.locator("#tab-notes").click()
        expect(self.page.locator("#notes-content")).to_have_value("")
        self.open_document(first)
        expect(self.page.locator("#notes-content")).to_have_value("只属于第一份资料的笔记")

    def test_markdown_position_survives_refresh(self):
        text = "# 长资料\n\n" + "\n\n".join(f"第 {i} 段：用于验证阅读位置保存和恢复。" * 4 for i in range(80))
        self.upload("long.md", text.encode())
        expect(self.page.locator("#doc-body")).to_contain_text("第 79 段")
        # 等待初始化恢复完成，以真实 scroll 事件触发保存。
        self.page.wait_for_timeout(600)
        with self.page.expect_response(lambda r: "/position" in r.url and r.request.method == "POST"):
            self.page.locator("#doc-scroll").evaluate("el => { el.scrollTop = el.scrollHeight / 2; }")
        self.page.reload(wait_until="networkidle")
        expect(self.page.locator("#doc-body")).to_contain_text("第 79 段")
        self.page.wait_for_function("document.getElementById('doc-scroll').scrollTop > 100")

    def test_pdf_uses_real_http_resource(self):
        pdf = io.BytesIO()
        document = canvas.Canvas(pdf)
        document.drawString(72, 720, "CI PDF playback fixture")
        document.save()
        doc_id = self.upload("sample.pdf", pdf.getvalue())
        expect(self.page.locator("#pdf-view")).to_be_visible()
        expect(self.page.locator("#pdf-viewer canvas").first).to_be_visible()
        document_data = self.context.request.get(f"{self.server.url}/api/documents/{doc_id}").json()
        response = self.context.request.get(self.server.url + document_data["pdf_url"])
        self.assertEqual(response.status, 200)
        self.assertIn("application/pdf", response.headers["content-type"])
        self.assertTrue(response.body().startswith(b"%PDF"))

    def test_narrow_window_keeps_reading_area_usable(self):
        self.page.set_viewport_size({"width": 800, "height": 900})
        self.upload("narrow.md", "# 窄窗口资料\n\n正文不能被侧栏挤成零宽。".encode())
        body = self.page.locator("#doc-body")
        expect(body).to_be_visible()
        box = body.bounding_box()
        self.assertIsNotNone(box)
        self.assertGreater(box["width"], 200)
        self.assertGreater(box["height"], 20)

    def configure_ai(self):
        self.page.route("**/api/chat/suggestions", lambda route: route.fulfill(json={"suggestions": ["问题一", "问题二", "问题三"], "source": "default"}))
        # 隔离 AI 传输边界，禁止真实模型联网。
        self.page.route("**/api/notes/suggest", lambda route: route.fulfill(json={"suggestions": []}))
        response = self.context.request.post(self.server.url + "/api/config", data={
            "api_base": "http://127.0.0.1:1", "api_key": "ci-fixture", "model": "fixture",
        })
        self.assertTrue(response.ok, response.text())
        self.page.reload(wait_until="networkidle")
        expect(self.page.locator("#btn-chat-send")).to_be_enabled()

    def test_citation_click_returns_to_source_block(self):
        doc_id = self.upload("cite.md", "# 来源\n\n引用必须能核对到原文。".encode())
        content = self.context.request.get(f"{self.server.url}/api/documents/{doc_id}").json()
        block_id = content["blocks"][-1]["id"]
        self.configure_ai()
        self.page.route("**/api/chat", lambda route: route.fulfill(json={"messages": [
            {"role": "assistant", "content": f"依据原文 [cite:{block_id}]"},
        ]}))
        self.page.locator("#chat-input").fill("这段是什么意思")
        self.page.locator("#btn-chat-send").click()
        cite = self.page.locator("#chat-messages a.cite")
        expect(cite).to_be_visible()
        cite.click()
        expect(self.page.locator(f'.doc-block[data-block-id="{block_id}"]')).to_have_class(re.compile(r"\bcite-flash\b"))

    def test_ai_failure_keeps_reading_and_notes_available(self):
        self.upload("offline.md", "# 离线阅读\n\nAI 失败也不能阻塞这段正文。".encode())
        self.configure_ai()
        self.expected_failures.add(("/api/chat", 502))
        self.page.route("**/api/chat", lambda route: route.fulfill(status=502, json={"error": "CI 模拟服务不可用"}))
        self.page.locator("#chat-input").fill("问一个问题")
        self.page.locator("#btn-chat-send").click()
        expect(self.page.locator("#toast")).to_contain_text("CI 模拟服务不可用")
        expect(self.page.locator("#doc-body")).to_contain_text("AI 失败也不能阻塞")
        self.page.locator("#tab-notes").click()
        self.page.locator("#notes-content").fill("失败后仍然能保存")
        self.page.locator("#btn-notes-save").click()
        expect(self.page.locator("#notes-save-status")).to_contain_text("已保存")

