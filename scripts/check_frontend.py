"""解析全部 JS，并用 ESLint 检查项目自有脚本。"""

import os
from pathlib import Path
import shutil
import subprocess


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    node = shutil.which("node")
    if not node:
        raise SystemExit("需要 Node.js 24")
    scripts = sorted((root / "app/static").rglob("*.js"))
    own = [str(path.relative_to(root)) for path in scripts if "vendor" not in path.parts]
    if not own:
        raise SystemExit("没有发现项目自有 JS，拒绝空检查")
    for path in scripts:
        subprocess.run([node, "--check", str(path)], cwd=root, check=True)
    tool_dir = Path(os.environ.get("HCI_ESLINT_DIR", root / "scripts/frontend"))
    subprocess.run([
        node, str(tool_dir / "node_modules/eslint/bin/eslint.js"),
        "--config", "scripts/frontend/eslint.config.mjs", "--max-warnings", "0", *own,
    ], cwd=root, check=True)
    print(f"前端检查通过：{len(scripts)} 个 JS 语法、{len(own)} 个自有脚本 lint")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
