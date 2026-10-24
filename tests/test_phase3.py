"""第三阶段回归测试：统一上下文、引用、划段动作、理解自评与练习证据。"""

import unittest
from pathlib import Path
from unittest.mock import patch

from app import ai_context, config, llm

from test_phase2 import BaseTest

FAKE_ID = "ffffffffffffffff"
QUOTE = "注意力机制按相关性对输入加权求和"


class AiBaseTest(BaseTest):
    def setUp(self):
        super().setUp()
        self.doc_id = self.upload(
            "attention.md",
            (
                "# 注意力机制\n\n"
                "注意力机制按相关性对输入加权求和，输出是对重要部分的聚合。\n\n"
                "- 查询向量决定关注点\n"
                "- 权重经过归一化\n"
            ).encode("utf-8"),
        ).get_json()["document_id"]
        response = self.client.post(
            "/api/config",
            json={
                "api_base": "https://api.example.com",
                "api_key": "sk-phase3-example",
                "model": "demo",
                "timeout": 20,
                "temperature": 0,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.client.post(f"/api/documents/{self.doc_id}/open")
        self.blocks = self.doc_content(self.doc_id)["blocks"]

    def text_block(self):
        for block in self.blocks:
            if block.get("type") != "heading":
                return block
        return self.blocks[0]

    def other_doc(self):
        return self.upload(
            "other.md", "# 另一份\n\n完全不同的资料。".encode("utf-8")
        ).get_json()["document_id"]


class ContextTests(AiBaseTest):
    def test_context_marks_blocks_and_filters_citations(self):
        block = self.text_block()
        context = ai_context.build_context(
            self.doc_id,
            question="注意力",
            quote=QUOTE,
            focus_block_id=block["id"],
        )
        self.assertIn(f"[B:{block['id']}]", context["text"])
        self.assertIn(block["id"], context["block_ids"])

        cleaned, citations = ai_context.clean_citations(
            f"依据原文 [cite:{block['id']}]；伪造 [cite:{FAKE_ID}]。", context
        )
        self.assertIn(block["id"], cleaned)
        self.assertNotIn(FAKE_ID, cleaned)
        self.assertEqual([c["block_id"] for c in citations], [block["id"]])
        self.assertTrue(citations[0]["locator"])

    def test_clean_citations_keeps_order_and_deduplicates(self):
        block = self.text_block()
        context = ai_context.build_context(self.doc_id, focus_block_id=block["id"])
        cleaned, citations = ai_context.clean_citations(
            f"一 [cite:{block['id']}] 二 [cite:{block['id']}]", context
        )
        self.assertEqual(len(citations), 1)
        self.assertIn(block["id"], cleaned)


class SelectionActionTests(AiBaseTest):
    def test_actions_return_only_allowed_citations(self):
        block = self.text_block()
        for mode in ("explain", "example", "prereq"):
            with patch(
                "app.llm.chat",
                return_value=f"回答内容 [cite:{block['id']}] [cite:{FAKE_ID}]",
            ):
                response = self.client.post(
                    "/api/selection/action",
                    json={
                        "doc_id": self.doc_id,
                        "mode": mode,
                        "quote": QUOTE,
                        "block_id": block["id"],
                    },
                )
            self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
            data = response.get_json()
            self.assertEqual(data["mode"], mode)
            self.assertNotIn(FAKE_ID, data["markdown"])
            self.assertEqual([c["block_id"] for c in data["citations"]], [block["id"]])

    def test_check_mode_returns_question(self):
        block = self.text_block()
        with patch("app.llm.chat", return_value="请说明权重为何要归一化。"):
            response = self.client.post(
                "/api/selection/action",
                json={
                    "doc_id": self.doc_id,
                    "mode": "check",
                    "quote": QUOTE,
                    "block_id": block["id"],
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertIn("归一化", response.get_json()["markdown"])

    def test_rejects_unknown_mode_and_stale_block(self):
        bad_mode = self.client.post(
            "/api/selection/action",
            json={"doc_id": self.doc_id, "mode": "rewrite", "quote": QUOTE},
        )
        self.assertEqual(bad_mode.status_code, 400)
        bad_block = self.client.post(
            "/api/selection/action",
            json={"doc_id": self.doc_id, "mode": "explain", "block_id": "missing"},
        )
        self.assertEqual(bad_block.status_code, 400)

    def test_llm_failure_does_not_block_reading(self):
        with patch("app.llm.chat", side_effect=llm.LLMError("服务不可用")):
            response = self.client.post(
                "/api/selection/action",
                json={"doc_id": self.doc_id, "mode": "explain", "quote": QUOTE},
            )
        self.assertEqual(response.status_code, 502)
        doc = self.doc_content(self.doc_id)
        self.assertEqual(doc["status"], "ready")
        self.assertTrue(doc["html"])


class UnderstandingTests(AiBaseTest):
    def submit_check(self, answer="注意力按相关性加权。", verdict="理解"):
        block = self.text_block()
        with patch(
            "app.llm.chat",
            return_value=f"【结论：{verdict}】\n回答到位 [cite:{block['id']}]",
        ):
            response = self.client.post(
                "/api/understanding",
                json={
                    "doc_id": self.doc_id,
                    "block_id": block["id"],
                    "quote": QUOTE,
                    "question": "注意力如何聚合输入？",
                    "answer": answer,
                },
            )
        return response

    def test_check_saves_verdict_and_self_level(self):
        response = self.submit_check()
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        data = response.get_json()
        self.assertTrue(data["id"])
        self.assertEqual(data["verdict"], "理解")
        self.assertIn("回答到位", data["feedback"])
        self.assertEqual(len(data["citations"]), 1)

        rated = self.client.patch(
            f"/api/understanding/{data['id']}", json={"self_level": "模糊"}
        )
        self.assertEqual(rated.status_code, 200)

        learning = self.client.get(f"/api/documents/{self.doc_id}/learning").get_json()
        self.assertEqual(len(learning["understanding"]), 1)
        self.assertEqual(learning["understanding"][0]["self_level"], "模糊")
        overview = self.client.get("/api/session").get_json()["overview"]
        self.assertEqual(overview["understanding_count"], 1)

    def test_rejects_empty_answer_and_bad_level(self):
        block = self.text_block()
        empty = self.client.post(
            "/api/understanding",
            json={
                "doc_id": self.doc_id,
                "block_id": block["id"],
                "question": "问题",
                "answer": " ",
            },
        )
        self.assertEqual(empty.status_code, 400)
        self.assertIn("不能为空", empty.get_json()["error"])

        check = self.submit_check().get_json()
        bad = self.client.patch(
            f"/api/understanding/{check['id']}", json={"self_level": "很懂"}
        )
        self.assertEqual(bad.status_code, 400)

    def test_records_are_isolated_between_documents(self):
        self.submit_check()
        other = self.other_doc()
        other_learning = self.client.get(f"/api/documents/{other}/learning").get_json()
        self.assertEqual(other_learning["understanding"], [])
        self.assertEqual(other_learning["practice"], [])


class ExerciseEvidenceTests(AiBaseTest):
    def test_submit_records_evidence_and_self_rating(self):
        with patch("app.llm.chat", return_value="【题型：非代码题】\n请解释注意力。"):
            question = self.client.post(
                "/api/exercise", json={"doc_id": self.doc_id, "difficulty": "入门"}
            )
        self.assertEqual(question.status_code, 200)
        with patch("app.llm.chat", return_value="批改通过"):
            response = self.client.post(
                "/api/exercise/submit",
                json={"doc_id": self.doc_id, "code": "我的解答"},
            )
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        evidence_id = response.get_json()["evidence_id"]
        self.assertTrue(evidence_id)

        rated = self.client.patch(
            f"/api/exercise-evidence/{evidence_id}", json={"self_level": "理解"}
        )
        self.assertEqual(rated.status_code, 200)

        learning = self.client.get(f"/api/documents/{self.doc_id}/learning").get_json()
        self.assertEqual(len(learning["practice"]), 1)
        self.assertEqual(learning["practice"][0]["self_level"], "理解")
        self.assertEqual(learning["practice"][0]["review"], "批改通过")
        overview = self.client.get("/api/session").get_json()["overview"]
        self.assertEqual(overview["practice_count"], 1)

    def test_unknown_evidence_is_404(self):
        response = self.client.patch(
            "/api/exercise-evidence/missing", json={"self_level": "理解"}
        )
        self.assertEqual(response.status_code, 404)


class ReadLevelTests(AiBaseTest):
    def test_read_level_roundtrip(self):
        response = self.client.post(
            f"/api/documents/{self.doc_id}/read-level", json={"self_level": "理解"}
        )
        self.assertEqual(response.status_code, 200)
        doc = self.doc_content(self.doc_id)["document"]
        self.assertEqual(doc["read_level"], "理解")

        invalid = self.client.post(
            f"/api/documents/{self.doc_id}/read-level", json={"self_level": "精通"}
        )
        self.assertEqual(invalid.status_code, 400)

        cleared = self.client.post(
            f"/api/documents/{self.doc_id}/read-level", json={"self_level": ""}
        )
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(
            self.doc_content(self.doc_id)["document"]["read_level"], ""
        )


class FrontendPhase3Tests(unittest.TestCase):
    def test_phase3_dom_ids_exist(self):
        html = (Path(config.APP_DIR) / "app" / "templates" / "index.html").read_text(encoding="utf-8")
        for element_id in (
            "btn-settings",
            "btn-avatar",
            "topbar-avatar-img",
            "topbar-avatar-initial",
            "help-modal",
            "btn-help-close",
            "btn-mode-explain",
            "btn-mode-example",
            "btn-mode-prereq",
            "btn-mode-check",
            "check-answer",
            "btn-check-submit",
            "check-feedback",
            "check-self-rate",
            "btn-notes-undo",
            "btn-notes-export",
            "exercise-self-rate",
            "exercise-evidence-status",
            "understanding-count",
            "practice-count",
        ):
            self.assertIn(f'id="{element_id}"', html, element_id)


if __name__ == "__main__":
    unittest.main()
