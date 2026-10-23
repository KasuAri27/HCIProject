"""命令行入口。

用法：
    python -m app.cli library          # 查看数据库中的文档与资料库路径
    python -m app.cli scan             # 扫描 library/ 并后台解析新文件
    python -m app.cli migrate          # 备份并迁移第一阶段 JSON 数据
    python -m app.cli serve            # 启动 Web 服务
"""

import argparse
import sys

from . import imports, migrate, source, store


def _prepare() -> None:
    source.ensure_library()
    store.init_db()


def cmd_library(_args: argparse.Namespace) -> int:
    _prepare()
    status = source.library_status()
    print(f"资料库：{status['path']}")
    print(f"资料库文件：{status['document_count']}")
    for warning in status["warnings"]:
        print(f"提示：{warning}")
    docs = store.list_document_summaries()
    print(f"数据库文档：{len(docs)}")
    for doc in docs:
        version = f"v{doc['version_no']}" if doc.get("version_no") else "v?"
        print(f"  - [{version} {doc.get('version_status') or '-'}] {doc['title']}")
    return 0


def cmd_scan(_args: argparse.Namespace) -> int:
    _prepare()
    result = imports.scan_library(background=False)
    for job in result.get("jobs") or []:
        if job.get("status") == "queued":
            imports.process_job(job["id"])
        print(f"任务 {job['id'][:8]}：{job.get('source_name')} -> {store.get_job(job['id']).get('status')}")
    print(f"扫描完成：登记 {result.get('registered', 0)} 个文件")
    return 0


def cmd_migrate(_args: argparse.Namespace) -> int:
    _prepare()
    result = migrate.migrate_if_needed()
    print(result)
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    from . import web

    web.run(host=args.host, port=args.port, debug=args.debug)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="learning-assistant",
        description="本地资料学习助手（导入、阅读、标注与可选 AI 辅助）",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("library", help="查看资料库与数据库文档").set_defaults(func=cmd_library)
    sub.add_parser("scan", help="扫描 library/ 并解析新文件").set_defaults(func=cmd_scan)
    sub.add_parser("migrate", help="备份并迁移旧 JSON 学习数据").set_defaults(func=cmd_migrate)

    serve = sub.add_parser("serve", help="启动 Web 服务")
    serve.add_argument("--host", default="127.0.0.1", help="监听地址（默认 127.0.0.1）")
    serve.add_argument("--port", type=int, default=5000, help="监听端口（默认 5000）")
    serve.add_argument("--debug", action="store_true", help="开启 Flask 调试模式")
    serve.set_defaults(func=cmd_serve)
    return parser


def main(argv: list = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
