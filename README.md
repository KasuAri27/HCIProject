# HCIProject 学习助手

面向本地资料的学习工作台：把 Markdown、TXT、DOCX、文本型 PDF 导入后，统一解析为 Markdown 预览，支持离线阅读、划选高亮、批注、笔记、出题和阅读位置恢复；AI 是可选助教，不配置也不影响使用。

## 快速开始

```bash
pip install -r requirements.txt
python launcher/launcher.py
```

Windows 也可以双击 `launcher/start.bat`；需要原生桌面窗口时运行 `python launcher/desktop.py`。

## 注意事项

- **提交前先阅读提交标准**：[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)。分支命名、提交词格式、提交前检查都以它为准；推送和 PR 会跑 CI，不合规会拦下。
- **当前任务和验收标准看 TODO**：[docs/TODO.md](docs/TODO.md)。新功能先确认所在阶段，再动手。
- 本地数据和密钥不提交：`db/learning.db`、`db/originals/`、`db/backups/`、`db/api_config.json` 以及 `library/` 中的用户资料。
- 不配置 API 也能阅读、标注、记笔记和恢复位置；AI 只是可选增强。
- 其他文档统一放在 `docs/` 下，根目录只保留本 README。