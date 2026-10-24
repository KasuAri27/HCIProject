"""隔离的真实 HTTP 服务；不替换后台导入、SQLite 或解析逻辑。"""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent


class LiveServer:
    def __init__(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="hci-ci-")
        self.state = Path(self.tmp.name)
        self.ready = self.state / "ready.txt"
        self.log_path = self.state / "server.log"
        self.log = self.log_path.open("w", encoding="utf-8")
        self.process = subprocess.Popen(
            [sys.executable, "-m", "scripts.ci_server", "--state", str(self.state),
             "--ready-file", str(self.ready)],
            cwd=ROOT, stdout=self.log, stderr=subprocess.STDOUT,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        deadline = time.monotonic() + 45
        while not self.ready.is_file():
            if self.process.poll() is not None or time.monotonic() > deadline:
                self.log.flush()
                details = self.log_path.read_text(encoding="utf-8", errors="replace")[-6000:]
                self.close()
                raise RuntimeError(f"隔离服务未启动：\n{details}")
            time.sleep(0.05)
        self.url = self.ready.read_text(encoding="utf-8")

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self.log.close()
        self.tmp.cleanup()
