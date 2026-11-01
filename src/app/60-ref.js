/* ==========================================================================
   Этап 7. Справочник C#: маршруты #/ref[/<кат>[/<запись>[/<раздел>]]], указатель,
   статья по шаблону, таблицы (сортировка и фильтр), поиск, связь с темами курса.
   Данные: partials/ref-*.md → build.py → REF (индекс) + <script type="text/x-ref"> (тексты, разбираются лениво).
   ========================================================================== */
var REF = /*{{REFIDX}}*/;
var REFBY = {}, REFCAT = {}, REFSRC = {}, REFHTML = {};
REF.entries.forEach(function (e) { REFBY[e.id] = e; });
REF.cats.forEach(function (c) { REFCAT[c.id] = c; });
$$('script[type="text/x-ref"]').forEach(function (s) { REFSRC[s.getAttribute('data-id')] = s.textContent.replace(/^\n|\n$/g, ''); });
var REF_SECS = [['syntax', 'Синтаксис'], ['semantics', 'Семантика'], ['internals', 'Под капотом'], ['complexity', 'Сложность'], ['versions', 'Версии'], ['pitfalls', 'Ловушки'], ['examples', 'Примеры']];
var refDrawer = null, refSpyOn = false;

function refRoute(cat, entry, sec) {
  cat = norm(cat); entry = norm(entry);
  var r = { view: 'ref', id: '', entry: '', sec: '', query: '' };
  if (REFBY[cat]) { sec = entry; entry = cat; cat = REFBY[entry].cat; }       /* #/ref/<запись> → полный адрес */
  if (!REFCAT[cat]) return r;
  r.id = cat;
  if (REFBY[entry] && REFBY[entry].cat === cat) { r.entry = entry; if (/^[\w-]+$/.test(sec || '')) r.sec = sec; }
  return r;
}
function refHref(e, sec) { return '#/ref/' + e.cat + '/' + e.id + (sec ? '/' + sec : ''); }
function refEntries(cat) { return REF.entries.filter(function (e) { return e.cat === cat; }); }

/* ---------- бейджи ---------- */
function refBadges(e) {
  var b = [];
  if (e.cs && e.cs !== '—') b.push('<li class="rf-b cs" title="Доступно с C# ' + esc(e.cs) + '"><span class="rf-bk">C#</span>' + esc(e.cs) + '+</li>');
  if (e.net) b.push('<li class="rf-b net" title="Доступно с .NET ' + esc(e.net) + '"><span class="rf-bk">.NET</span>' + esc(e.net) + '+</li>');
  if (e.cx) b.push('<li class="rf-b cx" title="Сложность по времени"><span class="rf-bk">время</span>' + esc(e.cx) + '</li>');
  if (e.mem) b.push('<li class="rf-b cx" title="Сложность по памяти"><span class="rf-bk">память</span>' + esc(e.mem) + '</li>');
  if (e.danger) b.push('<li class="rf-b dg" title="Здесь часто ошибаются"><span aria-hidden="true">⚠</span> ловушка</li>');
  return b.length ? '<ul class="rf-badges" aria-label="Свойства записи">' + b.join('') + '</ul>' : '';
}

/* ---------- указатель ---------- */
function refIndexHTML(cat, entry) {
  var h = '<div class="rf-idx-in"><input type="search" class="ds-input rf-f" placeholder="Фильтр указателя" aria-label="Фильтр указателя справочника" autocomplete="off">' +
    '<nav aria-label="Указатель справочника">';
  REF.cats.forEach(function (c) {
    var es = refEntries(c.id);
    h += '<details class="rf-cat"' + (c.id === cat ? ' open' : '') + '><summary><span class="rf-let" aria-hidden="true">' + c.letter + '</span><span class="rf-ct">' + esc(c.title) + '</span><small>' + es.length + '</small></summary><ul>' +
      '<li><a href="#/ref/' + c.id + '"' + (c.id === cat && !entry ? ' aria-current="page"' : '') + ' data-k="' + esc(norm(c.title + ' обзор')) + '"><em>Обзор категории</em></a></li>' +
      es.map(function (e) {
        return '<li><a href="' + refHref(e) + '"' + (e.id === entry ? ' aria-current="page"' : '') + ' data-k="' + esc(norm(e.title + ' ' + e.tags)) + '">' + esc(e.title) + (e.danger ? ' <span class="rf-dot" title="ловушка" aria-label="ловушка">⚠</span>' : '') + '</a></li>';
      }).join('') + '</ul></details>';
  });
  return h + '<p class="rf-none" hidden>Ничего не найдено. Глобальный поиск по тексту — Ctrl+K.</p></nav></div>';
}
document.addEventListener('input', function (e) {
  var f = e.target.closest && e.target.closest('.rf-f'); if (!f) return;
  var q = norm(f.value.trim()).split(/\s+/).filter(Boolean), root = f.closest('.rf-idx-in'), any = false;
  $$('.rf-cat', root).forEach(function (d) {
    var shown = 0;
    $$('li', d).forEach(function (li) {
      var k = li.firstChild.getAttribute('data-k') || '', ok = q.every(function (t) { return k.indexOf(t) >= 0; });
      li.hidden = !ok; if (ok) shown++;
    });
    d.hidden = !shown; if (q.length) d.open = true; if (shown) any = true;
  });
  $('.rf-none', root).hidden = any || !q.length;
});

/* ---------- разбор статьи (лениво) ---------- */
function refParse(id) {
  if (REFHTML[id]) return REFHTML[id];
  var src = REFSRC[id] || '', e = REFBY[id], lead = '';
  if (e) { lead = e.lead; src = src.slice(lead.length).replace(/^\s+/, ''); }
  var ps = new Parser({ id: 'ref:' + id, kind: 'ref', src: src });
  var html = ps.blocks(src.replace(/\r\n?/g, '\n').split('\n'));
  return (REFHTML[id] = { html: html, toc: ps.toc.filter(function (t) { return t.lvl <= 3; }) });
}
function refInline(s) { return new Parser({ id: 'ref:i', kind: 'ref', src: '' }).inline(s); }

function refRelated(e) {
  var rel = (e.related || []).slice();
  REF.entries.forEach(function (x) { if (x.id !== e.id && (x.related || []).indexOf(e.id) >= 0 && rel.indexOf(x.id) < 0) rel.push(x.id); });
  var a = rel.map(function (id) { return REFBY[id]; }).filter(Boolean).map(function (x) { return '<li><a href="' + refHref(x) + '">' + esc(x.title) + '</a></li>'; }).join('');
  var b = (e.topic || []).filter(function (t) { return byId[t]; }).map(function (t) { return '<li><a href="#/topic/' + t + '">' + esc(byId[t].title) + '</a></li>'; }).join('');
  var c = (e.learn || []).map(function (x) {
    var v = x.charAt(0) === '?', p = x.replace(/^\?/, '').split('::'), path = p[0], title = p[1] || path;
    return '<li><a class="learn-a" href="https://learn.microsoft.com/' + lang + '/' + (v ? 'search/?terms=' + encodeURIComponent(title) : esc(path)) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + '<span class="sr-only"> (откроется в новой вкладке)</span></a>' + (v ? ' <small>поиск по Learn</small>' : '') + '</li>';
  }).join('');
  return '<section class="rf-rel" aria-labelledby="h-related"><h2 id="h-related">Связанное' + refCopyBtn('related', 'Связанное') + '</h2><div class="rf-rel-g">' +
    (a ? '<div><h3>В справочнике</h3><ul>' + a + '</ul></div>' : '') + (b ? '<div><h3>В курсе</h3><ul>' + b + '</ul></div>' : '') +
    (c ? '<div><h3>Microsoft Learn</h3><ul>' + c + '</ul></div>' : '') + '</div></section>';
}
function refCopyBtn(sec, title) {
  return '<button type="button" class="rf-cp" data-rf-copy="' + esc(sec) + '" aria-label="Скопировать ссылку на раздел «' + esc(title) + '»" title="Скопировать ссылку на раздел"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg></button>';
}

/* ---------- страницы ---------- */
function refShell(cat, entry, inner) {
  return '<div class="rf"><aside class="rf-idx" aria-label="Указатель">' + refIndexHTML(cat, entry) + '</aside><div class="rf-main">' +
    '<button type="button" class="ds-btn sec rf-mbar" id="rfOpenIdx" aria-haspopup="dialog">Указатель справочника</button>' + inner + '</div></div>';
}
function refCrumbs(c, e) {
  return '<nav class="rd-crumbs rf-crumbs" aria-label="Хлебные крошки"><a href="#/ref">Справочник</a>' + (c ? '<span aria-hidden="true">›</span>' + (e ? '<a href="#/ref/' + c.id + '">' + c.letter + '. ' + esc(c.title) + '</a>' : '<span aria-current="page">' + c.letter + '. ' + esc(c.title) + '</span>') : '') + '</nav>';
}
function refEntryCard(e) {
  return '<li><a class="ds-card link rf-card" href="' + refHref(e) + '"><b>' + esc(e.title) + '</b><span class="rf-lead-s">' + refInline(e.lead) + '</span>' + refBadges(e) + '</a></li>';
}
function refPaint(title, html, cat, entry) {
  current = null;
  var c = $('#content'); c.innerHTML = refShell(cat, entry, html);
  syncLangButtons();
  document.title = title + ' · Справочник C# · C# → Junior .NET';
}
function renderRef(r) {
  var c = REFCAT[r.id], e = REFBY[r.entry], same = e && $('.rf-art[data-id="' + r.entry + '"]');
  if (same) { refScrollSec(r.sec); return; }
  if (!r.id) {
    var tabs = REF.entries.filter(function (x) { return x.table; });
    refPaint('Справочник', '<div class="rf-page"><h1 class="page-title" tabindex="-1">Справочник C#</h1><p class="rf-intro">Подробные статьи по языку и платформе: как вычисляется, во что компилируется, сколько стоит и где ошибаются. Поиск по всему тексту — Ctrl+K.</p>' +
      (REF.cats.length ? '<ul class="rf-cats">' + REF.cats.map(function (k) { return '<li><a class="ds-card link rf-catc" href="#/ref/' + k.id + '"><span class="rf-let big" aria-hidden="true">' + k.letter + '</span><b>' + esc(k.title) + '</b><span class="rf-lead-s">' + refInline(k.lead) + '</span><small>' + k.count + ' ' + plural(k.count, 'запись', 'записи', 'записей') + '</small></a></li>'; }).join('') + '</ul>'
        : '<div class="ds-card flat empty"><b>Раздел пока пуст</b></div>') +
      (tabs.length ? '<h2 class="rf-h2">Таблицы</h2><p class="rf-intro">Сортируются по клику на заголовок и фильтруются.</p><ul class="rf-cards">' + tabs.map(refEntryCard).join('') + '</ul>' : '') + '</div>', '', '');
    refAfter(); return;
  }
  if (!e) {
    var es = refEntries(r.id), ov = refParse('cat-' + r.id);
    refPaint(c.letter + '. ' + c.title, '<article class="rf-art rf-cat-art">' + refCrumbs(c) + '<h1 class="page-title" tabindex="-1">' + c.letter + '. ' + esc(c.title) + '</h1><p class="rf-lead">' + refInline(c.lead) + '</p>' +
      (REFSRC['cat-' + r.id] ? '<div class="rf-body content">' + ov.html + '</div>' : '') +
      '<h2 class="rf-h2" id="h-entries">Записи категории <small>' + es.length + '</small></h2><ul class="rf-cards">' + es.map(refEntryCard).join('') + '</ul></article>', r.id, '');
    refAfter(); return;
  }
  var a = refParse(e.id), list = refEntries(e.cat), i = list.indexOf(e), prev = list[i - 1], next = list[i + 1];
  var toc = a.toc.concat([{ id: 'related', text: 'Связанное', lvl: 2 }]);
  var tl = toc.map(function (t) { return '<a class="l' + t.lvl + '" href="' + refHref(e, t.id) + '" data-sec="' + t.id + '">' + esc(t.text) + '</a>'; }).join('');
  refPaint(e.title, '<div class="rf-cols"><article class="rf-art" data-id="' + e.id + '">' + refCrumbs(c, e) + '<h1 class="page-title" tabindex="-1">' + esc(e.title) + '</h1>' + refBadges(e) +
    '<p class="rf-lead">' + refInline(e.lead) + '</p><details class="rd-toc-m rf-toc-m"><summary>Содержание</summary><nav aria-label="Содержание">' + tl + '</nav></details>' +
    '<div class="rf-body content">' + a.html + '</div>' + refRelated(e) +
    '<div class="pn rd-pn rf-pn">' + (prev ? '<a href="' + refHref(prev) + '"><small>← Предыдущая</small><b>' + esc(prev.title) + '</b></a>' : '<a href="#/ref/' + c.id + '"><small>← К категории</small><b>' + esc(c.title) + '</b></a>') +
    (next ? '<a class="nx" href="' + refHref(next) + '"><small>Следующая →</small><b>' + esc(next.title) + '</b></a>' : '<a class="nx" href="#/ref/' + c.id + '"><small>К категории</small><b>' + esc(c.title) + '</b></a>') + '</div></article>' +
    '<nav class="toc rf-toc" aria-label="На этой странице"><div class="toc-h">На этой странице</div>' + tl + '</nav></div>', e.cat, e.id);
  var art = $('.rf-art[data-id="' + e.id + '"]');
  $$('.rf-body h2[id^="h-"], .rf-body h3[id^="h-"]', art).forEach(function (h) {
    var id = h.id.slice(2), t = h.textContent.trim(); h.insertAdjacentHTML('beforeend', refCopyBtn(id, t));
  });
  refAfter(r.sec, art);
}
function refAfter(sec, art) {
  var root = $('.rf-main');
  refTables(root); refRunButtons(root);
  var h1 = $('h1', root); if (h1 && !sec) try { h1.focus({ preventScroll: true }); } catch (x) { }
  if (sec) refScrollSec(sec); else window.scrollTo(0, 0);
  refSpy();
}
function refScrollSec(sec) {
  if (!sec) { window.scrollTo(0, 0); return; }
  var el = document.getElementById('h-' + sec) || document.getElementById(sec);
  if (el) { el.scrollIntoView(); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } else window.scrollTo(0, 0);
}
/* текущий раздел в оглавлении */
function refSpy() {
  var links = $$('.rf-toc a[data-sec]'); if (!links.length) return;
  var hs = links.map(function (a) { return document.getElementById('h-' + a.getAttribute('data-sec')); });
  var y = window.innerHeight * 0.3, cur = 0;
  hs.forEach(function (h, i) { if (h && h.getBoundingClientRect().top <= y) cur = i; });
  links.forEach(function (a, i) { if (i === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
}
window.addEventListener('scroll', function () { if (!refSpyOn && $('.rf-toc')) { refSpyOn = true; requestAnimationFrame(function () { refSpyOn = false; refSpy(); }); } }, { passive: true });

/* ---------- запуск примеров, сортируемые таблицы ---------- */
function refRunButtons(root) {
  $$('.code', root).forEach(function (c) {
    var l = $('.code-lang', c); if (!l || !/^C#$/i.test(l.textContent.trim())) return;
    var src = $('pre', c).textContent; if (!/Console\./.test(src)) return;
    var ok = c.hasAttribute('data-norun') ? false : RD_RUN[src];
    if (ok === undefined) { try { var r = CS.run(src, { timeLimit: 800 }); ok = !!r.ok && !(r.errors && r.errors.length) && !r.fatal; } catch (e) { ok = false; } RD_RUN[src] = ok; }
    var h = $('.code-h', c), cp = $('.copy', h);
    if (ok) { var b = document.createElement('button'); b.type = 'button'; b.className = 'rd-run'; b.textContent = 'Запустить'; h.insertBefore(b, cp); }
    else { var n = document.createElement('span'); n.className = 'rf-norun'; n.textContent = 'не запускается в браузерной IDE'; h.insertBefore(n, cp); }
  });
}
function refKey(t) {
  t = t.trim();
  var big = [[/^O\(1\)/, 0], [/^O\(α/, 0.5], [/^O\(log/i, 1], [/^O\(√/, 1.5], [/^O\(n\s*log/i, 3], [/^O\(n\)/, 2], [/^O\(n[²2]/, 4], [/^O\(n[³3]/, 5], [/^O\(2/, 6], [/^O\(n!/, 7]];
  for (var i = 0; i < big.length; i++) if (big[i][0].test(t)) return big[i][1];
  var m = /^[−-]?\s*[\d\s]+(?:[.,]\d+)?/.exec(t.replace(/ /g, ' '));
  if (m) { var v = parseFloat(m[0].replace(/\s/g, '').replace(',', '.').replace('−', '-')); if (!isNaN(v)) return v; }
  return null;
}
function refTables(root) {
  $$('[data-sortable]', root).forEach(function (box) {
    var tbl = $('table', box), tb = $('tbody', tbl), rows = $$('tr', tb), cnt = $('.rf-sort-n', box), f = $('.rf-sort-f', box), wrap = $('.tbl', box);
    if (wrap) { wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Таблица: ' + ($('.rf-sort-t', box).textContent || '')); }
    rows.forEach(function (r, i) { r._i = i; r._k = norm(r.textContent); });
    $$('th', tbl).forEach(function (th, ci) {
      var t = th.textContent; th.innerHTML = '<button type="button" class="rf-th">' + esc(t) + '<span class="rf-ar" aria-hidden="true"></span></button>'; th.setAttribute('aria-sort', 'none');
      $('button', th).addEventListener('click', function () {
        var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        $$('th', tbl).forEach(function (x) { x.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', dir);
        var sgn = dir === 'ascending' ? 1 : -1;
        rows.slice().sort(function (a, b) {
          var ta = a.children[ci].textContent, tb2 = b.children[ci].textContent, ka = refKey(ta), kb = refKey(tb2), c;
          if (ka !== null && kb !== null) c = ka - kb; else c = ta.localeCompare(tb2, 'ru', { numeric: true });
          return (c || a._i - b._i) * sgn;
        }).forEach(function (r) { tb.appendChild(r); });
        cnt.textContent = 'Отсортировано по столбцу «' + t + '», ' + (dir === 'ascending' ? 'по возрастанию' : 'по убыванию') + '.';
      });
    });
    f.addEventListener('input', function () {
      var q = norm(f.value.trim()).split(/\s+/).filter(Boolean), n = 0;
      rows.forEach(function (r) { var ok = q.every(function (x) { return r._k.indexOf(x) >= 0; }); r.hidden = !ok; if (ok) n++; });
      cnt.textContent = q.length ? 'Показано ' + n + ' из ' + rows.length + '.' : '';
    });
  });
}

/* ---------- клики: ссылка на раздел, шторка указателя ---------- */
document.addEventListener('click', function (e) {
  var cp = e.target.closest && e.target.closest('[data-rf-copy]');
  if (cp) {
    var art = cp.closest('.rf-art'), en = art && REFBY[art.getAttribute('data-id')]; if (!en) return;
    var url = location.href.split('#')[0] + refHref(en, cp.getAttribute('data-rf-copy'));
    aiCopyText(url, 'Ссылка на раздел скопирована'); return;
  }
  if (e.target.closest && e.target.closest('#rfOpenIdx')) {
    var r = canonicalRoute();
    if (!refDrawer) {
      refDrawer = DS.drawer({ title: 'Указатель справочника', side: 'left', label: 'Указатель справочника' });
      refDrawer.el.addEventListener('click', function (ev) { if (ev.target.closest('a[href^="#/ref"]')) refDrawer.close(); });
    }
    refDrawer.setContent(refIndexHTML(r.id, r.entry)); refDrawer.open();
  }
});

/* ---------- глобальный поиск (Ctrl+K) ---------- */
function refPlain(t) { return t.replace(/~~~[\w#+.-]*[^\n]*\n/g, ' ').replace(/~~~/g, ' ').replace(/[`*|]|^#+\s*/gm, ' ').replace(/\s+/g, ' '); }
function refSearchItems() {
  var out = [];
  function add(id, title, cat, tags, md, href) {
    var p = { id: 'ref:' + id, title: title, nav: title, phase: 0, nt: norm(title + ' ' + tags) };
    md.split(/\n(?=## )/).forEach(function (part, i) {
      var m = /^## (.+?)\s*\{#([\w-]+)\}/.exec(part), txt = refPlain(part.replace(/^## .*$/m, ''));
      out.push({ p: p, id: m ? m[2] : '', h: m ? m[1].replace(/`/g, '') : '', txt: txt, n: norm(txt), nh: norm(m ? m[1] : ''), ref: cat, href: href + (m && m[2] ? '/' + m[2] : '') });
    });
  }
  REF.cats.forEach(function (c) { if (REFSRC['cat-' + c.id]) add('cat-' + c.id, c.letter + '. ' + c.title + ' — обзор', c.id, c.title, REFSRC['cat-' + c.id], '#/ref/' + c.id); });
  REF.entries.forEach(function (e) { add(e.id, e.title, e.cat, e.tags + ' ' + e.id, REFSRC[e.id] || '', '#/ref/' + e.cat + '/' + e.id); });
  return out;
}

/* ---------- из темы курса: «Подробнее в справочнике» ---------- */
function refBacklink(pid) {
  var es = REF.entries.filter(function (e) { return (e.topic || []).indexOf(pid) >= 0; });
  es.sort(function (x, y) { return ((y.topic[0] === pid) - (x.topic[0] === pid)); });   /* сначала записи, для которых тема — основная */
  var seen = {}; es = es.filter(function (e) { seen[e.cat] = (seen[e.cat] || 0) + 1; return seen[e.cat] <= 5; });   /* не больше 5 из каждой категории */
  es.sort(function (x, y) { return x.cat < y.cat ? -1 : x.cat > y.cat ? 1 : 0; });
  if (!es.length) return null;
  var s = document.createElement('section'); s.className = 'rd-ref'; s.setAttribute('aria-labelledby', 'h-rd-ref');
  s.innerHTML = '<h2 id="h-rd-ref" class="rd-h">Подробнее в справочнике</h2><ul class="rd-ref-l">' + es.slice(0, 14).map(function (e) {
    return '<li><a href="' + refHref(e) + '"><b>' + esc(e.title) + '</b><span>' + refInline(e.lead) + '</span></a></li>';
  }).join('') + '</ul>';
  return s;
}
