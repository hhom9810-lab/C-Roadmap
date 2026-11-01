(function () {
'use strict';

/* ================= storage (always safe) ================= */
var PFX = 'csroad:';
var Store = (function () {
  var mem = {}, ok = false;
  try { var k = PFX + '__t'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); ok = true; } catch (e) { ok = false; }
  function get(key, def) {
    if (ok) {
      try { var v = window.localStorage.getItem(PFX + key); if (v !== null) return JSON.parse(v); } catch (e) {}
    }
    return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : def;
  }
  function set(key, val) {
    mem[key] = val;
    if (ok) { try { window.localStorage.setItem(PFX + key, JSON.stringify(val)); } catch (e) {} }
  }
  function del(key) {
    delete mem[key];
    if (ok) { try { window.localStorage.removeItem(PFX + key); } catch (e) {} }
  }
  return { get: get, set: set, del: del, ok: ok };
})();

/* ================= data ================= */
var PHASES = [
  null,
  { n: 1, title: 'Фундамент языка и памяти', m: [1, 3], focus: 'Синтаксис, типы, память, ООП', ratio: '35 / 45 / 20' },
  { n: 2, title: 'Структуры данных, LINQ, алгоритмы', m: [4, 6], focus: 'Коллекции под капотом, LINQ, Big O', ratio: '30 / 45 / 25' },
  { n: 3, title: 'Данные и SQL', m: [7, 9], focus: 'SQL, EF Core, работа с БД', ratio: '25 / 40 / 35' },
  { n: 4, title: 'Backend на ASP.NET Core', m: [10, 14], focus: 'Web API, DI, архитектура, auth', ratio: '20 / 35 / 45' },
  { n: 5, title: 'Асинхронность, тестирование, паттерны', m: [15, 18], focus: 'async/await внутри, TDD, паттерны', ratio: '20 / 30 / 50' },
  { n: 6, title: 'Капстоун и подготовка к рынку', m: [19, 22], focus: 'Большой проект, Docker, CI/CD, алгоритмы', ratio: '10 / 20 / 70' },
  { n: 7, title: 'Поиск работы', m: [23, 24], focus: 'Резюме, GitHub, mock-интервью, отклики', ratio: '5 / 15 / 80' }
];
var KIND = { overview: 'Обзор фазы', topic: 'Теория', practice: 'Практика', project: 'Проект', common: 'Раздел', tool: 'Инструмент' };

function phaseOfMonth(m) { for (var i = 1; i <= 7; i++) if (m >= PHASES[i].m[0] && m <= PHASES[i].m[1]) return i; return m < 1 ? 1 : 7; }

var pages = [], byId = {};
var cb = Store.get('cb', {}) || {};
var visited = Store.get('visited', {}) || {};
var lang = Store.get('lang', 'ru-ru');
if (lang !== 'ru-ru' && lang !== 'en-us') lang = 'ru-ru';

/* ================= helpers ================= */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е'); }
function dedent(lines) {
  var min = Infinity;
  lines.forEach(function (l) { if (l.trim()) { var m = l.match(/^[ \t]*/)[0].length; if (m < min) min = m; } });
  if (!isFinite(min) || !min) return lines.slice();
  return lines.map(function (l) { return l.slice(Math.min(min, l.match(/^[ \t]*/)[0].length)); });
}
function plural(n, a, b, c) { var n10 = n % 10, n100 = n % 100; if (n10 === 1 && n100 !== 11) return a; if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return b; return c; }
function pct(d, t) { return t ? Math.round(d * 100 / t) : 0; }
function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
var LANG_MARK = '\u0001L\u0001';

/* ================= syntax highlighting ================= */
function wordSet(s) { var o = {}; s.split(/\s+/).forEach(function (w) { if (w) o[w] = 1; }); return o; }
var KW_CS = wordSet('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while var async await record init required get set when where yield nameof dynamic and or not with partial nint nuint');
var KW_SQL = wordSet('select from where join inner left right full outer cross on group by order having as and or not null is in exists insert into values update set delete create table primary key foreign references index unique default int integer varchar char text serial bigint bigserial smallint decimal numeric boolean bool date timestamp timestamptz begin commit rollback transaction distinct limit offset count sum avg min max case when then else end union all like ilike between asc desc with cascade alter add drop constraint check returning coalesce true false view if');
var KW_SH = wordSet('if then else fi for do done in echo export cd mkdir sudo');

function mkLang(parts, classify, flags) {
  return { re: new RegExp(parts.map(function (p) { return '(' + p[1] + ')'; }).join('|'), 'g' + (flags || '')), kinds: parts.map(function (p) { return p[0]; }), classify: classify };
}
var LANGS = {};
LANGS.csharp = mkLang([
  ['com', '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/'],
  ['str', '\\$*"""[\\s\\S]*?"""|\\$@"(?:[^"]|"")*"|@\\$"(?:[^"]|"")*"|@"(?:[^"]|"")*"|\\$?"(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)+\''],
  ['pre', '^[ \\t]*#(?:region|endregion|if|else|elif|endif|nullable|pragma|define|warning)[^\\n]*'],
  ['num', '\\b(?:0[xX][\\da-fA-F_]+|0[bB][01_]+|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?)[mMfFdDuUlL]*\\b'],
  ['id', '@?[A-Za-z_][A-Za-z0-9_]*']
], function (tok, code, s, e, lastWord) {
  if (KW_CS[tok]) return 'kw';
  var j = e; while (code[j] === ' ') j++;
  var p = s - 1; while (p >= 0 && code[p] === ' ') p--;
  var next = code[j], prev = code[p], up = /^[A-Z]/.test(tok);
  if (up && lastWord === 'new' && prev !== '.') return 'ty';
  if (next === '(') return 'fn';
  if (up && ((next === '=' && code[j + 1] !== '=' && code[j + 1] !== '>') || next === ';' || next === ',' || next === ')') && prev !== '<' && !/[A-Za-z0-9_>\]]/.test(prev)) return '';
  if (up && prev !== '.') return 'ty';
  return '';
}, 'm');
LANGS.cs = LANGS.csharp;
LANGS.sql = mkLang([
  ['com', '--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/'],
  ['str', '\'(?:[^\']|\'\')*\''],
  ['num', '\\b\\d+(?:\\.\\d+)?\\b'],
  ['id', '[A-Za-z_][A-Za-z0-9_]*']
], function (tok, code, s, e) {
  if (KW_SQL[tok.toLowerCase()]) return 'kw';
  var j = e; while (code[j] === ' ') j++;
  return code[j] === '(' ? 'fn' : '';
});
LANGS.json = mkLang([
  ['key', '"(?:[^"\\\\\\n]|\\\\.)*"(?=\\s*:)'],
  ['str', '"(?:[^"\\\\\\n]|\\\\.)*"'],
  ['num', '-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b'],
  ['kw', '\\b(?:true|false|null)\\b']
]);
LANGS.bash = mkLang([
  ['com', '(?:^|[ \\t])#[^\\n]*'],
  ['str', '"(?:[^"\\\\]|\\\\.)*"|\'[^\']*\''],
  ['fn', '^[ \\t]*[A-Za-z_][\\w.-]*'],
  ['num', '(?:^|[ \\t])--?[A-Za-z][\\w-]*'],
  ['ty', '\\$[A-Za-z_]\\w*|\\$\\{[^}]*\\}']
], null, 'm');
LANGS.sh = LANGS.shell = LANGS.powershell = LANGS.bash;
LANGS.xml = mkLang([
  ['com', '<!--[\\s\\S]*?-->'],
  ['str', '"[^"]*"'],
  ['kw', '<\\/?[\\w.:-]+|\\/?>'],
  ['ty', '[\\w:-]+(?==)']
]);
LANGS.html = LANGS.xml;
LANGS.yaml = LANGS.yml = mkLang([
  ['com', '(?:^|[ \\t])#[^\\n]*'],
  ['key', '^[ \\t-]*[A-Za-z_][\\w.-]*(?=:)'],
  ['str', '"(?:[^"\\\\\\n]|\\\\.)*"|\'[^\'\\n]*\''],
  ['ty', '\\$\\{[^}]*\\}'],
  ['num', '\\b\\d+\\b']
], null, 'm');
LANGS.dockerfile = mkLang([
  ['com', '^[ \\t]*#[^\\n]*'],
  ['kw', '^[ \\t]*(?:FROM|RUN|COPY|WORKDIR|ENV|EXPOSE|ENTRYPOINT|CMD|ARG|LABEL|USER|HEALTHCHECK|VOLUME)\\b|\\bAS\\b'],
  ['str', '"(?:[^"\\\\]|\\\\.)*"'],
  ['num', '--[a-z][\\w-]*']
], null, 'm');

function highlight(code, lng) {
  var L = LANGS[lng];
  if (!L) return esc(code);
  var re = L.re, out = '', last = 0, m, lastWord = '';
  re.lastIndex = 0;
  while ((m = re.exec(code))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    var gi = 1; while (m[gi] === undefined) gi++;
    var kind = L.kinds[gi - 1], tok = m[0], cls = kind;
    if (kind === 'id') { cls = L.classify ? L.classify(tok, code, m.index, re.lastIndex, lastWord) : ''; lastWord = tok; }
    else if (kind === 'com' && /✅/.test(tok)) cls = 'ok';
    else if (kind === 'com' && /❌/.test(tok)) cls = 'bad';
    out += cls ? '<span class="t-' + cls + '">' + esc(tok) + '</span>' : esc(tok);
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}

/* ================= markup parser ================= */
var LANG_LABEL = { csharp: 'C#', cs: 'C#', sql: 'SQL', json: 'JSON', bash: 'bash', sh: 'bash', shell: 'shell', powershell: 'PowerShell', xml: 'XML', html: 'HTML', yaml: 'YAML', yml: 'YAML', dockerfile: 'Dockerfile', text: 'текст', console: 'вывод', '': 'код' };
var CALLOUT = {
  tip: ['✓', 'Совет'], info: ['i', 'Заметка'], warn: ['!', 'Осторожно'], danger: ['✕', 'Типичная ошибка'],
  deep: ['◎', 'Граница: rabbit hole'], key: ['★', 'Главное'], why: ['?', 'Зачем это тебе']
};

function Parser(page) {
  this.page = page; this.cbs = []; this.crit = []; this.toc = []; this.sec = 0; this.critDepth = 0; this.seen = {}; this.hseen = {};
}
Parser.prototype.cbId = function (text) {
  var base = this.page.id + '.' + hash(norm(text).replace(/\s+/g, ' ').trim()), id = base, k = 2;
  while (this.seen[id]) id = base + '-' + (k++);
  this.seen[id] = 1; this.cbs.push(id); if (this.critDepth) this.crit.push(id);
  return id;
};
Parser.prototype.link = function (text, url) {
  if (/^learn:/.test(url)) {
    return '<a class="learn-a" href="https://learn.microsoft.com/' + LANG_MARK + '/' + esc(url.slice(6)) + '" target="_blank" rel="noopener">' + text + '</a>';
  }
  if (url.charAt(0) === '#') return '<a href="#/' + esc(url.slice(1)) + '">' + text + '</a>';
  return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + text + '</a>';
};
Parser.prototype.inline = function (s) {
  var self = this, codes = [];
  s = s.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) { return self.link(t, u); });
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.replace(/\[\[([^\]]+)\]\]/g, function (_, k) { return k.split('+').map(function (x) { return '<kbd>' + x + '</kbd>'; }).join('+'); });
  s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + esc(codes[+i]) + '</code>'; });
  return s;
};
var RX = {
  fence: /^(\s*)~~~\s*([\w#+.-]*)\s*(.*)$/,
  fenceEnd: /^\s*~~~\s*$/,
  cont: /^\s*:::\s*([\w-]+)\s*(.*)$/,
  contEnd: /^\s*:::\s*$/,
  head: /^(#{2,4})\s+(.+?)(?:\s+\{#([\w-]+)\})?\s*$/,
  hr: /^\s*-{3,}\s*$/,
  tbl: /^\s*\|/,
  tblSep: /^\s*\|?\s*:?-{2,}/,
  quote: /^\s*>\s?/,
  li: /^(\s*)([-*]|\d+\.)\s+(.*)$/
};
function isStart(l) { return RX.fence.test(l) || RX.cont.test(l) || RX.head.test(l) || RX.hr.test(l) || RX.tbl.test(l) || RX.quote.test(l) || RX.li.test(l); }
function indentOf(l) { return l.match(/^\s*/)[0].length; }

Parser.prototype.blocks = function (lines) {
  var out = [], i = 0, n = lines.length, m, l;
  while (i < n) {
    l = lines[i];
    if (!l.trim()) { i++; continue; }
    if ((m = l.match(RX.fence))) {
      var body = []; i++;
      while (i < n && !RX.fenceEnd.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      out.push(this.code(dedent(body), m[2].toLowerCase(), m[3])); continue;
    }
    if ((m = l.match(RX.cont))) {
      var depth = 1, inner = [], inF = false; i++;
      while (i < n) {
        var t = lines[i];
        if (RX.fence.test(t) && (!inF || RX.fenceEnd.test(t))) inF = !inF;
        else if (!inF) {
          if (RX.cont.test(t)) depth++;
          else if (RX.contEnd.test(t)) { depth--; if (!depth) { i++; break; } }
        }
        inner.push(t); i++;
      }
      out.push(this.container(m[1], m[2], dedent(inner))); continue;
    }
    if ((m = l.match(RX.head))) {
      var lvl = m[1].length, text = m[2], id = m[3] || ('s' + (++this.sec));
      if (this.hseen[id]) id = id + '-' + (++this.sec);
      this.hseen[id] = 1;
      if (lvl <= 3) this.toc.push({ id: id, text: text.replace(/`/g, ''), lvl: lvl });
      out.push('<h' + lvl + ' id="h-' + id + '">' + this.inline(text) + '</h' + lvl + '>'); i++; continue;
    }
    if (RX.hr.test(l)) { out.push('<hr>'); i++; continue; }
    if (RX.tbl.test(l) && i + 1 < n && RX.tblSep.test(lines[i + 1])) {
      var rows = [];
      while (i < n && RX.tbl.test(lines[i])) { rows.push(lines[i]); i++; }
      out.push(this.table(rows)); continue;
    }
    if (RX.quote.test(l)) {
      var q = [];
      while (i < n && RX.quote.test(lines[i])) { q.push(lines[i].replace(RX.quote, '')); i++; }
      out.push('<blockquote>' + this.blocks(q) + '</blockquote>'); continue;
    }
    if (RX.li.test(l)) { var r = this.list(lines, i); out.push(r.html); i = r.i; continue; }
    var para = [];
    while (i < n && lines[i].trim() && !(para.length && isStart(lines[i]))) { para.push(lines[i].trim()); i++; }
    out.push('<p>' + this.inline(para.join(' ')) + '</p>');
  }
  return out.join('\n');
};
Parser.prototype.list = function (lines, i) {
  var n = lines.length, first = lines[i].match(RX.li), base = first[1].length, ordered = /\d/.test(first[2]);
  var items = [], m;
  while (i < n) {
    var l = lines[i];
    if (!l.trim()) {
      var j = i + 1; while (j < n && !lines[j].trim()) j++;
      if (j < n && (indentOf(lines[j]) > base || ((m = lines[j].match(RX.li)) && m[1].length === base))) { if (items.length) items[items.length - 1].kids.push(''); i++; continue; }
      break;
    }
    m = l.match(RX.li);
    if (m && m[1].length === base) { items.push({ text: m[3], kids: [] }); i++; continue; }
    if (indentOf(l) > base && items.length) { items[items.length - 1].kids.push(l); i++; continue; }
    break;
  }
  var self = this, anyTask = false;
  var html = items.map(function (it) {
    var kids = it.kids.length ? self.blocks(dedent(it.kids)) : '';
    var tm = it.text.match(/^\[( |x|X)\]\s+(.*)$/);
    if (tm) {
      anyTask = true;
      var id = self.cbId(tm[2]);
      return '<li class="task"><label><input type="checkbox" data-cb="' + id + '"><span>' + self.inline(tm[2]) + '</span></label>' + kids + '</li>';
    }
    return '<li>' + self.inline(it.text) + kids + '</li>';
  }).join('');
  var tag = ordered ? 'ol' : 'ul';
  return { html: '<' + tag + (anyTask ? ' class="tasks"' : '') + '>' + html + '</' + tag + '>', i: i };
};
Parser.prototype.table = function (rows) {
  var self = this;
  function cells(r) {
    r = r.trim().replace(/^\|/, '').replace(/\|$/, '');
    return r.replace(/\\\|/g, '\u0002').split('|').map(function (c) { return c.replace(/\u0002/g, '|').trim(); });
  }
  var head = cells(rows[0]), body = rows.slice(2).map(cells);
  return '<div class="tbl"><table><thead><tr>' + head.map(function (c) { return '<th>' + self.inline(c) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + body.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + self.inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
};
Parser.prototype.code = function (body, lng, title) {
  while (body.length && !body[body.length - 1].trim()) body.pop();
  var label = LANG_LABEL[lng] !== undefined ? LANG_LABEL[lng] : lng, fl = '';
  /* флаги блока кода справочника: @nocheck — не компилируется при проверке; @norun — не запускается в браузерной IDE */
  title = String(title || '').replace(/(^|\s)@(nocheck|norun)(?=\s|$)/g, function (m0, sp, f) { fl += ' data-' + f; return sp; }).trim();
  return '<div class="code"' + fl + '><div class="code-h"><span class="code-lang">' + esc(label) + '</span>' +
    (title ? '<span class="code-title">' + this.inline(title) + '</span>' : '') +
    '<button class="copy" type="button">Копировать</button></div><pre><code>' + highlight(body.join('\n'), lng) + '</code></pre></div>';
};
Parser.prototype.container = function (type, title, inner) {
  var t = title.trim(), b;
  if (LABT[type]) return labHolder(this, type, t, inner);
  if (type === 'spoiler') return '<details class="spoiler"><summary><span>' + this.inline(t || 'Показать ответ') + '</span></summary><div class="sp-b">' + this.blocks(inner) + '</div></details>';
  if (type === 'learn') {
    return '<aside class="learn"><div class="learn-h"><span class="lg"><i></i><i></i><i></i><i></i></span><span>' + this.inline(t || 'Подробнее на Microsoft Learn') + '</span>' +
      '<span class="lang-sw" role="group" aria-label="Язык Microsoft Learn"><button type="button" data-lang="ru-ru">RU</button><button type="button" data-lang="en-us">EN</button></span></div>' + this.blocks(inner) + '</aside>';
  }
  if (type === 'sortable') {
    var sid = 'st' + (++this.sec);
    return '<div class="rf-sort" data-sortable><div class="rf-sort-h"><span class="rf-sort-t">' + this.inline(t) + '</span><label class="sr-only" for="' + sid + '">Фильтр таблицы «' + esc(t) + '»</label>' +
      '<input id="' + sid + '" type="search" class="rf-sort-f ds-input" placeholder="Фильтр по таблице" autocomplete="off"></div>' + this.blocks(inner) + '<p class="rf-sort-n" aria-live="polite"></p></div>';
  }
  if (type === 'criteria') {
    this.critDepth++; b = this.blocks(inner); this.critDepth--;
    return '<section class="criteria" data-crit><div class="criteria-h"><span>🏁 ' + this.inline(t || 'Критерий готовности') + '</span><span class="st"></span></div>' + b + '</section>';
  }
  if (type === 'widget') return '<div class="widget" data-widget="' + esc(t) + '"></div>';
  var c = CALLOUT[type] || CALLOUT.info;
  return '<div class="co ' + (CALLOUT[type] ? type : 'info') + '"><div class="co-h"><span class="co-i">' + c[0] + '</span><span>' + this.inline(t || c[1]) + '</span></div><div class="co-b">' + this.blocks(inner) + '</div></div>';
};

function parsePage(p) {
  var ps = new Parser(p);
  var html = ps.blocks(p.src.replace(/\r\n?/g, '\n').split('\n'));
  if (p.kind === 'topic') {
    var id = ps.cbId('__done__');
    html += '<div class="done-card"><label><input type="checkbox" data-cb="' + id + '"><span>Тема пройдена: теорию могу объяснить своими словами, практику сделал руками.</span></label></div>';
  }
  p.html = html; p.cbs = ps.cbs; p.crit = ps.crit; p.toc = ps.toc;
}

/*{{LAB_PRE}}*/

/* ================= load pages ================= */
$$('script[type="text/x-md"]').forEach(function (s) {
  var d = s.dataset;
  var p = { id: d.id, phase: +d.phase || 0, group: d.group || '', title: d.title || d.id, nav: d.nav || d.title || d.id, kind: d.kind || 'topic', est: d.est || '', src: s.textContent };
  pages.push(p); byId[p.id] = p;
});
pages.forEach(parsePage);

/* ================= progress ================= */
function pageStat(p) { var d = 0; p.cbs.forEach(function (id) { if (cb[id]) d++; }); return { d: d, t: p.cbs.length }; }
function phasePages(n) { return pages.filter(function (p) { return p.phase === n; }); }
function phaseStat(n) {
  var d = 0, t = 0, cd = 0, ct = 0;
  phasePages(n).forEach(function (p) {
    p.cbs.forEach(function (id) { t++; if (cb[id]) d++; });
    p.crit.forEach(function (id) { ct++; if (cb[id]) cd++; });
  });
  return { d: d, t: t, cd: cd, ct: ct, closed: ct > 0 && cd === ct };
}
function totalStat() { var d = 0, t = 0; for (var n = 1; n <= 7; n++) { var s = phaseStat(n); d += s.d; t += s.t; } return { d: d, t: t }; }
function currentPhase() { for (var n = 1; n <= 7; n++) if (!phaseStat(n).closed) return n; return 8; }
function currentTopic(n) {
  if (n > 7) return null;
  var list = phasePages(n);
  if (!list.length) return null;
  var lastP = null, lastT = 0;
  list.forEach(function (p) { if (visited[p.id] && visited[p.id] > lastT) { lastT = visited[p.id]; lastP = p; } });
  if (lastP && lastP.kind !== 'overview') { var s = pageStat(lastP); if (!s.t || s.d < s.t) return lastP; }
  for (var i = 0; i < list.length; i++) {
    var p = list[i]; if (p.kind === 'overview') continue;
    var st = pageStat(p); if (st.t && st.d < st.t) return p;
  }
  return list[0];
}
function lastVisited() {
  var best = null, bt = 0;
  Object.keys(visited).forEach(function (k) { if (byId[k] && visited[k] > bt && k !== 'home') { bt = visited[k]; best = byId[k]; } });
  return best;
}

/* ================= navigation (sidebar) ================= */
var navOpen = Store.get('navOpen', {}) || {};
function groups() {
  var g = [{ key: 'start', title: 'Старт', sub: 'Как устроен путь', pages: pages.filter(function (p) { return !p.phase && p.group !== 'end'; }) }];
  for (var n = 1; n <= 7; n++) g.push({ key: 'p' + n, n: n, title: PHASES[n].title, sub: 'Фаза ' + n + ' · мес. ' + PHASES[n].m[0] + '–' + PHASES[n].m[1], pages: phasePages(n) });
  g.push({ key: 'end', title: 'Финиш', sub: 'Портфолио, риски, итог', pages: pages.filter(function (p) { return !p.phase && p.group === 'end'; }) });
  return g;
}
function dotClass(p) {
  var s = pageStat(p);
  if (s.t && s.d === s.t) return 'done';
  if (s.d) return 'part';
  if (visited[p.id]) return 'seen';
  return '';
}
/* левый сайдбар убран (Этап 2): навигация — шапка, нижняя панель и страница «Путь» */
function renderNav() {}

/* ================= page render ================= */
var current = null;
function phaseLabel(n) { return 'Фаза ' + n + ' · Мес. ' + PHASES[n].m[0] + '–' + PHASES[n].m[1]; }
function pageHTML(p) {
  var crumbs = '<div class="crumbs">';
  if (p.phase) {
    var ov = phasePages(p.phase).filter(function (x) { return x.kind === 'overview'; })[0];
    crumbs += ov && ov !== p ? '<a href="#/' + ov.id + '">' + phaseLabel(p.phase) + '</a>' : '<span>' + phaseLabel(p.phase) + '</span>';
  } else crumbs += '<span>' + (p.group === 'end' ? 'Финиш' : 'Старт') + '</span>';
  crumbs += '<span class="tag k-' + p.kind + '">' + (KIND[p.kind] || p.kind) + '</span>';
  if (p.est) crumbs += '<span class="tag">⏱ ' + esc(p.est) + '</span>';
  crumbs += '</div>';
  var st = pageStat(p);
  var meta = st.t ? '<div class="page-meta"><span class="pbar"><span class="bar"><i id="pgBar" style="width:' + pct(st.d, st.t) + '%"></i></span><span id="pgTxt">' + st.d + ' из ' + st.t + '</span></span></div>' : '<div class="page-meta"></div>';
  var hasToc = p.toc.filter(function (t) { return t.lvl === 2; }).length >= 3;
  var toc = hasToc ? '<nav class="toc" aria-label="На этой странице"><div class="toc-h">На этой странице</div>' + p.toc.map(function (t) {
    return '<a class="l' + t.lvl + '" href="#/' + p.id + '/' + t.id + '" data-sec="' + t.id + '">' + esc(t.text) + '</a>';
  }).join('') + '</nav>' : '';
  var i = pages.indexOf(p), prev = pages[i - 1], next = pages[i + 1];
  var pn = '<div class="pn">' + (prev ? '<a href="#/' + prev.id + '"><small>← Назад</small><b>' + esc(prev.title) + '</b></a>' : '') +
    (next ? '<a class="nx" href="#/' + next.id + '"><small>Дальше →</small><b>' + esc(next.title) + '</b></a>' : '') + '</div>';
  if (p.id === 'home') pn = '';
  var head = p.id === 'home' ? '<h1 class="sr-only">' + esc(p.title) + '</h1>' : crumbs + '<h1 class="page-title">' + esc(p.title) + '</h1>' + meta;
  return '<div class="page-grid' + (hasToc ? ' has-toc' : '') + '"><article>' + head +
    '<div class="content">' + p.html.split(LANG_MARK).join(lang) + '</div>' + pn + '</article>' + toc + '</div>';
}
function render(id, sec, keepScroll, mode) {
  var p = byId[id] || byId.home || pages[0];
  var y = window.scrollY;
  current = p;
  var c = $('#content');
  c.innerHTML = pageHTML(p);
  syncChecks(c);
  readerPrune(p, c);
  mountWidgets(c);
  labAfterRender(p);
  readerAfterRender(p, mode || 'read', sec);
  syncLangButtons();
  renderNav();
  updateHeader();
  document.title = p.title + ' · C# → Junior .NET';
  if (keepScroll) window.scrollTo(0, y);
  else if (sec) {
    var el = document.getElementById('h-' + sec);
    if (el) { el.scrollIntoView(); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    else window.scrollTo(0, 0);
  } else window.scrollTo(0, 0);
  visited[p.id] = Date.now(); Store.set('visited', visited);
  if (p.id !== 'home') Store.set('last', p.id);
  closeNav();
  spy();
}
function route() {
  var r = canonicalRoute();
  if (r.hash !== location.hash) { location.replace(r.hash); return; }   // старый адрес → новый, без лишней записи в истории
  showView(r);
}
window.addEventListener('hashchange', route);

/* checkboxes */
function syncChecks(root) {
  $$('input[data-cb]', root).forEach(function (inp) {
    inp.checked = !!cb[inp.getAttribute('data-cb')];
    var li = inp.closest('li.task'); if (li) li.classList.toggle('checked', inp.checked);
  });
  $$('[data-crit]', root).forEach(function (box) {
    var all = $$('input[data-cb]', box), d = all.filter(function (x) { return x.checked; }).length;
    box.classList.toggle('ok', all.length > 0 && d === all.length);
    var st = $('.st', box); if (st) st.textContent = d === all.length && all.length ? 'фаза закрыта ✓' : d + ' / ' + all.length;
  });
}
document.addEventListener('change', function (e) {
  var t = e.target;
  if (!t.matches || !t.matches('input[data-cb]')) return;
  var id = t.getAttribute('data-cb');
  var before = currentPhase();
  if (t.checked) cb[id] = 1; else delete cb[id];
  Store.set('cb', cb);
  refreshProgress();
  var after = currentPhase();
  if (after > before && before <= 7) toast(after <= 7 ? 'Фаза ' + before + ' закрыта. Ты переходишь на Фазу ' + after + ' 🎉' : 'Все фазы закрыты. Время откликов!');
});
function refreshProgress() {
  var c = $('#content');
  syncChecks(c);
  if (current) {
    var s = pageStat(current), bar = $('#pgBar'), tx = $('#pgTxt');
    if (bar) bar.style.width = pct(s.d, s.t) + '%';
    if (tx) tx.textContent = s.d + ' из ' + s.t;
  }
  $$('.widget[data-widget="home"]', c).forEach(function (el) { WIDGETS.home(el); });
  renderNav(); updateHeader();
}
function updateHeader() {}

/* ================= widgets ================= */
var WIDGETS = {};
function mountWidgets(root) { $$('.widget[data-widget]', root).forEach(function (el) { var w = WIDGETS[el.getAttribute('data-widget')]; if (w) w(el); }); }

WIDGETS.home = function (el) {
  var tot = totalStat(), n = currentPhase(), last = lastVisited(), topic = currentTopic(n);
  var h = '<div class="hero"><h1>C# → Junior .NET</h1><p>Два года, 4–5 часов в день, помодоро. Фазы, критерии, проекты — и честная отметка, где ты сейчас.</p>' +
    '<div class="big-progress"><span class="bar"><i style="width:' + pct(tot.d, tot.t) + '%"></i></span><span>' + pct(tot.d, tot.t) + '% пути</span></div><div class="btns">' +
    (last ? '<a class="btn pri" href="#/' + last.id + '"><span>Продолжить:</span> <span class="ell">' + esc(last.title) + '</span></a>' : '<a class="btn pri" href="#/how">Начать с «Как пользоваться»</a>') +
    '<button class="btn" type="button" data-open-map>Карта пути</button></div></div>';
  if (n <= 7) {
    h += '<div class="here-card"><span class="here-dot"></span><div class="tx"><small>Ты здесь</small><b>Фаза ' + n + ': ' + esc(PHASES[n].title) + '</b>' +
      (topic ? '<small>Текущая тема: ' + esc(topic.title) + '</small>' : '') + '</div>' +
      (topic ? '<a class="btn sm" href="#/' + topic.id + '">Открыть тему</a>' : '') + '<button class="btn sm" type="button" data-open-map>На карте</button></div>';
  }
  h += '<div class="phase-grid">';
  for (var i = 1; i <= 7; i++) {
    var st = phaseStat(i), ov = phasePages(i)[0];
    h += '<a class="pcard' + (i === n ? ' cur' : '') + (st.closed ? ' done' : '') + '" href="#/' + (ov ? ov.id : 'home') + '">' +
      (i === n ? '<span class="pill">ты здесь</span>' : st.closed ? '<span class="pill ok">закрыта</span>' : '') +
      '<span class="n">ФАЗА ' + i + ' · МЕС. ' + PHASES[i].m[0] + '–' + PHASES[i].m[1] + '</span><b>' + esc(PHASES[i].title) + '</b><small>' + esc(PHASES[i].focus) + '</small>' +
      '<div class="bar"><i style="width:' + pct(st.d, st.t) + '%"></i></div></a>';
  }
  h += '</div>';
  el.innerHTML = h;
};

/* rabbit holes */
var rbFilter = 'open';
WIDGETS.rabbit = function (el) {
  var list = Store.get('rabbit', []) || [];
  var depth = Store.get('depthDay', '');
  var days = depth ? Math.floor((Date.now() - new Date(depth + 'T00:00:00').getTime()) / 864e5) : null;
  var shown = list.filter(function (r) { return rbFilter === 'all' || (rbFilter === 'open' ? r.st === 'open' : r.st !== 'open'); });
  var counts = { open: list.filter(function (r) { return r.st === 'open'; }).length };
  var h = '<form class="rb-add" data-rb-form><input type="text" maxlength="400" placeholder="Что всплыло? Например: «как JIT решает, инлайнить ли метод»" aria-label="Новый вопрос"><button class="btn pri" type="submit">Записать</button></form>' +
    '<div class="rb-tabs"><button type="button" data-rbf="open"' + (rbFilter === 'open' ? ' class="on"' : '') + '>Открытые (' + counts.open + ')</button>' +
    '<button type="button" data-rbf="closed"' + (rbFilter === 'closed' ? ' class="on"' : '') + '>Закрытые</button>' +
    '<button type="button" data-rbf="all"' + (rbFilter === 'all' ? ' class="on"' : '') + '>Все (' + list.length + ')</button></div><ul class="rb-list">';
  if (!shown.length) h += '<li class="rb-empty" style="border:0;background:none">Пока пусто. Это хорошо — или ты ещё не начал копать.</li>';
  shown.slice().reverse().forEach(function (r) {
    h += '<li class="' + r.st + '"><div class="tx"><span>' + esc(r.t) + '</span><small>' + esc(r.d) + (r.ph ? ' · Фаза ' + r.ph : '') +
      (r.st === 'done' ? ' · разобрано' : r.st === 'drop' ? ' · вычеркнуто' : '') + '</small>' +
      (r.a ? '<details class="rb-ans"><summary>Ответ ИИ</summary><div class="ai-md">' + aiMd(r.a) + '</div></details>' : '') + '</div><div class="rb-acts">' +
      (r.st === 'open' ? '<button type="button" data-rba="done" data-id="' + r.id + '" title="Разобрал в день глубины">✓</button><button type="button" data-rba="drop" data-id="' + r.id + '" title="Любопытство ради любопытства">✕</button>'
        : '<button type="button" data-rba="open" data-id="' + r.id + '" title="Вернуть в открытые">↺</button><button type="button" data-rba="del" data-id="' + r.id + '" title="Удалить">🗑</button>') +
      '</div></li>';
  });
  h += '</ul><div class="depth">◎ <span>' + (days === null ? 'День глубины ещё не отмечен.' : 'Последний день глубины: ' + esc(depth) + ' (' + days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад).' + (days > 21 ? ' Пора — раз в 2–3 недели.' : '')) +
    '</span><button class="btn sm" type="button" data-rba="depth">Отметить сегодня</button><button class="btn sm" type="button" data-rba="export">Скачать rabbit-holes.md</button></div>';
  el.innerHTML = h;
};
document.addEventListener('submit', function (e) {
  var f = e.target.closest && e.target.closest('[data-rb-form]');
  if (!f) return;
  e.preventDefault();
  var inp = $('input', f), v = inp.value.trim();
  if (!v) return;
  var list = Store.get('rabbit', []) || [];
  var n = currentPhase();
  list.push({ id: Date.now().toString(36), t: v, d: todayISO(), ph: n <= 7 ? n : 7, st: 'open' });
  Store.set('rabbit', list);
  rbFilter = 'open';
  WIDGETS.rabbit(f.parentNode);
  var ni = $('[data-rb-form] input'); if (ni) ni.focus();
  toast('Записано. Возвращайся к теме фазы.');
});
document.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('[data-rbf],[data-rba]') : null;
  if (!t) return;
  var el = t.closest('.widget');
  if (t.hasAttribute('data-rbf')) { rbFilter = t.getAttribute('data-rbf'); WIDGETS.rabbit(el); return; }
  var a = t.getAttribute('data-rba'), list = Store.get('rabbit', []) || [];
  if (a === 'depth') { Store.set('depthDay', todayISO()); WIDGETS.rabbit(el); toast('День глубины отмечен'); return; }
  if (a === 'export') { download('rabbit-holes.md', rabbitMd(list), 'text/markdown'); return; }
  var id = t.getAttribute('data-id');
  list = list.filter(function (r) { if (r.id === id) { if (a === 'del') return false; r.st = a; } return true; });
  Store.set('rabbit', list); WIDGETS.rabbit(el);
});
function rabbitMd(list) {
  var s = '# rabbit-holes.md\n\n> Правило 20 минут: не вышел на прикладной вывод — записал сюда и вернулся к фазе.\n\n';
  function sec(title, st, fmt) {
    var xs = list.filter(function (r) { return r.st === st; });
    s += '## ' + title + '\n\n' + (xs.length ? xs.map(fmt).join('\n') : '_пусто_') + '\n\n';
  }
  function ans(r) { return r.a ? '\n' + r.a.split('\n').map(function (l) { return '  > ' + l; }).join('\n') : ''; }
  sec('Открытые', 'open', function (r) { return '- [ ] ' + r.d + ' · Фаза ' + r.ph + ' · ' + r.t + ans(r); });
  sec('Разобрано в дни глубины', 'done', function (r) { return '- [x] ' + r.d + ' · Фаза ' + r.ph + ' · ' + r.t + ans(r); });
  sec('Вычеркнуто (любопытство ради любопытства)', 'drop', function (r) { return '- ~~' + r.d + ' · ' + r.t + '~~'; });
  return s;
}

/* job applications tracker */
var JOB_ST = ['Отклик', 'Скрининг', 'Тех. интервью', 'Тестовое', 'Финал', 'Оффер', 'Отказ', 'Нет ответа'];
WIDGETS.jobs = function (el) {
  var list = Store.get('jobs', []) || [];
  var counts = {}; JOB_ST.forEach(function (s) { counts[s] = 0; });
  list.forEach(function (j) { if (counts[j.st] !== undefined) counts[j.st]++; });
  var reached = function (idx) { return list.filter(function (j) { var i = JOB_ST.indexOf(j.st); return i >= idx && i <= 5; }).length; };
  var h = '<form class="rb-add jobs-add" data-job-form>' +
    '<input type="text" name="company" maxlength="120" placeholder="Компания" aria-label="Компания" required>' +
    '<input type="text" name="role" maxlength="120" placeholder="Позиция" aria-label="Позиция">' +
    '<input type="url" name="link" maxlength="400" placeholder="Ссылка (необязательно)" aria-label="Ссылка на вакансию">' +
    '<button class="btn pri" type="submit">Добавить</button></form>';
  h += '<div class="funnel">';
  ['Отклик', 'Скрининг', 'Тех. интервью', 'Тестовое', 'Финал', 'Оффер'].forEach(function (s, i) {
    h += '<div class="fn"><b>' + reached(i) + '</b><small>' + s + (i ? '' : ' (всего активных)') + '</small></div>';
  });
  h += '<div class="fn bad"><b>' + counts['Отказ'] + '</b><small>Отказ</small></div><div class="fn"><b>' + counts['Нет ответа'] + '</b><small>Нет ответа</small></div></div>';
  h += '<ul class="rb-list">';
  if (!list.length) h += '<li class="rb-empty" style="border:0;background:none">Пока пусто. Первый отклик — лучший повод начать трекер.</li>';
  list.slice().reverse().forEach(function (j) {
    var title = esc(j.company) + (j.role ? ' — ' + esc(j.role) : '');
    var safeLink = /^https?:\/\//i.test(j.link || '') ? j.link : '';
    h += '<li><div class="tx"><span>' + (safeLink ? '<a href="' + esc(safeLink) + '" target="_blank" rel="noopener">' + title + '</a>' : title) + '</span><small>добавлено ' + esc(j.d) + (j.u && j.u !== j.d ? ' · обновлено ' + esc(j.u) : '') + '</small></div>' +
      '<div class="rb-acts"><select data-job="' + j.id + '" aria-label="Статус">' + JOB_ST.map(function (s) { return '<option' + (s === j.st ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<button type="button" data-jobdel="' + j.id + '" title="Удалить">🗑</button></div></li>';
  });
  h += '</ul><div class="depth"><span>Записей: ' + list.length + '</span><button class="btn sm" type="button" data-jobcsv>Скачать CSV</button></div>';
  el.innerHTML = h;
};
document.addEventListener('submit', function (e) {
  var f = e.target.closest && e.target.closest('[data-job-form]');
  if (!f) return;
  e.preventDefault();
  var company = f.company.value.trim();
  if (!company) return;
  var list = Store.get('jobs', []) || [];
  list.push({ id: Date.now().toString(36), company: company, role: f.role.value.trim(), link: f.link.value.trim(), st: 'Отклик', d: todayISO(), u: todayISO() });
  Store.set('jobs', list);
  WIDGETS.jobs(f.parentNode);
  toast('Отклик добавлен');
});
document.addEventListener('change', function (e) {
  var s = e.target.closest && e.target.closest('select[data-job]');
  if (!s) return;
  var list = Store.get('jobs', []) || [], id = s.getAttribute('data-job');
  list.forEach(function (j) { if (j.id === id) { j.st = s.value; j.u = todayISO(); } });
  Store.set('jobs', list);
  WIDGETS.jobs(s.closest('.widget'));
});
document.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('[data-jobdel],[data-jobcsv]') : null;
  if (!t) return;
  var list = Store.get('jobs', []) || [];
  if (t.hasAttribute('data-jobcsv')) {
    var q = function (v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; };
    var csv = '﻿Компания;Позиция;Ссылка;Статус;Добавлено;Обновлено\n' + list.map(function (j) { return [j.company, j.role, j.link, j.st, j.d, j.u].map(q).join(';'); }).join('\n');
    download('otkliki-' + todayISO() + '.csv', csv, 'text/csv');
    return;
  }
  var id = t.getAttribute('data-jobdel');
  Store.set('jobs', list.filter(function (j) { return j.id !== id; }));
  WIDGETS.jobs(t.closest('.widget'));
});

/* ================= search ================= */
var index = null;
function buildIndex() {
  index = [];
  var tmp = document.createElement('div');
  pages.forEach(function (p) {
    tmp.innerHTML = p.html;
    $$('.copy,.lang-sw', tmp).forEach(function (x) { x.parentNode.removeChild(x); });
    $$('td,th,li,p,summary,div,tr,h2,h3,h4,pre', tmp).forEach(function (x) { x.appendChild(document.createTextNode(' ')); });
    var sec = { p: p, id: '', h: '', txt: '' };
    var push = function () { sec.n = norm(sec.txt); sec.nh = norm(sec.h); index.push(sec); };
    Array.prototype.forEach.call(tmp.children, function (el) {
      if (/^H[234]$/.test(el.tagName)) {
        push();
        sec = { p: p, id: el.id.replace(/^h-/, ''), h: el.textContent, txt: '' };
      } else sec.txt += ' ' + (el.textContent || '').replace(/\s+/g, ' ');
    });
    push();
    p.nt = norm(p.title + ' ' + p.nav);
  });
  if (typeof refSearchItems === 'function') refSearchItems().forEach(function (x) { index.push(x); });
}
var sel = -1, results = [];
function doSearch(q) {
  var box = $('#sres');
  q = norm(q.trim());
  if (q.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return; }
  if (!index) buildIndex();
  var terms = q.split(/\s+/).filter(Boolean);
  results = [];
  index.forEach(function (s) {
    var all = s.p.nt + ' ' + s.nh + ' ' + s.n, score = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (all.indexOf(t) < 0) return;
      if (s.p.nt.indexOf(t) >= 0) score += s.id ? 2 : 12;
      if (s.nh.indexOf(t) >= 0) score += 8;
      var c = s.n.split(t).length - 1; score += Math.min(c, 6);
    }
    results.push({ s: s, score: score });
  });
  results.sort(function (a, b) { return b.score - a.score; });
  results = results.slice(0, 30);
  sel = results.length ? 0 : -1;
  if (!results.length) { box.innerHTML = '<div class="s-empty">Ничего не нашлось. Попробуй другое слово — например «boxing», «ref», «StringBuilder».</div>'; box.classList.add('open'); return; }
  box.innerHTML = results.map(function (r, i) {
    var s = r.s, ph = s.ref ? 'Справочник · ' + s.ref.toUpperCase() + ' · ' : s.p.phase ? 'Фаза ' + s.p.phase + ' · ' : '';
    return '<a class="sr' + (i === 0 ? ' sel' : '') + '" role="option" href="' + (s.href || '#/' + s.p.id + (s.id ? '/' + s.id : '')) + '"><div class="sr-t"><small>' + ph + '</small>' + mark(esc(s.p.title), terms) +
      (s.h ? ' <small>› ' + mark(esc(s.h), terms) + '</small>' : '') + '</div><div class="sr-s">' + snippet(s.txt, terms) + '</div></a>';
  }).join('');
  box.classList.add('open');
}
function mark(html, terms) {
  terms.forEach(function (t) {
    if (t.length < 2) return;
    var rx = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]') + ')', 'gi');
    html = html.replace(/(<[^>]*>)|([^<]+)/g, function (m0, tag, txt) { return tag ? tag : txt.replace(rx, '<mark>$1</mark>'); });
  });
  return html;
}
function snippet(txt, terms) {
  var n = norm(txt), pos = -1;
  for (var i = 0; i < terms.length && pos < 0; i++) pos = n.indexOf(terms[i]);
  if (pos < 0) pos = 0;
  var a = Math.max(0, pos - 60), b = Math.min(txt.length, pos + 120);
  return (a ? '… ' : '') + mark(esc(txt.slice(a, b).trim()), terms) + (b < txt.length ? ' …' : '');
}
var q = $('#q');
q.addEventListener('input', function () { doSearch(q.value); });
q.addEventListener('focus', function () { if (q.value.trim().length >= 2) doSearch(q.value); });
q.addEventListener('keydown', function (e) {
  var items = $$('#sres .sr');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!items.length) return;
    e.preventDefault();
    sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach(function (x, i) { x.classList.toggle('sel', i === sel); });
    items[sel].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    if (items[sel]) { e.preventDefault(); location.hash = items[sel].getAttribute('href'); closeSearch(); }
  } else if (e.key === 'Escape') { closeSearch(); q.blur(); }
});
$('#sres').addEventListener('click', function (e) { if (e.target.closest('.sr')) setTimeout(closeSearch, 0); });
function closeSearch() { $('#sres').classList.remove('open'); var sb = $('.search'); if (sb) sb.classList.remove('open'); var bt = $('#searchBtn'); if (bt) bt.setAttribute('aria-expanded', 'false'); }
document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.search')) closeSearch(); });

/* ================= settings ================= */
var theme = Store.get('theme', 'auto');
var fs = Store.get('fs', 17);
function applyTheme() {
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
  $$('#themeSeg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === theme); });
}
function applyFs() {
  fs = Math.max(14, Math.min(22, fs));
  document.documentElement.style.fontSize = fs + 'px';
  $('#fsVal').textContent = fs + 'px';
}
function syncLangButtons() {
  $$('[data-lang]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-lang') === lang); });
  $$('#langSeg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === lang); });
}
function setLang(l) {
  if (l !== 'ru-ru' && l !== 'en-us') return;
  lang = l; Store.set('lang', lang);
  $$('a.learn-a').forEach(function (a) { a.href = a.href.replace(/learn\.microsoft\.com\/[a-z]{2}-[a-z]{2}\//, 'learn.microsoft.com/' + lang + '/'); });
  $$('.lang-sw [data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
  syncLangButtons();
}
$('#themeSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; theme = b.getAttribute('data-v'); Store.set('theme', theme); applyTheme(); });
$('#fsSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var v = +b.getAttribute('data-v'); fs = v ? fs + v : 17; Store.set('fs', fs); applyFs(); });
$('#langSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setLang(b.getAttribute('data-v')); });
document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.lang-sw [data-lang]'); if (b) setLang(b.getAttribute('data-lang')); });
if (!Store.ok) $('#storeNote').textContent = 'localStorage недоступен (приватный режим?) — прогресс живёт только до закрытия вкладки. Сохраняй через «Экспорт JSON».';

var KEYS = ['cb', 'visited', 'last', 'rabbit', 'depthDay', 'jobs', 'start', 'navOpen', 'lang', 'theme', 'fs', 'g', 'lab', 'cards', 'vibe', 'motion', 'nodes', 'pathView', 'readpos', 'aihist'];
$('#expBtn').addEventListener('click', function () {
  var data = {}; KEYS.forEach(function (k) { var v = Store.get(k, undefined); if (v !== undefined) data[k] = v; });
  download('csharp-roadmap-progress-' + todayISO() + '.json', JSON.stringify({ app: 'csroad', v: 1, date: new Date().toISOString(), data: data }, null, 2), 'application/json');
});
$('#impFile').addEventListener('change', function () {
  var f = this.files && this.files[0]; if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var j = JSON.parse(rd.result);
      if (!j || j.app !== 'csroad' || !j.data) throw new Error('не тот формат');
      KEYS.forEach(function (k) { if (k in j.data) Store.set(k, j.data[k]); });
      cb = Store.get('cb', {}) || {}; visited = Store.get('visited', {}) || {}; lang = Store.get('lang', lang); theme = Store.get('theme', theme); fs = Store.get('fs', fs); vibe = Store.get('vibe', 'calm'); motion = Store.get('motion', 'on'); NODES = Store.get('nodes', {}) || {};
      applyTheme(); applyFs(); applyVibe(); applyMotion(); route(); toast('Прогресс импортирован');
      if ('g' in j.data || 'lab' in j.data || 'cards' in j.data) setTimeout(function () { location.reload(); }, 700);
    } catch (err) { toast('Не удалось импортировать: ' + err.message); }
  };
  rd.readAsText(f);
  this.value = '';
});
var resetArm = 0;
$('#resetBtn').addEventListener('click', function () {
  var b = this;
  if (Date.now() - resetArm > 4000) { resetArm = Date.now(); b.textContent = 'Точно? Нажми ещё раз'; setTimeout(function () { b.textContent = 'Сбросить'; }, 4000); return; }
  cb = {}; visited = {}; Store.set('cb', cb); Store.set('visited', visited); Store.del('last');
  b.textContent = 'Сбросить'; resetArm = 0; refreshProgress(); toast('Отметки прогресса сброшены');
});

function download(name, text, type) {
  try {
    var blob = new Blob([text], { type: type + ';charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.parentNode && a.parentNode.removeChild(a); }, 1000);
  } catch (e) { toast('Не удалось скачать файл: ' + e.message); }
}
var toastT = 0;
function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3600); }

/* copy buttons */
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('.copy'); if (!b) return;
  var text = b.closest('.code').querySelector('pre').textContent;
  function done(ok) { b.textContent = ok ? 'Скопировано' : 'Не вышло'; setTimeout(function () { b.textContent = 'Копировать'; }, 1500); }
  function fallback() {
    try { var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); done(ok); } catch (err) { done(false); }
  }
  try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback); else fallback(); } catch (err) { fallback(); }
});

/* ================= timer: rule of 20 minutes ================= */
var timerI = 0;
function tick() {
  var end = Store.get('timerEnd', 0), btn = $('#timerBtn'), tx = $('#timerTxt');
  if (!end) { btn.classList.remove('running'); tx.textContent = '20:00'; clearInterval(timerI); timerI = 0; return; }
  var left = Math.round((end - Date.now()) / 1000);
  if (left <= 0) {
    Store.del('timerEnd'); btn.classList.remove('running'); tx.textContent = '20:00'; clearInterval(timerI); timerI = 0;
    toast('20 минут вышли. Есть прикладной вывод? Нет — запиши вопрос в rabbit-holes и вернись к фазе.');
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
    return;
  }
  btn.classList.add('running');
  tx.textContent = Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2);
}
$('#timerBtn').addEventListener('click', function () {
  if (Store.get('timerEnd', 0)) { Store.del('timerEnd'); toast('Таймер остановлен'); }
  else { Store.set('timerEnd', Date.now() + 20 * 60 * 1000); toast('20 минут пошли. Цель — прикладной вывод, а не дно.'); }
  tick(); if (Store.get('timerEnd', 0) && !timerI) timerI = setInterval(tick, 1000);
});

/* ================= mobile nav, keys, scrollspy ================= */
function closeNav() {}
document.addEventListener('keydown', function (e) {
  var tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { e.preventDefault(); openSearch(); return; }
  if (e.key === 'Escape') { closeSearch(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); openSearch(); }
  else if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') { location.hash = '#/path'; }
  else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') { location.hash = '#/ref'; }
});
var spyRaf = 0;
function spy() {
  var links = $$('.toc a');
  if (!links.length) return;
  var best = null;
  links.forEach(function (a) { var h = document.getElementById('h-' + a.getAttribute('data-sec')); if (h && h.getBoundingClientRect().top < 140) best = a; });
  links.forEach(function (a) { a.classList.toggle('act', a === best); });
}
window.addEventListener('scroll', function () { if (!spyRaf) spyRaf = requestAnimationFrame(function () { spyRaf = 0; spy(); }); }, { passive: true });

/*{{LAB_POST}}*/

/*{{SHELL}}*/

/* ================= boot ================= */
applyTheme(); applyFs(); applyVibe(); applyMotion(); syncLangButtons();
route();
if (Store.get('timerEnd', 0)) { tick(); timerI = setInterval(tick, 1000); }
window.__app = { pages: pages, byId: byId, phaseStat: phaseStat, currentPhase: currentPhase, Store: Store, highlight: highlight, G: G, Cards: Cards, LABDATA: LABDATA, LabState: LabState, CARDREG: CARDREG };
})();
