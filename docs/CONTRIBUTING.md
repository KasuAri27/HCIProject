# 提交工作流与提交词规范

本文约定 HCIProject 的日常提交、推送和提交信息格式。目标是让每次提交都能回答三个问题：**改了什么、为什么改、怎么验证的**。

## 1. 分支与提交粒度

- `main` 保持可运行；不直接提交调试代码、运行数据或密钥。
- 功能分支：`feat/<scope>-<short-desc>`，例如 `feat/import-docx`。
- 修复分支：`fix/<scope>-<short-desc>`，例如 `fix/reader-position`。
- 文档/工程：`docs/<short-desc>`、`chore/<short-desc>`。
- 一个提交只做一件逻辑上的事，不要把重构、功能和格式化混在一起。
- `main` 已开启分支保护：改动通过 PR 合并，PR 必须通过 `checks` 与 `commit-messages` 两个检查。
- 推送前先同步远程：`git pull --rebase origin main`；不要对 `main` 使用 force push。

## 2. 提交前检查

在提交前至少运行（测试依赖见 `requirements-dev.txt`）：

```bash
python scripts/check_repo_layout.py
python -m ruff check app tests scripts
python -m unittest discover -s tests -v
node --check app/static/app.js
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
- PR 描述至少包含：改动目的、主要改动、验证方式、已知限制。
- UI 改动建议附截图或操作路径；数据层改动附迁移/回滚说明。
- 合并后删除已合并的功能分支；不要重写已推送的 `main` 历史。

## 7. CI 流水线

`.github/workflows/ci.yml` 在 push 到 `main` 和所有 PR 上运行两个 job：

| job | 检查内容 |
|---|---|
| `checks` | 仓库布局、`ruff`、`unittest`、`node --check` |
| `commit-messages` | 范围内每条提交信息的格式 |

本地预跑与 CI 等价：

```bash
pip install -r requirements-dev.txt
python scripts/check_repo_layout.py
python -m ruff check app tests scripts
python -m unittest discover -s tests -v
node --check app/static/app.js
python scripts/check_commit_messages.py --range origin/main..HEAD
```

合并/自动 revert 提交会被跳过；其余提交必须满足第 3 节的格式。`main` 的分支保护要求这两个检查通过才能合并。紧急情况下可以临时在仓库 Settings → Branches 里放宽保护，但不要把不合规的提交直接推上 `main`。
