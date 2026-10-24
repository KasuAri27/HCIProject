"""本地资料学习助手后端包（第三阶段）。

模块划分：
- config.py       可写目录、资料库、SQLite、原文件与环境变量
- store.py        SQLite 文档/版本/章节/内容块/标注/学习记录
- parsers.py      Markdown / TXT / DOCX / 文本 PDF → 统一文档结构
- render.py       内容块 → 带 block id 的 HTML
- imports.py      上传、资料库扫描、后台解析任务
- migrate.py      第一阶段 JSON → SQLite 迁移与备份
- source.py       资料库文件与 Markdown 渲染工具
- ai_context.py   统一 AI 上下文构建与引用校验
- tutor.py        划段解释/举例/补前置/理解检查与批改
- chapter_chat.py 按文档 ID 对话
- notes.py        按文档 ID 笔记与 AI 建议/草稿
- prereq.py       可选前置自评
- explainer.py    出题与批改
- progress.py     阅读进度/题目/提交（封装 store）
- web.py          Flask 页面与 JSON API
- cli.py          library / scan / migrate / serve 命令
"""
