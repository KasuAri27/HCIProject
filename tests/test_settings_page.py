"""设置页回归测试。"""

import unittest

from test_phase2 import BaseTest


class SettingsPageTests(BaseTest):
    def test_settings_page_redirects_and_modal_controls_exist(self):
        response = self.client.get("/settings")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/?panel=settings", response.headers["Location"])
        html = self.client.get("/").get_data(as_text=True)
        for element_id in (
            "settings-modal",
            "settings-tab-settings",
            "modal-reading-sample",
            "modal-font-dec",
            "modal-font-inc",
            "modal-line-height",
            "modal-reset",
            "modal-rescan",
        ):
            self.assertIn(f'id="{element_id}"', html, element_id)


if __name__ == "__main__":
    unittest.main()
