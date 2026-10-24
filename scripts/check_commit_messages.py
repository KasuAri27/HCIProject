"""校验提交信息是否符合 docs/CONTRIBUTING.md 的标准。

本地用法：
    python scripts/check_commit_messages.py --message "feat(import): 支持 DOCX 导入"
    python scripts/check_commit_messages.py --range origin/main..HEAD

CI 用法：设置 BASE_SHA / HEAD_SHA 环境变量后直接运行。
"""

import argparse
import os
import re
import subprocess
import sys

ALLOWED_TYPES = (
    "feat",
    "fix",
    "refactor",
    "perf",
    "test",
    "docs",
    "chore",
    "build",
    "ci",
    "revert",
)

SUBJECT_RE = re.compile(
    r"^(?P<type>" + "|".join(ALLOWED_TYPES) + r")"
    r"(\((?P<scope>[a-z0-9][a-z0-9-]*)\))?: (?P<subject>.+)$"
)

MAX_SUBJECT_CHARS = 50
VAGUE_SUMMARIES = {"更新代码", "更新", "杂项", "修改代码", "修复问题", "测试", "调整", "优化"}
RANGE_FALLBACK_COUNT = 30


def parse_subject(subject: str):
    """返回 (type, scope, summary)；不符合格式返回 None。"""
    match = SUBJECT_RE.match((subject or "").strip())
    if match is None:
        return None
    return match.group("type"), match.group("scope") or "", match.group("subject")


def validate_subject(subject: str) -> list[str]:
    """校验普通提交或 PR 标题；merge 由 git log --no-merges 识别。"""
    subject = (subject or "").strip()
    if not subject:
        return ["提交摘要不能为空"]
    errors: list[str] = []
    parsed = parse_subject(subject)
    if parsed is None:
        errors.append(
            "格式应为 <type>(<scope>): <中文摘要>，type 只能是 "
            + "/".join(ALLOWED_TYPES)
        )
    else:
        summary = parsed[2].strip()
        if not re.search(r"[\u3400-\u4dbf\u4e00-\u9fff]", summary):
            errors.append("摘要必须包含中文动作说明")
        if summary in VAGUE_SUMMARIES:
            errors.append("摘要过于空泛，请说明具体改动")
    if len(subject) > MAX_SUBJECT_CHARS:
        errors.append(f"摘要不超过 {MAX_SUBJECT_CHARS} 个字符，当前 {len(subject)}")
    if subject.endswith(("。", ".", "，", ",")):
        errors.append("摘要末尾不要句号或逗号")
    return errors


def _git_log(range_spec: str) -> list[tuple[str, str, str]]:
    fmt = "%H%x1f%s%x1f%b%x1e"
    result = subprocess.run(
        ["git", "log", "--no-merges", f"--format={fmt}", range_spec],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git log 执行失败")
    commits: list[tuple[str, str, str]] = []
    for record in result.stdout.split("\x1e"):
        record = record.strip("\n")
        if not record:
            continue
        parts = record.split("\x1f")
        if len(parts) < 2:
            continue
        commit_hash = parts[0].strip()
        subject = parts[1].strip()
        body = parts[2].strip() if len(parts) > 2 else ""
        commits.append((commit_hash, subject, body))
    return commits


def _resolve_range(base: str, head: str) -> str:
    if base and set(base) != {"0"}:
        return f"{base}..{head or 'HEAD'}"
    return f"-n {RANGE_FALLBACK_COUNT} {head or 'HEAD'}"


def main(argv: list | None = None) -> int:
    parser = argparse.ArgumentParser(description="检查提交信息是否符合规范")
    parser.add_argument("--message", help="只校验一条提交摘要（本地测试用）")
    parser.add_argument("--range", dest="range_spec", help="git log 范围，如 origin/main..HEAD")
    parser.add_argument("--base", help="范围起点（默认读 BASE_SHA）")
    parser.add_argument("--head", help="范围终点（默认读 HEAD_SHA 或 HEAD）")
    args = parser.parse_args(argv)

    if args.message is not None:
        errors = validate_subject(args.message)
        if errors:
            print(f"提交信息不符合规范：{args.message}")
            for error in errors:
                print(f"  - {error}")
            return 1
        print(f"提交信息符合规范：{args.message}")
        return 0

    base = args.base or os.environ.get("BASE_SHA", "")
    head = args.head or os.environ.get("HEAD_SHA", "HEAD")
    range_spec = args.range_spec or _resolve_range(base, head)

    try:
        commits = _git_log(range_spec)
    except RuntimeError as exc:
        print(f"无法读取提交范围 {range_spec}：{exc}")
        commits = _git_log(f"-n {RANGE_FALLBACK_COUNT} HEAD")

    if not commits:
        print("没有需要检查的提交。")
        return 0

    failures: list[tuple[str, str, list[str]]] = []
    for commit_hash, subject, body in commits:
        errors = validate_subject(subject)
        if errors:
            failures.append((commit_hash[:8], subject, errors))

    if failures:
        print(f"发现 {len(failures)} 条不符合规范的提交：")
        for short_hash, subject, errors in failures:
            print(f"  {short_hash}  {subject}")
            for error in errors:
                print(f"      - {error}")
        print("\n标准见 docs/CONTRIBUTING.md。")
        return 1

    print(f"提交信息检查通过（{len(commits)} 条）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
