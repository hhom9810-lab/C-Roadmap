#!/usr/bin/env python3
"""Проверка контраста токенов src/ds/tokens.css по WCAG 2.x (AA).
Текст: >= 4.5. Графика (маркеры фаз, рамка фокуса): >= 3.0."""
import re, sys, pathlib
CSS = (pathlib.Path(__file__).parent.parent / 'src' / 'ds' / 'tokens.css').read_text(encoding='utf-8')

def block(sel):
    m = re.search(re.escape(sel) + r'\s*\{(.*?)\n\}', CSS, re.S)
    return m.group(1) if m else ''
def vars_of(txt):
    return dict(re.findall(r'(--ds-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})', txt))
light = vars_of(block(':root'))
dark = {**light, **vars_of(block(':root[data-theme="dark"]'))}

def lum(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
def cr(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + .05) / (lb + .05)

TEXT = [('text', 'bg'), ('text', 'surface'), ('text-2', 'bg'), ('text-2', 'surface'), ('muted', 'bg'), ('muted', 'surface'), ('muted', 'surface-2'),
        ('accent', 'bg'), ('accent', 'surface'), ('accent', 'accent-soft'), ('on-accent', 'accent'), ('on-accent', 'accent-hover'),
        ('ok', 'bg'), ('ok', 'ok-soft'), ('warn', 'bg'), ('warn', 'warn-soft'), ('bad', 'bg'), ('bad', 'bad-soft'), ('info', 'bg'), ('info', 'info-soft')]
GRAPH = [('focus', 'bg'), ('focus', 'surface'), ('control-border', 'bg'), ('control-border', 'surface')] + [('ph%d' % i, s) for i in range(1, 8) for s in ('bg', 'surface')]
bad = 0
for name, t in (('light', light), ('dark', dark)):
    print('==', name)
    for lim, pairs in ((4.5, TEXT), (3.0, GRAPH)):
        for a, b in pairs:
            k1, k2 = '--ds-' + a, '--ds-' + b
            if k1 not in t or k2 not in t: print('  ?? нет токена', a, b); bad += 1; continue
            r = cr(t[k1], t[k2]); ok = r >= lim
            if not ok: bad += 1
            print('  %s %-14s на %-12s %5.2f (нужно %.1f)' % ('ok  ' if ok else 'FAIL', a, b, r, lim))
print('проблем:', bad); sys.exit(1 if bad else 0)
