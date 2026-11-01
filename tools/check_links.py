#!/usr/bin/env python3
"""Проверка ссылок на Microsoft Learn из src/links.json. Запускать у себя (в песочнице Learn недоступен).
   python3 tools/check_links.py            — проверить все ссылки (ru-ru и en-us не различаются: берём en-us)
   python3 tools/check_links.py --verify   — только записи с "verify": true
Ничего не меняет в файлах. Для каждой ссылки печатает код ответа; в конце — список проблемных путей,
которые нужно исправить в src/links.json (после правки: python3 build.py)."""
import json, pathlib, sys, time, urllib.request, urllib.error
ROOT = pathlib.Path(__file__).resolve().parent.parent
links = json.loads((ROOT / 'src' / 'links.json').read_text(encoding='utf-8'))
only_verify = '--verify' in sys.argv
bad, seen = [], {}
for pid, arr in links.items():
    for l in arr:
        if only_verify and not l.get('verify'): continue
        path = l['path']
        if path in seen: code = seen[path]
        else:
            url = 'https://learn.microsoft.com/en-us/' + path
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (link-check)'}, method='GET')
                with urllib.request.urlopen(req, timeout=20) as r: code = r.status
            except urllib.error.HTTPError as e: code = e.code
            except Exception as e: code = type(e).__name__
            seen[path] = code; time.sleep(0.2)
        mark = 'ok  ' if code == 200 else 'FAIL'
        print(f'{mark} {code} {pid}: {path}')
        if code != 200: bad.append((pid, path, code))
print(f'\nпроверено {len(seen)} адресов, проблемных {len(bad)}')
for pid, path, code in bad: print(f'  {pid}: {path} -> {code}')
sys.exit(1 if bad else 0)
