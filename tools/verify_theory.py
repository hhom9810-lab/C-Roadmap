#!/usr/bin/env python3
"""Проверка примеров на страницах курса (Этап 8) настоящим компилятором .NET.
   python3 tools/verify_theory.py [--force] [--fill] [partials/файл.md …]
Проверяются блоки ~~~csharp, за которыми сразу идёт ~~~console (компиляция + запуск + сравнение вывода);
  блок с единственной строкой «?» в ~~~console заполняется реальным выводом (--fill; потом прочитать глазами);
  ~~~csharp @nocheck — не проверяется. Блоки без ~~~console не трогаются (фрагменты старого текста)."""
import hashlib, json, pathlib, shutil, sys
from concurrent.futures import ThreadPoolExecutor
import os
sys.argv_saved = sys.argv[:]
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
_a = sys.argv; sys.argv = [_a[0], '--none']
import importlib.util
src = (ROOT / 'tools' / 'verify_ref.py').read_text(encoding='utf-8').replace('\nmain()', '\n')
ns = {'__file__': str(ROOT / 'tools' / 'verify_ref.py'), '__name__': 'vr'}
exec(compile(src, 'verify_ref.py', 'exec'), ns)
sys.argv = _a
FENCE, run_one, LANGV, TFM = ns['FENCE'], ns['run_one'], ns['LANGV'], ns['TFM']
if os.environ.get('REF_WEB'):   # страницы про ASP.NET Core: Sdk.Web (общий фреймворк входит в SDK, NuGet не нужен)
    ns['CSPROJ'] = ns['CSPROJ'].replace('Microsoft.NET.Sdk"', 'Microsoft.NET.Sdk.Web"')
CACHE = ROOT / 'tools' / '.cache' / 'theory-verified.json'

def main():
    fill = '--fill' in sys.argv; force = '--force' in sys.argv
    files = [pathlib.Path(a) for a in sys.argv[1:] if not a.startswith('--')] or sorted((ROOT / 'partials').glob('[0-9]*.md'))
    cache = json.loads(CACHE.read_text()) if CACHE.exists() and not force else {}
    jobs = []
    for f in files:
        t = f.read_text(encoding='utf-8')
        for m in FENCE.finditer(t):
            if m.group(3) is None or '@nocheck' in m.group(1): continue
            h = hashlib.sha1((LANGV + TFM + os.environ.get('REF_WEB', '') + m.group(2) + '\0' + m.group(3)).encode()).hexdigest()
            jobs.append({'f': f, 'code': m.group(2), 'exp': m.group(3), 'h': h, 'line': t[:m.start()].count('\n') + 1})
    todo = [j for j in jobs if j['exp'] == '?' or cache.get(j['h']) != 'ok']
    print(f'блоков с выводом: {len(jobs)}, к проверке: {len(todo)}')
    bad = 0
    with ThreadPoolExecutor(max_workers=int(os.environ.get('REF_JOBS', '4'))) as ex:
        res = list(ex.map(run_one, todo))
    for j, r in zip(todo, res):
        if r is not None: bad += 1; print('FAIL', j['f'].name, 'строка', j['line'], r); continue
        if j['exp'] == '?':
            if not fill: print('? ', j['f'].name, 'строка', j['line'], '(нужен --fill)'); bad += 1; continue
            t = j['f'].read_text(encoding='utf-8'); i = t.index(j['code'] + '\n~~~'); k = t.index('\n?\n~~~', i)
            t = t[:k] + '\n' + j['got'] + '\n~~~' + t[k + len('\n?\n~~~'):]; j['f'].write_text(t, encoding='utf-8'); print('fill', j['f'].name, j['line'])
        else: cache[j['h']] = 'ok'
    CACHE.parent.mkdir(parents=True, exist_ok=True); CACHE.write_text(json.dumps(cache))
    print(f'ошибок {bad}'); sys.exit(1 if bad else 0)
main()
