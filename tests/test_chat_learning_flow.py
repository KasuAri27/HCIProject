"""出题、答题与笔记建议在同一个文档会话中完成。"""

from unittest.mock import patch

from app import store
from test_phase2 import BaseTest


class ChatLearningFlowTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.doc_id = self.upload("lesson.md", "# 注意力\n\n注意力机制按相关性对输入加权。".encode()).get_json()["document_id"]

    def test_question_and_answer_continue_in_the_same_conversation(self):
        with patch("app.llm.chat", return_value="请问：注意力机制如何聚合输入？") as model:
            first = self.client.post("/api/chat", json={"doc_id": self.doc_id, "question": "出个题考察一下"}).get_json()
        self.assertIn("默认先不给答案", model.call_args.args[0][0]["content"])
        with patch("app.llm.chat", return_value="回答正确，按相关性加权。") as model:
            second = self.client.post("/api/chat", json={"doc_id": self.doc_id, "thread_id": first["thread_id"], "question": "我的答案：按相关性加权"}).get_json()
        self.assertEqual(first["thread_id"], second["thread_id"])
        self.assertIn("注意力机制如何聚合输入", str(model.call_args.args[0]))
        self.assertEqual(len(second["messages"]), 4)

    def test_note_advice_reads_note_but_does_not_overwrite_it(self):
        store.save_note(self.doc_id, "我认为查询向量决定关注点")
        with patch("app.llm.chat", return_value="建议补充权重归一化的作用。") as model:
            response = self.client.post("/api/chat", json={"doc_id": self.doc_id, "question": "看看我的笔记还需要补充什么"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("查询向量决定关注点", str(model.call_args.args[0]))
        self.assertEqual(store.get_note(self.doc_id)["content"], "我认为查询向量决定关注点")
