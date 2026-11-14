# 当前架构

整理日期：2026-11-04。

适用范围：当前本地工作区，包含尚未提交的前端和笔记流式改动。本文整理现状，不授权修改数据库、架构、契约或技术栈；变更遵守 [AGENTS.md](../AGENTS.md)。

## 系统形态

本地优先、单用户、模块化单体。默认通过 127.0.0.1:5000 提供服务，提供三个主页面：阅读工作台（`/`）、知识星空页（`/sky`）、学习工具页（`/tools`）；设置功能放在统一弹窗中，旧独立设置页地址重定向到工作台。

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


## 课程工作台扩展（2026-11-07，用户已授权）

继续采用现有 Flask + 原生前端 + SQLite，不新增依赖或独立服务。左侧按课程组织文件，文件下列出独立会话；原文、笔记、AI 对话在宽屏并排，AI 可单独收起。窄屏课程栏使用抽屉，笔记常驻，原文按需打开。

课程与会话存取仍由 `store.py` 承担，`web.py` 校验和编排，`chapter_chat.py` 与建议/笔记模块显式接收会话 ID。资料的身份、原文件、解析和版本流程不变；课程通过关联表引用稳定文档 ID，笔记按文件共享，对话按会话隔离。升级和兼容规则见数据库与契约文档的 2026-11-07 扩展节。


### 笔记与对话入口调整（2026-11-07）

工作台从左到右依次为课程栏、原文、常驻笔记与 AI 对话。宽屏默认课程栏占 16%、原文占 50%，笔记与 AI 均分剩余空间；三条分隔线可拖动或用方向键调整相邻区域，课程栏调整范围为 15%～20%，比例保存在本机浏览器。笔记作为 AI 左侧的独立编辑区常驻，AI 展开占用笔记的弹性空间，原文区宽度保持不变。窄屏笔记仍常驻，原文按需打开。独立练习页及笔记 AI 草稿/建议区移除，出题、答题、批改和笔记建议都在当前文档会话中完成。模型读取已保存笔记，建议不自动改写笔记；用户可以明确将回复记入笔记。既有练习与草稿 API、数据库历史记录保留兼容，本次不改变结构或响应格式。


## 主页面扩展（2026-11-10，用户已授权）

主页面由阅读工作台、知识星空页和学习工具页组成，仍由 Flask 的 `web.py` 渲染 Jinja2 模板，使用原生 JS/CSS，不新增后端服务。星空页依赖 three.js 0.170.0，以本地文件放在 `static/vendor/three/`；学习工具页现阶段只有纯前端的函数图绘制。三页的路由契约见 [CONTRACTS.md](CONTRACTS.md) 的 2026-11-10 节。
