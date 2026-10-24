"""多服务商 API 配置回归测试。"""

import json
import unittest
from unittest.mock import patch

from app import api_config

from test_phase2 import BaseTest


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class ProviderTests(BaseTest):
    def test_builtin_providers_are_listed_and_keys_masked(self):
        state = self.client.get("/api/providers").get_json()
        ids = {provider["id"] for provider in state["providers"]}
        self.assertTrue({"qwen", "moonshot", "zhipu", "deepseek"} <= ids)
        saved = self.client.post(
            "/api/providers",
            json={
                "id": "deepseek",
                "name": "深度求索",
                "api_base": "https://api.deepseek.com/v1",
                "api_key": "sk-deepseek-secret",
                "models": ["deepseek-chat", "deepseek-reasoner"],
            },
        )
        self.assertEqual(saved.status_code, 200, saved.get_data(as_text=True))
        raw = saved.get_data(as_text=True)
        self.assertNotIn("sk-deepseek-secret", raw)
        state = saved.get_json()["state"]
        deepseek = next(p for p in state["providers"] if p["id"] == "deepseek")
        self.assertTrue(deepseek["has_key"])
        self.assertIn("…", deepseek["api_key_masked"])

        kept = self.client.post(
            "/api/providers",
            json={
                "id": "deepseek",
                "api_base": "https://api.deepseek.com/v1",
                "models": ["deepseek-chat", "deepseek-reasoner"],
            },
        )
        self.assertTrue(kept.get_json()["provider"]["has_key"])

        cleared = self.client.post(
            "/api/providers",
            json={
                "id": "deepseek",
                "api_base": "https://api.deepseek.com/v1",
                "clear_key": True,
            },
        )
        self.assertFalse(cleared.get_json()["provider"]["has_key"])

    def test_custom_provider_and_active_model_switching(self):
        created = self.client.post(
            "/api/providers",
            json={
                "name": "本地兼容服务",
                "api_base": "https://local.example/v1",
                "api_key": "sk-local",
                "models": ["local-small", "local-large"],
            },
        )
        self.assertEqual(created.status_code, 200, created.get_data(as_text=True))
        provider = created.get_json()["provider"]
        self.assertEqual(provider["kind"], "custom")
        self.assertTrue(provider["id"].startswith("custom-"))

        active = self.client.post(
            "/api/active-model",
            json={"provider_id": provider["id"], "model": "local-small"},
        )
        self.assertEqual(active.status_code, 200)
        self.assertEqual(active.get_json()["active"]["model"], "local-small")

        state = self.client.get("/api/models").get_json()
        self.assertEqual(state["active"]["provider_id"], provider["id"])
        self.assertIn(
            "local-small",
            [item["model"] for item in state["enabled_models"]],
        )

        disabled = self.client.patch(
            f"/api/providers/{provider['id']}/models",
            json={"model": "local-small", "enabled": False},
        )
        self.assertEqual(disabled.status_code, 200)
        self.assertEqual(
            disabled.get_json()["state"]["active"]["model"], "local-large"
        )

        same = self.client.patch(
            f"/api/providers/{provider['id']}/models",
            json={"model": "local-large", "enabled": False},
        )
        self.assertEqual(same.status_code, 400)
        self.assertIn("至少保留", same.get_json()["error"])

        deleted = self.client.delete(f"/api/providers/{provider['id']}")
        self.assertEqual(deleted.status_code, 200)

    def test_scan_models_merges_results(self):
        self.client.post(
            "/api/providers",
            json={
                "id": "qwen",
                "api_base": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "api_key": "sk-qwen",
                "models": ["qwen-plus"],
            },
        )
        with patch(
            "app.api_config.urllib.request.urlopen",
            return_value=FakeResponse(
                {"data": [{"id": "qwen-plus"}, {"id": "qwen-max"}]}
            ),
        ):
            response = self.client.post("/api/providers/qwen/scan")
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        models = response.get_json()["provider"]["models"]
        ids = [m["id"] for m in models]
        self.assertIn("qwen-plus", ids)
        self.assertIn("qwen-max", ids)
        self.assertEqual(len(ids), len(set(ids)))

    def test_scan_without_key_reports_error(self):
        self.client.post(
            "/api/providers",
            json={
                "id": "moonshot",
                "api_base": "https://api.moonshot.cn/v1",
                "clear_key": True,
            },
        )
        response = self.client.post("/api/providers/moonshot/scan")
        self.assertEqual(response.status_code, 502)
        self.assertIn("API Key", response.get_json()["error"])

    def test_legacy_config_maps_to_active_provider(self):
        response = self.client.post(
            "/api/config",
            json={
                "api_base": "https://legacy.example/v1",
                "api_key": "sk-legacy-secret",
                "model": "legacy-model",
                "timeout": 30,
                "temperature": 0.2,
            },
        )
        self.assertEqual(response.status_code, 200)
        public = self.client.get("/api/config").get_json()
        self.assertEqual(public["api_base"], "https://legacy.example/v1")
        self.assertEqual(public["model"], "legacy-model")
        self.assertTrue(public["has_key"])
        self.assertNotIn("sk-legacy-secret", json.dumps(public, ensure_ascii=False))


class ProviderPageTests(BaseTest):
    def test_pages_render(self):
        api_page = self.client.get("/api-config")
        self.assertEqual(api_page.status_code, 200)
        html = api_page.get_data(as_text=True)
        self.assertIn("接线台", html)
        self.assertIn("id=\"provider-list\"", html)
        self.assertIn("id=\"model-list\"", html)
        self.assertEqual(self.client.get("/user").status_code, 200)
        self.assertEqual(self.client.get("/settings").status_code, 200)

    def test_default_state_is_not_configured(self):
        # 确保测试不依赖本机真实 db/api_config.json
        self.assertFalse(api_config.is_configured())


if __name__ == "__main__":
    unittest.main()
