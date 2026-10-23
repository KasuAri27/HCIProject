"""学习助手 桌面版入口。

使用 pywebview 将 Flask 学习页面装入原生桌面窗口（不再依赖浏览器），
双击打包后的 exe 即可启动。

源码运行：python launcher/desktop.py。

注意：网页启动方式仍保留（launcher/start.bat 或 launcher/launcher.py）。
"""

import json
import sys
import threading
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import webview

from app import web

HOST = "127.0.0.1"
PORT = 5000
URL = f"http://{HOST}:{PORT}"


def _server_ready() -> bool:
    """端口上是否已经运行本应用。"""
    try:
        with urllib.request.urlopen(URL + "/api/health", timeout=0.6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("app") == "local-learning-assistant"
    except (OSError, ValueError):
        return False


def _wait_for_server(timeout: float = 15.0) -> bool:
    """等待服务就绪（健康检查通过）。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _server_ready():
            return True
        time.sleep(0.2)
    return False


def _start_server() -> None:
    """在后台线程启动 Flask 学习服务。"""
    web.run(host=HOST, port=PORT, debug=False)


def main() -> None:
    # 端口已有本应用则复用（如网页启动器仍在运行），否则启动新服务
    if not _server_ready():
        threading.Thread(target=_start_server, daemon=True).start()
        if not _wait_for_server():
            raise SystemExit(
                "服务启动失败：端口 5000 可能被其他程序占用，或 Flask 依赖未安装。"
            )

    # 原生桌面窗口（不再打开浏览器）
    webview.create_window(
        "学习助手 · 本地资料",
        URL,
        width=1280,
        height=820,
        min_size=(1000, 680),
    )
    webview.start()


if __name__ == "__main__":
    main()
