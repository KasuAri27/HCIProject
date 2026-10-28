"""建议提问只读取上下文，模型失败时回退，不能写入正式对话。"""

import json
from unittest.mock import patch

from app import chat_suggestions, llm, store
from test_phase2 import BaseTest, make_pdf


class ChatSuggestionTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.doc_id = self.upload("context.md", "# 注意力\n\n查询向量决定关注点。".encode()).get_json()["document_id"]

    def suggest(self, **kwargs):
        return self.client.post("/api/chat/suggestions", json={"doc_id": self.doc_id, **kwargs})

    def test_no_context_or_no_api_does_not_call_model(self):
        with patch("app.llm.chat") as model:
            for data in ({}, {"doc_id": self.doc_id}):
                response = self.client.post("/api/chat/suggestions", json=data)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json()["suggestions"], chat_suggestions.DEFAULT_QUESTIONS)
            model.assert_not_called()

    def test_suggestions_use_document_quote_focus_and_saved_history_without_writing_chat(self):
        store.append_chat(self.doc_id, "user", "查询向量有什么用？")
        store.append_chat(self.doc_id, "assistant", "它决定关注点。")
        before = store.get_chat(self.doc_id)
        block = store.get_document_content(self.doc_id)["blocks"][-1]
        questions = ["查询和键有什么区别？", "如何计算注意力分数？", "给我一个加权的例子"]
        with patch("app.api_config.is_configured", return_value=True), patch(
            "app.llm.chat", return_value=json.dumps({"suggestions": questions})
        ) as model:
            response = self.suggest(quote="查询向量", block_id=block["id"])
        self.assertEqual(response.get_json(), {"suggestions": questions, "source": "ai"})
        prompt = model.call_args.args[0][1]["content"]
        for text in ("查询向量决定关注点", "查询向量有什么用", "它决定关注点", "【用户划选】\n查询向量"):
            self.assertIn(text, prompt)
        self.assertEqual(store.get_chat(self.doc_id), before)
        self.assertLessEqual(model.call_args.kwargs["timeout"], 25)

    def test_invalid_or_failed_model_keeps_exactly_three_defaults(self):
        for reply in ("not json", '[]', '{"suggestions":[]}', '{"suggestions":["相同","相同","相同"]}',
                      '{"suggestions":[null,2,{}]}'):
            with self.subTest(reply=reply), patch("app.api_config.is_configured", return_value=True), patch(
                "app.llm.chat", return_value=reply
            ):
                data = self.suggest().get_json()
                self.assertEqual(data["suggestions"], chat_suggestions.DEFAULT_QUESTIONS)
                self.assertEqual(data["source"], "default")
        with patch("app.api_config.is_configured", return_value=True), patch(
            "app.llm.chat", side_effect=llm.LLMError("请求失败")
        ):
            self.assertEqual(self.suggest().get_json()["source"], "default")

    def test_pdf_page_selects_its_own_context(self):
        doc_id = self.upload("pages.pdf", make_pdf()).get_json()["document_id"]
        with patch("app.api_config.is_configured", return_value=True), patch(
            "app.llm.chat", return_value='{"suggestions":["问题一","问题二","问题三"]}'
        ) as model:
            response = self.client.post("/api/chat/suggestions", json={"doc_id": doc_id, "page": 2})
        self.assertEqual(response.status_code, 200)
        prompt = model.call_args.args[0][1]["content"]
        self.assertIn("PDF page two", prompt.split("【资料摘录】")[0])

    def test_invalid_request_is_rejected(self):
        for data in ([], {"doc_id": []}, {"quote": 2}, {"block_id": None}, {"page": True},
                     {"page": -1}, {"page": "2"}, {"doc_id": "missing"}):
            with self.subTest(data=data):
                response = self.client.post("/api/chat/suggestions", json=data)
                self.assertEqual(response.status_code, 400)
