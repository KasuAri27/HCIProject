"""用户页与本地档案回归测试。"""

import unittest

from test_phase2 import BaseTest


class ProfileTests(BaseTest):
    def test_profile_roundtrip(self):
        empty = self.client.get("/api/profile").get_json()
        self.assertEqual(empty["profile"]["display_name"], "")

        saved = self.client.post(
            "/api/profile",
            json={"display_name": "小林", "goal": "读完机器学习课件"},
        )
        self.assertEqual(saved.status_code, 200)
        profile = self.client.get("/api/profile").get_json()["profile"]
        self.assertEqual(profile["display_name"], "小林")
        self.assertEqual(profile["goal"], "读完机器学习课件")

    def test_profile_rejects_overlong_fields(self):
        response = self.client.post(
            "/api/profile", json={"display_name": "x" * 41, "goal": ""}
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            "/api/profile", json={"display_name": "", "goal": "x" * 201}
        )
        self.assertEqual(response.status_code, 400)


class UserPageTests(BaseTest):
    def test_user_page_renders_services_and_profile(self):
        response = self.client.get("/user")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("读者档案", html)
        self.assertIn('id="service-list"', html)
        self.assertIn('id="profile-form"', html)
        self.assertIn('id="custom-form"', html)
        self.assertIn("/api-config", html)


if __name__ == "__main__":
    unittest.main()
