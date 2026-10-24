"""配置管理模块。

所有可配置项均从环境变量读取，禁止把 API Key 等敏感信息硬编码进代码。

可设置的环境变量：
- LEARN_LIBRARY_DIR  本地资料目录（默认：可写根目录下的 library/）
- LLM_API_BASE       OpenAI 兼容 API 基础地址（默认：https://api.deepseek.com）
- LLM_API_KEY        API 密钥（可选；不配置时阅读与本地功能仍可用）
- LLM_MODEL          模型名称（默认：deepseek-v4-flash）
- LLM_TIMEOUT        HTTP 请求超时秒数（默认：180）
- LLM_TEMPERATURE    采样温度（默认：0.7）
- LEARN_OCR_LANG     OCR 语言（默认：chi_sim+eng）
"""

import os
import sys
from pathlib import Path

# 项目根目录 = 本文件所在目录的上一级（app/ -> 项目根）
_SOURCE_ROOT = Path(__file__).resolve().parent.parent


def _app_dir() -> Path:
    """可写数据目录（资料库、学习进度、笔记、API 配置）。

    源码运行时为项目根；打包后为可执行文件所在目录，便于备份迁移。
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return _SOURCE_ROOT


# 可写数据根（library/ 与运行时 JSON）
APP_DIR = _app_dir()

# 本地资料目录：用户把 .md / .txt / .docx / .pdf 放进来即可阅读
LIBRARY_DIR = Path(
    os.environ.get("LEARN_LIBRARY_DIR", str(APP_DIR / "library"))
)

# 学习数据库（文档、版本、章节、内容块、标注、学习记录）
DB_PATH = Path(os.environ.get("LEARN_DB", str(APP_DIR / "db" / "learning.db")))

# 导入时保留的原始文件
ORIGINALS_DIR = Path(
    os.environ.get("LEARN_ORIGINALS_DIR", str(APP_DIR / "db" / "originals"))
)

# 旧 JSON 数据备份目录
BACKUP_DIR = Path(os.environ.get("LEARN_BACKUP_DIR", str(APP_DIR / "db" / "backups")))

# 导入大小上限（MB）
MAX_UPLOAD_MB = int(os.environ.get("LEARN_MAX_UPLOAD_MB", "50"))

# OpenAI 兼容 API 配置
LLM_API_BASE = os.environ.get("LLM_API_BASE", "https://api.deepseek.com")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "deepseek-v4-flash")
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "180"))
LLM_TEMPERATURE = float(os.environ.get("LLM_TEMPERATURE", "0.7"))

# 扫描 PDF 的 OCR 语言；需要系统安装 Tesseract 与对应语言包
OCR_LANG = os.environ.get("LEARN_OCR_LANG", "chi_sim+eng")
