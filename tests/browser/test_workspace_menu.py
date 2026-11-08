"""头像菜单、设置复用与侧栏状态的真实浏览器回归。"""

import unittest

from playwright.sync_api import expect, sync_playwright

from scripts.ci_support import LiveServer, ROOT


class WorkspaceMenuTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = LiveServer()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True, channel="chromium")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 960})
        self.addCleanup(self.context.close)
        # 应用未提供站点图标；只隔离浏览器自动请求，不忽略应用错误。
        self.context.route("**/favicon.ico", lambda route: route.fulfill(status=204))
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.on("console", lambda msg: self.errors.append(f"{msg.location}: {msg.text}") if msg.type == "error" else None)
        self.page.goto(self.server.url, wait_until="networkidle")

    def tearDown(self):
        self.assertEqual(self.errors, [])

    def open_settings(self, section="reading"):
        if not self.page.locator("#workspace-settings").is_visible():
            self.page.locator("#btn-avatar").click()
        self.page.locator(f'.workspace-settings-nav [data-settings-section="{section}"]').click()
        expect(self.page.locator("#workspace-settings")).to_be_visible()
        expect(self.page.locator(f"#settings-{section}")).to_be_visible()

    def test_dialog_keyboard_navigation_focus_trap_and_dismissal(self):
        avatar = self.page.locator("#btn-avatar")
        avatar.focus()
        avatar.press("Enter")
        expect(self.page.locator("#settings-user-title")).to_be_focused()
        reading = self.page.locator('.workspace-settings-nav [data-settings-section="reading"]')
        reading.focus()
        reading.press("ArrowDown")
        expect(self.page.locator("#settings-data")).to_be_visible()
        self.page.keyboard.press("?")
        expect(self.page.locator("#help-modal")).to_be_hidden()
        self.page.keyboard.press("Tab")
        self.assertTrue(self.page.locator("#workspace-settings").evaluate("el => el.contains(document.activeElement)"))
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#workspace-settings")).not_to_be_visible()
        expect(avatar).to_be_focused()
        expect(avatar).to_have_attribute("aria-expanded", "false")
        avatar.click()
        self.page.locator("body").click(position={"x": 5, "y": 5})
        expect(avatar).to_have_attribute("aria-expanded", "false")

    def test_reading_settings_apply_immediately_and_survive_reload(self):
        self.open_settings()
        self.page.locator("#btn-font-inc").click()
        self.page.get_by_role("button", name="宽松", exact=True).click()
        expect(self.page.locator("#font-size-value")).to_have_text("18 px")
        self.assertEqual(self.page.locator("html").evaluate(
            "el => el.style.getPropertyValue('--read-font-size')"), "18px")
        self.assertEqual(self.page.locator("html").evaluate(
            "el => el.style.getPropertyValue('--read-line-height')"), "2.1")
        self.page.keyboard.press("Escape")
        self.page.reload(wait_until="networkidle")
        self.open_settings()
        expect(self.page.locator("#font-size-value")).to_have_text("18 px")
        self.page.locator("#btn-reading-reset").click()
        expect(self.page.locator("#font-size-value")).to_have_text("17 px")
        self.page.keyboard.press("Escape")
        self.page.goto(self.server.url + "/settings", wait_until="networkidle")
        self.page.locator("#btn-font-inc").click()
        self.page.goto(self.server.url, wait_until="networkidle")
        self.open_settings()
        expect(self.page.locator("#font-size-value")).to_have_text("18 px")

    def test_each_section_opens_directly_and_narrow_layout_fits(self):
        artifacts = ROOT / ".uitest/ui-preview"
        artifacts.mkdir(parents=True, exist_ok=True)
        for width in (1440, 1280, 390):
            self.page.set_viewport_size({"width": width, "height": 900})
            self.page.locator("#btn-avatar").click()
            self.page.screenshot(path=str(artifacts / f"dialog-{width}.png"))
            self.page.keyboard.press("Escape")
            for section in ("user", "api", "reading", "data", "shortcuts", "about"):
                self.open_settings(section)
                visible = self.page.locator(".workspace-section:visible")
                expect(visible).to_have_count(1)
                box = self.page.locator("#workspace-settings").bounding_box()
                self.assertGreaterEqual(box["x"], 0)
                self.assertLessEqual(box["x"] + box["width"], width)
                self.assertTrue(self.page.locator(".workspace-settings-content").evaluate(
                    "el => el.scrollWidth <= el.clientWidth"))
                if section == "reading":
                    self.page.screenshot(path=str(artifacts / f"settings-{width}.png"))
                self.page.keyboard.press("Escape")
        # 清空操作仍要求再次确认；关闭弹窗后撤销待确认状态。
        self.open_settings("data")
        self.page.locator("#btn-reset-learning").click()
        expect(self.page.locator("#btn-reset-learning")).to_have_text("再次点击确认清空")
        self.page.keyboard.press("Escape")
        self.open_settings("data")
        expect(self.page.locator("#btn-reset-learning")).to_have_text("清空学习记录")

    def test_sidebar_toggle_tracks_desktop_and_mobile(self):
        toggle = self.page.locator("#btn-chat-toggle")
        expect(self.page.locator("#btn-settings")).to_have_count(0)
        expect(toggle).to_have_attribute("aria-expanded", "true")
        toggle.click()
        expect(toggle).to_have_attribute("aria-label", "展开 AI 侧栏")
        expect(self.page.locator("#rail-right")).not_to_be_visible()
        toggle.click()
        expect(toggle).to_have_attribute("aria-expanded", "true")
        self.page.set_viewport_size({"width": 390, "height": 844})
        expect(toggle).to_have_attribute("aria-expanded", "false")
        toggle.click()
        expect(toggle).to_have_attribute("aria-expanded", "true")
        self.page.locator("body").click(position={"x": 5, "y": 200})
        expect(toggle).to_have_attribute("aria-expanded", "false")

    def test_profile_and_provider_forms_work_without_reloading_reader(self):
        self.page.locator("#chat-input").fill("还没有发送的问题")
        self.page.evaluate("window.modalTestToken = 'same-document'")
        self.open_settings("user")
        self.page.locator("#profile-name").fill("小林")
        self.page.locator("#profile-goal").fill("读完课件")
        with self.page.expect_response(lambda r: r.url.endswith("/api/profile") and r.request.method == "POST"):
            self.page.get_by_role("button", name="保存档案", exact=True).click()
        expect(self.page.locator("#topbar-avatar-initial")).to_have_text("小")
        self.open_settings("api")
        expect(self.page.locator("#provider-list button")).not_to_have_count(0)
        self.page.locator("#custom-name").fill("本地测试服务")
        self.page.locator("#custom-base").fill("http://127.0.0.1:1/v1")
        self.page.get_by_role("button", name="添加服务", exact=True).click()
        expect(self.page.locator("#provider-name")).to_have_text("本地测试服务")
        self.page.locator("#model-add-input").fill("test-model")
        self.page.locator("#btn-add-model").click()
        expect(self.page.locator("#model-list")).to_contain_text("test-model")
        self.page.get_by_role("button", name="设为当前", exact=True).click()
        expect(self.page.locator("#model-list")).to_contain_text("首页正在用")
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#chat-input")).to_have_value("还没有发送的问题")
        self.assertEqual(self.page.evaluate("window.modalTestToken"), "same-document")
        self.assertEqual(self.page.url, self.server.url + "/")

    def test_legacy_addresses_open_the_right_modal_section(self):
        for path, section in (("/user", "user"), ("/api-config?provider=qwen", "api"), ("/settings", "reading")):
            self.page.goto(self.server.url + path, wait_until="networkidle")
            expect(self.page.locator("#workspace-settings")).to_be_visible()
            expect(self.page.locator(f"#settings-{section}")).to_be_visible()
            self.assertIn("/?panel=", self.page.url)
            if section == "api":
                expect(self.page.locator("#provider-name")).to_have_text("通义千问")
            self.page.keyboard.press("Escape")
            self.page.wait_for_url(self.server.url + "/")
            self.assertEqual(self.page.url, self.server.url + "/")

    def test_learning_reset_clears_reader_state_and_keeps_document(self):
        with self.page.expect_response(lambda r: r.url.endswith("/api/import")) as uploaded:
            self.page.locator("#import-input").set_input_files({
                "name": "settings-reset.md", "mimeType": "text/markdown",
                "buffer": "# 设置回归资料\n\n这份资料用于隔离环境的设置验证。".encode(),
            })
        doc_id = uploaded.value.json()["document_id"]
        self.page.locator("#btn-rail-toggle").click()
        self.page.locator(f'.file[data-doc-id="{doc_id}"]').click()
        expect(self.page.locator("#doc-body")).to_contain_text("设置回归资料", timeout=20000)
        self.page.locator("#btn-rail-toggle").click()
        expect(self.page.locator("#job-strip")).to_be_hidden(timeout=10000)
        self.page.locator("#tab-notes").click()
        self.page.locator("#notes-content").fill("待清空的隔离测试笔记")
        with self.page.expect_response(lambda r: r.url.endswith("/api/notes") and r.request.method == "PUT"):
            self.page.locator("#btn-notes-save").click()
        self.open_settings("data")
        self.page.locator("#btn-reset-learning").click()
        with self.page.expect_response(lambda r: r.url.endswith("/api/reset")) as reset:
            self.page.locator("#btn-reset-learning").click()
        self.assertTrue(reset.value.ok)
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#notes-content")).to_have_value("")
        expect(self.page.locator("#btn-notes-undo")).to_be_disabled()
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.context.request.get(f"{self.server.url}/api/documents/{doc_id}").status, 200)
        data = self.context.request.get(f"{self.server.url}/api/notes?doc_id={doc_id}").json()
        self.assertEqual(data["content"], "")


if __name__ == "__main__":
    unittest.main()
