#!/usr/bin/env python3
"""Проверка оболочки (Этап 2): маршруты и редиректы, шапка, меню, поиск, «Сегодня», совместимость прогресса.
Скриншоты — в каталог argv[1] (необязательно)."""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).parent.parent
URL = (ROOT / 'dist' / 'csharp-dotnet-roadmap.html').resolve().as_uri()
shots = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
errs, fails = [], []
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + ((' ' + str(extra)) if (extra and not cond) else ''))
    if not cond: fails.append(name)
def shot(pg, n):
    if shots: pg.screenshot(path=str(shots / n))
def hash_of(pg): return pg.evaluate('location.hash')
def go(pg, h):
    pg.evaluate("h => { location.hash = h }", h); pg.wait_for_timeout(120)
    return hash_of(pg)

REDIRECTS = [
    ('#/home', '#/today'), ('', '#/today'), ('#/', '#/today'), ('#/nonexistent', '#/today'),
    ('#/p1-types', '#/topic/p1-types'), ('#/p1-types/lab', '#/topic/p1-types/lab'),
    ('#/p1-practice', '#/topic/p1-practice'), ('#/p1-project', '#/topic/p1-project'),
    ('#/p1', '#/path/1'), ('#/p7', '#/path/7'), ('#/path', '#/path'), ('#/path/3', '#/path/3'), ('#/path/9', '#/path'),
    ('#/profile', '#/profile'), ('#/review', '#/profile/review'),
    ('#/how', '#/help/how'), ('#/calibration', '#/help/calibration'), ('#/structure', '#/help/structure'),
    ('#/lab', '#/help/lab'), ('#/rabbit-holes', '#/help/rabbit-holes'),
    ('#/portfolio', '#/topic/portfolio'), ('#/risks', '#/topic/risks'), ('#/final', '#/topic/final'),
    ('#/topic/p2-list', '#/topic/p2-list'), ('#/practice/p2-list', '#/practice/p2-list'), ('#/practice/p1', '#/topic/p1'), ('#/topic/p1', '#/topic/p1'), ('#/p1', '#/path/1'), ('#/path/1?view=track&x=1', '#/path/1?view=track'), ('#/topic/nope', '#/today'),
    ('#/ref', '#/ref'), ('#/ref/operators/plus', '#/ref'), ('#/help', '#/help'), ('#/help/jobs', '#/help/jobs'),
    ('#/path?view=tree', '#/path?view=tree'), ('#/p7-applications', '#/topic/p7-applications'),
]
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 800}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(400)

    # --- маршруты ---
    for src, dst in REDIRECTS:
        check('редирект %-24s → %s' % (src or '(пусто)', dst), go(pg, src) == dst, hash_of(pg))
    # «назад» не зацикливается
    go(pg, '#/today'); go(pg, '#/p1-types'); pg.go_back(); pg.wait_for_timeout(150)
    check('кнопка «назад» возвращает на Сегодня', hash_of(pg) == '#/today', hash_of(pg))

    # --- каркас ---
    check('сайдбара нет', pg.evaluate("!document.querySelector('.side') || getComputedStyle(document.querySelector('.side')).display === 'none'"))
    go(pg, '#/today')
    check('в шапке 4 раздела', pg.locator('.topnav a').count() == 4)
    check('текущий раздел помечен aria-current', pg.evaluate("document.querySelector('.topnav a[aria-current=page]').dataset.nav") == 'today')
    go(pg, '#/topic/p1-types')
    check('на теме подсвечен раздел «Путь»', pg.evaluate("document.querySelector('.topnav a[aria-current=page]').dataset.nav") == 'path')
    check('старой шапки нет (Ты здесь, карта, таймер)', pg.evaluate("!document.querySelector('#hereChip,#mapBtn,.hdr #timerBtn,#menuBtn')"))
    check('открывается страница темы', pg.evaluate("document.querySelector('h1.page-title').textContent").startswith('Value types'))

    # --- Сегодня ---
    go(pg, '#/today')
    check('Сегодня: одна главная карточка', pg.locator('.t-continue').count() == 1)
    check('Сегодня: главная кнопка ведёт в тему', (pg.get_attribute('.t-continue .ds-btn.pri', 'href') or '').startswith('#/topic/'))
    check('Сегодня: 7 сегментов фаз', pg.locator('.t-phases .ds-segbar a').count() == 7)
    check('Сегодня: 3 маленькие карточки', pg.locator('.t-mini').count() == 3)
    check('Сегодня: старых блоков нет', pg.locator('.phase-grid,.here-card,.home-xp,.hero:not(.ds-card)').count() == 0)
    check('Сегодня: ровно одна primary-кнопка', pg.locator('.today .ds-btn.pri').count() == 1)
    shot(pg, 'shell-today-light.png')
    pg.click('.t-continue .ds-btn.pri'); pg.wait_for_timeout(200)
    check('1 клик: Сегодня → тема', hash_of(pg).startswith('#/topic/'), hash_of(pg))
    shot(pg, 'shell-topic-light.png')
    pg.click('.topnav a[data-nav=path]'); pg.wait_for_timeout(150)
    check('1 клик: тема → Путь', hash_of(pg) == '#/path')
    shot(pg, 'shell-path-light.png')

    # --- клавиши ---
    go(pg, '#/today'); pg.locator('body').click(position={'x': 5, 'y': 400}); pg.keyboard.press('m'); pg.wait_for_timeout(120)
    check('клавиша M → Путь', hash_of(pg) == '#/path')
    pg.keyboard.press('r'); pg.wait_for_timeout(120)
    check('клавиша R → Справочник', hash_of(pg) == '#/ref')
    shot(pg, 'shell-ref.png')

    # --- поиск ---
    go(pg, '#/today')
    check('поле поиска скрыто до открытия', not pg.is_visible('#q'))
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(120)
    check('Ctrl+K раскрывает поиск и фокусирует поле', pg.is_visible('#q') and pg.evaluate("document.activeElement.id") == 'q')
    pg.keyboard.type('боксинг'); pg.wait_for_timeout(200)
    check('поиск находит результаты', pg.locator('#sres .sr').count() > 0)
    shot(pg, 'shell-search.png')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    check('Enter открывает тему', hash_of(pg).startswith('#/topic/'), hash_of(pg))
    check('поиск закрылся', not pg.is_visible('#q'))
    pg.keyboard.press('Control+k'); pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    check('Esc закрывает поиск', not pg.is_visible('#q'))

    # --- меню ---
    go(pg, '#/today'); pg.click('#moreBtn'); pg.wait_for_timeout(300)
    check('меню открыто, фокус внутри', pg.evaluate("document.querySelector('.ds-drawer.open').contains(document.activeElement)"))
    for sel in ('#themeSeg', '#fsSeg', '#vibeChk', '#motionChk', '#timerBtn', '#langSeg', '#expBtn', '#impFile', '#resetBtn'):
        check('в меню есть ' + sel, pg.locator(sel).count() == 1)
    shot(pg, 'shell-menu.png')
    pg.click('#themeSeg [data-v=dark]'); pg.wait_for_timeout(100)
    check('тёмная тема применилась и сохранена', pg.evaluate("document.documentElement.dataset.theme") == 'dark' and pg.evaluate("localStorage.getItem('csroad:theme')") == '"dark"')
    shot(pg, 'shell-menu-dark.png')
    pg.check('#vibeChk'); pg.wait_for_timeout(100)
    check('«Яркая тема» включается и сохраняется', pg.evaluate("document.documentElement.dataset.vibe") == 'neon' and pg.evaluate("localStorage.getItem('csroad:vibe')") == '"neon"')
    pg.uncheck('#vibeChk')
    check('по умолчанию и после выключения тема спокойная', pg.evaluate("document.documentElement.dataset.vibe") is None)
    pg.uncheck('#motionChk'); pg.wait_for_timeout(50)
    check('«Анимации» выключаются', pg.evaluate("document.documentElement.dataset.motion") == 'off')
    pg.check('#motionChk')
    pg.click('#timerBtn'); pg.wait_for_timeout(1200)
    check('таймер запущен, чип в шапке', pg.is_visible('#timerChip') and '⏱' in pg.inner_text('#timerChip'))
    pg.click('#timerBtn'); pg.wait_for_timeout(1200)
    check('таймер остановлен, чип скрыт', not pg.is_visible('#timerChip'))
    pg.click('.mn-link[href="#/help/jobs"]'); pg.wait_for_timeout(300)
    check('ссылка меню ведёт в трекер и закрывает меню', hash_of(pg) == '#/help/jobs' and pg.evaluate("!document.querySelector('.ds-drawer.open')"))
    check('трекер откликов отрисован', pg.locator('.jobs-add').count() == 1)
    pg.evaluate("document.documentElement.removeAttribute('data-theme')")

    # --- совместимость данных ---
    exp = pg.evaluate("""() => { const d = {}; ['cb','visited','last','rabbit','depthDay','jobs','start','navOpen','lang','theme','fs','g','lab','cards','vibe','motion'].forEach(k => { const v = localStorage.getItem('csroad:'+k); if (v !== null) d[k] = JSON.parse(v); }); return d; }""")
    check('ключи csroad: на месте (theme, vibe, visited)', all(k in exp for k in ('theme', 'visited')))
    pg.evaluate("localStorage.setItem('csroad:gemini-key', JSON.stringify('SECRET'))")
    pg.click('#moreBtn'); pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.click('#expBtn')
    path = dl.value.path(); data = json.load(open(path, encoding='utf-8'))
    check('экспорт: формат app=csroad, v=1', data.get('app') == 'csroad' and data.get('v') == 1)
    check('экспорт: ключ Gemini не попадает', 'SECRET' not in open(path, encoding='utf-8').read() and 'gemini-key' not in data['data'])
    pg.keyboard.press('Escape')

    # --- прогресс старого пользователя не теряется ---
    old = pg.context.new_page(); old.on('pageerror', lambda e: errs.append(str(e)))
    old.goto(URL)
    old.evaluate("""() => { localStorage.setItem('csroad:g', JSON.stringify({xp: 320, done: {}, days: {}, ach: {}, streak: {n: 4, last: (()=>{const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)})(), best: 4}, stat: {}}));
      localStorage.setItem('csroad:visited', JSON.stringify({'p1-types': Date.now()})); localStorage.removeItem('csroad:theme'); }""")
    old.goto(URL + '#/today'); old.reload(); old.wait_for_timeout(400)
    txt = old.inner_text('.today')
    check('старый XP/ранг виден на Сегодня (Junior I)', 'Junior I' in txt, txt[:200])
    check('серия 4 дня видна', 'Серия: 4 дня' in txt)
    check('«Продолжить» ведёт в последнюю открытую тему', (old.get_attribute('.t-continue .ds-btn.pri', 'href') or '') == '#/topic/p1-types')
    old.close()

    # --- тёмная, мобильная версия ---
    for label, size in (('mobile', {'width': 360, 'height': 740}), ('tablet', {'width': 820, 'height': 1000})):
        c2 = b.new_context(viewport=size, has_touch=label == 'mobile', is_mobile=label == 'mobile'); m = c2.new_page()
        m.on('pageerror', lambda e: errs.append(str(e))); m.on('console', lambda x: x.type == 'error' and errs.append(x.text))
        m.goto(URL); m.wait_for_timeout(300)
        for h in ('#/today', '#/path', '#/topic/p1-types', '#/profile', '#/help', '#/ref', '#/help/jobs', '#/path/2'):
            m.evaluate("h => { location.hash = h }", h); m.wait_for_timeout(250)
            ok = m.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
            check('%s: нет горизонтального скролла на %s' % (label, h), ok, m.evaluate('document.documentElement.scrollWidth'))
        if label == 'mobile':
            m.evaluate("location.hash = '#/today'"); m.wait_for_timeout(200)
            check('mobile: нижняя панель видна, верхнее меню скрыто', m.is_visible('.tabbar') and not m.is_visible('.topnav'))
            check('mobile: 4 пункта нижней панели ≥ 44px', m.evaluate("[...document.querySelectorAll('.tabbar a')].every(a => a.getBoundingClientRect().height >= 44)"))
            shot(m, 'shell-today-mobile.png')
            m.click('.tabbar a[data-nav=profile]'); m.wait_for_timeout(200)
            check('mobile: переход через нижнюю панель', hash_of(m) == '#/profile')
            m.click('#moreBtn'); m.wait_for_timeout(300); shot(m, 'shell-menu-mobile.png')
            check('mobile: меню — нижняя шторка', m.evaluate("(()=>{const r=document.querySelector('.ds-drawer.open').getBoundingClientRect();return r.bottom>=innerHeight-1 && r.width>=innerWidth-1})()"))
            m.keyboard.press('Escape')
            m.evaluate("location.hash = '#/topic/p1-types'"); m.wait_for_timeout(250); shot(m, 'shell-topic-mobile.png')
        else:
            m.evaluate("location.hash = '#/today'"); m.wait_for_timeout(200); shot(m, 'shell-today-tablet.png')
        c2.close()
    # reduced motion
    c3 = b.new_context(reduced_motion='reduce'); r = c3.new_page(); r.goto(URL); r.wait_for_timeout(200)
    check('reduced-motion: нет бесконечных анимаций на Сегодня', r.evaluate("document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity).length") == 0)
    b.close()
check('нет ошибок консоли/страницы: ' + str(errs[:3]), not errs)
print('провалов:', len(fails)); sys.exit(1 if fails else 0)
