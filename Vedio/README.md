# 两分钟学习工作台宣传片

当前成片：[`output/study-film-v3.mp4`](output/study-film-v3.mp4)。此前的两版保留作对照：`output/study-film-cinematic.mp4`（角色开场版）和 `output/study-film-2min.mp4`（首版）。

星空片段预览：`output/knowledge-preview.mp4`（取自首版 1:27–1:44，含配音与字幕）。通过 `python scripts/extract_knowledge.py` 从完成的成片提取。

120 秒，1920×1080，30 fps，H.264/AAC；中文合成配音、中文字幕、原创合成配乐，无产品名和品牌 Logo。全部画面由程序制作，不需要真人素材。

## 内容

前 32 秒以风格化三维角色演出夜间复习。人物与宿舍房间全部由 Three.js 基本体搭建，不使用外部模型：人物有五官、眼镜、分层头发、耳机、连帽卫衣和分节的手；房间有窗外夜景、书架、软木板、串灯、床和地毯，由台灯、月光和屏幕三处光源照明并投影。

书桌段是绕人物头部的一条连续运镜：先从背后远景缓缓推到右肩后方看屏幕上切换的工具，再以固定的距离和高度匀速滑到左肩后方，中途不推近也不拉远。镜头经过正后方时，头部把屏幕完全挡住，屏幕内容就在这一帧从工具切到讲义；随后在左肩后方看加速翻阅的长文。之后学生起身面对散落的知识点，镜头绕回背面，时钟与滴答声加速。第 32 秒进入原页面演示。

第 32–87 秒是一个连续镜头：页面窗口始终在场，正在讲解的面板被“提”出来放大成卡片，回答自上而下逐行出现，光标点击与画面变化对应；文档滚动使用两张截图按真实滚动距离拼接。随后的知识星空沿用开场的夜空色调，把开场里散落的星点连成星座；学习工具三栏同屏，强调随旁白移动；片尾在全部点亮的星空前收束并淡出。

场景之间以交叠溶解衔接，不再经过暗场。字幕逐句显示，起止时间由 `scripts/align_subtitles.py` 从配音文件的停顿实测得到。全部配音按原速播放。

完整时间线与演示边界见 [`PLAN.md`](PLAN.md)。

**工作台画面是原页面渲染素材。** 本次制作时的模板、样式和前端脚本已快照保存到 `public/source-ui/`；通过浏览器实际渲染，影片只对截图做裁切、缩放与逐步揭示，不在 React 中重建页面布局。它是有镜头编排的页面演示，不是整段连续操作录屏。课程、文档、AI 回答及笔记均为预设示例，接口由内存夹具响应，没有调用真实模型，没有使用真实用户资料。

**知识星空和学习工具是概念演示。** 当前应用尚未完整实现这些页面，视频持续显示概念标记。节点中的液体进度、满格学会、金色掌握光环，以及函数参数、几何作图、代码结果，均由独立动画源码生成，不写入项目功能。

知识星空现为 52 个真实 Three.js 球体、95 条三维连接，排布在朝向镜头的穹面上：已掌握的知识在中央，未知的在外缘；镜头会推近正在学习的节点，点亮时向外扩散一圈光波。辉光由叠加贴图实现，没有引入后期处理依赖。已点亮节点显示名称及金色光环；直接连接已点亮节点的未点亮节点显示灰色和知识名称；仅连接未点亮节点的显示“???”。揭示只传播一层，灰色节点完成学习并点亮后，才揭示新的相邻知识。

## 文件

- `src/`：React + Remotion + Three.js 全部动画源码。开场的人物在 `Student.tsx`，房间在 `StudyRoom.tsx`，运镜在 `CinematicOpening.tsx`。
- `data/narration.json`：旁白文案与每段配音的时间窗。
- `data/subtitle-timing.json`：逐句字幕的实测起止时间，由 `scripts/align_subtitles.py` 生成。
- `scripts/capture_ui.py`：原页面渲染素材采集，使用演示夹具。
- `scripts/make_audio.py`：中文配音、原创配乐及混音。
- `scripts/align_subtitles.py`：分析配音停顿，生成逐句字幕时间。
- `scripts/render.mjs`：关键帧预览与完整视频导出。
- `scripts/verify.py`：解码检查与成片审阅图生成。
- `scripts/check-knowledge.mjs`：灰色显名、未知隐藏、点亮后揭示及图连接规则检查。
- `public/ui/`：双倍像素密度的页面截图、源码哈希与采集报告。
- `public/source-ui/`：制作时的原前端快照，不含数据库、配置密钥或用户文件。
- 原前端快照保留当前使用的 PDF.js `runtime`，不发布未使用的旧版 `build` 副本；校验清单只记录随源码发布的文件。
- `public/audio/`：逐段配音、独立旁白、独立配乐与最终混音。
- `public/grain.png`：全片叠加的颗粒贴图，用于消除深色渐变的色带。
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
