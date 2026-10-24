"""在独立数据目录启动真实后端，供浏览器和外部工具集成测试使用。"""

import argparse
import os
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--ready-file", type=Path, required=True)
    args = parser.parse_args()
    state = args.state.resolve()
    state.mkdir(parents=True, exist_ok=True)
    # 所有配置均在 import 业务模块前隔离，不读取开发者的真实密钥或学习数据。
    os.environ["LLM_API_KEY"] = ""
    os.environ["LLM_API_BASE"] = "http://127.0.0.1:1"
    os.environ["LEARN_LIBRARY_DIR"] = str(state / "library")
    os.environ["LEARN_DB"] = str(state / "db/learning.db")
    os.environ["LEARN_ORIGINALS_DIR"] = str(state / "db/originals")
    os.environ["LEARN_BACKUP_DIR"] = str(state / "db/backups")
    from app import config

    config.APP_DIR = state
    from app import web
    from werkzeug.serving import make_server

    web.bootstrap()
    server = make_server("127.0.0.1", 0, web.app, threaded=True)
    args.ready_file.write_text(f"http://127.0.0.1:{server.server_port}", encoding="utf-8")
    server.serve_forever()


if __name__ == "__main__":
    main()
