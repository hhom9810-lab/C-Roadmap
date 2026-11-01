#!/usr/bin/env python3
"""Проверка дизайн-системы в браузере: нет ошибок консоли, drawer ловит фокус и закрывается по Esc,
при data-motion=off переходы нулевые. Скриншоты — в каталог из argv[1] (необязательно)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).parent.parent
URL = (ROOT / 'dist' / 'ds-preview.html').resolve().as_uri()
shots = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
errs, fails = [], []
def check(name, cond):
    print(('ok   ' if cond else 'FAIL ') + name)
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    for label, kw in (('desktop', dict(viewport={'width': 1100, 'height': 900})), ('mobile', dict(viewport={'width': 360, 'height': 740}, has_touch=True, is_mobile=True))):
        ctx = b.new_context(**kw); pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.goto(URL)
        for theme in ('light', 'dark'):
            pg.click('[data-t="%s"]' % theme)
            if shots: pg.screenshot(path=str(shots / ('ds-%s-%s.png' % (label, theme))), full_page=True)
        # горизонтального скролла нет
        check(label + ': нет горизонтального скролла', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
        if label == 'desktop':
            pg.click('[data-t="light"]')
            pg.click('#oDr'); pg.wait_for_timeout(300)
            check('drawer открыт и фокус внутри', pg.evaluate("document.querySelector('.ds-drawer').contains(document.activeElement)"))
            for _ in range(8): pg.keyboard.press('Tab')
            check('фокус не уходит из drawer после 8 Tab', pg.evaluate("document.querySelector('.ds-drawer').contains(document.activeElement)"))
            if shots: pg.screenshot(path=str(shots / 'ds-drawer.png'))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            check('Esc закрывает drawer', pg.evaluate("!document.querySelector('.ds-drawer').classList.contains('open')"))
            check('фокус вернулся на кнопку-открывалку', pg.evaluate("document.activeElement.id === 'oDr'"))
            pg.click('#oMo'); pg.wait_for_timeout(300)
            check('модалка открыта', pg.evaluate("document.querySelector('.ds-modal').classList.contains('open')"))
            pg.keyboard.press('Escape')
            pg.click('#oTo'); check('тост показан', pg.locator('.ds-toast').count() >= 1)
            pg.check('#mo')
            check('motion=off обнуляет длительности', pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--ds-dur').trim() === '0ms'"))
        else:
            pg.click('#oDr'); pg.wait_for_timeout(300)
            check('mobile: drawer стал нижней шторкой', pg.evaluate("(function(){var r=document.querySelector('.ds-drawer').getBoundingClientRect();return r.bottom>=window.innerHeight-1 && r.width>=window.innerWidth-1;})()"))
            if shots: pg.screenshot(path=str(shots / 'ds-mobile-sheet.png'))
        ctx.close()
    # reduced-motion (системная настройка)
    ctx = b.new_context(reduced_motion='reduce'); pg = ctx.new_page(); pg.goto(URL)
    check('prefers-reduced-motion обнуляет длительности', pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--ds-dur').trim() === '0ms'"))
    check('DS.motionOK() === false при reduced-motion', pg.evaluate('DS.motionOK() === false'))
    b.close()
check('нет ошибок консоли/страницы: ' + str(errs[:3]), not errs)
print('провалов:', len(fails)); sys.exit(1 if fails else 0)
