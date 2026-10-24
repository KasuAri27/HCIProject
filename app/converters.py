"""把 DOCX / PPTX 转成 PDF，供阅读页直接播放。

依赖 Windows 与本机 Microsoft Office（Word / PowerPoint）。转换只在导入
后台线程或启动补齐时执行；缺少 Office 或 pywin32 时抛出 ConvertError，
由调用方决定失败提示，绝不静默。
"""

import sys
import threading
from pathlib import Path

_lock = threading.Lock()

WORD_PDF_FORMAT = 17
POWERPOINT_PDF_FORMAT = 32


class ConvertError(Exception):
    """Office 转 PDF 失败。"""


def office_available() -> bool:
    if sys.platform != "win32":
        return False
    try:
        import win32com.client  # noqa: F401
    except ImportError:
        return False
    return True


def _word_to_pdf(source: Path, target: Path) -> None:
    import win32com.client

    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    try:
        document = word.Documents.Open(str(source), ReadOnly=True)
        try:
            document.SaveAs(str(target), FileFormat=WORD_PDF_FORMAT)
        finally:
            document.Close(False)
    finally:
        word.Quit()


def _powerpoint_to_pdf(source: Path, target: Path) -> None:
    import win32com.client

    powerpoint = win32com.client.DispatchEx("PowerPoint.Application")
    try:
        presentation = powerpoint.Presentations.Open(str(source), WithWindow=False)
        try:
            presentation.SaveAs(str(target), POWERPOINT_PDF_FORMAT)
        finally:
            presentation.Close()
    finally:
        powerpoint.Quit()


def convert_to_pdf(source: Path, target: Path) -> Path:
    """把 DOCX/PPTX 转成 PDF；返回生成的 PDF 路径。"""
    source = Path(source)
    target = Path(target)
    suffix = source.suffix.lower()
    if suffix not in (".docx", ".pptx"):
        raise ConvertError("只有 DOCX / PPTX 需要转 PDF")
    if not source.is_file():
        raise ConvertError("原文件不存在，无法转换")
    if sys.platform != "win32":
        raise ConvertError("当前系统没有 Microsoft Office，无法转换 DOCX/PPTX；请在 Windows + Office 环境导入")
    try:
        import pythoncom
    except ImportError as exc:
        raise ConvertError("缺少 pywin32，无法调用本机 Office 转换") from exc

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    if tmp.exists():
        tmp.unlink()
    with _lock:
        pythoncom.CoInitialize()
        try:
            if suffix == ".docx":
                _word_to_pdf(source.resolve(), tmp.resolve())
            else:
                _powerpoint_to_pdf(source.resolve(), tmp.resolve())
        except ConvertError:
            raise
        except Exception as exc:
            raise ConvertError(f"Office 转换失败：{exc}") from exc
        finally:
            pythoncom.CoUninitialize()
    if not tmp.is_file() or tmp.stat().st_size == 0:
        raise ConvertError("Office 没有生成有效的 PDF")
    tmp.replace(target)
    return target
