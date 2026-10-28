"""只验证笔记草稿的流式输出、取消、错误与旧接口兼容。"""

import io
import json
import unittest
from unittest.mock import patch

from app import llm, notes, store
from test_phase2 import BaseTest


class NotesStreamTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.doc_id = self.upload("notes.md", "# 笔记资料\n\n注意力按相关性加权。".encode()).get_json()["document_id"]
        notes.put(self.doc_id, "我的原有笔记")

    def request_stream(self):
        return self.client.post("/api/notes/draft", json={
            "doc_id": self.doc_id, "instruction": "整理重点", "stream": True,
        }, buffered=False)

    def test_stream_outputs_chunks_without_saving_notes(self):
        with patch("app.llm.chat_stream", return_value=iter(["## 要点\n", "按相关性加权"])) as model:
            response = self.request_stream()
            events = [json.loads(line[6:]) for line in response.get_data(as_text=True).splitlines() if line.startswith("data: ")]
        self.assertEqual(response.mimetype, "text/event-stream")
        self.assertEqual("".join(e.get("delta", "") for e in events), "## 要点\n按相关性加权")
        self.assertTrue(events[-1]["done"])
        self.assertIn("整理重点", model.call_args.args[0][1]["content"])
        self.assertEqual(store.get_note(self.doc_id)["content"], "我的原有笔记")

    def test_client_close_closes_upstream_generator(self):
        closed = []

        def stream(*_args, **_kwargs):
            try:
                yield "第一段"
                yield "迟到的内容"
            finally:
                closed.append(True)

        with patch("app.llm.chat_stream", side_effect=stream):
            response = self.request_stream()
            chunks = iter(response.response)
            next(chunks)  # started
            self.assertIn("第一段", next(chunks).decode())
            response.close()
        self.assertEqual(closed, [True])
        self.assertEqual(store.get_note(self.doc_id)["content"], "我的原有笔记")

    def test_model_error_is_a_stream_error(self):
        with patch("app.llm.chat_stream", side_effect=llm.LLMError("服务暂不可用")):
            response = self.request_stream()
            text = response.get_data(as_text=True)
        self.assertIn('"error": "服务暂不可用"', text)
        self.assertNotIn('"done":true', text)

    def test_non_streaming_call_stays_compatible(self):
        with patch("app.llm.chat", return_value="## 草稿"):
            response = self.client.post("/api/notes/draft", json={"doc_id": self.doc_id})
        self.assertEqual(response.get_json()["draft"], "## 草稿")
        self.assertEqual(store.get_note(self.doc_id)["content"], "我的原有笔记")


class ModelStreamTests(unittest.TestCase):
    def test_sse_unicode_and_close_release_response(self):
        response = io.BytesIO((
            ': heartbeat\n\ndata: {"choices":[{"delta":{"content":"中文片段"}}]}\n\n'
            'data: [DONE]\n\n'
        ).encode())
        with patch("app.llm.urllib.request.urlopen", return_value=response) as opened:
            stream = llm.chat_stream([], api_base="http://example.test/v1", api_key="test-only", model="fixture")
            self.assertEqual(next(stream), "中文片段")
            self.assertFalse(response.closed)
            stream.close()
        self.assertTrue(response.closed)
        self.assertTrue(json.loads(opened.call_args.args[0].data)["stream"])
