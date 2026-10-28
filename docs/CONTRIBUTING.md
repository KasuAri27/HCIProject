# 提交工作流与提交词规范

本文约定 HCIProject 的日常提交、推送和提交信息格式。目标是让每次提交都能回答三个问题：**改了什么、为什么改、怎么验证的**。

## 1. 分支与提交粒度

### 界面约定（后续开发必须遵守）

- 主页面是唯一完整页面，承载资料阅读、对话、笔记与练习。
- 点击右上角头像直接打开统一设置弹窗；个人档案、API 配置、阅读、学习数据、快捷键和关于均在弹窗内切换。
- 后续新增的所有非主页面必须作为统一弹窗中的板块实现，不新增独立整页或跳转入口。
- 弹窗内切换与关闭不得重新加载阅读台，必须保留当前资料、阅读位置和未提交输入；可支持旧地址重定向到主页面并打开对应板块。

### 分支规则

- `main` 保持可运行；不直接提交调试代码、运行数据或密钥。
- 功能分支：`feat/<scope>-<short-desc>`，例如 `feat/import-docx`。
- 修复分支：`fix/<scope>-<short-desc>`，例如 `fix/reader-position`。
- 文档/工程：`docs/<short-desc>`、`chore/<short-desc>`。
- Codex 协作分支允许 `codex/<short-desc>`。来源分支使用小写字母、数字与短横线；PR 标题执行同样的提交词校验。
- 一个提交只做一件逻辑上的事，不要把重构、功能和格式化混在一起。
- `main` 已开启分支保护：改动通过 PR 合并，PR 必须通过 `checks` 与 `commit-messages` 两个检查。
- 推送前先同步远程：`git pull --rebase origin main`；不要对 `main` 使用 force push。

## 2. 提交前检查

在提交前至少运行（测试依赖见 `requirements-dev.txt`）：

```bash
python scripts/check_repo_layout.py
python -m ruff check app tests scripts launcher
python -m compileall -q app tests scripts launcher
python -m unittest discover -s tests -v
python scripts/check_frontend.py
python -m unittest discover -s tests/browser -v
python scripts/check_commit_messages.py --message "feat(import): 支持 DOCX 导入"
```

涉及 UI 的改动还应实际打开页面验证：

```bash
python launcher/launcher.py
```

重点检查导入、阅读、标注、位置恢复、笔记保存和无 API 状态。涉及数据层的改动要确认：

- 不破坏已有文档 ID、标注和阅读位置；
- 旧数据迁移可重复执行，迁移前有备份；
- 解析失败有明确错误和重试路径。

## 3. 提交词格式

采用 Conventional Commits 风格，摘要使用中文：

```text
<type>(<scope>): <中文摘要>
```

- 摘要使用祈使句，直接说明动作，例如“修复阅读位置恢复”，不要写“修复了……”。
- 摘要不超过 50 个字符，末尾不加句号。
- 需要解释动机、影响和验证时，空一行写正文；正文每行尽量不超过 72 个字符。
- 一个提交只写一个主题；不要用“更新代码”“杂项”这类空摘要。
- 自动检查要求摘要包含中文，并拒绝约定的空泛摘要；语义是否具体、是否单一主题仍需要审阅。
- 真正的 merge 通过提交拓扑跳过；普通提交不能靠 `Merge ` 或 `Revert ` 前缀免检。回退请使用 `revert: 回退具体改动`。

### type

| type | 用途 |
|---|---|
| `feat` | 新增用户可感知的能力 |
| `fix` | 修复缺陷或错误行为 |
| `refactor` | 不改变外部行为的结构调整 |
| `perf` | 性能或资源占用优化 |
| `test` | 新增或调整测试 |
| `docs` | 只改文档 |
| `chore` | 构建、依赖、仓库初始化、杂务 |
| `build` | 打包或构建配置 |
| `ci` | CI 配置 |
| `revert` | 回退已有提交 |

### scope

按改动的主要区域选择，常用：

`import`、`reader`、`annotate`、`note`、`exercise`、`ai`、`store`、`migrate`、`ui`、`deps`、`docs`。

没有明确区域时可以省略 scope，例如 `docs: 更新第二阶段说明`。

### 示例

```text
feat(import): 支持 DOCX 与文本型 PDF 导入
fix(reader): 恢复位置时忽略过期版本
refactor(store): 统一内容块的 Markdown 字段
test(store): 覆盖改名后文档 ID 保持
docs: 更新导入与标注说明
chore(deps): 增加 python-docx 与 pypdf
```

正文示例：

```text
fix(reader): 恢复位置时忽略过期版本

旧版本的内容块 ID 可能在新版本中不存在，恢复前先校验
version_id 和 block_id，避免滚动到错误位置。

验证：python -m unittest discover -s tests -v
```

## 4. 初始化仓库的标准提交

仓库第一次提交统一使用：

```text
chore: 初始化仓库
```

正文说明本次初始化的范围、运行方式和验证结果。后续提交不要重复使用“初始化仓库”作为摘要。

## 5. 数据与密钥

以下内容只留在本地，不进入 Git：

- `db/learning.db` 及其 WAL/SHM 文件；
- `db/originals/` 中导入的原文件；
- `db/backups/` 中的迁移备份；
- `db/api_config.json` 中的 API Key；
- `db/*.json` 运行时学习数据；
- `library/` 中的用户资料（保留 `.gitkeep`）；
- `.qoder-credits/`、缓存、构建产物和虚拟环境。

提交前用 `git status` 和 `git diff --staged` 再检查一次，确认没有把用户资料或密钥带进去。

## 6. PR 与推送

- 推送前确认工作区干净，提交信息符合本规范。
- **创建或更新 PR 前，必须先阅读并按 [PR 模板](../.github/pull_request_template.md)填写**；后续所有 PR 统一遵守。[简短示例](PR_EXAMPLE_CI.md)。
- 正文只保留「内容 / 验证 / 注意」三节，每节 1～2 句，建议 200 字以内。内容简述目的与主要改动，验证写结果，注意写限制；没有限制写“无”。详细方案和日志只放链接，自动检查上限为正文 800 字符。
- 验证结果要区分本地、GitHub CI、模拟边界与真实外部工具。没有执行或没有环境时明确写出。
- UI 改动建议附截图或操作路径；数据层改动附迁移/回滚说明。
- **PR 合并后删除其远端及本地来源分支，不再保留旧分支**；不要重写已推送的 `main` 历史。CI 的清理工作流负责删除同仓库远端分支，默认分支与合并后已新增提交的分支除外；本地分支在切离后删除。

## 7. CI 流水线

`.github/workflows/ci.yml` 在 push 到 `main` 和 PR 上运行质量门禁，保留两个必需检查名称：

| job | 检查内容 |
|---|---|
| `checks` | 汇总 Linux 质量检查、Windows 单测、浏览器关键流程、真实 OCR；任一失败、跳过或取消均不放行 |
| `commit-messages` | 范围内每条非 merge 提交信息、PR 标题与来源分支 |

基础本地预跑（先激活 D:\Dev 下的开发环境，前端工具安装方式见 [CI.md](CI.md)）：

```bash
pip install -r requirements-dev.txt -r requirements-browser.txt
python scripts/check_repo_layout.py
python -m ruff check app tests scripts launcher
python -m compileall -q app tests scripts launcher
python -m unittest discover -s tests -v
python scripts/check_frontend.py
python -m unittest discover -s tests/browser -v
python scripts/check_commit_messages.py --range origin/main..HEAD
```

外部工具与密钥扫描另按 [CI 检查与验收](CI.md)执行；完整 GitHub 矩阵与本地环境不等同。Office 的真实转换需要受控 Windows + Office 环境，常规 PR 中的 Windows 契约测试不替代真实验收。

第六项“提交范围回退”按用户要求暂缓，缺少或无法读取比较基准时仍有已知问题。CI 审查前五项的实现、边界及需求到测试的对应见 [CI.md](CI.md)。`main` 已有的必需状态检查是 `checks` 与 `commit-messages`；本轮未更改仓库保护设置，完整强制 PR/更新/绕过策略尚未获权限核实。
