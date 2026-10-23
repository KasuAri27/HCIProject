"""学习助手 本地启动器。

用法：
- 双击项目根目录的 start.bat，或在命令行运行 python launcher.py。

功能：
1. 若学习服务已在运行，直接打开浏览器，不重复启动；
2. 否则启动 Flask 学习服务（默认 http://127.0.0.1:5000），
   等服务就绪后自动打开浏览器。

停止服务：关闭启动服务时弹出的命令行窗口，或在其中按 Ctrl+C。
"""

import json
import threading
import urllib.request
import webbrowser

from app import web

HOST = "127.0.0.1"
PORT = 5000
URL = f"http://{HOST}:{PORT}"


def _server_running() -> bool:
    """检测端口上是否已经是本应用，而不是任意占用端口的服务。"""
    try:
        with urllib.request.urlopen(URL + "/api/health", timeout=0.6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("app") == "local-learning-assistant"
    except (OSError, ValueError):
        return False


def _open_browser() -> None:
    """在默认浏览器中打开学习页面。"""
    webbrowser.open(URL)


def main() -> None:
    if _server_running():
        # 已在运行：无需重复启动，直接打开浏览器后退出
        _open_browser()
        return
    # 延迟打开浏览器，等服务器先起来，避免"连接被拒绝"
    timer = threading.Timer(1.5, _open_browser)
    timer.daemon = True
    timer.start()
    web.run(host=HOST, port=PORT)


if __name__ == "__main__":
    main()
