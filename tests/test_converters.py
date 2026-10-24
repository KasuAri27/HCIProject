"""执行真实转换编排，只替换系统/COM 边界，不替换 convert_to_pdf。"""

from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

from app import converters


class ConverterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "source.docx"
        self.source.write_bytes(b"office-input")
        self.target = self.root / "rendered" / "output.pdf"
        self.com = types.ModuleType("pythoncom")
        self.com.CoInitialize = Mock()
        self.com.CoUninitialize = Mock()

    def test_rejects_bad_format_missing_file_and_non_windows(self):
        with self.assertRaisesRegex(converters.ConvertError, "只有"):
            converters.convert_to_pdf(self.root / "source.txt", self.target)
        with self.assertRaisesRegex(converters.ConvertError, "不存在"):
            converters.convert_to_pdf(self.root / "missing.docx", self.target)
        with patch.object(sys, "platform", "linux"):
            with self.assertRaisesRegex(converters.ConvertError, "Windows"):
                converters.convert_to_pdf(self.source, self.target)

    def test_reports_missing_pywin32(self):
        with patch.object(sys, "platform", "win32"), patch.dict(sys.modules, {"pythoncom": None}):
            with self.assertRaisesRegex(converters.ConvertError, "pywin32"):
                converters.convert_to_pdf(self.source, self.target)

    def convert(self, boundary):
        with patch.object(sys, "platform", "win32"), patch.dict(sys.modules, {"pythoncom": self.com}):
            with patch("app.converters._word_to_pdf", side_effect=boundary) as word:
                result = converters.convert_to_pdf(self.source, self.target)
        self.com.CoInitialize.assert_called_once()
        self.com.CoUninitialize.assert_called_once()
        word.assert_called_once()
        return result

    def test_real_orchestrator_publishes_pdf_atomically(self):
        def write_pdf(source, target):
            self.assertEqual(source, self.source.resolve())
            self.assertFalse(self.target.exists())
            target.write_bytes(b"%PDF-1.4\nfixture")

        self.assertEqual(self.convert(write_pdf), self.target)
        self.assertTrue(self.target.read_bytes().startswith(b"%PDF"))
        self.assertFalse(self.target.with_suffix(".pdf.tmp").exists())

    def test_rejects_missing_or_empty_conversion_output(self):
        for empty in (False, True):
            with self.subTest(empty=empty):
                self.com.CoInitialize.reset_mock()
                self.com.CoUninitialize.reset_mock()

                def write_empty(source, target):
                    if empty:
                        target.write_bytes(b"")

                with self.assertRaisesRegex(converters.ConvertError, "有效的 PDF"):
                    self.convert(write_empty)
                self.assertFalse(self.target.exists())

    def test_com_error_is_reported_and_uninitialized(self):
        with patch.object(sys, "platform", "win32"), patch.dict(sys.modules, {"pythoncom": self.com}):
            with patch("app.converters._word_to_pdf", side_effect=RuntimeError("COM unavailable")):
                with self.assertRaisesRegex(converters.ConvertError, "COM unavailable"):
                    converters.convert_to_pdf(self.source, self.target)
        self.com.CoUninitialize.assert_called_once()
        self.assertFalse(self.target.exists())

    def test_pptx_dispatch_uses_powerpoint(self):
        deck = self.source.with_suffix(".pptx")
        deck.write_bytes(b"presentation")
        with patch.object(sys, "platform", "win32"), patch.dict(sys.modules, {"pythoncom": self.com}):
            with patch("app.converters._powerpoint_to_pdf", side_effect=lambda s, t: t.write_bytes(b"%PDF")) as ppt:
                converters.convert_to_pdf(deck, self.target)
        ppt.assert_called_once()
        self.com.CoUninitialize.assert_called_once()


class ComBoundaryTests(unittest.TestCase):
    def test_office_resources_close_on_save_error(self):
        for helper, app_name, open_chain in (
            (converters._word_to_pdf, "Word.Application", "Documents"),
            (converters._powerpoint_to_pdf, "PowerPoint.Application", "Presentations"),
        ):
            with self.subTest(application=app_name):
                client = types.ModuleType("win32com.client")
                application = Mock()
                document = getattr(application, open_chain).Open.return_value
                document.SaveAs.side_effect = RuntimeError("disk full")
                client.DispatchEx = Mock(return_value=application)
                package = types.ModuleType("win32com")
                package.client = client
                with patch.dict(sys.modules, {"win32com": package, "win32com.client": client}):
                    with self.assertRaisesRegex(RuntimeError, "disk full"):
                        helper(Path("input.docx"), Path("output.pdf"))
                client.DispatchEx.assert_called_once_with(app_name)
                document.Close.assert_called_once()
                application.Quit.assert_called_once()
