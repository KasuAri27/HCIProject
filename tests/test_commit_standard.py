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

    def test_prefixes_cannot_bypass_validation(self):
        for message in ("Merge arbitrary", 'Revert "feat(import): 支持导入"', ""):
            self.assertTrue(commit_check.validate_subject(message), message)

    def test_requires_concrete_chinese_summary(self):
        for message in ("feat: fix bug", "feat: 更新代码", "chore: 杂项", "feat:   "):
            self.assertTrue(commit_check.validate_subject(message), message)

    def test_scope_does_not_satisfy_chinese_summary(self):
        self.assertTrue(commit_check.validate_subject("feat(api): add provider"))
        self.assertEqual(commit_check.validate_subject("feat(api): 支持 OpenAI 接口"), [])


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

    def test_rejects_all_runtime_database_files(self):
        paths = [
            "db/api_config.json",
            "db/api_config.json.tmp",
            "db/profile.json",
            "db/memory.json",
            "db/other.db",
            "db/other.db-wal",
        ]
        self.assertEqual(len(layout_check.find_violations(paths)), len(paths))

    def test_rejects_nested_secrets_and_generated_files(self):
        paths = [
            ".qoder-credits/cache.json", "app/.env", "app/.env.local",
            "scripts/frontend/node_modules/eslint/package.json", "nested/dist/app.js",
            "app/__pycache__/web.pyc", "certs/private.pem", "test-results/trace.zip",
        ]
        self.assertEqual(len(layout_check.find_violations(paths)), len(paths))

    def test_allows_secret_free_examples_and_source_fixtures(self):
        self.assertEqual(layout_check.find_violations([
            "docs/.env.example", "docs/.env.sample", "tests/fixtures/input.txt",
            "scripts/frontend/package.json", ".github/gitleaks.toml",
        ]), [])


if __name__ == "__main__":
    unittest.main()
