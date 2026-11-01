#!/usr/bin/env python3
"""Проверка примеров справочника настоящим компилятором .NET.
   python3 tools/verify_ref.py            — все записи partials/ref-*.md
   python3 tools/verify_ref.py op-checked — только указанные записи (id через пробел)
   python3 tools/verify_ref.py --force    — игнорировать кэш
Правила:
  ~~~csharp …~~~           компилируется как отдельная программа (C# 14, net10.0; нужен `dotnet` в PATH);
  ~~~csharp …~~~ + сразу после ~~~console …~~~   ещё и запускается, вывод сравнивается с ожидаемым;
  ~~~csharp @nocheck …     не проверяется (фрагменты, намеренно неверный код).
Результат кэшируется по хэшу кода в tools/.cache/ref-verified.json."""
import hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build
CACHE = ROOT / 'tools' / '.cache' / 'ref-verified.json'
LANGV = os.environ.get('REF_LANGVERSION', 'latest')
TFM = os.environ.get('REF_TFM', 'net10.0')
CSPROJ = f'''<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>{TFM}</TargetFramework><LangVersion>{LANGV}</LangVersion>
<Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><AllowUnsafeBlocks>true</AllowUnsafeBlocks><InvariantGlobalization>true</InvariantGlobalization>
<NoWarn>CS0219;CS0168;CS0162;CS0164;CS8321;CS0414;CS0649;CS0169;CS1717;CS8981;CS0108;CS0628;CS0067;CS8618;CS8600;CS8601;CS8602;CS8603;CS8604;CS8625;CS8765;CS1998;CS0183;CS0184;CS0652;CS0665;CS8509;CS0675;CS0652;CS0642;CS8073;CS0472;CS0642;CA1822;SYSLIB1045</NoWarn>
<TreatWarningsAsErrors>false</TreatWarningsAsErrors><SatelliteResourceLanguages>en</SatelliteResourceLanguages></PropertyGroup></Project>'''
FENCE = re.compile(r'^~~~csharp[ \t]*([^\n]*)\n(.*?)\n~~~[ \t]*$(?:\n+~~~console[^\n]*\n(.*?)\n~~~[ \t]*$)?', re.S | re.M)

def blocks(entry_id, body):
    for n, m in enumerate(FENCE.finditer(body), 1):
        info, code, exp = m.group(1), m.group(2), m.group(3)
        if '@nocheck' in info: continue
        yield {'id': f'{entry_id}#{n}', 'code': code, 'exp': exp, 'line': body[:m.start()].count('\n') + 1}

def run_one(b):
    d = pathlib.Path(tempfile.mkdtemp(prefix='refv-'))
    try:
        (d / 'ex.csproj').write_text(CSPROJ, encoding='utf-8'); (d / 'Program.cs').write_text(b['code'] + '\n', encoding='utf-8')
        env = dict(os.environ, DOTNET_CLI_TELEMETRY_OPTOUT='1', DOTNET_NOLOGO='1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1')
        r = subprocess.run(['dotnet', 'build', '-c', 'Release', '-v', 'q', '-nologo', '-o', str(d / 'out')], cwd=d, capture_output=True, text=True, timeout=240, env=env)
        if r.returncode:
            errs = [l for l in (r.stdout + r.stderr).splitlines() if ': error ' in l]
            return 'сборка: ' + '; '.join(sorted(set(re.sub(r'^.*Program\.cs', 'Program.cs', l).split(' [')[0] for l in errs))[:4])
        if b['exp'] is None: return None
        r = subprocess.run(['dotnet', str(d / 'out' / 'ex.dll')], cwd=d, capture_output=True, text=True, timeout=60, env=env)
        got = (r.stdout + (r.stderr if r.returncode else '')).replace('\r\n', '\n').rstrip()
        if b['exp'] == '?': b['got'] = got; return None
        want = b['exp'].replace('\r\n', '\n').rstrip()
        if got != want: return f'вывод отличается.\n--- ожидалось:\n{want}\n--- получено:\n{got}'
        return None
    except subprocess.TimeoutExpired: return 'таймаут'
    finally: shutil.rmtree(d, ignore_errors=True)

def fill():
    """--fill: блоки ~~~console с единственной строкой «?» заполняются реальным выводом программы (потом прочитай глазами!)."""
    jobs = []
    for f in sorted((ROOT / 'partials').glob('ref-*.md')):
        text = f.read_text(encoding='utf-8')
        for m in FENCE.finditer(text):
            if m.group(3) == '?' and '@nocheck' not in m.group(1): jobs.append((f, m.group(2)))
    bs = [{'code': c, 'exp': '?'} for _, c in jobs]
    with ThreadPoolExecutor(max_workers=int(os.environ.get('REF_JOBS', '4'))) as ex:
        errs = list(ex.map(run_one, bs))
    for (f, c), b, e in zip(jobs, bs, errs):
        if e or 'got' not in b: print('FAIL', f.name, e or 'нет вывода'); continue
        t = f.read_text(encoding='utf-8'); old = c + '\n~~~'
        i = t.index(old); j = t.index('~~~console', i); k = t.index('\n?\n~~~', j)
        t = t[:k] + '\n' + b['got'] + '\n~~~' + t[k + len('\n?\n~~~'):]
        f.write_text(t, encoding='utf-8'); print('fill', f.name, '→', len(b['got'].splitlines()), 'строк')

def main():
    if '--fill' in sys.argv: return fill()
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; force = '--force' in sys.argv
    if not shutil.which('dotnet'): sys.exit('dotnet не найден в PATH')
    ids = {p['attrs']['id'] for p in build.pages()}
    cats, entries, _ = build.load_refs(ids)
    cache = json.loads(CACHE.read_text()) if CACHE.exists() and not force else {}
    todo, total = [], 0
    for e in entries:
        if args and e['attrs']['id'] not in args: continue
        for b in blocks(e['attrs']['id'], e['body']):
            total += 1; h = hashlib.sha1((LANGV + TFM + b['code'] + '\0' + str(b['exp'])).encode()).hexdigest(); b['h'] = h
            if cache.get(h) != 'ok': todo.append(b)
    print(f'блоков: {total}, к проверке: {len(todo)} (остальные — из кэша)')
    bad = 0
    with ThreadPoolExecutor(max_workers=int(os.environ.get('REF_JOBS', '4'))) as ex:
        for b, res in zip(todo, ex.map(run_one, todo)):
            if res is None: cache[b['h']] = 'ok'; print('ok  ', b['id'])
            else: bad += 1; print('FAIL', b['id'], f'(строка {b["line"]} записи):', res)
    CACHE.parent.mkdir(parents=True, exist_ok=True); CACHE.write_text(json.dumps(cache))
    print(f'проверено {total}, ошибок {bad}')
    sys.exit(1 if bad else 0)
main()
