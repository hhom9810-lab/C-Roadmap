#!/usr/bin/env python3
"""Заменяет тело страницы курса (строка @@page остаётся) текстом из файла.
   python3 tools/rewrite_page.py p1-runtime новый_текст.md"""
import pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
pid, src = sys.argv[1], pathlib.Path(sys.argv[2]).read_text(encoding='utf-8').strip('\n')
for f in sorted((ROOT / 'partials').glob('[0-9]*.md')):
    t = f.read_text(encoding='utf-8')
    m = re.search(r'(?m)^@@page id="%s"[^\n]*\n' % re.escape(pid), t)
    if not m: continue
    n = re.search(r'(?m)^@@(?:page|append)\b', t[m.end():])
    end = m.end() + n.start() if n else len(t)
    t = t[:m.end()] + src + '\n\n' + t[end:]
    f.write_text(t, encoding='utf-8'); print('ok', f.name, pid); break
else: sys.exit('страница не найдена: ' + pid)
