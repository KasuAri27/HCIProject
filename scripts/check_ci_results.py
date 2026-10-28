"""必需检查只接受所有必需子任务成功，拒绝跳过、取消和遗漏。"""

import json
import os

REQUIRED_JOBS = {"quality", "windows", "browser", "ocr"}


def validate_results(results: dict) -> list[str]:
    if not isinstance(results, dict):
        return ["门禁结果必须是对象"]
    errors = [f"缺少门禁：{name}" for name in sorted(REQUIRED_JOBS - results.keys())]
    for name, job in results.items():
        if not isinstance(job, dict) or job.get("result") != "success":
            errors.append(f"门禁未成功：{name}")
    return errors


def main() -> int:
    results = json.loads(os.environ["RESULTS"])
    errors = validate_results(results)
    for error in errors:
        print(error)
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
