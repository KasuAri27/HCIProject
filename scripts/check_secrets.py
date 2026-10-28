"""扫描版本控制候选文件与可选的完整历史；始终脱敏，不读取本地 db。"""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from scripts.check_repo_layout import _tracked_files


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gitleaks", default=os.environ.get("GITLEAKS_BIN", "gitleaks"))
    parser.add_argument("--history", action="store_true")
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parent.parent
    command = [args.gitleaks, "--no-banner", "--redact=100", "--exit-code=1", "--config", str(root / ".github/gitleaks.toml")]
    with tempfile.TemporaryDirectory(prefix="hci-secrets-") as folder:
        destination = Path(folder)
        for relative in _tracked_files():
            path = root / relative
            if path.is_symlink() or not path.resolve().is_relative_to(root):
                raise SystemExit(f"拒绝扫描仓库外链接：{relative}")
            if not path.is_file():
                continue
            copy = destination / relative
            copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, copy)
        result = subprocess.run([*command, "dir", str(destination)], cwd=root)
    if result.returncode:
        return result.returncode
    if args.history:
        return subprocess.run([*command, "git", "--log-opts=--all", str(root)], cwd=root).returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
