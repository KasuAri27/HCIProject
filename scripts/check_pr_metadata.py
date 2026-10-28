"""按简短 PR 模板检查标题、来源分支及正文。"""

import argparse
import json
import os
from pathlib import Path
import re

from scripts.check_commit_messages import validate_subject

BRANCH_RE = re.compile(r"^(feat|fix|docs|chore|codex)/[a-z0-9]+(?:-[a-z0-9]+)*$")
SECTIONS = ("内容", "验证", "注意")
MAX_BODY_CHARS = 800


def validate_pr(title: str, branch: str, body: str = "") -> list[str]:
    errors = validate_subject(title)
    if len(branch) > 100 or not BRANCH_RE.fullmatch(branch):
        errors.append("来源分支应为 feat/fix/docs/chore/codex 加 / 和小写短横线描述")
    clean = re.sub(r"<!--.*?-->", "", body or "", flags=re.DOTALL).strip()
    if len(clean) > MAX_BODY_CHARS:
        errors.append("PR 正文最多 800 字符，请将详细内容放文档链接")
    headings = list(re.finditer(r"(?m)^##[ \t]+([^\n]+?)[ \t]*$", clean))
    if tuple(match.group(1).strip() for match in headings) != SECTIONS:
        errors.append("PR 正文须按模板依次填写 内容 / 验证 / 注意 三节")
    else:
        for index, match in enumerate(headings):
            end = headings[index + 1].start() if index + 1 < len(headings) else len(clean)
            content = clean[match.end():end].strip(" \r\n\t-*")
            if not content or content in {"待补充", "TODO", "...", "填写内容"}:
                errors.append(f"PR 的{SECTIONS[index]}不能为空或占位文字")
    return errors


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", default=os.environ.get("GITHUB_EVENT_PATH"))
    args = parser.parse_args(argv)
    if not args.event:
        parser.error("需要 --event 或 GITHUB_EVENT_PATH")
    event = json.loads(Path(args.event).read_text(encoding="utf-8"))
    pr = event.get("pull_request")
    if not pr:
        print("当前事件不是 PR，跳过 PR 元数据检查")
        return 0
    errors = validate_pr(pr.get("title", ""), pr.get("head", {}).get("ref", ""), pr.get("body", ""))
    for error in errors:
        print(error)
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
