# Этап 5: проверки сессии практики. Запуск: python3 tests/sessioncheck.py
import os, pathlib, json
from playwright.sync_api import sync_playwright
URL = pathlib.Path(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'csharp-dotnet-roadmap.html')).resolve().as_uri()
res = []
def ok(name, cond, extra=''):
    res.append((name, bool(cond), extra)); print(('ok   ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra and not cond else ''))

def finish_block(pg, typ):
    """Пройти текущий блок «по-честному» там, где это просто, иначе пропустить."""
    if typ == 'quiz':
        n = int(pg.evaluate("document.querySelector('.sx .lab-sub').textContent.match(/из (\\d+)/)[1]"))
        for i in range(n):
            pg.locator('.sx .opt').first.click(); pg.wait_for_timeout(60); pg.locator('#sxNext').click(); pg.wait_for_timeout(60)
        pg.locator('#sxNext').click(); pg.wait_for_timeout(60)       # «Дальше» с экрана результата
    elif typ == 'cards':
        pg.locator('#sxNext').click(); pg.wait_for_timeout(60)
    else:
        pg.locator('#sxSkip').click(); pg.wait_for_timeout(60)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1100, 'height': 800}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    def go(h, w=300): pg.goto('about:blank'); pg.goto(URL + h); pg.wait_for_timeout(w)
    go('')
    pages = pg.evaluate("window.__app.pages.filter(p=>['topic','practice','project'].includes(p.kind)).map(p=>({id:p.id,labs:(p.labs||[]).filter(l=>['quiz','ide','ticket','compare','cards','legacy','interview'].includes(l.type)).map(l=>l.type)})).filter(p=>p.labs.length)")
    ok('есть страницы с практикой', len(pages) > 40, len(pages))

    # --- каждая страница: сессия открывается, шагов столько же, сколько блоков, доходит до итогов
    bad = []
    for pgi in pages:
        go('#/practice/' + pgi['id'], 120)
        kick = []
        try:
            for t in pgi['labs']:
                kick.append(pg.locator('.sx-kicker small').inner_text())
                finish_block(pg, t)
            done = pg.locator('.sx-sum').count() == 1
            if not done or kick[0] != '1 из %d' % len(pgi['labs']): bad.append(pgi['id'])
        except Exception as e:
            bad.append(pgi['id'] + ':' + str(e)[:60])
    ok('все страницы практики проходятся до экрана итогов', not bad, bad[:5])
    ok('нет ошибок страницы на всех сессиях', not errs, errs[:3])

    # --- квиз: неверный / верный ответ, XP, панель
    go('#/practice/p1-types', 500)
    ok('«Дальше» неактивна до ответа', pg.locator('#sxNext').is_disabled())
    ok('собственная панель квиза скрыта (подача только сессии)', not pg.locator('.sx .qfb').is_visible())
    rng = pg.evaluate("(()=>{const q=window.__app.LABDATA['p1-types.quiz2'].qs[0];const d=document.createElement('div');return q.opts.map(o=>{d.innerHTML=o.html;return [d.textContent.trim(),o.ok]})})()")
    right = [t for t, o in rng if o][0]; wrong = [t for t, o in rng if not o][0]
    xp0 = pg.evaluate("window.__app.G.st.xp||0")
    pg.locator('.sx .opt', has_text=wrong[:25]).first.click(); pg.wait_for_timeout(300)
    ok('неверный ответ → красная панель с верным ответом и разбором', pg.locator('#sxFoot').get_attribute('data-state') == 'bad' and 'Верный ответ' in pg.locator('#sxMsg').inner_text() and 'Не совсем' in pg.locator('#sxMsg').inner_text())
    ok('за неверный ответ XP не начислен', pg.evaluate("window.__app.G.st.xp||0") == xp0)
    cards_n = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('csroad:cards')||'{}')).length")
    ok('неверный ответ ушёл в карточки повторения', cards_n >= 1, cards_n)
    p0 = int(pg.locator('.sx-bar').get_attribute('aria-valuenow'))
    pg.locator('#sxNext').click(); pg.wait_for_timeout(250)
    ok('полоса прогресса растёт', int(pg.locator('.sx-bar').get_attribute('aria-valuenow')) >= p0)
    # второй вопрос: верный
    qi = pg.evaluate("document.querySelector('.sx .lab-sub').textContent")
    q2 = pg.evaluate("(()=>{const q=window.__app.LABDATA['p1-types.quiz2'].qs[1];const d=document.createElement('div');d.innerHTML=q.opts.find(o=>o.ok).html;return d.textContent.trim()})()")
    xp1 = pg.evaluate("window.__app.G.st.xp||0")
    pg.locator('.sx .opt', has_text=q2[:25]).first.click(); pg.wait_for_timeout(300)
    ok('верный ответ → зелёная панель', pg.locator('#sxFoot').get_attribute('data-state') == 'ok' and 'Верно' in pg.locator('#sxMsg').inner_text())
    ok('верный ответ: +8 XP, как в обычном квизе', pg.evaluate("window.__app.G.st.xp||0") == xp1 + 8)
    ok('счётчик XP сессии обновляется', pg.locator('#sxXp').inner_text().strip().startswith('+8'), pg.locator('#sxXp').inner_text())
    ok('после ответа фокус на «Дальше»', pg.evaluate("document.activeElement && document.activeElement.id==='sxNext'"))

    # --- тикет: плохой → хороший ответ
    go('#/practice/p1-types', 500)
    for i in range(4):
        pg.locator('.sx .opt').first.click(); pg.wait_for_timeout(80); pg.locator('#sxNext').click(); pg.wait_for_timeout(80)
    pg.locator('#sxNext').click(); pg.wait_for_timeout(300)
    ok('шаг «Тикет»: «Дальше» скрыта, есть «Пропустить»', pg.locator('#sxNext').is_hidden() and pg.locator('#sxSkip').is_visible())
    ok('кнопка проверки называется «Проверить»', 'Проверить' in pg.locator('.sx [data-a="check"]').inner_text())
    xp2 = pg.evaluate("window.__app.G.st.xp||0")
    pg.locator('.sx [data-a="check"]').click(); pg.wait_for_timeout(500)
    ok('тикет: неверное решение → красная панель', pg.locator('#sxFoot').get_attribute('data-state') == 'bad')
    sol = pg.evaluate("(()=>{const l=window.__app.LABDATA;const k=Object.keys(l).find(x=>x.indexOf('p1-types.ticket')===0);return l[k].solution})()")
    pg.evaluate("(s)=>{const t=document.querySelector('.ed-ta');t.value=s;t.dispatchEvent(new Event('input',{bubbles:true}))}", sol); pg.wait_for_timeout(200)
    ok('красная панель гаснет при правке кода', pg.locator('#sxFoot').get_attribute('data-state') == 'idle')
    pg.locator('.sx [data-a="check"]').click(); pg.wait_for_timeout(800)
    ok('верное решение → зелёная панель, «Дальше» доступна', pg.locator('#sxFoot').get_attribute('data-state') == 'ok' and pg.locator('#sxNext').is_enabled() and pg.locator('#sxNext').is_visible())
    gain = pg.evaluate("window.__app.G.st.xp||0") - xp2
    ok('XP за тикет начислен по правилам блока (≥ 40% награды)', gain >= 28, gain)
    pg.locator('#sxNext').click(); pg.wait_for_timeout(300)
    ok('карточки: последний шаг — «Завершить»', pg.locator('#sxNext').inner_text() == 'Завершить')
    pg.locator('#sxNext').click(); pg.wait_for_timeout(500)
    ok('итоги: XP, время, точность, ссылка на следующую тему', pg.locator('.sx-stats').inner_text().count('XP') == 1 and pg.locator('.sx-ring').count() == 1 and pg.locator('.sx-end a.pri').get_attribute('href').startswith('#/topic/'))
    nxt = pg.evaluate("(()=>{const s=[];for(let n=1;n<=8;n++){}return null})()")
    pg.locator('#sxAgain').click(); pg.wait_for_timeout(400)
    ok('«Пройти ещё раз» начинает сессию заново', pg.locator('.sx-kicker small').inner_text().startswith('1 из'))
    # повторная сдача решения не даёт XP второй раз
    for i in range(4):
        pg.locator('.sx .opt').first.click(); pg.wait_for_timeout(80); pg.locator('#sxNext').click(); pg.wait_for_timeout(80)
    pg.locator('#sxNext').click(); pg.wait_for_timeout(300)
    xp3 = pg.evaluate("window.__app.G.st.xp||0")
    pg.evaluate("(s)=>{const t=document.querySelector('.ed-ta');t.value=s;t.dispatchEvent(new Event('input',{bubbles:true}))}", sol); pg.wait_for_timeout(200)
    pg.locator('.sx [data-a="check"]').click(); pg.wait_for_timeout(700)
    ok('повторное решение не начисляет XP', pg.evaluate("window.__app.G.st.xp||0") == xp3)

    # --- compare / legacy / interview
    for typ, pid in [(t, next((x['id'] for x in pages if t in x['labs']), None)) for t in ('compare', 'legacy', 'interview')]:
        if not pid: ok('есть страница с блоком ' + typ, False); continue
        go('#/practice/' + pid, 400)
        idx = pages[[x['id'] for x in pages].index(pid)]['labs'].index(typ)
        for i in range(idx): finish_block(pg, pages[[x['id'] for x in pages].index(pid)]['labs'][i])
        ok(typ + ': шаг открыт, «Дальше» неактивна/скрыта', pg.locator('.sx-kicker span').inner_text().lower() != '' and (pg.locator('#sxNext').is_hidden() or pg.locator('#sxNext').is_disabled()))
        if typ == 'compare':
            pg.locator('.sx .cmp-foot button:not([data-a="run"])').first.click()
        elif typ == 'legacy':
            pg.locator('.sx [data-a="check"]').first.click()
        else:
            pg.locator('.sx [data-a]').first.click(); pg.wait_for_timeout(150); pg.locator('.sx [data-g="2"]').first.click()
        pg.wait_for_timeout(300)
        ok(typ + ': после действия «Дальше» доступна и есть панель', pg.locator('#sxNext').is_enabled() and pg.locator('#sxNext').is_visible() and pg.locator('#sxMsg').inner_text().strip() != '')

    # --- выход и уход со страницы
    go('#/practice/p1-types', 400)
    ok('шапка и нижняя панель скрыты в сессии', not pg.locator('#hdr').is_visible() and pg.evaluate("document.documentElement.classList.contains('sx-open')"))
    pg.locator('#sxExit').click(); pg.wait_for_timeout(300)
    ok('«Выйти» ведёт к теме, оболочка возвращается', pg.evaluate("location.hash") == '#/topic/p1-types' and pg.locator('#hdr').is_visible() and not pg.evaluate("document.documentElement.classList.contains('sx-open')"))
    go('#/practice/p1-types', 300); pg.evaluate("location.hash='#/today'"); pg.wait_for_timeout(300)
    ok('уход по ссылке снимает режим сессии', not pg.evaluate("document.documentElement.classList.contains('sx-open')") and pg.locator('.sx').count() == 0)
    go('#/practice/p1', 200); ok('чекпойнт без практики → тема', pg.evaluate("location.hash") == '#/topic/p1')

    # --- Today и Path ведут в сессию
    go('#/today', 400)
    ok('«Сегодня»: задание ведёт в сессию', (pg.locator('a.t-mini[href^="#/practice/"]').first.get_attribute('href') or '').startswith('#/practice/'))
    pg.locator('a.t-mini[href^="#/practice/"]').first.click(); pg.wait_for_timeout(500)
    ok('«К заданию» открывает сессию сразу на задаче', pg.locator('.sx-kicker span').inner_text().lower() in ('задача', 'тикет') and '?at=' in pg.evaluate('location.hash'))
    go('#/practice/p1-types?at=bogus', 300); ok('неизвестный блок в ?at= отбрасывается', pg.evaluate('location.hash') == '#/practice/p1-types')

    # --- reduced motion, мобильный
    c2 = b.new_context(viewport={'width': 1100, 'height': 800}, reduced_motion='reduce'); pr = c2.new_page(); pr.goto(URL + '#/practice/p1-types'); pr.wait_for_timeout(500)
    ok('reduced-motion: полоса прогресса без переходов', pr.evaluate("getComputedStyle(document.querySelector('.sx-bar i')).transitionDuration") in ('0s', ''))
    c2.close()
    c3 = b.new_context(viewport={'width': 360, 'height': 740}); pm = c3.new_page(); pm.on('pageerror', lambda e: errs.append(str(e)))
    pm.goto(URL + '#/practice/p1-types'); pm.wait_for_timeout(500)
    ok('360px: вопрос без горизонтального скролла', pm.evaluate("document.documentElement.scrollWidth") <= 360)
    pm.locator('.sx .opt').first.click(); pm.wait_for_timeout(300)
    box = pm.locator('#sxNext').bounding_box()
    ok('360px: кнопка «Дальше» целиком в экране и ≥44px', box and box['x'] >= 0 and box['x'] + box['width'] <= 360 and box['y'] + box['height'] <= 740 and box['height'] >= 44, box)
    for i in range(3):
        pm.locator('#sxNext').click(); pm.wait_for_timeout(100); pm.locator('.sx .opt').first.click(); pm.wait_for_timeout(100)
    pm.locator('#sxNext').click(); pm.wait_for_timeout(100); pm.locator('#sxNext').click(); pm.wait_for_timeout(400)
    ok('360px: шаг с редактором без горизонтального скролла', pm.evaluate("document.documentElement.scrollWidth") <= 360 and pm.evaluate("document.querySelector('.sx-body').scrollWidth") <= 361)
    c3.close()
    ok('нет ошибок страницы и консоли', not errs, errs[:3])
    b.close()
bad = [r for r in res if not r[1]]
print('\nchecks', len(res), 'failed', len(bad)); raise SystemExit(1 if bad else 0)
