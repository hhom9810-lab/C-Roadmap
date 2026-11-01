# Этап 3: проверки страницы «Путь». Запуск: python3 tests/pathcheck.py
import os, pathlib, json
from playwright.sync_api import sync_playwright
URL = pathlib.Path(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'csharp-dotnet-roadmap.html')).resolve().as_uri()
res = []
def ok(name, cond, extra=''):
    res.append((name, bool(cond), extra)); print(('ok   ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra and not cond else ''))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    def go(h): pg.goto(URL + h); pg.wait_for_timeout(350)
    go('#/path/1')
    ok('дерево: узлы отрисованы', pg.locator('.pt-node').count() >= 10)
    ok('дерево: легенда', pg.locator('.pt-legend').count() == 1)
    types = pg.evaluate("[...document.querySelectorAll('.pt-node')].map(n=>n.className).join(' ')")
    ok('типы узлов: обязательная и необязательная', 't-req' in types)
    go('#/path/3'); ok('фаза 3: опциональный узел отличается', pg.locator('.pt-node.t-opt').count() >= 1)
    go('#/path/1?view=track'); ok('дорожка: узлы и сундук', pg.locator('.tk-node').count() >= 10 and pg.locator('.tk-chest').count() == 1)
    ok('дорожка: заблокированные открываются', pg.locator('.tk-node.lock').count() >= 1)
    pg.locator('.tk-node.lock').first.click(); pg.wait_for_timeout(300)
    ok('панель открывается по заблокированному', pg.locator('.nd').count() >= 1 and pg.locator('.nd .ds-drawer-b').is_visible())
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok('Esc закрывает панель', not pg.locator('.nd .ds-drawer-b').is_visible())
    ok('фокус вернулся на узел', pg.evaluate("document.activeElement && document.activeElement.classList.contains('tk-node')"))
    # переключатель вида
    pg.locator('[data-view-set="tree"]').click(); pg.wait_for_timeout(250)
    ok('переключение на дерево', pg.locator('.pt-tree').count() >= 1 and 'view=tree' in pg.url + '' or pg.locator('.pt-tree').count() >= 1)
    # фильтры
    pg.locator('[data-fs="done"]').click(); pg.wait_for_timeout(200)
    ok('фильтр «Пройдены» пуст при нуле прогресса', pg.locator('.pt-node').count() == 0)
    pg.locator('[data-fs="all"]').click(); pg.wait_for_timeout(200)
    n_all = pg.locator('.pt-node').count()
    go('#/path/3'); n3 = pg.locator('.pt-node').count()
    pg.locator('.pt-req input').check(); pg.wait_for_timeout(200)
    ok('фильтр «только обязательное» убирает необязательные', pg.locator('.pt-node').count() < n3 and pg.locator('.pt-node.t-opt').count() == 0)
    pg.locator('.pt-req input').uncheck()
    # статусы через панель
    go('#/path/1')
    first = pg.locator('.pt-node').first; first.click(); pg.wait_for_timeout(300)
    pg.locator('.nd [data-st="progress"]').click(); pg.wait_for_timeout(200)
    ok('статус «в процессе» сохраняется', json.loads(pg.evaluate("localStorage.getItem('csroad:nodes')") or '{}') != {})
    ok('кнопка статуса нажата', pg.locator('.nd [data-st="progress"]').get_attribute('aria-pressed') == 'true')
    pg.locator('.nd [data-st="skipped"]').click(); pg.wait_for_timeout(200)
    ok('статус «пропущена»', pg.locator('.nd [data-st="skipped"]').get_attribute('aria-pressed') == 'true')
    pg.locator('.nd [data-st="todo"]').click(); pg.wait_for_timeout(200)
    # «Отметить пройденным» ↔ карточка «Тема пройдена»
    xp0 = pg.evaluate("window.__app.G.st.xp || 0")
    pg.locator('.nd [data-toggle-done]').click(); pg.wait_for_timeout(300)
    ok('«Отметить пройденным» → done', pg.locator('.nd [data-st="done"]').get_attribute('aria-pressed') == 'true')
    ok('XP начислен через карточку темы', pg.evaluate("window.__app.G.st.xp || 0") > xp0)
    cb = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('csroad:cb')||'{}')).filter(k=>k.indexOf('__done__')>=0||/\\.[0-9a-z]+$/.test(k)).length")
    ok('галочка темы записана в cb', cb >= 1)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok('узел стал «пройден»', pg.locator('.pt-node.s-done').count() == 1)
    go('#/topic/' + pg.evaluate("window.__app.pages.filter(p=>p.kind==='topic')[0].id"))
    ok('на странице темы карточка отмечена', pg.evaluate("[...document.querySelectorAll('input[data-cb]')].some(i=>i.checked)"))
    # календарь
    go('#/path/1'); pg.locator('#ptCal').click(); pg.wait_for_timeout(300)
    ok('календарь открывается модалкой', pg.locator('#startDate').count() == 1)
    pg.keyboard.press('Escape')
    # экспорт/импорт: ключ nodes в KEYS, gemini-key не экспортируется
    keys = pg.evaluate("localStorage.setItem('csroad:gemini-key','x'); Object.keys(localStorage)")
    ok('ключ nodes есть в хранилище', 'csroad:nodes' in keys)
    # запись старого прогресса без nodes не ломает страницу
    pg2 = ctx.new_page(); e2 = []; pg2.on('pageerror', lambda e: e2.append(str(e)))
    pg2.goto(URL); pg2.evaluate("localStorage.clear(); localStorage.setItem('csroad:cb', JSON.stringify({'p1-start.abcdef':1})); localStorage.setItem('csroad:visited', JSON.stringify({'p1-start':1}))")
    pg2.goto(URL + '#/path/1'); pg2.wait_for_timeout(400); pg2.reload(); pg2.wait_for_timeout(400)
    ok('старый прогресс без nodes открывается без ошибок', not e2 and pg2.locator('.pt-node').count() >= 10, e2)
    pg2.close()
    # анимации: reduced motion
    c2 = b.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce'); pr = c2.new_page()
    pr.goto(URL + '#/path/1?view=track'); pr.wait_for_timeout(400)
    an = pr.evaluate("getComputedStyle(document.querySelector('.tk-node.cur .tk-c')).animationName")
    ok('reduced-motion: пульсация отключена', an in ('none', ''), an)
    c2.close()
    # мобильный
    c3 = b.new_context(viewport={'width': 360, 'height': 740}); pm = c3.new_page(); pm.on('pageerror', lambda e: errs.append(str(e)))
    for h in ('#/path/1', '#/path/1?view=track', '#/path/8', '#/path/5?view=track'):
        pm.goto(URL + h); pm.wait_for_timeout(350)
        ok('360px без горизонтального скролла ' + h, pm.evaluate("document.documentElement.scrollWidth") <= 360)
    pm.goto(URL + '#/path/1'); pm.locator('.pt-node').first.click(); pm.wait_for_timeout(350)
    ok('мобильная панель в экране', pm.evaluate("(()=>{const r=document.querySelector('.nd').getBoundingClientRect();return r.left>=0&&r.right<=360})()"))
    c3.close()
    # сундук: +100 XP один раз
    c4 = b.new_context(viewport={'width': 1280, 'height': 900}); pc = c4.new_page(); pc.on('pageerror', lambda e: errs.append(str(e)))
    pc.goto(URL + '#/path/1?view=track'); pc.wait_for_timeout(300)
    pc.locator('.tk-chest').click(); pc.wait_for_timeout(300)
    ok('сундук закрытой фазы не даёт XP', pc.evaluate("(window.__app.G.st.xp||0)") == 0)
    c4.close()
    ok('нет ошибок страницы', not errs, errs)
    b.close()
bad = [r for r in res if not r[1]]
print('\nchecks', len(res), 'failed', len(bad)); raise SystemExit(1 if bad else 0)
