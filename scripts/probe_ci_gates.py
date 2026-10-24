"""在无用户数据的副本中注入故障，验证门禁能拒绝原审查的漏检样本。"""

import json
from pathlib import Path
import secrets
import shutil
import string
import subprocess
import sys
import tempfile


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    results = {}
    with tempfile.TemporaryDirectory(prefix="hci-gate-probes-") as folder:
        copy = Path(folder)
        for name in ("app", "launcher", "scripts", "tests"):
            shutil.copytree(root / name, copy / name, ignore=shutil.ignore_patterns(
                "__pycache__", "node_modules", ".env", ".env.*",
            ))
        shutil.copyfile(root / "ruff.toml", copy / "ruff.toml")
        for name, relative, transform, command in (
            ("launcher-syntax", "launcher/launcher.py", lambda text: text + "\ndef broken(:\n",
             [sys.executable, "-m", "ruff", "check", "launcher"]),
            ("converter-runtime", "app/converters.py",
             lambda text: text.replace("    source = Path(source)", '    raise ConvertError("CI_PROBE")\n    source = Path(source)', 1),
             [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_converters.py"]),
            ("frontend-runtime", "app/static/app.js", lambda text: 'throw new Error("CI_PROBE_RUNTIME");\n' + text,
             [sys.executable, "-m", "unittest", "discover", "-s", "tests/browser", "-k", "no_api", "-v"]),
        ):
            path = copy / relative
            original = path.read_bytes()
            try:
                path.write_text(transform(original.decode("utf-8")), encoding="utf-8")
                result = subprocess.run(command, cwd=copy, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90)
                results[name] = {"exit": result.returncode, "blocked": result.returncode != 0,
                                 "output": (result.stdout + result.stderr)[-5000:]}
            finally:
                path.write_bytes(original)

    from scripts.check_commit_messages import validate_subject
    from scripts.check_repo_layout import find_violations

    results["messages"] = {value: bool(validate_subject(value)) for value in ("feat: fix bug", "feat: 更新代码", "Merge arbitrary", "Revert arbitrary", "")}
    results["paths"] = {value: bool(find_violations([value])) for value in ("db/new_runtime.json", ".qoder-credits/cache.json", "app/.env")}
    # 合成无权限的 PAT 形状样本只通过 stdin 输入，不写入仓库或报告。
    import os
    binary = os.environ.get("GITLEAKS_BIN", "gitleaks")
    fake = "ghp_" + "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(36))
    result = subprocess.run([binary, "stdin", "--no-banner", "--redact=100", "--config", str(root / ".github/gitleaks.toml")], input=fake, text=True, capture_output=True)
    results["synthetic-secret"] = {"exit": result.returncode, "blocked": result.returncode == 1}
    output = root / ".uitest/gate-probes.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    passed = (
        all(results[key]["blocked"] for key in ("launcher-syntax", "converter-runtime", "frontend-runtime", "synthetic-secret"))
        and all(results["messages"].values()) and all(results["paths"].values())
        and "CI_PROBE" in results["converter-runtime"]["output"]
        and "CI_PROBE_RUNTIME" in results["frontend-runtime"]["output"]
    )
    print("故障样本已全部阻挡" if passed else f"门禁复验失败，查看 {output}")
    return int(not passed)


if __name__ == "__main__":
    raise SystemExit(main())
