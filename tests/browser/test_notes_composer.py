"""独立笔记编辑区回归。旧草稿流接口另由 test_notes_stream 验证。"""

import time
import unittest

from playwright.sync_api import expect, sync_playwright
from scripts.ci_support import LiveServer


class NotesWorkspaceTests(unittest.TestCase):
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
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 900})
        self.addCleanup(self.context.close)
        self.context.route("**/favicon.ico", lambda route: route.fulfill(status=204))
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        response = self.context.request.post(self.server.url + "/api/import", multipart={
            "file": {"name": "notes.md", "mimeType": "text/markdown", "buffer": "# 笔记资料\n\n用于检查独立笔记编辑区。".encode()},
        })
        self.doc_id = response.json()["document_id"]
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if self.context.request.get(f"{self.server.url}/api/documents/{self.doc_id}").json()["status"] == "ready":
                break
            time.sleep(0.05)
        else:
            self.fail("测试资料没有解析完成")
        self.context.request.post(f"{self.server.url}/api/documents/{self.doc_id}/open")
        self.context.request.put(self.server.url + "/api/notes", data={"doc_id": self.doc_id, "content": "我的原有笔记"})
        self.page.goto(self.server.url, wait_until="networkidle")
        expect(self.page.locator("#notes-content")).to_have_value("我的原有笔记")

    def tearDown(self):
        self.assertEqual(self.errors, [])

    def test_notes_stay_visible_when_ai_expands_on_desktop_and_phone(self):
        expect(self.page.locator("#tab-exercise, #pane-exercise, .notes-ai, .suggest")).to_have_count(0)
        for width in (1440, 725, 390):
            self.page.set_viewport_size({"width": width, "height": 900})
            if self.page.locator("#pane-chat").is_visible():
                self.page.locator("#btn-chat-toggle").click()
            self.page.wait_for_function("document.querySelector('#workbench').getAnimations().length === 0")
            before = self.page.locator("#notes-rail").bounding_box()["width"]
            self.page.locator("#btn-chat-toggle").click()
            expect(self.page.locator("#pane-chat")).to_be_visible()
            expect(self.page.locator("#pane-notes")).to_be_visible()
            self.page.wait_for_function("document.querySelector('#workbench').getAnimations().length === 0")
            self.assertLess(self.page.locator("#notes-rail").bounding_box()["width"], before)
            expect(self.page.locator("#notes-content")).to_have_value("我的原有笔记")
            self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def test_save_undo_and_reload_keep_the_document_note(self):
        editor = self.page.locator("#notes-content")
        editor.fill("新的笔记内容")
        with self.page.expect_response(lambda r: r.url.endswith("/api/notes") and r.request.method == "PUT"):
            self.page.locator("#btn-notes-save").click()
        expect(self.page.locator("#btn-notes-undo")).to_be_enabled()
        self.page.locator("#btn-notes-undo").click()
        expect(editor).to_have_value("我的原有笔记")
        expect(self.page.locator("#notes-save-status")).to_contain_text("已保存")
        self.page.reload(wait_until="networkidle")
        expect(editor).to_have_value("我的原有笔记")

    def test_export_downloads_the_current_note(self):
        with self.page.expect_download() as download:
            self.page.locator("#btn-notes-export").click()
        with open(download.value.path(), encoding="utf-8") as exported:
            self.assertIn("我的原有笔记", exported.read())
