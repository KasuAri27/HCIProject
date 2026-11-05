# 当前架构

整理日期：2026-11-04。

适用范围：当前本地工作区，包含尚未提交的前端和笔记流式改动。本文整理现状，不授权修改数据库、架构、契约或技术栈；变更遵守 [AGENTS.md](../AGENTS.md)。

## 系统形态

本地优先、单用户、模块化单体。默认通过 127.0.0.1:5000 提供服务，主阅读台是唯一完整页面，设置功能放在统一弹窗中；旧独立页面地址重定向到主页面。

~~~text
浏览器 / 可选 pywebview
        ↓ 同源 HTTP
Flask 路由 → 业务模块 → SQLite / 本地文件
                  ↓
            可选模型 HTTP 接口
~~~

## 职责边界

| 模块 | 职责 |
|---|---|
| web.py | 页面、API、参数处理和功能编排 |
| imports.py | 上传、扫描、任务登记、后台解析与重试 |
| parsers.py、converters.py、render.py | 格式解析、Office 转 PDF、内容块转阅读 HTML |
| store.py、migrate.py | SQLite 访问、结构初始化、旧数据迁移与补齐 |
| chapter_chat.py、notes.py、tutor.py、explainer.py、prereq.py、progress.py | 对话、笔记、划段讲解、练习、前置自评与进度 |
| search.py、ai_context.py、chat_suggestions.py | 跨资料关键词检索、上下文与引用校验、建议提问 |
| llm.py、api_config.py | 模型 HTTP 调用、流式读取、服务配置与密钥掩码 |
| config.py、source.py | 可写路径、环境配置、资料库与资源路径检查 |
| templates/、static/、launcher/ | 页面与交互、阅读器、浏览器/桌面启动入口 |

路由和 SQL 访问比较集中，模块职责主要靠代码约定维护。后台任务使用进程内守护线程；任务状态保存在 SQLite，前端轮询。当前没有独立任务队列服务。

## 两条主要流程

1. **资料导入**：上传或扫描 → 保存原文件、文档/版本/任务 → 后台解析 → 保存章节和块 → 标为 ready。PDF 使用原文件；DOCX/PPTX 经本机 Office 转 PDF；Markdown/TXT 渲染正文。文本与来源位置用于检索和 AI。
2. **AI 辅助**：选定文档/选区 → 构造带块 ID 的上下文 → 请求模型 → 对支持引用的回答校验白名单 → 返回前端。笔记建议和草稿不自动写入笔记，用户采纳后保存。

启动时 bootstrap 初始化资料库和数据库，执行现有迁移、恢复任务状态、扫描资料并补齐 PDF 路径。只需要建库时按 [DATABASE.md](DATABASE.md) 操作，不必调用完整启动流程。

## 固定技术栈

- 后端：Python、Flask、Jinja2、标准库 sqlite3；现有 CI 基线为 Python 3.12。
- 前端：原生 HTML/CSS/JavaScript，本地 PDF.js 与 KaTeX；可选 pywebview 桌面壳。
- 解析：python-docx、python-pptx、pypdf、Pillow；OCR 为 pytesseract + Tesseract，默认 chi_sim+eng。
- Office 转换：Windows + Microsoft Word/PowerPoint + pywin32。
- AI：urllib 调用 OpenAI 兼容 HTTP 接口；当前笔记草稿支持 SSE，其他主要生成接口仍等待完整结果。
- 检查：unittest、Ruff、ESLint、Playwright/Chromium、Gitleaks、GitHub Actions；Node.js 24 用于现有前端检查。

依赖与版本约束见 requirements*.txt 和 scripts/frontend/package*.json；运行依赖多为最低版本范围，并非完整锁版环境。未经授权不得更换选型、调整依赖或引入新基础设施。

## 当前边界与文档入口

AI 未配置或失败时仍须能阅读和保存笔记。本地服务没有完整账号鉴权、CSRF 与限流体系，不能直接当作公网多用户服务部署。
当前检索是关键词子串打分；PDF.js 支持文本型 PDF 选字及页级定位，应用标注和 PDF 位置恢复尚未接入。

- [数据库与建库](DATABASE.md)：数据身份、初始化和迁移。
- [核心契约](CONTRACTS.md)：接口、事件和持久化约定。
- [贡献规范](CONTRIBUTING.md)、[CI](CI.md)：提交及验证规则。
