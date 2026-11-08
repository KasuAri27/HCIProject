# 数据库与建库

整理日期：2026-11-04；依据当前工作区（含未提交改动），不代表远端 main 已同步。

本文描述当前本地工作区的实现。表结构或迁移变更必须先获用户授权；完整定义以 [store.py](../app/store.py) 的 SCHEMA 和 init_db 为准。相关说明：[架构](ARCHITECTURE.md)、[契约](CONTRACTS.md)。

## 建库入口

在项目根目录、已安装现有依赖的 Python 环境中执行：
~~~powershell
python -c "from app import store; store.init_db()"
~~~
该命令会创建缺失的库、表和索引，也会对已有库执行现有的补列逻辑，并非只读检查。不要对未备份的真实用户库随意运行迁移。
正常启动 python launcher/launcher.py 或 python -m app.cli serve 也会自动初始化，无须另写一套建表 SQL。

默认路径是项目目录下 db/learning.db；环境变量 LEARN_DB 可覆盖路径，必须在导入 app 模块前设置。连接启用 foreign_keys=ON、journal_mode=WAL；store._conn 成功提交、异常回滚，最后关闭连接。当前初始化在 app_state 中写入 key='schema_version'、value='6' 的记录。

## 数据关系

文档是稳定身份，版本是一次内容快照；每个版本拥有章节和内容块。学习记录通过 document_id 隔离，需要定位原文的记录还保存 version_id、block_id。ID 通常为 uuid4().hex 字符串。

| 表 | 用途 |
|---|---|
| documents | 文档身份、来源、当前版本指针 |
| document_versions | 版本号、内容哈希、解析状态、Markdown 和 PDF 路径 |
| chapters、blocks | 章节、内容块、顺序及来源位置 |
| annotations、reading_positions | 标注范围与阅读位置 |
| notes、chat_messages、prereq_cache | 笔记、对话、前置题缓存 |
| read_records、understanding_checks | 阅读状态、理解检查与自评 |
| exercise_state、exercise_history、last_submissions、exercise_evidence | 当前练习、出题历史、最近提交、练习证据 |
| courses、course_documents、chat_threads | 课程、课程与文件关联、文件下独立会话 |
| import_jobs、app_state | 导入任务状态、全局状态；用户档案/头像也存于 app_state |

共 20 张表。版本号在同一文档内唯一；章节和内容块的顺序在同一版本内唯一。具体外键和级联规则见 SCHEMA；例如 annotations.block_id、import_jobs 的关联没有数据库外键约束，不能假定所有引用都会自动级联。

## 文件与数据库的分工

- SQLite 保存结构与学习记录；原文件不作为数据库大字段保存。
- db/originals/<doc_id>/ 保存导入文件，assets/ 保存提取图片，rendered/<version_id>.pdf 保存 Office 转换结果。
- library/ 是用户资料库；db/api_config.json 单独保存模型服务配置与密钥，不属于 SQLite。
- 对应覆盖项为 LEARN_ORIGINALS_DIR、LEARN_LIBRARY_DIR、LEARN_BACKUP_DIR，见 [config.py](../app/config.py)。

## 初始化、迁移与数据保护

- init_db 使用 IF NOT EXISTS 和 _ensure_column 维护现有结构；不要绕过它直接手工改表。
- [migrate.py](../app/migrate.py) 负责旧 JSON 数据迁移、Markdown 补齐与历史 PDF 路径补齐；legacy_migrated 标记用于避免重复导入旧记录。
- 备份位于 db/backups/。现有代码会尝试生成迁移备份，但部分备份错误会被捕获，不能将“初始化成功”当作“备份可恢复”的证明。
- reset_learning 清空学习记录和当前文档选择，保留文档、版本、原文件、模型配置及用户档案。
- 删除文档记录不会自动删除磁盘原文件；同版本重新解析会重新生成块，并清除该版本标注和位置，不能当作无损操作。
- 真实数据库、密钥、原文件、备份及 WAL/SHM 文件不得提交 Git。授权迁移前需确认备份与恢复办法。


## 2026-11-07：课程与独立会话（用户已授权）

- `courses` 保存课程名称；`course_documents` 用稳定文档 ID 关联课程与文件，复用导入去重。同一文件可以关联多个课程，原文、笔记与版本仍是同一份，不复制或搬移磁盘原文件。
- `chat_threads` 按 `document_id` 保存独立会话。`chat_messages.thread_id` 关联会话；写入和读取前校验会话属于当前文件，切换会话不改变文件笔记。
- v5 升级前先用 SQLite backup API 备份到 `db/backups/courses-v6-*.db`。备份失败则拒绝升级；已有消息只补会话关联，保留消息 ID、内容和时间，旧记录集中在“历史对话”。重复初始化不复制会话。
- 旧 API 未指定 `thread_id` 时继续使用该文件稳定的默认会话。新客户端显式发送会话 ID；不将其他会话历史混入模型上下文。
- 当前会话按文件保存在 `app_state` 的 `selected_thread:<doc_id>` 键中。清空学习记录时同时清空会话和当前会话选择，保留课程、文件关联及资料。
- 回退时先停止服务，再用升级前的 SQLite 备份恢复数据库；保留现有原文件目录。不要在运行中的库上覆盖数据库文件。
