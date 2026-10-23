"""提交规范与仓库布局检查脚本的单元测试。"""

import unittest

from scripts import check_commit_messages as commit_check
from scripts import check_repo_layout as layout_check


class CommitMessageStandardTests(unittest.TestCase):
    def test_accepts_standard_messages(self):
        messages = [
            "chore: 初始化仓库",
            "chore(repo): 整理根目录、文档与启动入口",
            "feat(import): 支持 DOCX 导入",
            "fix(reader): 恢复阅读位置",
            "docs(todo): 修正打包配置说明",
            "ci: 增加提交规范与代码校验流水线",
            "revert: 回退导入解析改动",
        ]
        for message in messages:
            self.assertEqual(commit_check.validate_subject(message), [], message)

    def test_rejects_non_standard_messages(self):
        messages = [
            "更新代码",
            "Update code",
            "feat:",
            "feat(import): 支持 DOCX 导入。",
            "FEAT(import): 大写类型",
            "feat(Import): 大写 scope",
            "feat(import): " + "很长的摘要" * 10,
        ]
        for message in messages:
            self.assertTrue(commit_check.validate_subject(message), message)

    def test_skips_merge_and_revert_prefix(self):
        self.assertEqual(commit_check.validate_subject("Merge branch 'main'"), [])
        self.assertEqual(commit_check.validate_subject('Revert "feat(import): 支持导入"'), [])


class RepoLayoutTests(unittest.TestCase):
    def test_accepts_expected_layout(self):
        paths = [
            "README.md",
            "requirements.txt",
            "requirements-dev.txt",
            "docs/TODO.md",
            "app/web.py",
            "launcher/launcher.py",
            "library/.gitkeep",
        ]
        self.assertEqual(layout_check.find_violations(paths), [])

    def test_rejects_root_docs_and_user_data(self):
        paths = [
            "TODO.md",
            "AIInfra学习助手.spec",
            "db/learning.db",
            "library/资料.pdf",
            "db/backups/phase2-20261022/progress.json",
        ]
        self.assertEqual(len(layout_check.find_violations(paths)), 5)


if __name__ == "__main__":
    unittest.main()