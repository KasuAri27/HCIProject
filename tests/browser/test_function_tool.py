"""函数工具从工作台入口到绘图和数值计算的回归。"""

import unittest

from playwright.sync_api import expect, sync_playwright

from scripts.ci_support import LiveServer


class FunctionToolTests(unittest.TestCase):
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
        self.page = self.browser.new_page(viewport={"width": 1440, "height": 900})
        self.addCleanup(self.page.close)
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.goto(self.server.url)
        self.page.get_by_role("link", name="学习工具").click()
        expect(self.page).to_have_url(self.server.url + "/tools")
        self.tool = self.page.locator("#function-tool")
        expect(self.tool).to_be_visible()
        self.input = self.tool.get_by_label("函数表达式")

    def tearDown(self):
        self.assertEqual(self.errors, [])

    def add(self, expression):
        self.input.fill(expression)
        self.tool.get_by_role("button", name="添加函数").click()
        expect(self.input).to_have_value("")

    def test_symbols_multiple_curves_and_editing(self):
        self.input.fill("x²")
        self.input.select_text()
        self.tool.get_by_role("button", name="平方根").click()
        expect(self.input).to_have_value("sqrt(x²)")
        self.tool.get_by_role("button", name="添加函数").click()
        self.add("1/x")
        paths = self.tool.locator("#function-plot [data-function-id]")
        expect(paths).to_have_count(2)
        # 1/x 的两个分支必须分别起笔，不能跨过 x=0 的渐近线。
        self.assertGreaterEqual(paths.nth(1).get_attribute("d").count("M"), 2)
        self.tool.get_by_role("button", name="f1(x) = sqrt(x²)").click()
        self.input.fill("f(x) = 2πx")
        self.tool.get_by_role("button", name="保存函数").click()
        expect(self.tool.get_by_role("button", name="f1(x) = 2πx")).to_be_visible()
        self.tool.get_by_label("x 最小值").fill("-π")
        self.tool.get_by_label("x 最大值").fill("π")
        self.tool.get_by_role("button", name="更新坐标").click()
        expect(self.tool.locator("#function-range-error")).to_be_hidden()
        self.tool.get_by_role("button", name="移除函数 f2").click()
        expect(paths).to_have_count(1)

    def test_integral_and_limits(self):
        self.add("x²")
        self.tool.get_by_role("button", name="计算积分").click()
        expect(self.tool.locator("#function-integral-result")).to_have_text("≈ 0.33333333")
        self.add("sin(x)/x")
        self.tool.get_by_role("button", name="计算极限").click()
        expect(self.tool.locator("#function-limit-result")).to_have_text("≈ 1")
        self.add("2sin(x)")
        self.tool.get_by_role("button", name="计算极限").click()
        expect(self.tool.locator("#function-limit-result")).to_have_text("≈ 0")
        self.add("1/x")
        self.tool.get_by_role("button", name="计算极限").click()
        expect(self.tool.locator("#function-limit-result")).to_contain_text("左右极限不同")
        expect(self.tool.locator("#function-limit-result")).to_contain_text("左侧 −∞")
        expect(self.tool.locator("#function-limit-result")).to_contain_text("右侧 +∞")
        self.tool.get_by_role("button", name="计算积分").click()
        expect(self.tool.locator("#function-integral-result")).to_contain_text("无定义值")
        self.add("sin(1/x)")
        self.tool.get_by_role("button", name="计算极限").click()
        expect(self.tool.locator("#function-limit-result")).to_contain_text("未能确认双侧极限")
        self.add("ln(x)")
        self.tool.locator("#function-limit-point").fill("∞")
        self.tool.get_by_role("button", name="计算极限").click()
        expect(self.tool.locator("#function-limit-result")).to_have_text("+∞")
        self.tool.locator("#function-limit-point").fill("0")
        self.tool.get_by_label("方向").select_option("right")
        self.tool.get_by_role("button", name="计算极限").click()
        expect(self.tool.locator("#function-limit-result")).to_have_text("−∞")

    def test_parallel_page_keeps_functions_and_draft_when_navigating(self):
        self.input.fill("window.alert(1)")
        self.tool.get_by_role("button", name="添加函数").click()
        expect(self.tool.locator("#function-editor-error")).to_be_visible()
        self.add("x")
        self.input.fill("x+")
        expect(self.page.locator("dialog")).to_have_count(0)
        self.page.get_by_role("link", name="工作台").click()
        expect(self.page).to_have_url(self.server.url + "/")
        self.page.get_by_role("link", name="学习工具").click()
        expect(self.tool.get_by_role("button", name="f1(x) = x")).to_be_visible()
        expect(self.input).to_have_value("x+")
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.assertTrue(self.page.locator("body").evaluate("el => el.scrollWidth <= el.clientWidth"))
