"""检查仓库布局与本地数据是否被误提交。

规则见 docs/CONTRIBUTING.md 与根目录 README：
- 根目录只允许 README.md 作为文档，其他文档放 docs/；
- db/ 下的运行时数据、library/ 下的用户资料不进入 Git；
- 根目录只保留启动配置与依赖清单，启动脚本在 launcher/ 下。

用法：python scripts/check_repo_layout.py
"""

import subprocess
import sys

ROOT_ALLOWED = {
    ".gitattributes",
    ".gitignore",
    "README.md",
    "requirements.txt",
    "requirements-dev.txt",
    "ruff.toml",
    "pyproject.toml",
}

FORBIDDEN_PREFIXES = (
    "db/originals/",
    "db/backups/",
    "db/learning.db",
    "db/guide_image_cache/",
)

FORBIDDEN_FILES = {
    "db/api_config.json",
    "db/progress.json",
    "db/chapter_chats.json",
    "db/chapter_notes.json",
    "db/prereq.json",
}


def find_violations(paths: list[str]) -> list[str]:
    """返回不合规路径的说明列表。"""
    violations: list[str] = []
    for path in paths:
        if path in FORBIDDEN_FILES or path.startswith(FORBIDDEN_PREFIXES):
            violations.append(f"{path} 是本地运行时数据，不应提交")
            continue
        if path.startswith("library/") and path != "library/.gitkeep":
            violations.append(f"{path} 是用户资料，不应提交（library/ 只保留 .gitkeep）")
            continue
        if "/" not in path:
            if path not in ROOT_ALLOWED:
                violations.append(
                    f"{path} 不应放在根目录；文档放 docs/，启动脚本放 launcher/"
                )
    return violations


def _tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git ls-files 执行失败")
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def main() -> int:
    try:
        paths = _tracked_files()
    except RuntimeError as exc:
        print(f"无法读取仓库文件列表：{exc}")
        return 1
    violations = find_violations(paths)
    if violations:
        print("仓库布局检查未通过：")
        for item in violations:
            print(f"  - {item}")
        return 1
    print(f"仓库布局检查通过（{len(paths)} 个受版本控制的文件）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())