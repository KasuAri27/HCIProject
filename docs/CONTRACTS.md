# 核心契约

整理日期：2026-11-04；依据当前工作区（含未提交改动），不代表远端 main 已同步。

契约是调用方与实现方共同依赖的约定。本文是当前本地工作区的简明基线，不是完整 OpenAPI；完整字段以 [web.py](../app/web.py)、对应功能模块和 tests/ 为准。若文档、代码、测试冲突，先报告差异，未经明确授权不改行为。参见 [架构](ARCHITECTURE.md)、[数据库](DATABASE.md)。

## 公共约定

- 普通 API 使用同源 HTTP + JSON，上传使用 multipart/form-data，原文件/PDF/图片返回对应文件类型。不要假定所有 /api 路径都返回 JSON。
- 常用状态码：200 成功响应，400 参数错误，404 资源不存在，413 文件过大，502 模型调用失败。业务 JSON 错误通常为 {"error":"说明"}；未处理异常与部分资源错误仍可能返回 HTML，当前没有全局统一错误封装。
- 默认上传上限 50 MB，可由 LEARN_MAX_UPLOAD_MB 配置。导入返回 200 仅表示请求已处理，解析是否成功必须检查任务/版本状态。
- 文档身份用 doc_id 或 document_id，版本用 version_id，内容块用 block_id；字段名按具体接口保留，不能自行统一改名。路径和文件名不是稳定身份。
- API Key 存于本地配置；公开配置接口返回 has_key/掩码等状态，不回传完整 Key。未配置 AI 不应阻断阅读与笔记。

## 主要接口

下表列出开发中最常用的入口，不是全部路由清单；新增或修改接口仍需同步文档与测试。

| 方法与路径 | 输入和关键输出 |
|---|---|
| GET /api/health、/api/session、/api/library | 健康标识、当前资料/学习聚合、资料与任务列表；这些 GET 的响应结构各自不同 |
| POST /api/import | multipart 字段 file；返回 document_id，非重复导入还有 version_id/job_id；保留 duplicate 状态 |
| GET /api/imports、/api/imports/<job_id>；POST /api/imports/<job_id>/retry | 查询/重试解析任务；状态为 queued、parsing、ready、failed，进度 0～100 |
| GET /api/documents/<doc_id>；POST /api/documents/<doc_id>/open | 返回文档内容；open 更新当前选择并标记已读 |
| GET /api/documents/<doc_id>/pdf、/api/documents/<doc_id>/original、/api/documents/<doc_id>/assets/<name> | 返回文件；保留各资源路由现有的路径处理与访问边界 |
| GET/POST /api/documents/<doc_id>/position | 保存 version_id、block_id、block_offset、scroll_ratio；POST 只接受当前版本内的有效块，比例限制在 0～1 |
| GET/POST /api/documents/<doc_id>/annotations；PATCH/DELETE /api/annotations/<annotation_id> | 标注包含块、版本、quote、start_offset/end_offset、note、color；范围按块内字符偏移解释 |
| GET/PUT /api/notes | 查询参数或 JSON 使用 doc_id；PUT 还需 content，可带 title；返回保存后的笔记及统计 |
| GET/POST /api/chat；POST /api/chat/spot、/api/chat/suggestions | 文档对话、现场问、建议提问；生成输入以 doc_id、question、quote、block_id 等现有字段为准 |
| GET /api/search；POST /api/ask | search 用 q，返回 results/keywords/count 等；ask 用 query，返回 answer/citations/sources；可限定 doc_id |
| POST /api/notes/draft | doc_id、instruction、quote；可选 stream=true，见下文 |
| GET/POST /api/config、GET/POST /api/providers、POST /api/active-model | 配置兼容入口、模型服务管理、当前模型选择；各自按 api_config.py 的解析与公开字段执行 |
| GET/POST /api/profile、POST/DELETE /api/profile/avatar | 用户档案与头像；档案保存在 app_state |
| POST /api/reset | 清理学习记录，保留资料、版本、文件、模型配置及用户档案 |

出题/批改、前置自评、划段动作、理解检查与练习证据接口还包括 /api/exercise、/api/exercise/submit、/api/prereq、/api/selection/action、/api/understanding 等，具体必填项见对应 parse_body 和路由，不凭名称推断字段。

## 阅读与引用

文档内容响应以 status 决定能否阅读，只有 ready 才表示解析完成。关键字段为 document、version、versions、blocks、chapters、html、annotations、position、view_mode、pdf_url、original_url；部分状态下字段可能为空或缺省。
view_mode 为 markdown 或 pdf；pdf_missing 表示缺少播放文件、可能回退为文本预览。version 的对外序号为 number，数据库列名为 version_no。

模型上下文把块标为 [B:<block_id>]，回答引用写为 [cite:<block_id>]。ai_context.clean_citations 只保留上下文白名单内、符合既有格式的引用；不能只靠前端生成可信引用。来源定位可能是页码、幻灯片或行号，页级定位不等于段落高亮。

## 笔记草稿 SSE

POST /api/notes/draft，JSON 示例：
~~~json
{"doc_id":"实际文档ID","instruction":"整理要点","stream":true}
~~~
返回 Content-Type: text/event-stream，每条消息是 data: 后跟 JSON，再以空行结束：
~~~text
data: {"started":true}

data: {"delta":"一段文本"}

data: {"done":true}

~~~
失败时返回 {"error":"说明"} 事件；HTTP 连接成功不等于生成成功。客户端关闭连接时，生成器应释放上游连接。未传 stream=true 时仍使用普通 JSON draft 响应。生成草稿不会自动持久化，采纳后才通过 PUT /api/notes 保存。

## 前后端协作与验证

- 主阅读台为单页；设置放统一弹窗，旧地址重定向兼容。切换或关闭弹窗不得丢失资料、位置和未提交输入。
- render.py 输出 .doc-block、data-block-id 和来源定位元数据；前端选择、引用、标注依赖这些字段，不能单独改一侧。
- learning:pdf-page 事件的 detail.page 为页码；阅读设置、档案、API 配置等 learning:* 事件及 localStorage 键也是跨模块约定，改动前需检查发送方、接收方与旧数据兼容。
- 文档切换必须隔离笔记、对话和异步响应；不得将旧文档响应覆盖到新文档。此项是目标约定，现有迟到响应问题仍需修复，不能视为已获测试保证。
- 关键契约测试分布在 test_phase2/3/4、test_api_providers、test_chat_suggestions、test_notes_stream 与浏览器测试中。现有测试并非完整契约证明；变更前定位对应断言，禁止为通过检查而擅自放宽契约。
