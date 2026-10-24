# HCIProject 学习助手

面向本地资料的学习工作台：导入资料后按类型阅读，PDF 播放原版面，PPTX/DOCX 转 PDF 播放，Markdown/TXT 渲染 Markdown；支持资料柜、全文检索、标注、笔记、自评、练习和可选的 AI 助教。

## 目前支持

- **导入**：Markdown、TXT、DOCX、PPTX、PDF（含扫描 PDF）；原文件保留，可随时下载。
- **阅读**：PDF 原版面播放；DOCX/PPTX 用本机 Office 转 PDF 后播放；Markdown/TXT 显示渲染后的正文。
- **资料管理**：资料柜、全文检索、版本提示、阅读位置恢复（Markdown 模式）、标签页批注。
- **学习记录**：高亮标注、笔记保存/撤销/导出、读后自评、理解检查、练习与证据记录。
- **AI 助教**（可选）：划段解释/举例/补前置/理解检查、跨资料检索与带来源引用的问答；不配置 API 也能阅读和记笔记。
- **复杂资料**：PPTX 文字/表格/图片/备注提取；扫描 PDF OCR；旧版本和旧引用保留并提示。

## 快速开始

```bash
pip install -r requirements.txt
python launcher/launcher.py
```

Windows 也可以双击 `launcher/start.bat`；需要原生桌面窗口时运行 `python launcher/desktop.py`。

## 注意事项

- **提交前先阅读提交标准**：[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)。分支命名、提交词格式、提交前检查都以它为准；推送和 PR 会跑 CI，不合规会拦下。
- **当前任务和限制看 TODO**：[docs/TODO.md](docs/TODO.md)。
- 本地数据和密钥不提交：`db/learning.db`、`db/originals/`、`db/backups/`、`db/api_config.json` 以及 `library/` 中的用户资料。
- 不配置 API 也能阅读、标注、记笔记和恢复位置；AI 只是可选增强。
- DOCX/PPTX 转 PDF 依赖 Windows 与本机 Microsoft Office（Word/PowerPoint）；PDF 播放模式暂不记录滚动位置，也不能划选标注。
- 扫描 PDF 的 OCR 需要系统安装 Tesseract，并准备中文语言包（默认 `chi_sim+eng`，可用 `LEARN_OCR_LANG` 调整）。缺少引擎时页面会显示明确提示，文本型 PDF 不受影响。
- PPTX 图表数据、嵌入公式和动画暂不解析；旧版本不提供切换阅读界面。
- 其他文档统一放在 `docs/` 下，根目录只保留本 README。
