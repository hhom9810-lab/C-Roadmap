# Этап 6: Microsoft Learn и «Не понятно? Спроси ИИ». Запуск: python3 tests/aicheck.py
# Сеть к Gemini подменена (page.route) — реальные запросы тест не делает.
import os, pathlib, json, re
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(os.path.dirname(os.path.abspath(__file__))).parent
URL = (ROOT / 'dist' / 'csharp-dotnet-roadmap.html').resolve().as_uri()
KEY = 'AIzaTESTKEY_0123456789abcdefghij'
res = []
def ok(name, cond, extra=''):
    res.append((name, bool(cond), extra)); print(('ok   ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra and not cond else ''))

def sse(*texts, finish='STOP'):
    out = ''
    for i, t in enumerate(texts):
        c = {'content': {'role': 'model', 'parts': [{'text': t}]}}
        if i == len(texts) - 1: c['finishReason'] = finish
        out += 'data: ' + json.dumps({'candidates': [c]}, ensure_ascii=False) + '\r\n\r\n'
    return out

ANSWER = ['**Аналогия.** Это как ящик.\n\n1. Первое\n2. Второе\n\n```csharp\nvar x = 1;\nConsole.WriteLine(x);\n```\n', 'Ошибка: <script>alert(1)</script> и [ссылка](https://learn.microsoft.com/) [плохо](javascript:alert(1))']
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    calls = []
    mode = {'v': 'ok'}
    def handler(route):
        req = route.request
        if req.method == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
        calls.append({'url': req.url, 'key': req.headers.get('x-goog-api-key'), 'body': req.post_data})
        m = mode['v']
        if m == 'ok': return route.fulfill(status=200, headers={**CORS, 'content-type': 'text/event-stream'}, body=sse(*ANSWER))
        if m == '429': return route.fulfill(status=429, headers=CORS, content_type='application/json', body=json.dumps({'error': {'code': 429, 'message': 'quota', 'status': 'RESOURCE_EXHAUSTED'}}))
        if m == '403': return route.fulfill(status=403, headers=CORS, content_type='application/json', body=json.dumps({'error': {'code': 403, 'message': 'denied', 'status': 'PERMISSION_DENIED'}}))
        if m == '400k': return route.fulfill(status=400, headers=CORS, content_type='application/json', body=json.dumps({'error': {'code': 400, 'message': 'API key not valid. Please pass a valid API key.', 'status': 'INVALID_ARGUMENT'}}))
        if m == '500': return route.fulfill(status=503, headers=CORS, content_type='application/json', body='{}')
        if m == 'empty': return route.fulfill(status=200, headers={**CORS, 'content-type': 'text/event-stream'}, body='data: {"candidates":[{"finishReason":"STOP"}]}\r\n\r\n')
        if m == 'block': return route.fulfill(status=200, headers={**CORS, 'content-type': 'text/event-stream'}, body='data: {"promptFeedback":{"blockReason":"SAFETY"}}\r\n\r\n')
        if m == 'abort': return route.abort()
    ctx.route('https://generativelanguage.googleapis.com/**', handler)
    def go(h, w=350): pg.goto('about:blank'); pg.goto(URL + h); pg.wait_for_timeout(w)

    # ---------- links.json ----------
    lk = json.load(open(ROOT / 'src' / 'links.json', encoding='utf-8'))
    ok('links.json: у каждой темы 3–6 ссылок', all(3 <= len(v) <= 6 for v in lk.values()), [k for k, v in lk.items() if not 3 <= len(v) <= 6])
    ok('links.json: поля заполнены, пути без хоста', all(l['title'] and l['why'] and l['type'] and not l['path'].startswith(('http', '/')) for v in lk.values() for l in v))
    ok('links.json: «зачем читать» — одна строка до 160 символов', all(len(l['why']) <= 160 and '\n' not in l['why'] for v in lk.values() for l in v), [l['path'] for v in lk.values() for l in v if len(l['why']) > 160][:3])
    ok('links.json: в страницах нет остатков :::learn', 'learn-a' not in ''.join(f.read_text(encoding='utf-8') for f in (ROOT / 'partials').glob('*.md')) and ':::learn' not in ''.join(f.read_text(encoding='utf-8') for f in (ROOT / 'partials').glob('*.md')))

    # ---------- блок Learn ----------
    go('#/topic/p1-types', 500)
    n = pg.locator('.rd-learn a.learn-a').count()
    ok('блок Learn: ссылки из links.json', n == len(lk['p1-types']), n)
    ok('ссылки: target=_blank и rel=noopener noreferrer', pg.evaluate("[...document.querySelectorAll('.rd-learn a.learn-a')].every(a=>a.target==='_blank'&&/noopener/.test(a.rel)&&/noreferrer/.test(a.rel))"))
    ok('у каждой ссылки есть заголовок и «зачем читать»', pg.evaluate("[...document.querySelectorAll('.rd-learn li')].every(li=>li.querySelector('.ln-t').textContent.length>3&&li.querySelector('.ln-w').textContent.length>10)"))
    h1 = pg.locator('.rd-learn a.learn-a').first.get_attribute('href')
    ok('локаль по умолчанию ru-ru', '/ru-ru/' in h1, h1)
    pg.click('.rd-learn .lang-sw [data-lang="en-us"]')
    ok('переключатель RU/EN меняет ссылки и aria-pressed', all('/en-us/' in a for a in pg.eval_on_selector_all('.rd-learn a.learn-a', 'e=>e.map(x=>x.href)')) and pg.get_attribute('.rd-learn [data-lang="en-us"]', 'aria-pressed') == 'true')
    pg.click('.rd-learn .lang-sw [data-lang="ru-ru"]')
    go('#/topic/p5-git', 400)
    hv = pg.eval_on_selector_all('.rd-learn a.learn-a', 'e=>e.map(x=>x.href)')
    ok('verify:true → ссылка на поиск Learn с пометкой', any('/search/?terms=' in h for h in hv) and pg.locator('.ln-v').count() >= 1, hv)
    go('#/topic/p7-resume', 300)
    ok('у карьерных страниц без ссылок нет пустого блока Learn', pg.locator('.rd-learn').count() == 0)

    # ---------- «?» у h2 и блок в конце ----------
    go('#/topic/p1-types', 500)
    qn, hn = pg.locator('.rd-theory h2 .rd-q').count(), pg.locator('.rd-theory h2[id^="h-"]').count()
    ok('у каждого h2 есть кнопка «?» с aria-label', qn == hn and qn > 0 and pg.evaluate("[...document.querySelectorAll('.rd-q')].every(b=>b.getAttribute('aria-label').startsWith('Не понятно?'))"), (qn, hn))
    ok('в оглавлении нет «?» и «#» в названиях', not pg.evaluate("[...document.querySelectorAll('.toc a')].some(a=>/[#?]$/.test(a.textContent.trim()))"))
    ok('блок «Не понятно? Спроси ИИ» в конце темы', pg.locator('.rd-ai').count() == 1 and 'Спросить про эту тему' in pg.locator('.rd-ai').inner_text())
    ok('порядок конца: Learn → ИИ', pg.evaluate("(()=>{const e=[...document.querySelectorAll('.rd-end > section')].map(s=>s.className);return e.indexOf('rd-learn')>=0&&e.findIndex(x=>x.startsWith('rd-ai'))>e.indexOf('rd-learn')})()"))

    # ---------- панель: промпт ----------
    pg.locator('.rd-theory h2 .rd-q').first.click(); pg.wait_for_timeout(350)
    ok('панель открывается по «?»', pg.locator('.ai-panel.open').count() == 1)
    pr = pg.input_value('#aiPrompt')
    for frag in ['Ты — терпеливый наставник по C# и .NET. Объясняй по-русски, простым языком, но технически точно.', 'Контекст: я изучаю курс «C# → Junior .NET», сейчас фаза 1 «Фундамент языка и памяти», тема «', '», раздел «', 'Мой уровень:', 'Фрагмент, который мне непонятен: «', 'Мой вопрос/что именно непонятно: объясни это проще', 'Как отвечать: 1) объясни интуитивно на бытовой аналогии; 2) затем строго и технически; 3) покажи минимальный пример кода на C# с ожидаемым выводом; 4) назови 2–3 типичные ошибки новичков; 5) задай мне 2 проверочных вопроса. Если что-то зависит от версии C#/.NET — укажи. Если не уверен — скажи об этом, не выдумывай.']:
        if frag not in pr: ok('промпт содержит: ' + frag[:40], False, pr[:300])
    ok('промпт собран по шаблону (фаза, тема, раздел, ранг, фрагмент, инструкции)', all(f in pr for f in ['фаза 1 «Фундамент', 'Мой уровень:', 'Фрагмент, который мне непонятен: «', 'объясни это проще', '5) задай мне 2 проверочных вопроса']))
    ok('фрагмент ограничен ~1500 символов', len(re.search(r'Фрагмент, который мне непонятен: «(.*?)»\nМой', pr, re.S).group(1)) <= 1500)
    pg.fill('#aiQ', 'почему тут boxing?')
    ok('вопрос пользователя подставляется в промпт', 'Мой вопрос/что именно непонятно: почему тут boxing?' in pg.input_value('#aiPrompt'))
    pg.locator('.ai-pr summary').click(); pg.fill('#aiPrompt', pg.input_value('#aiPrompt') + '\nДобавь таблицу.')
    pg.fill('#aiQ', 'другой вопрос')
    ok('ручная правка промпта не затирается', 'Добавь таблицу.' in pg.input_value('#aiPrompt') and 'почему тут boxing?' in pg.input_value('#aiPrompt'))
    ok('«Открыть Gemini» — новая вкладка, noopener', pg.evaluate("(()=>{const a=document.querySelector('.ai-panel a[data-ai=gem]');return a.href.startsWith('https://gemini.google.com/')&&a.target==='_blank'&&/noopener/.test(a.rel)})()"))

    # ---------- без ключа ----------
    pg.click('#aiAsk'); pg.wait_for_timeout(200)
    ok('без ключа: понятное сообщение и запасной путь', 'Нет ключа Gemini' in pg.locator('#aiOut').inner_text() and pg.locator('#aiOut [data-ai=copy]').count() == 1 and not calls)
    ok('ошибки в role=alert', pg.locator('#aiOut [role=alert]').count() == 1)
    pg.click('#aiOut [data-ai=copy]'); pg.wait_for_timeout(200)
    hist = pg.evaluate("JSON.parse(localStorage.getItem('csroad:aihist')||'{}')")
    ok('«Скопировать промпт» пишет запись в историю (без ответа)', sum(len(v) for v in hist.values()) == 1 and list(hist.values())[0][0]['via'] == 'copy', hist)
    pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(350)

    # ---------- настройки ключа ----------
    pg.click('#moreBtn'); pg.wait_for_timeout(350)
    ok('в меню есть «ИИ-помощник»', 'ии-помощник' in pg.locator('.ds-drawer.open').inner_text().lower() and 'Ключ не задан' in pg.text_content('#aiKeyNote'))
    pg.click('#aiSetBtn'); pg.wait_for_timeout(400)
    ok('модалка ключа: поле password, autocomplete off', pg.evaluate("(()=>{const i=document.querySelector('#aiKeyIn');return i&&i.type==='password'&&i.autocomplete==='off'})()"))
    pg.fill('#aiKeyIn', 'abc'); pg.click('[data-ais=save]')
    ok('короткий ключ отклоняется с сообщением', pg.locator('#aiKeyErr').is_visible())
    pg.fill('#aiKeyIn', KEY); pg.click('[data-ais=save]'); pg.wait_for_timeout(100)
    ok('первое сохранение: сначала предупреждение', pg.locator('#aiWarn').is_visible() and pg.evaluate("localStorage.getItem('csroad:gemini-key')") is None)
    pg.click('[data-ais=save]'); pg.wait_for_timeout(400)
    ok('ключ лежит в csroad:gemini-key', json.loads(pg.evaluate("localStorage.getItem('csroad:gemini-key')")) == KEY)
    ok('после сохранения в меню «Ключ сохранён»', 'Ключ сохранён' in pg.text_content('#aiKeyNote'))

    # ---------- запрос к Gemini ----------
    go('#/topic/p1-types', 500)
    pg.locator('.rd-theory h2 .rd-q').nth(1).click(); pg.wait_for_timeout(350)
    pg.fill('#aiQ', 'объясни про память')
    pg.click('#aiAsk'); pg.wait_for_timeout(900)
    ok('запрос ушёл к Gemini (streamGenerateContent, alt=sse)', len(calls) == 1 and 'streamGenerateContent?alt=sse' in calls[0]['url'] and '/models/gemini-' in calls[0]['url'], calls[:1])
    ok('ключ передан заголовком x-goog-api-key, не в URL', calls[0]['key'] == KEY and KEY not in calls[0]['url'])
    ok('в теле запроса — отредактированный промпт', 'объясни про память' in json.loads(calls[0]['body'])['contents'][0]['parts'][0]['text'])
    out = pg.inner_html('#aiOut')
    ok('Markdown: жирный, список, код с подсветкой и «Копировать»', '<strong>Аналогия.</strong>' in out and '<ol>' in out and 'class="code"' in out and 'class="copy"' in out and 't-' in out)
    ok('Markdown безопасен: <script> экранирован, javascript:-ссылка не создана', '<script' not in out and '&lt;script&gt;' in out and 'javascript:' not in re.sub(r'\[плохо\]\(javascript:alert\(1\)\)', '', out) )
    ok('внешняя ссылка из ответа с noopener', 'rel="noopener noreferrer"' in out)
    ok('после ответа есть «Копировать ответ», «Сохранить в блокнот», «Повторить»', all(pg.locator('#aiOut [data-ai=%s]' % a).count() == 1 for a in ['copy-ans', 'note', 'ask']))
    hist = pg.evaluate("JSON.parse(localStorage.getItem('csroad:aihist'))")
    ok('ответ сохранён в историю темы', hist['p1-types'][-1]['via'] == 'gemini' and 'Аналогия' in hist['p1-types'][-1]['a'])
    pg.click('#aiOut [data-ai=note]'); pg.wait_for_timeout(200)
    rb = pg.evaluate("JSON.parse(localStorage.getItem('csroad:rabbit'))")
    ok('«Сохранить в блокнот» добавляет запись с ответом', rb and rb[-1]['a'] and rb[-1]['t'].startswith('ИИ:') and rb[-1]['src'] == 'p1-types', rb[-1:] )
    pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(350)

    # ---------- ошибки и «Повторить» ----------
    def err_case(m, text, kind=None):
        mode['v'] = m
        go('#/topic/p1-types', 300)
        pg.locator('.rd-ai [data-ai-open=topic]').click(); pg.wait_for_timeout(300)
        pg.click('#aiAsk'); pg.wait_for_timeout(500)
        t = pg.locator('#aiOut').inner_text()
        ok('ошибка «%s»: %s' % (m, text), text in t and pg.locator('#aiOut [role=alert]').count() == 1, t[:200])
        return t
    err_case('429', 'лимит'); ok('429: есть «Повторить»', pg.locator('#aiOut [data-ai=ask]').count() == 1)
    mode['v'] = 'ok'; pg.click('#aiOut [data-ai=ask]'); pg.wait_for_timeout(700)
    ok('«Повторить» после ошибки даёт ответ', 'Аналогия' in pg.locator('#aiOut').inner_text())
    pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(350)
    err_case('403', 'Ключ не принят'); pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(300)
    err_case('400k', 'Ключ не принят'); pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(300)
    err_case('500', 'временно недоступен'); pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(300)
    err_case('empty', 'пустой ответ'); pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(300)
    err_case('block', 'фильтры безопасности'); pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(300)
    err_case('abort', 'нет сети'); pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(300)
    mode['v'] = 'ok'

    # ---------- выделение текста ----------
    go('#/topic/p1-types', 500)
    pg.evaluate("""()=>{const p=document.querySelector('.rd-theory > p');p.scrollIntoView({block:'center'});const r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);}""")
    pg.wait_for_timeout(500)
    ok('при выделении появляется «Объяснить это»', pg.locator('.ai-sel').is_visible())
    pg.locator('.ai-sel').click(); pg.wait_for_timeout(400)
    fr = re.search(r'Фрагмент, который мне непонятен: «(.*?)»\nМой', pg.input_value('#aiPrompt'), re.S).group(1)
    ok('выделенный текст попал в промпт', len(fr) > 20 and fr[:20] in pg.evaluate("document.querySelector('.rd-theory > p').textContent"), fr[:60])
    ok('фокус внутри панели, Esc закрывает и возвращает фокус', pg.evaluate("document.querySelector('.ai-panel').contains(document.activeElement)"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(350)
    ok('Esc закрыл панель', pg.locator('.ai-panel.open').count() == 0)
    pg.evaluate("getSelection().removeAllRanges()"); pg.wait_for_timeout(400)
    ok('без выделения кнопка скрыта', not pg.locator('.ai-sel').is_visible())

    # ---------- история, профиль, блокнот ----------
    go('#/topic/p1-types', 400)
    pg.locator('.rd-ai [data-ai-open=hist]').click(); pg.wait_for_timeout(350)
    ok('история темы открывается из блока', pg.locator('#aiHist[open]').count() == 1 and pg.locator('.ai-hl li').count() >= 1)
    pg.locator('.ai-hl button').first.click(); pg.wait_for_timeout(200)
    ok('запись истории показывает ответ', pg.locator('#aiOut .ai-md').count() == 1)
    go('#/profile', 500)
    ok('в профиле есть «Мои вопросы»', 'Мои вопросы' in pg.locator('.pf-ai').inner_text() and pg.locator('.pf-ai-l li').count() >= 2)
    go('#/help/rabbit-holes', 500)
    ok('в блокноте у записи есть «Ответ ИИ»', pg.locator('.rb-ans').count() >= 1)

    # ---------- «Очистить» ----------
    go('#/topic/p1-types', 400)
    pg.locator('.rd-ai [data-ai-open=hist]').click(); pg.wait_for_timeout(350)
    pg.click('[data-ai=clear]'); pg.click('[data-ai=clear]'); pg.wait_for_timeout(200)
    ok('«Очистить историю темы» (два нажатия)', pg.evaluate("(JSON.parse(localStorage.getItem('csroad:aihist')||'{}')['p1-types']||[]).length") == 0)
    pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(300)

    # ---------- лимит размера истории ----------
    pg.evaluate("""()=>{const big='x'.repeat(8000);const h={};for(let t=0;t<30;t++){h['p'+t]=[];for(let i=0;i<15;i++)h['p'+t].push({id:'i'+t+'_'+i,t:i,q:'q',sec:'',frag:'',a:big,via:'gemini'});}localStorage.setItem('csroad:aihist',JSON.stringify(h));}""")
    go('#/topic/p1-types', 400)
    pg.locator('.rd-ai [data-ai-open=topic]').click(); pg.wait_for_timeout(300)
    pg.click('[data-ai=copy]'); pg.wait_for_timeout(200)
    sz = pg.evaluate("localStorage.getItem('csroad:aihist').length")
    ok('история ограничена по размеру (≤ 350 тыс. символов)', sz <= 350000 + 2000, sz)
    pg.click('.ai-panel [data-ds-close]'); pg.wait_for_timeout(300)

    # ---------- ключ не уходит наружу ----------
    pg.evaluate("localStorage.setItem('csroad:aihist','{}')")
    go('#/today', 300)
    with pg.expect_download() as dl:
        pg.click('#moreBtn'); pg.wait_for_timeout(350); pg.click('#expBtn')
    path = dl.value.path(); txt = open(path, encoding='utf-8').read()
    ok('экспорт JSON не содержит ключ и gemini-ключей', KEY not in txt and 'gemini' not in txt.lower(), [k for k in json.loads(txt)['data']])
    ok('экспорт: только ключи из списка KEYS', set(json.loads(txt)['data']) <= set(['cb','visited','last','rabbit','depthDay','jobs','start','navOpen','lang','theme','fs','g','lab','cards','vibe','motion','nodes','pathView','readpos','aihist']), list(json.loads(txt)['data']))
    html = (ROOT / 'dist' / 'csharp-dotnet-roadmap.html').read_text(encoding='utf-8')
    ok('в сборке нет ключей Gemini (AIza…)', not re.search(r'AIza[0-9A-Za-z_\-]{20,}', html))
    ok('модель задана в одном месте', html.count("var AI_MODEL = '") == 1)
    pg.keyboard.press('Escape')
    # удалить ключ
    pg.evaluate("document.querySelector('#aiSetBtn').click()") ; pg.wait_for_timeout(500)
    pg.click('[data-ais=del]'); pg.wait_for_timeout(300)
    ok('«Удалить ключ» очищает localStorage', pg.evaluate("localStorage.getItem('csroad:gemini-key')") is None)

    # ---------- мобильная вёрстка ----------
    m = b.new_context(viewport={'width': 360, 'height': 740}, has_touch=True, is_mobile=True); mp = m.new_page()
    mp.on('pageerror', lambda e: errs.append(str(e)))
    mp.goto(URL + '#/topic/p1-types'); mp.wait_for_timeout(600)
    ok('360px: нет горизонтального скролла', mp.evaluate("document.documentElement.scrollWidth <= 361"))
    box = mp.locator('.rd-q').first.bounding_box()
    ok('360px: «?» имеет цель касания ≥ 44px', box['width'] >= 43 and box['height'] >= 43, box)
    mp.locator('.rd-ai [data-ai-open=topic]').click(); mp.wait_for_timeout(400)
    bx = mp.locator('.ai-panel').bounding_box()
    ok('360px: панель — нижний лист на всю ширину', bx['width'] >= 359 and bx['y'] > 40 and bx['y'] + bx['height'] >= 735, bx)
    ok('360px: нет горизонтального скролла с панелью', mp.evaluate("document.documentElement.scrollWidth <= 361 && document.querySelector('.ai-panel').scrollWidth <= 361"))
    mp.screenshot(path=str(pathlib.Path(os.environ.get('SHOTS', '/tmp')) / 'ai-mobile.png'))
    m.close()
    ok('нет ошибок JS на страницах', not errs, errs[:3])
    b.close()
bad = [r for r in res if not r[1]]
print('\n%d проверок, провалено %d' % (len(res), len(bad)))
raise SystemExit(1 if bad else 0)
