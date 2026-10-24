import unittest

from scripts.check_pr_metadata import validate_pr


class PrMetadataTests(unittest.TestCase):
    BODY = "## 内容\n补齐项目质量门禁。\n\n## 验证\n本地测试通过。\n\n## 注意\n无。"

    def test_accepts_title_and_project_branches(self):
        for branch in ("feat/import-docx", "fix/reader-position", "chore/ci-gates", "codex/ci-gates"):
            self.assertEqual(validate_pr("ci: 补齐项目质量门禁", branch, self.BODY), [])

    def test_rejects_english_title_and_invalid_branch(self):
        self.assertTrue(validate_pr("feat: update code", "feat/import-docx", self.BODY))
        for branch in ("main", "feature/NewFeature", "fix/../main", "fix/"):
            self.assertTrue(validate_pr("fix: 修复位置恢复", branch, self.BODY), branch)

    def test_rejects_empty_unstructured_or_overlong_body(self):
        for body in ("", "更新检查", self.BODY + "很长" * 500,
                     "## 内容\n<!-- 填写 -->\n## 验证\n通过\n## 注意\n无"):
            self.assertTrue(validate_pr("ci: 补齐项目质量门禁", "codex/ci-quality-gates", body))

    def test_comments_do_not_count_as_filled_template(self):
        template = "<!-- 简要填写 -->\n## 内容\n<!-- 为什么 -->\n## 验证\n<!-- 结果 -->\n## 注意\n无"
        self.assertTrue(validate_pr("docs: 简化 PR 模板", "codex/docs-pr-guidelines", template))
