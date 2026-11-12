# 两分钟学习工作台宣传片

角色开场版成片见 [`output/study-film-cinematic.mp4`](output/study-film-cinematic.mp4)。

星空片段预览：`output/knowledge-preview.mp4`（原片 1:27–1:44，含配音与字幕）。通过 `python scripts/extract_knowledge.py` 从完成的成片提取。

120 秒，1920×1080，30 fps，H.264/AAC；中文合成配音、中文字幕、原创合成配乐，无产品名和品牌 Logo。全部画面由程序制作，不需要真人素材。

## 内容

前 32 秒以风格化三维角色演出夜间复习。学生从背面抱头，到右侧切换工具，再由同一条运镜掠过人物背后，抵达左侧观看加速翻阅的长文。随后学生起身面对散落的知识点，镜头绕回背面，时钟与滴答声加速。第 32 秒进入原页面演示。

完整时间线与演示边界见 [`PLAN.md`](PLAN.md)。

**工作台画面是原页面渲染素材。** 本次制作时的模板、样式和前端脚本已快照保存到 `public/source-ui/`；通过浏览器实际渲染，配合镜头推近与淡化切换。它是有镜头编排的页面演示，不是整段连续操作录屏。课程、文档、AI 回答及笔记均为预设示例，接口由内存夹具响应，没有调用真实模型，没有使用真实用户资料。

**知识星空和学习工具是概念演示。** 当前应用尚未完整实现这些页面，视频持续显示概念标记。节点中的液体进度、满格学会、金色掌握光环，以及函数参数、几何作图、代码结果，均由独立动画源码生成，不写入项目功能。

知识星空现为 52 个真实 Three.js 球体、94 条三维连接，带透视旋转和前后遮挡。已点亮节点显示名称及金色光环；直接连接已点亮节点的未点亮节点显示灰色和知识名称；仅连接未点亮节点的显示“???”。揭示只传播一层，灰色节点完成学习并点亮后，才揭示新的相邻知识。

## 文件

- `src/`：React + Remotion + Three.js 全部动画源码。
- `data/narration.json`：旁白、字幕内容与时间。
- `scripts/capture_ui.py`：原页面渲染素材采集，使用演示夹具。
- `scripts/make_audio.py`：中文配音、原创配乐及混音。
- `scripts/render.mjs`：关键帧预览与完整视频导出。
- `scripts/verify.py`：解码检查与成片审阅图生成。
- `scripts/check-knowledge.mjs`：灰色显名、未知隐藏、点亮后揭示及图连接规则检查。
- `public/ui/`：双倍像素密度的页面截图、源码哈希与采集报告。
- `public/source-ui/`：制作时的原前端快照，不含数据库、配置密钥或用户文件。
- 原前端快照保留当前使用的 PDF.js `runtime`，不发布未使用的旧版 `build` 副本；校验清单只记录随源码发布的文件。
- `public/audio/`：逐段配音、独立旁白、独立配乐与最终混音。
- `output/`：成片、SRT 字幕、关键帧、审阅图和检查结果。

## 本机预览和导出

在 `Vedio` 目录运行：

```powershell
npm run studio
npm run check
node scripts/check-knowledge.mjs
npm run preview-frames
npm run render
```

预览中选择 `StudyFilm`。本机 `node_modules` 是指向项目已有 `promo/node_modules` 的目录联接，复用已有工具，不调整应用依赖。迁移到另一台电脑时，根据本目录的 `package.json` 执行 `npm install` 即可准备独立动画环境。

渲染默认使用现有 Chromium：`D:/Dev/tool/hci-ci/browsers/chromium-1248/chrome-win64/chrome.exe`。可通过 `VIDEO_BROWSER` 环境变量覆盖。Three.js 使用 ANGLE 渲染，所有运动、波浪和进度按帧号计算。

## 重新生成素材

已保留全部成片素材；只修改镜头和文字时，直接重新渲染即可，不必重新联网生成配音。

```powershell
python scripts/capture_ui.py
python scripts/make_audio.py
python scripts/verify.py
```

素材脚本需要 Python、Flask、Playwright、NumPy、PyAV、Pillow；配音需要 `edge-tts` 及网络，使用 `zh-CN-XiaoxiaoNeural`。本机优先复用 `D:/Dev/tool/hci-ci/python` 的浏览器工具和 `D:/Dev/python-packages/video-production` 的配音工具。音频脚本会复用已存在的逐段配音，改动某段文案后可删除其对应 `public/audio/voice-XX.mp3` 再生成。

原前端快照已固定。如需捕获项目后来更新的界面，请先另存本次快照，再更新 `public/source-ui/`，不要把历史成片的素材直接覆盖成另一版页面。
