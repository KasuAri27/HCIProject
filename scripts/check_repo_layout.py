"""检查仓库布局与本地数据是否被误提交。

规则见 docs/CONTRIBUTING.md 与根目录 README：
- 根目录文档只允许 README.md、项目约束 AGENTS.md 与 CLAUDE.md，其他文档放 docs/；
- AGENTS.md 与 CLAUDE.md 内容必须一致，避免两份约束漂移；
- db/ 下的运行时数据、library/ 下的用户资料不进入 Git；
- 根目录只保留启动配置与依赖清单，启动脚本在 launcher/ 下。

用法：python scripts/check_repo_layout.py
"""

import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT_ALLOWED = {
    ".gitattributes",
    ".gitignore",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "requirements.txt",
    "requirements-dev.txt",
    "requirements-browser.txt",
    "ruff.toml",
    "pyproject.toml",
}

FORBIDDEN_PREFIXES = ("db/", ".qoder-credits/")
FORBIDDEN_PARTS = {
    "__pycache__", ".ruff_cache", ".pytest_cache", ".venv", "venv",
    "node_modules", "build", "dist", ".uitest", "test-results", "playwright-report",
}
SECRET_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}


def find_violations(paths: list[str]) -> list[str]:
    """返回不合规路径的说明列表。"""
    violations: list[str] = []
    for path in paths:
        parts = PurePosixPath(path).parts
        name = parts[-1] if parts else ""
        if (
            any(part in FORBIDDEN_PARTS for part in parts)
            or name in {".DS_Store", "Thumbs.db"}
            or name.endswith((".pyc", ".pyo", ".log"))
        ):
            violations.append(f"{path} 是缓存、依赖或构建产物，不应提交")
            continue
        if (
            (name == ".env" or name.startswith(".env."))
            and name not in {".env.example", ".env.sample"}
        ) or PurePosixPath(path).suffix.lower() in SECRET_SUFFIXES:
            violations.append(f"{path} 可能包含本机密钥，不应提交")
            continue
        if path.startswith(FORBIDDEN_PREFIXES):
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


def find_agent_doc_drift(root: Path) -> list[str]:
    """AGENTS.md 与 CLAUDE.md 必须同时存在且内容一致；换行符差异不算不一致。"""
    texts = {}
    for name in ("AGENTS.md", "CLAUDE.md"):
        path = root / name
        if not path.is_file():
            return [f"{name} 缺失；AGENTS.md 与 CLAUDE.md 必须同时存在并保持一致"]
        # 工作区可能按平台换行符检出，比较前统一为 LF
        texts[name] = path.read_bytes().replace(b"\r\n", b"\n")
    if texts["AGENTS.md"] != texts["CLAUDE.md"]:
        return ["AGENTS.md 与 CLAUDE.md 内容不一致；修改其中一个时须同步另一个"]
    return []


def _tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "-c", "core.quotepath=false", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git ls-files 执行失败")
    return sorted(set(path for path in result.stdout.split("\0") if path))


def main() -> int:
    try:
        paths = _tracked_files()
    except RuntimeError as exc:
        print(f"无法读取仓库文件列表：{exc}")
        return 1
    violations = find_violations(paths) + find_agent_doc_drift(Path(__file__).resolve().parent.parent)
    if violations:
        print("仓库布局检查未通过：")
        for item in violations:
            print(f"  - {item}")
        return 1
    print(f"仓库布局检查通过（{len(paths)} 个版本控制候选文件）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
