#!/usr/bin/env python3
"""Этап 8: проверка страниц теории по шаблону из 7 разделов (статически, без браузера).
   python3 tests/theorycheck.py            — проверить все переписанные страницы
   Страница считается переписанной, если в ней есть раздел «Зачем это нужно»."""
import json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build
H2 = ['Зачем это нужно', 'Интуиция и аналогия', 'Основная теория по шагам', 'Как это работает под капотом',
      'Типичные ошибки и ловушки', 'Вопросы с собеседований', 'Что запомнить']
base = json.loads((ROOT / 'tests' / 'theory_baseline.json').read_text(encoding='utf-8'))
fails = 0
def ok(name, cond, info=''):
    global fails
    print(('ok   ' if cond else 'FAIL ') + name + (f' | {info}' if info and not cond else ''))
    if not cond: fails += 1

def prose_words(text):
    text = re.sub(r'(?ms)^~~~.*?^~~~\s*$', ' ', text)           # блоки кода
    text = re.sub(r'`[^`]*`', ' ', text)
    return len(re.findall(r'[\wА-Яа-яЁё]+', text))

done = 0
for p in build.pages():
    a = p['attrs']
    if a.get('kind') != 'topic': continue
    body = p['body']
    if not re.search(r'(?m)^## Зачем это нужно\s*$', body): continue
    done += 1
    pid = a['id']
    theory = body.split('\n## Закрепление')[0]
    h2 = [re.sub(r'\s*\{#[\w-]+\}\s*$', '', m).strip() for m in re.findall(r'(?m)^## (.+)$', re.sub(r'(?ms)^~~~.*?^~~~\s*$', '', theory))]
    ok(f'{pid}: 7 разделов по порядку', h2[:7] == H2 and h2[7:] in ([], ['Практика']), h2)
    w = prose_words(theory)
    ok(f'{pid}: объём 1500–3500 слов (без кода) — {w}', 1500 <= w <= 3500, w)
    ok(f'{pid}: есть вопросы с собеседований (≥ 5 :::spoiler)', theory.count(':::spoiler') >= 5, theory.count(':::spoiler'))
    ok(f'{pid}: есть код с выводом', '~~~console' in theory)
    ok(f'{pid}: нет незаполненных «?» в выводе', not re.search(r'~~~console\n\?\n~~~', theory))
    cbs = re.findall(r'(?m)^\s*- \[[ xX]\]\s+(.*)$', theory)
    miss = [t for t in base.get(pid, []) if t not in cbs]
    ok(f'{pid}: чекбоксы практики сохранены (ключи прогресса)', not miss, miss)
    ok(f'{pid}: нет текстов-заглушек', not re.search(r'TODO|TBD|lorem|\?\?\?', theory))
print(f'переписано страниц: {done}, провалов: {fails}')
sys.exit(1 if fails else 0)
