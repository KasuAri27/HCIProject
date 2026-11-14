"""知识星空页：从工作台进入、场景启动、键盘与课程切换、返回工作台。"""

import unittest

from playwright.sync_api import expect, sync_playwright

from scripts.ci_support import LiveServer


class KnowledgeSkyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = LiveServer()
        cls.playwright = sync_playwright().start()
        # 无显卡的 CI 机器靠软件渲染（SwiftShader）提供 WebGL，显式放行以免被新版 Chromium 拦下。
        cls.browser = cls.playwright.chromium.launch(
            headless=True, channel="chromium",
            args=["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 900})
        self.addCleanup(self.context.close)
        # 应用没有站点图标，与其他浏览器测试一样拦截浏览器自动发起的 favicon 请求，避免它混入控制台错误。
        self.context.route("**/favicon.ico", lambda route: route.fulfill(status=204))
        self.page = self.context.new_page()
        self.errors = []
        self.requests = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.on("console", lambda msg: self.errors.append(msg.text) if msg.type == "error" else None)
        self.page.on("request", lambda request: self.requests.append(request.url))
        self.page.goto(self.server.url)
        self.page.get_by_role("link", name="知识星空图").click()
        expect(self.page).to_have_url(self.server.url + "/sky")
        self.sky = self.page.locator("#knowledge-sky")
        # data-renderer 在场景完整建好后才写入，等到它出现就说明 three.js 与本地 addons 都加载成功。
        expect(self.sky).to_have_attribute("data-renderer", "three-webgl-bloom")
        self.canvas = self.sky.locator("canvas")

    def tearDown(self):
        self.assertEqual(self.errors, [])
        # 本地优先：页面运行期间不得请求任何站外资源。
        self.assertEqual([url for url in self.requests if not url.startswith(self.server.url)], [])

    def test_scene_fills_page_and_lists_courses(self):
        box = self.canvas.bounding_box()
        self.assertGreater(box["width"], 800)
        self.assertGreater(box["height"], 500)
        # 舞台占满顶栏以外的整屏，页面本身不出现滚动条。
        self.assertFalse(self.page.evaluate("document.documentElement.scrollHeight > innerHeight"))
        options = self.sky.locator("#ks-course option")
        self.assertEqual(options.all_inner_texts(), ["微积分", "线性代数", "概率论"])
        self.assertEqual(self.sky.locator(".ks-marker").count(), 24)

    def test_keyboard_focus_and_course_switch(self):
        progress = self.sky.locator(".ks-progress")
        expect(progress).to_contain_text("函数")
        self.canvas.focus()
        self.page.keyboard.press("ArrowRight")
        expect(progress).to_contain_text("极限")
        self.page.keyboard.press("Escape")
        expect(progress).to_contain_text("函数")
        self.sky.locator("#ks-course").select_option(label="线性代数")
        self.assertEqual(self.sky.locator(".ks-marker").count(), 15)
        self.assertEqual(self.sky.locator(".ks-marker[data-selected='true']").count(), 1)

    def test_back_to_workbench(self):
        self.page.get_by_role("link", name="工作台").click()
        expect(self.page).to_have_url(self.server.url + "/")
        expect(self.page.locator("#btn-knowledge-sky")).to_be_visible()

    def test_narrow_viewport_keeps_controls_in_view(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        picker = self.sky.locator("#ks-course")
        expect(picker).to_be_visible()
        box = picker.bounding_box()
        self.assertGreaterEqual(box["x"], 0)
        self.assertLessEqual(box["x"] + box["width"], 390)
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))


if __name__ == "__main__":
    unittest.main()
