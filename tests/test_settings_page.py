"""设置页回归测试。"""

import unittest

from test_phase2 import BaseTest


class SettingsPageTests(BaseTest):
    def test_settings_page_renders_controls(self):
        response = self.client.get("/settings")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("工作台设置", html)
        for element_id in (
            "reading-preview",
            "btn-font-dec",
            "btn-font-inc",
            "line-height-group",
            "btn-reset-learning",
            "btn-reading-reset",
            "btn-rescan-library",
        ):
            self.assertIn(f'id="{element_id}"', html, element_id)
        self.assertIn("快捷键", html)
        self.assertIn("回到阅读台", html)


if __name__ == "__main__":
    unittest.main()
