#!/usr/bin/env python3
"""Проверка SQL-примеров курса (Этап 8) на настоящем PostgreSQL.
   python3 tools/verify_sql.py [--fill] [partials/файл.md …]
Блок ~~~sql выполняется через psql (-X -q) в отдельной БД страницы, клонированной из шаблона lib_tpl
(схема из блока «~~~sql library.sql» страницы p3-select). Если сразу за ним идёт ~~~console, вывод сравнивается;
«?» заполняется реальным выводом (--fill). ~~~sql @nocheck — не выполняется. Блок без ~~~console не должен падать с ERROR.
Сервер: PostgreSQL из /usr/lib/postgresql/16, каталог /tmp/pgdata, порт 5433 (поднимается автоматически)."""
import os, pathlib, re, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
PG = '/usr/lib/postgresql/16/bin'; PORT = '5433'; SOCK = '/tmp'
FENCE = re.compile(r'^~~~sql[ \t]*([^\n]*)\n(.*?)\n~~~[ \t]*$(?:\n+~~~console[^\n]*\n(.*?)\n~~~[ \t]*$)?', re.S | re.M)
EF_PAGES = {'p5-integration', 'p4-validation', 'p3-efcore', 'p3-migrations', 'p3-tracking', 'p3-relations', 'p3-loading', 'p3-repository'}
PAGE = re.compile(r'^@@page id="([^"]+)"', re.M)

def psql(db, sql, extra=()):
    r = subprocess.run(['psql', '-X', '-q', '-h', SOCK, '-p', PORT, '-U', 'postgres', '-d', db, *extra],
                       input=sql, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={**os.environ, 'PGOPTIONS': '-c client_min_messages=notice', 'LC_ALL': 'C.UTF-8', 'PGTZ': 'UTC'})
    out = r.stdout
    out = re.sub(r'^psql:<stdin>:\d+: ', '', out, flags=re.M)
    return out.rstrip('\n'), r.returncode

def ensure_server():
    if subprocess.run(['pg_isready', '-h', SOCK, '-p', PORT], capture_output=True).returncode == 0: return
    if not os.path.exists('/tmp/pgdata/PG_VERSION'):
        os.makedirs('/tmp/pgdata', exist_ok=True); subprocess.run(['chown', 'postgres', '/tmp/pgdata'])
        subprocess.run(['su', 'postgres', '-c', f'{PG}/initdb -D /tmp/pgdata -A trust >/dev/null'], check=True)
    subprocess.run(['su', 'postgres', '-c', f"{PG}/pg_ctl -D /tmp/pgdata -o '-p {PORT} -k {SOCK}' -l /tmp/pg.log start"], check=True, capture_output=True)

def main():
    fill = '--fill' in sys.argv
    files = [pathlib.Path(a) for a in sys.argv[1:] if not a.startswith('--')] or sorted((ROOT / 'partials').glob('3[0-9]*.md'))
    ensure_server()
    lib = (ROOT / 'partials' / '31-phase3-sql.md').read_text(encoding='utf-8')
    m = re.search(r'^~~~sql library\.sql\n(.*?)\n~~~', lib, re.S | re.M)
    psql('postgres', 'DROP DATABASE IF EXISTS lib_tpl WITH (FORCE);')
    psql('postgres', 'CREATE DATABASE lib_tpl;')
    o, rc = psql('lib_tpl', m.group(1), ['-v', 'ON_ERROR_STOP=1'])
    if rc: print('схема не загрузилась:', o); sys.exit(1)
    psql('postgres', 'DROP DATABASE IF EXISTS ef_tpl WITH (FORCE);'); psql('postgres', 'CREATE DATABASE ef_tpl;')
    o, rc = psql('ef_tpl', (ROOT / 'tools' / 'ef_schema.sql').read_text(encoding='utf-8'), ['-v', 'ON_ERROR_STOP=1'])
    if rc: print('ef-схема не загрузилась:', o); sys.exit(1)
    bad = 0; n = 0
    for f in files:
        t = f.read_text(encoding='utf-8')
        pages = [(p.group(1), p.start()) for p in PAGE.finditer(t)] + [(None, len(t))]
        fills = []
        for (pid, a), (_, b) in zip(pages, pages[1:]):
            db = 'p_' + pid.replace('-', '_')
            psql('postgres', f'DROP DATABASE IF EXISTS {db} WITH (FORCE);'); psql('postgres', f'CREATE DATABASE {db} TEMPLATE ' + ('ef_tpl' if pid in EF_PAGES else 'lib_tpl') + ';')
            for bm in FENCE.finditer(t, a, b):
                if '@nocheck' in bm.group(1): continue
                n += 1
                out, rc = psql(db, bm.group(2))
                line = t[:bm.start()].count('\n') + 1
                exp = bm.group(3)
                if exp is None:
                    if 'ERROR' in out: bad += 1; print('FAIL', f.name, pid, 'строка', line, out.splitlines()[0])
                elif exp.strip() == '?':
                    fills.append((bm, out)); print('fill', f.name, pid, line)
                elif exp.rstrip() != out:
                    bad += 1; print('FAIL', f.name, pid, 'строка', line, '\n--- ожидалось\n' + exp + '\n--- получено\n' + out)
        for bm, out in reversed(fills):
            k = t.index('\n?\n~~~', bm.end(2)); t = t[:k] + '\n' + out + '\n~~~' + t[k + len('\n?\n~~~'):]
        if fills: f.write_text(t, encoding='utf-8')
    print(f'sql-блоков: {n}, ошибок {bad}'); sys.exit(1 if bad else 0)
main()
