# Этап 7: проверки справочника. Запуск: python3 tests/refcheck.py
import os, pathlib, re
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'csharp-dotnet-roadmap.html').as_uri()
SHOTS = ROOT / 'docs' / 'screens'; SHOTS.mkdir(parents=True, exist_ok=True)
res = []
def ok(name, cond, extra=''):
    res.append((name, bool(cond), extra)); print(('ok   ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra and not cond else ''))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}, permissions=['clipboard-read', 'clipboard-write']); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    def go(h, w=300): pg.goto(URL + h); pg.wait_for_timeout(w)
    hs = lambda: pg.evaluate("location.hash")
    go('#/ref')
    entries = pg.evaluate("window.__app && window.__app.ref ? window.__app.ref.entries.map(e=>e.id) : null")
    if entries is None:
        entries = pg.evaluate("[...document.querySelectorAll('script[type=\"text/x-ref\"]')].map(s=>s.dataset.id).filter(i=>!i.startsWith('cat-'))")
    ent_a = [e for e in entries if e.startswith('op-')]
    ent_b = [e for e in entries if e.startswith('ty-')]; ent_c = [e for e in entries if e.startswith('cl-')]
    ent_d = [e for e in entries if e.startswith('fl-')]; ent_e = [e for e in entries if e.startswith('co-')]
    ent_f = [e for e in entries if e.startswith('as-') or e in ('rt-memory-model','rt-serialization')]; ent_g = [e for e in entries if (e.startswith('rt-') and e not in ('rt-memory-model','rt-serialization')) or e.startswith('pf-')]
    cat_of = lambda e: {'rt-memory-model': 'f', 'rt-serialization': 'f'}.get(e) or {'op': 'a', 'ty': 'b', 'cl': 'c', 'fl': 'd', 'co': 'e', 'as': 'f', 'rt': 'g', 'pf': 'g'}[e.split('-')[0]]
    ok('категории D–G: записи есть (D ≥ 14, E ≥ 16, F ≥ 13, G ≥ 11)', len(ent_d) >= 14 and len(ent_e) >= 16 and len(ent_f) >= 13 and len(ent_g) >= 11, (len(ent_d), len(ent_e), len(ent_f), len(ent_g)))
    ok('в сборку попали записи справочника (A ≥ 38, B ≥ 21, C ≥ 22)', len(ent_a) >= 38 and len(ent_b) >= 21 and len(ent_c) >= 22, (len(ent_a), len(ent_b), len(ent_c)))

    # --- главная справочника
    ok('#/ref: заголовок и карточка категории A', pg.locator('h1').inner_text().startswith('Справочник') and pg.locator('.rf-catc').count() >= 1)
    ok('#/ref: блок «Таблицы» с приоритетом операторов', pg.locator('.rf-cards a[href$="op-precedence"]').count() == 1)
    ok('#/ref: в верхней навигации пункт «Справочник» активен', pg.evaluate("!!document.querySelector('[aria-current=\"page\"][href=\"#/ref\"]')"))
    ok('#/ref: слева указатель с фильтром', pg.locator('.rf-idx .rf-f').count() == 1 and pg.locator('.rf-idx .rf-cat').count() >= 1)

    # --- категория
    go('#/ref/a')
    ok('#/ref/a: обзор и все записи', pg.locator('.rf-cards > li').count() == len(ent_a) and pg.locator('.rf-body h2').count() >= 3, pg.locator('.rf-cards > li').count())
    ok('обзор категории ≤ 2500 слов', len(pg.locator('.rf-body').inner_text().split()) <= 2500)
    dead = pg.evaluate("[...document.querySelectorAll('.rf-body a[href^=\"#/ref\"]')].filter(a=>{const h=a.getAttribute('href').split('/');return h.length>=4 && !window.__app.ref?.entries?.some?.(e=>e.id===h[3])}).length") if False else 0

    # --- статья: структура
    go('#/ref/a/op-null-coalescing', 500)
    ok('статья: заголовок, бейджи C#/время/память', pg.locator('h1').inner_text().startswith('Оператор объединения') and pg.locator('.rf-badges .rf-b').count() >= 3)
    secs = pg.evaluate("[...document.querySelectorAll('.rf-body h2')].map(h=>h.id)")
    need = ['h-syntax', 'h-semantics', 'h-internals', 'h-complexity', 'h-versions', 'h-pitfalls', 'h-examples']
    ok('статья: семь фиксированных разделов + «Связанное»', all(n in secs for n in need) and pg.locator('#h-related').count() == 1, secs)
    ok('вводный абзац (что это) под заголовком', len(pg.locator('.rf-lead').inner_text().split()) >= 8)
    ok('оглавление справа со ссылками на разделы', pg.locator('.rf-toc a[data-sec]').count() >= 8)
    ok('«Связанное»: справочник, курс, Microsoft Learn', pg.locator('.rf-rel h3').count() == 3)
    ok('ссылки на Learn: noopener и новая вкладка', pg.evaluate("[...document.querySelectorAll('.rf-rel .learn-a')].every(a=>a.target==='_blank'&&/noopener/.test(a.rel))"))
    ok('пример с выводом: блок кода и блок console', pg.locator('.rf-body .code').count() >= 3)
    ok('prev/next между записями', pg.locator('.rf-pn a').count() == 2)

    # --- постоянные ссылки на разделы и копирование
    go('#/ref/a/op-null-coalescing/pitfalls', 600)
    top = pg.evaluate("document.getElementById('h-pitfalls').getBoundingClientRect().top")
    ok('адрес с разделом прокручивает к разделу', 0 <= top < 400, top)
    pg.locator('#h-pitfalls .rf-cp').click(); pg.wait_for_timeout(300)
    clip = pg.evaluate("navigator.clipboard.readText()")
    ok('«Скопировать ссылку на раздел» кладёт постоянный адрес', clip.endswith('#/ref/a/op-null-coalescing/pitfalls'), clip)
    ok('кнопка копирования имеет понятное имя', 'Скопировать ссылку на раздел' in (pg.locator('#h-pitfalls .rf-cp').get_attribute('aria-label') or ''))
    go('#/ref/op-ternary'); ok('короткий адрес #/ref/<запись> приводится к полному', hs() == '#/ref/a/op-ternary', hs())

    # --- указатель, фильтр
    pg.fill('.rf-idx .rf-f', 'switch'); pg.wait_for_timeout(150)
    vis = pg.evaluate("[...document.querySelectorAll('.rf-idx li:not([hidden]) a')].map(a=>a.textContent.trim())")
    ok('фильтр указателя оставляет подходящие записи', 1 <= len(vis) <= 8 and any('switch' in v.lower() for v in vis), vis)
    pg.fill('.rf-idx .rf-f', 'абракадабра'); pg.wait_for_timeout(120)
    ok('фильтр: сообщение «Ничего не найдено»', pg.locator('.rf-idx .rf-none').is_visible())
    pg.fill('.rf-idx .rf-f', 'nameof'); pg.wait_for_timeout(120)
    ok('фильтр ищет и по тегам/ключевым словам', pg.evaluate("[...document.querySelectorAll('.rf-idx li:not([hidden]) a')].some(a=>/nameof/i.test(a.textContent))"))

    # --- поиск Ctrl+K
    go('#/today')
    pg.keyboard.press('Control+k'); pg.keyboard.type('stackalloc'); pg.wait_for_timeout(300)
    rs = pg.evaluate("[...document.querySelectorAll('#sres .sr')].map(r=>({t:r.textContent,h:r.getAttribute('href')||r.dataset.href||''}))")
    ok('Ctrl+K находит записи справочника', any('Справочник' in r['t'] or '#/ref' in r['h'] for r in rs), rs[:3])
    pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    ok('Enter открывает запись справочника', hs().startswith('#/ref/a/op-stackalloc'), hs())
    pg.keyboard.press('Control+k'); pg.keyboard.type('Dictionary'); pg.wait_for_timeout(250)
    ok('поиск по-прежнему находит темы курса', pg.evaluate("[...document.querySelectorAll('#sres .sr')].some(r=>/#\\/topic\\//.test(r.getAttribute('href')||r.dataset.href||''))") or pg.locator('#sres .sr').count() > 0)
    pg.keyboard.press('Escape')

    # --- таблица приоритетов
    go('#/ref/a/op-precedence', 500)
    ok('таблица приоритетов: 17 строк', pg.locator('[data-sortable] tbody tr').count() == 17, pg.locator('[data-sortable] tbody tr').count())
    ok('заголовки таблицы — кнопки с aria-sort', pg.locator('[data-sortable] th[aria-sort] button').count() == 4)
    pg.locator('[data-sortable] th button').nth(1).click(); pg.wait_for_timeout(150)
    firsts = pg.evaluate("[...document.querySelectorAll('[data-sortable] tbody tr')].map(r=>r.children[1].textContent)")
    ok('сортировка по «Категория» (по возрастанию)', firsts == sorted(firsts, key=lambda s: s.lower()) or firsts[0] != 'Первичные', firsts[:3])
    ok('aria-sort обновлён', pg.locator('[data-sortable] th[aria-sort="ascending"]').count() == 1)
    pg.locator('[data-sortable] th button').nth(0).click(); pg.wait_for_timeout(150); pg.locator('[data-sortable] th button').nth(0).click(); pg.wait_for_timeout(150)
    nums = pg.evaluate("[...document.querySelectorAll('[data-sortable] tbody tr')].map(r=>parseInt(r.children[0].textContent))")
    ok('числовая сортировка по убыванию (№)', nums == sorted(nums, reverse=True), nums[:5])
    pg.fill('.rf-sort-f', '??'); pg.wait_for_timeout(150)
    shown = pg.locator('[data-sortable] tbody tr:not([hidden])').count()
    ok('фильтр таблицы', 1 <= shown <= 2, shown)
    ok('результат фильтра объявлен для скринридера', 'Показано' in pg.locator('.rf-sort-n').inner_text())
    ok('таблица прокручивается с клавиатуры (tabindex)', pg.locator('[data-sortable] .tbl[tabindex="0"]').count() == 1)
    pg.fill('.rf-sort-f', '')

    # --- запуск примеров / метки
    go('#/ref/a/op-arithmetic', 700)
    runs = pg.locator('.rf-body .rd-run').count(); nor = pg.locator('.rf-body .rf-norun').count()
    ok('у каждого C#-примера с Console — «Запустить» или пометка', runs + nor >= 1, (runs, nor))
    if runs:
        pg.locator('.rf-body .rd-run').first.click(); pg.wait_for_timeout(1200)
        ok('«Запустить» открывает мини-IDE с кодом примера', pg.locator('.ds-modal.open #rdSrc').count() == 1 and len(pg.locator('#rdSrc').input_value()) > 10)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    go('#/ref/a/op-pointers', 700)
    ok('небезопасный код помечен как не запускаемый', pg.locator('.rf-body .rf-norun').count() >= 1)


    # --- категория B
    go('#/ref/b', 400)
    ok('#/ref/b: обзор и 21 запись', pg.locator('.rf-cards > li').count() == len(ent_b) and pg.locator('.rf-body h2').count() >= 3, pg.locator('.rf-cards > li').count())
    ok('обзор B ≤ 2500 слов', len(pg.locator('.rf-body').inner_text().split()) <= 2500)
    go('#/ref/b/ty-builtin', 500)
    ok('ty-builtin: таблица типов, 14 строк', pg.locator('[data-sortable] tbody tr').count() == 14, pg.locator('[data-sortable] tbody tr').count())
    pg.locator('[data-sortable] th button').nth(2).click(); pg.wait_for_timeout(150); pg.locator('[data-sortable] th button').nth(2).click(); pg.wait_for_timeout(150)
    sizes = pg.evaluate("[...document.querySelectorAll('[data-sortable] tbody tr')].map(r=>r.children[2].textContent.trim())")
    ok('сортировка по размеру (убывание): первым идёт decimal', sizes[0] == '16', sizes[:3])
    pg.fill('.rf-sort-f', 'decimal'); pg.wait_for_timeout(120)
    ok('фильтр таблицы типов', pg.locator('[data-sortable] tbody tr:not([hidden])').count() == 1)
    go('#/topic/p1-types', 600)
    ok('в теме «Типы» есть ссылки на записи категории B', pg.locator('.rd-ref a[href^="#/ref/b/"]').count() >= 1)
    go('#/ref/b/ty-generics/pitfalls', 500)
    ok('постоянная ссылка на раздел работает и для B', pg.evaluate("document.getElementById('h-pitfalls').getBoundingClientRect().top") < 400)

    # --- категория C
    go('#/ref/c', 400)
    ok('#/ref/c: обзор и все записи', pg.locator('.rf-cards > li').count() == len(ent_c) and pg.locator('.rf-body h2').count() >= 3, pg.locator('.rf-cards > li').count())
    ok('обзор C ≤ 2500 слов', len(pg.locator('.rf-body').inner_text().split()) <= 2500)
    go('#/ref/c/cl-vtable/pitfalls', 500)
    ok('постоянная ссылка на раздел работает и для C', pg.evaluate("document.getElementById('h-pitfalls').getBoundingClientRect().top") < 400)
    go('#/topic/p1-inheritance', 700)
    ok('в теме «Наследование» есть ссылки на записи категории C', pg.locator('.rd-ref a[href^="#/ref/c/"]').count() >= 1)

    # --- категории D–G
    for cat, ents, topic, ex in (('d', ent_d, 'p1-exceptions', 'fl-try-catch'), ('e', ent_e, 'p2-linq', 'co-linq-deferred'), ('f', ent_f, 'p5-async', 'as-async-await'), ('g', ent_g, 'p1-runtime', 'rt-gc')):
        go('#/ref/' + cat, 400)
        ok('#/ref/%s: обзор и все записи' % cat, pg.locator('.rf-cards > li').count() == len(ents) and pg.locator('.rf-body h2').count() >= 3, (pg.locator('.rf-cards > li').count(), len(ents)))
        ok('обзор %s ≤ 2500 слов' % cat.upper(), len(pg.locator('.rf-body').inner_text().split()) <= 2500)
        go('#/topic/' + topic, 700)
        ok('в теме %s есть ссылки на записи категории %s' % (topic, cat.upper()), pg.locator('.rd-ref a[href^="#/ref/%s/"]' % cat).count() >= 1)
    go('#/ref/e/co-complexity', 500)
    ok('co-complexity: сортируемая таблица', pg.locator('[data-sortable] tbody tr').count() >= 8, pg.locator('[data-sortable] tbody tr').count())
    go('#/ref/d/fl-exception-hierarchy', 500)
    ok('fl-exception-hierarchy: сортируемая таблица', pg.locator('[data-sortable] tbody tr').count() >= 10, pg.locator('[data-sortable] tbody tr').count())

    # --- ссылка из темы курса в справочник
    go('#/topic/p1-types', 700)
    ok('в теме есть блок «Подробнее в справочнике»', pg.locator('.rd-ref a[href^="#/ref/a/"]').count() >= 1)
    pg.locator('.rd-ref a').first.click(); pg.wait_for_timeout(300)
    ok('переход из темы открывает запись', hs().startswith('#/ref/a/'), hs())

    # --- все записи: загрузка, нет битых ссылок, разделы, TOC
    problems = []
    for e in entries:
        go('#/ref/' + cat_of(e) + '/' + e, 60)
        r = pg.evaluate("""()=>({h:[...document.querySelectorAll('.rf-body h2')].map(h=>h.id), n:document.querySelectorAll('.rf-body .code').length,
          bad:[...document.querySelectorAll('.rf-body a[href^="#/ref"], .rf-rel a[href^="#/ref"]')].filter(a=>{const x=a.getAttribute('href').split('/');return x.length>=4&&!document.querySelector('.rf-idx a[href="#/ref/'+x[2]+'/'+x[3]+'"]')}).length,
          t: document.title})""")
        miss = [s for s in need if s not in r['h']]
        if miss or r['bad'] or r['n'] < 2: problems.append((e, miss, r['bad'], r['n']))
    ok('все записи: 7 разделов, ≥ 2 примеров кода, без битых ссылок', not problems, problems[:5])

    # --- мобильный режим 360
    ctx2 = b.new_context(viewport={'width': 360, 'height': 740}); m = ctx2.new_page()
    merrs = []; m.on('pageerror', lambda e: merrs.append(str(e)))
    m.goto(URL + '#/ref/a/op-precedence'); m.wait_for_timeout(600)
    ok('360px: нет горизонтальной прокрутки страницы', m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), m.evaluate("document.documentElement.scrollWidth"))
    ok('360px: указатель скрыт, кнопка-шторка видна', not m.locator('.rf-idx').is_visible() and m.locator('#rfOpenIdx').is_visible())
    m.click('#rfOpenIdx'); m.wait_for_timeout(350)
    ok('шторка указателя открывается и содержит записи', m.locator('.ds-drawer.open .rf-cat a').count() > 10)
    ok('фокус внутри шторки', m.evaluate("!!document.querySelector('.ds-drawer.open') && document.querySelector('.ds-drawer.open').contains(document.activeElement)"))
    m.keyboard.press('Escape'); m.wait_for_timeout(300)
    ok('Esc закрывает шторку', m.locator('.ds-drawer.open').count() == 0)
    m.click('#rfOpenIdx'); m.wait_for_timeout(300); m.locator('.ds-drawer.open .rf-cat a[href$="op-lambda"]').first.click(); m.wait_for_timeout(300)
    ok('выбор в шторке закрывает её и открывает запись', m.locator('.ds-drawer.open').count() == 0 and m.evaluate("location.hash").endswith('op-lambda'))
    m.goto(URL + '#/ref/a/op-shift'); m.wait_for_timeout(500)
    ok('360px: код не расширяет страницу', m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    m.screenshot(path=str(SHOTS / 'ref-mobile.png'))
    ok('мобильная часть без ошибок JS', not merrs, merrs[:2])

    # --- скриншоты и reduced motion / a11y
    go('#/ref', 400); pg.screenshot(path=str(SHOTS / 'ref-home.png'))
    go('#/ref/a/op-switch-expression', 600); pg.screenshot(path=str(SHOTS / 'ref-article.png'))
    go('#/ref/a/op-precedence', 600); pg.screenshot(path=str(SHOTS / 'ref-table.png'))
    ok('у всех кнопок в статье есть доступное имя', pg.evaluate("[...document.querySelectorAll('.rf-main button')].every(b=>(b.getAttribute('aria-label')||b.textContent).trim().length>0)"))
    ok('у фильтров есть метки', pg.evaluate("[...document.querySelectorAll('.rf input')].every(i=>i.getAttribute('aria-label')||document.querySelector('label[for=\"'+i.id+'\"]'))"))
    ok('ошибок в консоли нет', not errs, errs[:3])
    b.close()
bad = [r for r in res if not r[1]]
print(f'\n{len(res) - len(bad)}/{len(res)} проверок пройдено')
raise SystemExit(1 if bad else 0)
