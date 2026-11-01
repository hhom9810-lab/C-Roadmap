# Этап 4: проверки режима чтения. Запуск: python3 tests/readcheck.py
import os, pathlib, json
from playwright.sync_api import sync_playwright
URL = pathlib.Path(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'csharp-dotnet-roadmap.html')).resolve().as_uri()
res = []
def ok(name, cond, extra=''):
    res.append((name, bool(cond), extra)); print(('ok   ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra and not cond else ''))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    def go(h, w=350): pg.goto(URL + h); pg.wait_for_timeout(w)
    go('')
    topics = pg.evaluate("window.__app.pages.filter(p=>['topic','practice','project'].includes(p.kind)).map(p=>p.id)")
    ok('есть темы для проверки', len(topics) > 50, len(topics))

    # --- весь контент: лаб-блоки вынесены из потока, ничего не потеряно
    bad_flow, bad_toc = [], []
    for t in topics:
        go('#/topic/' + t, 120)
        r = pg.evaluate("""()=>{
          const mv=['quiz','ide','ticket','compare','cards','legacy','interview'];
          const inFlow=[...document.querySelectorAll('.widget.lab[data-lab]')].filter(e=>mv.includes(e.dataset.lab)).length;
          const dead=[...document.querySelectorAll('.toc a[data-sec]')].filter(a=>!document.getElementById('h-'+a.dataset.sec)).length;
          return {inFlow, dead, rd: !!document.querySelector('.rd'), ed: document.querySelectorAll('.ed-ta').length}}""")
        if not r['rd'] or r['inFlow'] or r['ed']: bad_flow.append(t)
        if r['dead']: bad_toc.append(t)
    ok('в странице темы нет квизов, задач, тикетов, сравнений, карточек (и скрытых редакторов)', not bad_flow, bad_flow[:5])
    ok('в оглавлении нет мёртвых ссылок', not bad_toc, bad_toc[:5])

    # --- вёрстка читалки
    go('#/topic/p1-types', 600)
    w = pg.evaluate("document.querySelector('.rd .content').getBoundingClientRect().width")
    ok('колонка текста 680–760 px', 680 <= w <= 760, w)
    ok('шрифт 18px, межстрочный 1.7', pg.evaluate("(()=>{const c=getComputedStyle(document.querySelector('.rd-theory > p'));return c.fontSize==='18px'&&Math.abs(parseFloat(c.lineHeight)/18-1.7)<0.01})()"))
    ok('хлебные крошки ведут на Путь', pg.locator('.rd-crumbs a').first.get_attribute('href').startswith('#/path'))
    ok('метаданные: время чтения и «Чему научишься» (3 пункта)', pg.locator('.rd-meta').inner_text().count('мин чтения') == 1 and 'Чему научишься' in pg.locator('.rd-meta').inner_text() and pg.locator('.rd-learns li').count() == 3)
    ok('врезки: подписи семейств', pg.evaluate("(()=>{const f=s=>{const e=document.querySelector('.rd .co.'+s);return e?getComputedStyle(e,'::before').content:null};return f('key')==='\"Важно\"'&&f('danger')==='\"Ловушка\"'&&f('deep')==='\"Под капотом\"'})()"))
    ok('у кода есть «Копировать»', pg.locator('.rd .code .copy').count() >= 5)
    ok('якоря у заголовков', pg.locator('.rd h2 .rd-a').count() >= 5)
    # порядок конца страницы
    order = pg.evaluate("""()=>{const q=s=>document.querySelector(s);const idx=e=>e?[...q('.rd-end').parentElement.querySelectorAll('.rd-end > *')].indexOf(e):-1;
      return [idx(q('.rd-prac')),idx(q('.rd-learn')),idx(q('.rd-end .done-card'))]}""")
    ok('порядок: практика → Microsoft Learn → «Тема пройдена»', order[0] >= 0 and order[0] < order[1] < order[2], order)
    ok('prev/next после блока «Тема пройдена»', pg.evaluate("document.querySelector('.rd-end .done-card').compareDocumentPosition(document.querySelector('.rd-pn'))&4")>0)
    btn = pg.locator('#rdStart')
    ok('кнопка практики: шаги, минуты, XP', btn.count() == 1 and pg.evaluate("/Начать практику \\(\\d+ шаг\\S*, ~\\d+ мин, \\+\\d+ XP\\)/.test(document.querySelector('#rdStart').textContent)") and btn.get_attribute('href') == '#/practice/p1-types', btn.inner_text())

    # --- прогресс чтения
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(150)
    s0 = pg.evaluate("parseFloat(document.querySelector('.rd-prog i').style.transform.replace(/[^0-9.]/g,'')||0)")
    pg.evaluate("window.scrollTo(0, document.querySelector('.rd-theory').getBoundingClientRect().top + scrollY + document.querySelector('.rd-theory').offsetHeight/2)"); pg.wait_for_timeout(250)
    s1 = pg.evaluate("parseFloat(document.querySelector('.rd-prog i').style.transform.replace(/[^0-9.]/g,'')||0)")
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight)"); pg.wait_for_timeout(250)
    s2 = pg.evaluate("parseFloat(document.querySelector('.rd-prog i').style.transform.replace(/[^0-9.]/g,'')||0)")
    ok('линия прогресса чтения растёт', s0 < 0.05 and 0.3 < s1 < 0.8 and s2 > 0.95, (s0, s1, s2))

    # --- «вернуться к месту, где остановился»
    pg.evaluate("window.scrollTo(0, document.querySelector('.rd-theory').getBoundingClientRect().top + scrollY + document.querySelector('.rd-theory').offsetHeight*0.45)"); pg.wait_for_timeout(900)
    saved = json.loads(pg.evaluate("localStorage.getItem('csroad:readpos')") or '{}')
    ok('позиция чтения сохранена (ключ readpos)', 'p1-types' in saved and 0.3 < saved['p1-types']['r'] < 0.6, saved)
    go('#/path/1'); go('#/topic/p1-types', 500)
    ok('подсказка «Вернуться к месту» показана', pg.locator('.rd-resume').count() == 1)
    y0 = pg.evaluate("scrollY"); pg.locator('[data-rd-resume]').click(); pg.wait_for_timeout(900)
    ok('кнопка возвращает к месту', pg.evaluate("scrollY") > y0 + 500 and pg.locator('.rd-resume').count() == 0)
    go('#/topic/p1-types/two-families', 400)
    ok('при переходе по якорю подсказки нет', pg.locator('.rd-resume').count() == 0)

    # --- оглавление и якоря
    go('#/topic/p1-types', 500)
    first = pg.locator('.toc a').nth(2); sec = first.get_attribute('data-sec'); first.click(); pg.wait_for_timeout(500)
    top = pg.evaluate("(s)=>document.getElementById('h-'+s).getBoundingClientRect().top", sec)
    ok('клик по оглавлению прокручивает к разделу', -5 < top < 200, top)

    # --- мини-IDE
    ok('кнопки «Запустить» у запускаемых фрагментов', pg.locator('.rd-run').count() >= 3, pg.locator('.rd-run').count())
    pg.locator('.rd-run').first.click(); pg.wait_for_timeout(500)
    out = pg.locator('#rdOut').inner_text()
    ok('мини-IDE показывает вывод программы', len(out.strip()) > 0 and 'строка' not in out, out[:80])
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok('мини-IDE закрывается по Esc', not pg.locator('#rdOut').is_visible())

    # --- переход в сессию практики
    go('#/topic/p1-types', 400); pg.locator('#rdStart').click(); pg.wait_for_timeout(500)
    ok('«Начать практику» открывает сессию', pg.locator('.sx').count() == 1 and pg.evaluate('location.hash') == '#/practice/p1-types')
    go('#/practice/p1', 300); ok('практика для чекпойнта → тема', pg.evaluate('location.hash') == '#/topic/p1')

    # --- «Тема пройдена» из читалки: XP и запись
    go('#/topic/p1-types', 500)
    xp0 = pg.evaluate("window.__app.G.st.xp||0")
    pg.locator('.rd-end .done-card input').check(); pg.wait_for_timeout(300)
    ok('«Тема пройдена» из читалки даёт XP и пишется в cb', pg.evaluate("window.__app.G.st.xp||0") > xp0 and pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('csroad:cb')||'{}')).some(k=>k.indexOf('p1-types.')===0)"))

    # --- prev / next
    nxt = pg.locator('.rd-pn .nx').get_attribute('href'); pg.locator('.rd-pn .nx').click(); pg.wait_for_timeout(400)
    ok('«Следующая» ведёт на следующую тему Пути', pg.evaluate("location.hash") == nxt and nxt.startswith('#/topic/'), nxt)
    ok('«Предыдущая» возвращает', pg.locator('.rd-pn a:not(.nx)').get_attribute('href') == '#/topic/p1-types')
    go('#/topic/p1-start', 300)
    # --- reduced motion
    c2 = b.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce'); pr = c2.new_page(); pr.goto(URL + '#/topic/p1-types'); pr.wait_for_timeout(500)
    ok('reduced-motion: линия прогресса без переходов', pr.evaluate("getComputedStyle(document.querySelector('.rd-prog i')).transitionDuration") in ('0s', ''))
    c2.close()
    # --- мобильный
    c3 = b.new_context(viewport={'width': 360, 'height': 740}); pm = c3.new_page(); pm.on('pageerror', lambda e: errs.append(str(e)))
    wide = []
    for t in topics[::4]:
        pm.goto(URL + '#/topic/' + t); pm.wait_for_timeout(180)
        if pm.evaluate("document.documentElement.scrollWidth") > 360: wide.append(t)
    ok('360px: нет горизонтального скролла на темах', not wide, wide[:5])
    pm.goto(URL + '#/topic/p1-types'); pm.wait_for_timeout(400)
    ok('360px: содержание — раскрывающийся список, боковое скрыто', pm.locator('.rd-toc-m').is_visible() and not pm.locator('.rd-grid > .toc').is_visible())
    c3.close()
    ok('нет ошибок в консоли и страницы', not errs, errs[:3])
    b.close()
bad = [r for r in res if not r[1]]
print('\nchecks', len(res), 'failed', len(bad)); raise SystemExit(1 if bad else 0)
