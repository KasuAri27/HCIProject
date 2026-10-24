# CI 检查与验收

本轮落实 CI 审查前五项：前端运行测试、真实后端依赖边界、启动入口、提交规范、数据与密钥禁入。第六项“提交范围回退”按用户要求暂缓；`_git_log`、`_resolve_range` 和 `main` 的范围处理未改动。

## 合并门禁

main 原有必需检查名保持为 `checks`、`commit-messages`。

| 检查 | 执行内容 | 失败后的结果 |
|---|---|---|
| quality | 候选文件布局、Python lint/编译、单元测试、全部 JS 语法和自有 JS lint、候选文件与完整历史密钥扫描 | checks 失败 |
| windows | Windows/Python 3.12 单元测试，含未替换转换编排函数的契约测试 | checks 失败 |
| browser | Chromium 与真实 HTTP 服务，验证关键阅读流程，收集未预期页面异常、控制台错误和失败请求 | checks 失败 |
| ocr | 安装 Tesseract、中英文语言包与中文字体，执行真实扫描 PDF OCR | checks 失败 |
| checks | 必须等上述四项全部 success；failure、cancelled、skipped 均不放行 | 必需检查失败 |
| commit-messages | 非 merge 提交摘要、PR 标题、来源分支与简短正文 | 必需检查失败 |

PR 创建、更新提交、重开、编辑标题和转为可审阅时运行；main push 也运行。手动运行 CI 可验证代码，但不执行缺少比较基准的提交范围检查。第六项保留的回退缺陷仍需单独处理。

这次只修改仓库配置，没有修改 GitHub 的分支保护。原必需检查名称可继续使用；严格更新、强制 PR 与绕过策略仍需要仓库管理员核实。

## 需求如何对应到验收

| 需求 | 自动验证 | 边界 |
|---|---|---|
| 无 API 也能阅读 | 空库启动、禁用 AI 动作、真实 Markdown/TXT 导入 | 不调用真实模型 |
| 笔记不丢且资料隔离 | 界面编辑/保存、刷新、切换另一资料再返回 | 只操作测试创建的数据 |
| 阅读位置恢复 | 真正滚动触发保存，刷新后检查滚动恢复 | PDF 模式本身不支持位置记录 |
| 引用能返回原文 | 在 AI HTTP 响应边界提供固定引用，点击后检查对应内容块高亮 | 引用合法性由后端原有单测验证 |
| AI 失败不阻塞阅读 | 指定 /api/chat 的一次 502，仍能阅读与保存笔记 | 只允许该测试声明的失败，其他错误仍失败 |
| PDF 路径可用 | 真实 PDF 上传、iframe 可见、资源成功、MIME 与 PDF 字节 | 不将浏览器内置查看器的像素渲染当作应用 DOM 验收 |
| 窄窗口仍可阅读 | 800px 窗口下正文可见且宽高非零 | 不替代所有尺寸的人工视觉审阅 |
| 转换编排出错可检出 | 不 mock convert_to_pdf；覆盖 DOCX/PPTX 分派、输出校验、COM 异常与资源关闭 | 系统 COM 边界仍有模拟 |
| 真实 Office 可转换 | 独立 Office 集成验收产生 DOCX/PPTX，检查 PDF 页与文本 | 需要 Windows、Office、pywin32 |
| 扫描 PDF 可提取中文 | 真正执行扫描 PDF -> 嵌入图片 -> Tesseract -> 内容块并核对文字 | 合成样本，复杂真实课件质量另验收 |

新增或改变需求时，在 PR 的验证表中指向对应测试或人工验收证据；没有对应测试的需求不能仅凭 CI 绿灯判定完成。

## 本地执行

以下命令均从仓库根目录运行；先激活 `D:\Dev` 下的项目开发环境。开发工具按全局约定安装在 `D:\Dev`。CI runner 上的项目依赖安装由工作流管理。

```powershell
python -m pip install -r requirements-dev.txt -r requirements-browser.txt
$frontendTools = 'D:\Dev\tool\hci-ci\frontend'
New-Item -ItemType Directory -Force $frontendTools
Copy-Item scripts/frontend/package*.json $frontendTools
npm ci --prefix $frontendTools --ignore-scripts
$env:HCI_ESLINT_DIR = $frontendTools
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\Dev\tool\hci-ci\browsers'
python -m playwright install chromium
python scripts/check_repo_layout.py
python -m ruff check app tests scripts launcher
python -m compileall -q app tests scripts launcher
python -m unittest discover -s tests -v
python scripts/check_frontend.py
python -m unittest discover -s tests/browser -v
python scripts/check_commit_messages.py --range origin/main..HEAD
python -m scripts.check_secrets --gitleaks <Gitleaks可执行文件> --history
```

可以把浏览器依赖、ESLint 安装到 D:\Dev；本次本地验证采用：

```powershell
$env:PYTHONPATH = 'D:\Dev\tool\hci-ci\python'
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\Dev\tool\hci-ci\browsers'
$env:HCI_ESLINT_DIR = 'D:\Dev\tool\hci-ci\frontend'
$env:GITLEAKS_BIN = 'D:\Dev\tool\hci-ci\gitleaks\gitleaks.exe'
```

若系统临时目录受限，先创建仓库下已忽略的 `.uitest/runtime`，将当前进程的 TMP/TEMP 指向它。测试 HTTP 服务使用独立临时目录、临时端口和空 API 配置，不读取开发者的 db、资料库或密钥。浏览器禁止站外 HTTP 请求；data/about 和 Chromium 内部资源可加载。

浏览器失败时，trace 位于 `.uitest/browser/`，GitHub 上传失败 trace，保留 7 天。测试固定 Playwright 版本并安装与之对应的 Chromium；Node 固定主版本 24，ESLint/globals 使用锁文件。

## 外部工具验收

真实 OCR：

```powershell
# 本机先安装 Tesseract 与 chi_sim、eng；必要时配置 PATH、TESSDATA_PREFIX。
python -m unittest discover -s tests/integration -p test_external_tools.py -k Ocr -v
```

真实 Office：

```powershell
python -m unittest discover -s tests/integration -p test_external_tools.py -k Office -v
```

两者缺少环境会失败，不以 skip 代替成功。Office 工作流只允许维护者手动选择可信 ref，在带 `office` 标签的 Windows 自托管 runner 运行；仓库尚未核实存在该 runner。它目前不属于常规 PR 自动门禁，涉及 Office 转换的改动合并前需要附真实验收结果。本机已完成一次 Word、PowerPoint 真实转换，不能据此声称 GitHub 已配置该 runner。

## 提交与数据规则

- 摘要不能为空，必须包含具体中文说明；拒绝“更新代码”“杂项”等约定的空泛摘要。
- `Merge `、`Revert ` 字符串不再免检；真正 merge 通过 git log --no-merges 排除。回退提交改用 `revert: 回退某项具体改动`。
- PR 标题采用同样规则，正文按统一模板填写「内容 / 验证 / 注意」三节，每节简述，最多 800 字符。来源分支接受 feat/fix/docs/chore/codex 前缀和小写短横线描述；codex 用于自动化协作分支。
- PR 标题与来源分支从事件 JSON 读取，不拼接进 shell。最终 squash 消息仍需维护者保留已验证的中文标题，CI 无法预知合并时任意编辑的消息。
- 整个 db/、用户资料、.qoder-credits、缓存/依赖/构建目录、本机环境与密钥文件禁止入库。允许不含密钥的 .env.example/.env.sample。
- 布局与密钥扫描纳入未忽略的新增文件，避免本地检查漏掉尚未 git add 的文件；已跟踪文件即使后来被忽略也会扫描。
- Gitleaks 固定 8.30.1，CI 校验发布包 SHA256；扫描候选文件和完整历史，日志脱敏。若误报，只对经审阅的精确样本做例外，不跳过整个测试目录；不宣称扫描能发现一切秘密。

故障样本复验：

```powershell
python -m scripts.probe_ci_gates
```

该脚本在不含用户数据的源码副本中验证原审查样本被阻挡：启动器语法错误、转换函数无条件失败、前端启动抛错、不规范摘要、禁入路径，以及通过 stdin 输入的合成无权限密钥形状样本。结果写入已忽略的 `.uitest/gate-probes.json`。

## PR 与合并后清理

创建或更新 PR 前必须阅读[统一模板](../.github/pull_request_template.md)，按「内容 / 验证 / 注意」简短填写，后续 PR 统一遵守；示例见 [PR_EXAMPLE_CI.md](PR_EXAMPLE_CI.md)。

`delete-merged-branch.yml` 在 PR 已合并时删除同仓库远端来源分支。它只运行可信默认分支脚本，不检出 PR 代码，不删除默认分支；若来源分支合并后已有新提交，工作流失败并保留分支，需先核对新工作。本地来源分支在切离后删除，不再保留已合并旧分支。
