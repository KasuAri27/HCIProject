"""四栏比例与真实分隔线拖动回归，使用隔离资料库。"""

import unittest

from playwright.sync_api import expect, sync_playwright

from scripts.ci_support import LiveServer


class WorkspaceWidthTests(unittest.TestCase):
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
        self.context = self.browser.new_context(viewport={"width": 1600, "height": 1000})
        self.addCleanup(self.context.close)
        self.context.route("**/favicon.ico", lambda route: route.fulfill(status=204))
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.goto(self.server.url, wait_until="networkidle")

    def tearDown(self):
        self.assertEqual(self.errors, [])

    def widths(self):
        return [self.page.locator(selector).bounding_box()["width"] for selector in
                ("#rail-left", "#reading", "#notes-rail", "#rail-right")]

    def drag(self, selector, delta):
        box = self.page.locator(selector).bounding_box()
        x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        self.page.mouse.move(x, y)
        self.page.mouse.down()
        self.page.mouse.move(x + delta, y, steps=8)
        self.page.mouse.up()
        expect(self.page.locator("body")).not_to_have_class("is-resizing")

    def test_default_proportions_and_ai_only_takes_note_space(self):
        course, source, notes, chat = self.widths()
        self.assertGreaterEqual(course / 1600, 0.15)
        self.assertLessEqual(course / 1600, 0.20)
        self.assertAlmostEqual(source / 1600, 0.50, delta=0.005)
        self.assertAlmostEqual(notes + chat, 1600 - course - source - 3, delta=1)
        self.page.locator("#btn-close-chat").click()
        expect(self.page.locator("#rail-right")).to_be_hidden()
        self.assertAlmostEqual(self.page.locator("#reading").bounding_box()["width"], source, delta=1)
        self.assertAlmostEqual(self.page.locator("#notes-rail").bounding_box()["width"], notes + chat + 1, delta=1)
        self.page.locator("#btn-chat-toggle").click()
        self.page.wait_for_function("document.querySelector('#rail-right').getAnimations().length === 0")
        self.assertAlmostEqual(self.widths()[3], chat, delta=1)

    def test_all_three_dividers_drag_adjacent_panels_and_survive_reload(self):
        before = self.widths()
        self.drag("#gutter-left", 40)
        after = self.widths()
        self.assertAlmostEqual(after[0] - before[0], 40, delta=1)
        self.assertAlmostEqual(after[1] - before[1], -40, delta=1)
        self.assertAlmostEqual(after[2], before[2], delta=1)
        self.drag("#gutter-source", -80)
        next_widths = self.widths()
        self.assertAlmostEqual(next_widths[1] - after[1], -80, delta=1)
        self.assertAlmostEqual(next_widths[2] - after[2], 80, delta=1)
        self.assertAlmostEqual(next_widths[3], after[3], delta=1)
        self.drag("#gutter-right", -50)
        saved = self.widths()
        self.assertAlmostEqual(saved[3] - next_widths[3], 50, delta=1)
        self.assertAlmostEqual(saved[2] - next_widths[2], -50, delta=1)
        self.assertAlmostEqual(saved[1], next_widths[1], delta=1)
        self.page.reload(wait_until="networkidle")
        for actual, expected in zip(self.widths(), saved):
            self.assertAlmostEqual(actual, expected, delta=1)

    def test_keyboard_adjustment_bounds_and_responsive_fit(self):
        before = self.widths()[1]
        self.page.locator("#gutter-source").press("ArrowLeft")
        self.assertAlmostEqual(self.widths()[1], before - 16, delta=1)
        self.drag("#gutter-left", 1000)
        self.assertAlmostEqual(self.widths()[0], 1600 * 0.20, delta=1)
        self.drag("#gutter-source", 1000)
        self.assertGreaterEqual(self.widths()[2], 149)
        for width in (1280, 1100, 725, 390):
            self.page.set_viewport_size({"width": width, "height": 900})
            # 浏览器异步分发 resize；等待分隔线边界更新后再核对最终布局。
            expect(self.page.locator("#gutter-left")).to_have_attribute("aria-valuemax", str(round(width * 0.20)))
            if width <= 1000:
                expect(self.page.locator("#gutter-source")).to_be_hidden()
                before = self.page.locator("#rail-right").bounding_box()["width"]
                self.page.locator("#gutter-right").press("ArrowRight")
                self.assertLess(self.page.locator("#rail-right").bounding_box()["width"], before)
            self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"),
                self.page.evaluate("""() => ({width: innerWidth, total: document.documentElement.scrollWidth,
                    panels: [...document.querySelectorAll('#reading,#notes-rail,#rail-right')].map(e =>
                        ({id:e.id, width:e.getBoundingClientRect().width})),
                    overflow: [...document.querySelectorAll('body *')].filter(e =>
                        e.getBoundingClientRect().right > innerWidth + 1).map(e => e.id || e.className).slice(0,12)})"""))
            expect(self.page.locator("#pane-notes")).to_be_visible()

    def test_chat_slides_from_right_preserving_input_focus_and_reader(self):
        for width in (1600, 725):
            self.page.set_viewport_size({"width": width, "height": 900})
            expect(self.page.locator("#gutter-left")).to_have_attribute("aria-valuemax", str(round(width * 0.20)))
            rail = self.page.locator("#rail-right")
            editor = self.page.locator("#chat-input")
            editor.fill("尚未发送的内容")
            before = self.page.locator("#notes-rail").bounding_box()["width"]
            source = self.page.locator("#reading").bounding_box()
            self.page.locator("#btn-close-chat").click()
            # 检查真实运行中的位移动画，避免只有状态改变、面板直接消失。
            moving = rail.evaluate("el => el.getAnimations().some(a => a.transitionProperty === 'transform')")
            self.assertTrue(moving)
            expect(self.page.locator("#btn-chat-toggle")).to_be_focused()
            expect(rail).to_have_attribute("inert", "")
            expect(rail).to_be_hidden()
            self.assertGreater(self.page.locator("#notes-rail").bounding_box()["width"], before)
            if source:
                self.assertAlmostEqual(self.page.locator("#reading").bounding_box()["width"], source["width"], delta=1)
            self.page.locator("#btn-chat-toggle").click()
            self.page.wait_for_function("document.querySelector('#rail-right').getAnimations().length === 0")
            expect(editor).to_have_value("尚未发送的内容")
            self.assertFalse(rail.evaluate("el => el.inert"))
            self.page.wait_for_function("document.querySelector('#workbench').getAnimations().length === 0")
            self.assertAlmostEqual(self.page.locator("#notes-rail").bounding_box()["width"], before, delta=1)
            self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))

    def test_rapid_toggle_and_reduced_motion_finish_in_correct_state(self):
        toggle = self.page.locator("#btn-chat-toggle")
        for _ in range(4):
            toggle.click()
        self.page.wait_for_function("document.querySelector('#rail-right').getAnimations().length === 0")
        expect(toggle).to_have_attribute("aria-expanded", "true")
        expect(self.page.locator("#pane-chat")).to_be_visible()
        self.page.emulate_media(reduced_motion="reduce")
        toggle.click()
        expect(self.page.locator("#rail-right")).to_be_hidden()
        self.assertEqual(self.page.locator("#rail-right").evaluate("el => el.getAnimations().length"), 0)
        toggle.click()
        expect(self.page.locator("#pane-chat")).to_be_visible()
        self.assertEqual(self.page.locator("#rail-right").evaluate("el => el.getAnimations().length"), 0)
