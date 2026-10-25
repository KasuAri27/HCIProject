"""用户页与本地档案回归测试。"""

import io
import unittest

from PIL import Image

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


class ProfileAvatarTests(BaseTest):
    def test_avatar_upload_and_remove(self):
        buffer = io.BytesIO()
        Image.new("RGB", (320, 240), (20, 120, 140)).save(buffer, format="PNG")
        buffer.seek(0)
        uploaded = self.client.post(
            "/api/profile/avatar",
            data={"file": (buffer, "avatar.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.get_data(as_text=True))
        avatar = uploaded.get_json()["avatar"]
        self.assertTrue(avatar.startswith("data:image/png;base64,"))
        profile = self.client.get("/api/profile").get_json()["profile"]
        self.assertEqual(profile["avatar"], avatar)

        removed = self.client.delete("/api/profile/avatar")
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(
            self.client.get("/api/profile").get_json()["profile"]["avatar"], ""
        )

    def test_avatar_rejects_non_image(self):
        response = self.client.post(
            "/api/profile/avatar",
            data={"file": (io.BytesIO(b"not an image"), "a.txt")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)


class HomeHeaderTests(BaseTest):
    def test_home_keeps_settings_and_avatar_only(self):
        html = self.client.get("/").get_data(as_text=True)
        self.assertIn('id="btn-settings"', html)
        self.assertIn('id="btn-avatar"', html)
        self.assertIn('id="topbar-avatar-initial"', html)
        for old in (
            "btn-focus",
            "btn-help",
            "btn-refresh-library",
            "btn-config",
            "btn-workspace",
            "btn-reset",
            "btn-import",
            "llm-status",
            "model-menu",
            "doc-call",
            "doc-original",
            "read-level",
            "btn-read-settings",
        ):
            self.assertNotIn(f'id="{old}"', html)
        self.assertIn('id="import-input"', html)
        self.assertIn('id="pdf-viewer-container"', html)


class UserPageTests(BaseTest):
    def test_user_page_keeps_profile_and_drops_api_management(self):
        response = self.client.get("/user")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("读者档案", html)
        self.assertIn('id="profile-form"', html)
        self.assertIn('class="page-back-btn"', html)
        self.assertIn('id="avatar-input"', html)
        self.assertIn('id="btn-avatar-remove"', html)
        self.assertNotIn("API 服务", html)
        self.assertNotIn('id="service-list"', html)
        self.assertNotIn('id="custom-form"', html)


if __name__ == "__main__":
    unittest.main()
