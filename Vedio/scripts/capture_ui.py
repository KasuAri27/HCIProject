"""Render the original frontend against video-only, in-memory sample responses.

The source application, its database and API keys are never imported or opened.
The archived template/styles/scripts make these screenshots reproducible later.
"""

import hashlib
import json
from pathlib import Path
import shutil
import sys
import threading
from urllib.parse import urlparse

sys.path.insert(0, 'D:/Dev/tool/hci-ci/python')
from flask import Flask, render_template
from playwright.sync_api import sync_playwright, expect
from werkzeug.serving import make_server

BASE = Path(__file__).resolve().parents[1]
PROJECT = BASE.parent
ARCHIVE = BASE / 'public' / 'source-ui'
OUT = BASE / 'public' / 'ui'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    if not (ARCHIVE / 'templates' / 'index.html').exists():
        shutil.copytree(PROJECT / 'app' / 'templates', ARCHIVE / 'templates', dirs_exist_ok=True)
        # The current viewer imports vendor/pdfjs/runtime. Its unused legacy
        # build directory is excluded by repository policy and is not needed here.
        shutil.copytree(PROJECT / 'app' / 'static', ARCHIVE / 'static', dirs_exist_ok=True,
                        ignore=lambda current, names: ['build'] if Path(current).name == 'pdfjs' else [])
    # Separate path and digest fields so API-related filenames cannot make a
    # source checksum look like a credential assignment to secret scanners.
    hashes = {'algorithm': 'sha256', 'files': [
        {'path': p.relative_to(ARCHIVE).as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
        for p in sorted(ARCHIVE.rglob('*'))
        if p.is_file() and 'build' not in p.relative_to(ARCHIVE).parts
    ]}
    (OUT / 'source-hashes.json').write_text(json.dumps(hashes, indent=2), encoding='utf-8')

    site = Flask('film-fixture', template_folder=str(ARCHIVE / 'templates'), static_folder=str(ARCHIVE / 'static'))
    site.add_url_rule('/', 'index', lambda: render_template('index.html'))
    server = make_server('127.0.0.1', 0, site, threaded=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}'
    docs = []
    for i, (title, fmt) in enumerate([
        ('导数与变化率.md', 'md'), ('微积分课堂讲义.pdf', 'pdf'),
        ('第三章 导数应用.pptx', 'pptx'), ('课堂讨论与习题.docx', 'docx'),
        ('线性代数复习.md', 'md'), ('认知与学习.pdf', 'pdf'),
    ]):
        docs.append({'id': f'doc-{i}', 'title': title, 'source_name': title, 'source_format': fmt,
                     'version_status': 'ready', 'is_read': True, 'has_note': i == 0})
    library = {'documents': docs, 'courses': [
        {'id': 'calculus', 'title': '高等数学', 'document_ids': ['doc-0', 'doc-1', 'doc-2', 'doc-3']},
        {'id': 'algebra', 'title': '线性代数', 'document_ids': ['doc-4']},
        {'id': 'hci', 'title': '人机交互', 'document_ids': ['doc-5']},
    ], 'threads': [{'id': 'thread-0', 'document_id': 'doc-0', 'title': '理解导数的含义'}],
        'overview': {}, 'library': {'warnings': []}, 'jobs': []}
    paragraphs = [
        ('h1', '第三章：导数与变化率'),
        ('p', '从一次变化开始，理解微积分。我们已经学习了函数与极限，现在试着回答：一个量究竟变化得有多快？'),
        ('h2', '一、从平均速度到瞬时速度'),
        ('p', '平均速度描述一段时间内的整体变化。如果想知道汽车在某一时刻的速度，就需要让观察的时间间隔不断缩短。'),
        ('p', '导数刻画函数在某一点的瞬时变化率。它是平均变化率在时间间隔趋近于零时的极限，也对应曲线在该点切线的斜率。'),
        ('p', '$$ f\u0027(x)=\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h} $$'),
        ('h2', '二、用一个函数理解导数'),
        ('p', '对于函数 f(x)=x²，它的导数为 f\u0027(x)=2x。在 x=1 时斜率为 2，在 x=2 时斜率为 4。位置不同，变化的快慢也不同。'),
        ('h2', '三、导数的几何意义'),
        ('p', '想象沿着曲线走过一个点。切线指出此时的前进方向，斜率告诉我们曲线正在怎样变化。正值表示上升，负值表示下降。'),
        ('h2', '四、导数与函数的单调性'),
        ('p', '在一个区间内，若导数始终为正，则函数递增；若导数始终为负，则函数递减。判断变化率，是分析函数的重要入口。'),
        ('h2', '五、把概念用于实际问题'),
        ('p', '速度、边际成本和温度变化，都可以借助导数来描述。先找到自变量与因变量，再解释变化率的实际含义。'),
    ]
    html = ''.join(f'<{tag} class="doc-block" data-block-id="b{i}" data-locator="第 {i+1} 段">{text}</{tag}>' for i, (tag, text) in enumerate(paragraphs))
    messages = []
    note = '# 导数与变化率\n\n今天想弄懂：\n1. 平均变化率与瞬时变化率\n2. 导数为什么是切线斜率\n'
    explanation = '### 从速度表开始理解\n\n**平均速度**：整段路程除以总时间。\n\n**瞬时速度**：汽车速度表此刻显示的速度。\n\n导数做的事情，就是把观察间隔不断缩小，得到某一点的变化快慢。\n\n例如 **f(x)=x²**，它的导数是 **2x**。在 x=2 时，曲线切线的斜率为 4。'
    outline = '### 先抓住三个重点\n\n1. **是什么**：导数是瞬时变化率。\n2. **怎么看**：几何上是曲线切线的斜率。\n3. **怎么用**：用导数判断函数增减，解释变化快慢。\n\n建议先读第一节，再用 f(x)=x² 验证自己的理解。'
    api_log = []

    def api(route):
        nonlocal messages, note
        req = route.request
        path = urlparse(req.url).path
        payload = req.post_data_json if req.method in ('POST', 'PUT', 'PATCH') and req.post_data else {}
        api_log.append({'method': req.method, 'path': path})
        response = {}
        if path == '/api/session':
            response = {'selected_document': docs[0], 'selected_thread_id': 'thread-0', 'llm_configured': True, 'overview': {}}
        elif path == '/api/library':
            response = library
        elif path == '/api/profile':
            response = {'profile': {'display_name': '同学'}}
        elif path == '/api/chat/suggestions':
            response = {'suggestions': ['帮我梳理这份资料的重点', '用直观的例子解释导数', '出个题考察一下'], 'source': 'fixture'}
        elif path.startswith('/api/documents/') and not path.endswith(('/position', '/open')):
            response = {'document': docs[0], 'status': 'ready', 'version': {'id': 'v0', 'number': 1}, 'versions': [],
                        'view_mode': 'markdown', 'html': html, 'blocks': [{'id': f'b{i}', 'text': text, 'locator': f'第 {i+1} 段'} for i, (_, text) in enumerate(paragraphs)], 'position': None}
        elif path == '/api/notes':
            if req.method == 'PUT':
                note = payload.get('content', note)
            response = {'doc_id': 'doc-0', 'title': docs[0]['title'], 'content': note, 'updated_at': '刚刚'}
        elif path == '/api/chat':
            if req.method == 'POST':
                question = payload.get('question', '')
                reply = outline if '重点' in question else explanation
                messages = [{'role': 'user', 'content': question, 'quote': payload.get('quote', '')},
                            {'role': 'assistant', 'content': reply, 'sources': [{'document_id': 'doc-0', 'title': '导数与变化率 · 第一节'}]}]
            response = {'messages': messages, 'thread_id': 'thread-0'}
        elif path == '/api/chat/spot':
            response = {'reply': '把两点之间的平均变化率想成割线斜率。当第二个点不断靠近第一个点，割线趋近于切线，得到的斜率就是导数。', 'sources': []}
        elif path in ('/api/config', '/api/providers'):
            response = {'providers': [], 'configured': True, 'has_key': True}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(response, ensure_ascii=False))

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, executable_path='D:/Dev/tool/hci-ci/browsers/chromium-1248/chrome-win64/chrome.exe')
            # Capture at double density so camera close-ups retain original text clarity.
            page = browser.new_page(viewport={'width': 1760, 'height': 840}, device_scale_factor=2)
            page.route('**/api/**', api)
            page.route('**/favicon.ico', lambda r: r.fulfill(status=204))
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(url, wait_until='networkidle')
            expect(page.locator('#doc-body')).to_contain_text('瞬时变化率')
            page.evaluate('document.fonts.ready')
            page.wait_for_timeout(400)
            boxes = {}

            def shot(name):
                page.mouse.move(1738, 823)
                page.wait_for_timeout(150)
                page.screenshot(path=str(OUT / f'{name}.png'))
                for selector in ['#rail-left', '#reading', '#notes-rail', '#rail-right', '#doc-body', '#notes-content', '#chat-input', '#select-bubble']:
                    box = page.locator(selector).bounding_box()
                    if box:
                        boxes[selector] = box
                print(f'Captured {name}', flush=True)

            shot('overview')
            page.locator('#doc-scroll').evaluate('(el)=>el.scrollTop=510')
            shot('reading-scroll')
            page.locator('#doc-scroll').evaluate('(el)=>el.scrollTop=0')
            page.locator('#chat-input').fill('帮我梳理这份资料的重点')
            shot('outline-question')
            page.locator('#btn-chat-send').click()
            expect(page.locator('#chat-messages')).to_contain_text('先抓住三个重点')
            shot('outline-answer')
            page.locator('#chat-input').fill('用直观的例子解释导数')
            shot('explain-question')
            page.locator('#btn-chat-send').click()
            expect(page.locator('#chat-messages')).to_contain_text('汽车速度表')
            shot('explain-answer')
            # A genuine DOM selection drives the original mouseup handler.
            page.locator('[data-block-id="b4"]').evaluate('''el=>{
                const r=document.createRange();r.setStart(el.firstChild,0);r.setEnd(el.firstChild,el.firstChild.textContent.length);
                const s=window.getSelection();s.removeAllRanges();s.addRange(r);
                document.getElementById('doc-body').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
            }''')
            expect(page.locator('#select-bubble')).to_be_visible()
            shot('selection')
            page.locator('#select-bubble-input').fill('为什么它又是切线的斜率？')
            shot('selection-question')
            page.locator('#btn-spot-ask').click()
            expect(page.locator('#select-bubble-answer')).to_contain_text('割线')
            shot('selection-answer')
            page.locator('#select-bubble-close').click()
            page.locator('.chat-to-notes').last.click()
            expect(page.locator('#notes-content')).to_have_value(__import__('re').compile('汽车速度表'))
            shot('note-captured')
            page.locator('#notes-content').fill('# 我对导数的理解\n\n导数：某一点的瞬时变化率。\n\n平均速度看一段路；\n瞬时速度看此时此刻。\n\n几何意义：切线的斜率。\n\nf(x)=x² → f\u0027(x)=2x\n\n在 x=2 时，斜率是 4。\n\n复习时：先解释概念，再做一道题。')
            page.locator('#btn-notes-save').click()
            expect(page.locator('#notes-save-status')).to_contain_text('已保存')
            shot('note-personal')
            assert not errors, errors
            (OUT / 'capture-report.json').write_text(json.dumps({'viewport': [1760, 840], 'boxes': boxes, 'browser_errors': errors, 'api_calls': api_log, 'fixture': 'in-memory sample responses; no real model invocation'}, ensure_ascii=False, indent=2), encoding='utf-8')
            browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
