/* ===================== РЕЖИМ ЧТЕНИЯ ТЕМЫ (Этап 4) =====================
   Страница темы после обычного рендера перестраивается в «читалку»:
   - квизы, задачи, тикеты, сравнения, карточки, интервью и «наследие» убраны из потока (они живут в сессии практики);
   - в конце: «Что запомнить», «Практика», Microsoft Learn, «Тема пройдена», предыдущая/следующая;
   - сверху — хлебные крошки, метаданные, тонкая линия прогресса чтения; «вернуться к месту, где остановился».
   Идентификаторы лаб-блоков и чекбоксов не меняются: сессия монтирует те же LABUI по тем же lid. */
var RD_KINDS = { topic: 1, practice: 1, project: 1 };
var RD_MOVE = { quiz: 1, ide: 1, ticket: 1, compare: 1, cards: 1, legacy: 1, interview: 1 };
/* Microsoft Learn: данные в src/links.json (pageId → [{title,path,why,type,verify?}]) */
var LINKS = /*{{LINKS}}*/;
var LN_TYPE = { tutorial: 'Туториал', reference: 'Справочник', guide: 'Руководство', module: 'Курс', docs: 'Документация' };
function learnHref(l) {
  return 'https://learn.microsoft.com/' + lang + '/' + (l.verify ? 'search/?terms=' + encodeURIComponent(l.title) : l.path);
}
function learnHTML(pid) {
  var arr = LINKS[pid]; if (!arr || !arr.length) return '';
  return '<aside class="learn" aria-labelledby="h-rd-learn"><div class="learn-h"><span class="lg" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Подробнее на Microsoft Learn</span>' +
    '<span class="lang-sw" role="group" aria-label="Язык Microsoft Learn"><button type="button" data-lang="ru-ru" aria-pressed="' + (lang === 'ru-ru') + '">RU</button><button type="button" data-lang="en-us" aria-pressed="' + (lang === 'en-us') + '">EN</button></span></div><ul class="lnk">' +
    arr.map(function (l) {
      return '<li><a class="learn-a" href="' + esc(learnHref(l)) + '" target="_blank" rel="noopener noreferrer"><span class="ln-t">' + esc(l.title) + '</span><span class="ln-w">' + esc(l.why) + '</span>' +
        '<span class="ln-m"><em>' + (LN_TYPE[l.type] || 'Документация') + '</em>' + (l.verify ? '<em class="ln-v" title="Точный адрес статьи не проверен — откроется поиск по Learn">поиск по Learn</em>' : '') + '<span class="sr-only"> (откроется в новой вкладке)</span></span></a></li>';
    }).join('') + '</ul></aside>';
}

var RD_SKIP_H = /^(практика|проверь себя|типичные ошибки|закрепление|что запомнить|зачем|итоговый тест)/i;
var READPOS = Store.get('readpos', {}) || {};
var rd = null;                                            // состояние открытой читалки

function readerPage(p) { return !!(p && RD_KINDS[p.kind]); }
function practiceLabs(p) { return (p.labs || []).filter(function (l) { return RD_MOVE[l.type]; }); }

/* сводка практики: шаги, минуты, XP (то, что ещё не получено) */
function practiceInfo(p) {
  var steps = 0, min = 0, xp = 0, xpAll = 0, rows = [], done = 0;
  practiceLabs(p).forEach(function (l) {
    var d = LABDATA[l.id]; if (!d) return;
    var left = 0, all = 0, name, n = 1;
    if (l.type === 'quiz') {
      n = d.qs.length; name = 'Квиз · ' + n + ' ' + plural(n, 'вопрос', 'вопроса', 'вопросов'); min += Math.max(1, Math.round(n * 0.7));
      d.qs.forEach(function (q, i) { all += 8; if (!G.done('q:' + l.id + ':' + i)) left += 8; });
      all += 10; if (!G.done('qd:' + l.id)) left += 10;
      if (n >= 3) { all += 20; if (!G.done('qp:' + l.id)) left += 20; }
    } else if (l.type === 'ide' || l.type === 'ticket') {
      name = (l.type === 'ticket' ? 'Тикет' : 'Задача') + ' · ' + d.title; min += l.type === 'ticket' ? 10 : 8; all = d.xp || 0; left = G.done('ide:' + l.id) ? 0 : all;
    } else if (l.type === 'interview') {
      name = 'Вопрос с собеседования'; min += 3; all = 15; left = G.done('iv:' + l.id) ? 0 : all;
    } else if (l.type === 'compare') {
      name = 'Как надо / как не надо'; min += 2; all = 5; left = G.done('cmp:' + l.id) ? 0 : all;
    } else if (l.type === 'cards') {
      n = (d.cards || []).length; name = 'Карточки · ' + n + ' шт'; min += 2;
    } else { name = 'Разбор легаси-кода'; min += 4; }
    steps += (l.type === 'quiz' ? n : 1); xp += left; xpAll += all;
    var r = labDone(l); if (r) done++;
    rows.push({ name: name, left: left, done: r === true });
  });
  return { steps: steps, min: Math.max(1, min), xp: xp, xpAll: xpAll, rows: rows, blocks: rows.length, doneBlocks: done, finished: rows.length > 0 && done === rows.filter(function (x) { return x.done || x.left > 0; }).length && xp === 0 };
}

function pathSeq() {
  var out = []; for (var n = 1; n <= 8; n++) out = out.concat(pathPages(n)); return out;
}
function readMinutes(root) {
  var code = 0, clone = root.cloneNode(true);
  $$('pre', clone).forEach(function (x) { code += x.textContent.split('\n').length; x.parentNode.removeChild(x); });
  var words = (clone.textContent.match(/[\wА-Яа-яЁё]+/g) || []).length;
  return Math.max(1, Math.round(words / 200 + code / 25));
}
function rdEmptyHeadings(cont) {
  [3, 2].forEach(function (lvl) {
    $$('h' + lvl, cont).forEach(function (h) {
      var n = h.nextElementSibling;
      if (!n || (/^H[1-3]$/.test(n.tagName) && +n.tagName.charAt(1) <= lvl)) h.parentNode.removeChild(h);
    });
  });
}

/* практика живёт только в сессии: блоки убираются из страницы до монтирования виджетов (без скрытых редакторов) */
function readerPrune(p, root) {
  if (!readerPage(p)) return;
  $$('.widget.lab[data-lab]', root).forEach(function (w) { if (RD_MOVE[w.getAttribute('data-lab')]) w.parentNode.removeChild(w); });
}
function readerAfterRender(p, mode, sec) {
  rd = null;
  if (!readerPage(p)) return;
  var art = $('#content article'), cont = art && $('.content', art), grid = $('#content .page-grid'); if (!cont) return;
  var seq = pathSeq(), i = seq.indexOf(p), n = p.phase || 8;
  art.classList.add('rd'); if (grid) grid.classList.add('rd-grid');
  var wrap = document.createElement('div'); wrap.className = 'rd-theory';
  while (cont.firstChild) wrap.appendChild(cont.firstChild);
  cont.appendChild(wrap);

  /* 1. вынос практики, «Что запомнить», Microsoft Learn и «Тема пройдена» из потока */
  var moved = practiceLabs(p).length;
  var learn = learnHTML(p.id), done = $('.done-card', wrap);
  $$('aside.learn', wrap).concat(done ? [done] : []).forEach(function (x) { x.parentNode.removeChild(x); });
  var rem = null, rh = $$('h2', wrap).filter(function (h) { return /^что запомнить/i.test(h.textContent.trim()); })[0];
  if (rh) {
    var sibs = [], sn = rh.nextElementSibling;
    while (sn && !/^H[1-2]$/.test(sn.tagName)) { sibs.push(sn); sn = sn.nextElementSibling; }
    rem = document.createElement('section'); rem.className = 'rd-remember'; rh.id = 'h-rd-remember'; rh.className = 'rd-h';
    rem.appendChild(rh); sibs.forEach(function (x) { rem.appendChild(x); });
  }
  rdEmptyHeadings(wrap);

  var end = document.createElement('footer'); end.className = 'rd-end';
  var pi = practiceInfo(p);
  if (rem) end.appendChild(rem);
  if (moved) {
    var s = document.createElement('section'); s.className = 'rd-prac ds-card'; s.setAttribute('aria-labelledby', 'h-rd-prac');
    var list = pi.rows.map(function (r) { return '<li' + (r.done ? ' class="ok"' : '') + '><span>' + esc(r.name) + '</span><small>' + (r.done ? 'пройдено' : r.left ? '+' + r.left + ' XP' : '') + '</small></li>'; }).join('');
    var allDone = pi.rows.length && pi.rows.every(function (r) { return r.done || (!r.left && r.name.indexOf('Карточки') === 0); }) && pi.xp === 0;
    s.innerHTML = '<h2 id="h-rd-prac" class="rd-h">Практика этой темы</h2><ul class="rd-prac-l">' + list + '</ul>' +
      '<a class="ds-btn pri lg" id="rdStart" href="#/practice/' + p.id + '">' + (allDone ? 'Повторить практику' : 'Начать практику (' + pi.steps + ' ' + plural(pi.steps, 'шаг', 'шага', 'шагов') + ', ~' + pi.min + ' мин' + (pi.xp ? ', +' + pi.xp + ' XP' : '') + ')') + '</a>';
    end.appendChild(s);
  }
  var refEnd = refBacklink(p.id);
  if (refEnd) end.appendChild(refEnd);
  if (learn) {
    var ls = document.createElement('section'); ls.className = 'rd-learn'; ls.innerHTML = '<h2 id="h-rd-learn" class="rd-h">Дальше изучить на Microsoft Learn</h2>' + learn;
    end.appendChild(ls);
  }
  var aiEnd = aiEndBlock(p);
  if (aiEnd) end.appendChild(aiEnd);
  if (done) end.appendChild(done);
  cont.appendChild(end);

  /* 3. шапка: крошки, метаданные */
  var oldCr = $('.crumbs', art), h1 = $('h1', art), meta = $('.page-meta', art);
  var mins = readMinutes(wrap);
  var inTopic = $$('h2', wrap).map(function (h) { return h.textContent.replace(/#$/, '').trim(); }).filter(function (t) { return !RD_SKIP_H.test(t); }).slice(0, 3);
  /* «Чему научишься»: три первых тезиса из «Что запомнить», сокращённые до первой фразы */
  var learnPts = rem ? $$('li', rem).slice(0, 3).map(function (li) {
    var s = li.textContent.replace(/\s+/g, ' ').trim().replace(/[.;:]+$/, '');
    var cut = s.search(/[.;] /); if (cut > 25) s = s.slice(0, cut);
    if (s.length > 110) s = s.slice(0, 107).replace(/\s+\S*$/, '') + '…';
    return s;
  }).filter(Boolean) : [];
  var cr = document.createElement('nav'); cr.className = 'rd-crumbs'; cr.setAttribute('aria-label', 'Хлебные крошки');
  cr.innerHTML = '<a href="#/path' + (p.phase ? '/' + p.phase : '/8') + '">Путь</a><span aria-hidden="true">›</span><a href="#/path/' + n + '">' + (p.phase ? 'Фаза ' + p.phase : 'Финиш') + '</a><span aria-hidden="true">›</span><span aria-current="page">' + esc(KIND[p.kind] || 'Тема') + '</span>';
  if (oldCr) oldCr.parentNode.replaceChild(cr, oldCr);
  var mt = document.createElement('div'); mt.className = 'rd-meta';
  mt.innerHTML = (p.phase ? '<span class="rd-m">' + DS.phaseDot(Math.min(n, 7)) + ' Фаза ' + p.phase + ' · ' + esc(PHASES[p.phase].title) + '</span>' : '') +
    '<span class="rd-m">≈ ' + mins + ' мин чтения</span>' + (p.est ? '<span class="rd-m">на изучение ' + esc(p.est) + '</span>' : '') +
    (moved ? '<span class="rd-m">практика ' + pi.steps + ' ' + plural(pi.steps, 'шаг', 'шага', 'шагов') + '</span>' : '') +
    (learnPts.length ? '<span class="rd-m rd-learns"><b>Чему научишься:</b><ul>' + learnPts.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></span>'
      : inTopic.length ? '<span class="rd-m rd-in"><b>В теме:</b> ' + inTopic.map(esc).join(' · ') + '</span>' : '');
  if (h1) { h1.tabIndex = -1; h1.parentNode.insertBefore(mt, h1.nextSibling); }
  /* 4. якоря заголовков */
  $$('h2[id^="h-"], h3[id^="h-"]', wrap).forEach(function (h) {
    var id = h.id.slice(2), a = document.createElement('a');
    a.className = 'rd-a'; a.href = '#/topic/' + p.id + '/' + id; a.setAttribute('aria-label', 'Ссылка на раздел «' + h.textContent.trim() + '»'); a.textContent = '#';
    h.appendChild(a);
  });

  /* 5. оглавление (из живого DOM) + мобильный вариант */
  var heads = $$('h2[id^="h-"], h3[id^="h-"]', wrap).map(function (h) { return { id: h.id.slice(2), text: h.textContent.replace(/#$/, '').trim(), lvl: h.tagName === 'H2' ? 2 : 3 }; });
  var tail = [];
  if (rem) tail.push({ id: 'rd-remember', text: 'Что запомнить', lvl: 2 });
  if (moved) tail.push({ id: 'rd-prac', text: 'Практика этой темы', lvl: 2 });
  if (refEnd) tail.push({ id: 'rd-ref', text: 'Подробнее в справочнике', lvl: 2 });
  if (learn) tail.push({ id: 'rd-learn', text: 'Microsoft Learn', lvl: 2 });
  if (aiEnd) tail.push({ id: 'rd-ai', text: 'Не понятно? Спроси ИИ', lvl: 2 });
  var toc = heads.concat(tail), tocEl = $('.toc', art.parentNode);
  var links = toc.map(function (t) { return '<a class="l' + t.lvl + '" href="#/topic/' + p.id + '/' + t.id + '" data-sec="' + t.id + '">' + esc(t.text) + '</a>'; }).join('');
  if (tocEl && tocEl.parentNode) tocEl.parentNode.removeChild(tocEl);
  if (heads.filter(function (t) { return t.lvl === 2; }).length >= 2 && grid) {
    var nav = document.createElement('nav'); nav.className = 'toc'; nav.setAttribute('aria-label', 'На этой странице');
    nav.innerHTML = '<div class="toc-h">На этой странице</div>' + links; grid.appendChild(nav); grid.classList.add('has-toc');
    var det = document.createElement('details'); det.className = 'rd-toc-m'; det.innerHTML = '<summary>Содержание</summary><nav aria-label="Содержание">' + links + '</nav>';
    meta ? meta.parentNode.insertBefore(det, meta.nextSibling) : mt.parentNode.insertBefore(det, mt.nextSibling);
    det.addEventListener('click', function (e) { if (e.target.closest('a')) det.open = false; });
  } else if (grid) grid.classList.remove('has-toc');

  /* 6. предыдущая / следующая по порядку Пути */
  var pn = $('.pn', art), prev = seq[i - 1], next = seq[i + 1];
  if (pn) {
    var lab = function (x) { return x.kind === 'overview' ? 'Чекпойнт фазы ' + x.phase : x.title; };
    pn.className = 'pn rd-pn';
    pn.innerHTML = (prev ? '<a href="#/topic/' + prev.id + '"><small>← Предыдущая</small><b>' + esc(lab(prev)) + '</b></a>' : '<span></span>') +
      (next ? '<a class="nx" href="#/topic/' + next.id + '"><small>Следующая →</small><b>' + esc(lab(next)) + '</b></a>' : '<a class="nx" href="#/path/' + n + '"><small>Дальше</small><b>Вернуться к Пути</b></a>');
  }

  /* 7. прогресс чтения, «вернуться к месту» */
  {
    var bar = document.createElement('div'); bar.className = 'rd-prog'; bar.setAttribute('aria-hidden', 'true'); bar.innerHTML = '<i></i>'; art.insertBefore(bar, art.firstChild);
    rd = { id: p.id, art: art, bar: bar.firstChild, wrap: wrap, end: end, chip: null, timer: 0, ratio: 0 };
    var saved = READPOS[p.id];
    if (!sec && saved && saved.r > 0.08 && saved.r < 0.97) rdResumeChip(saved.r);
  }
  /* фокус: заголовок темы, без прокрутки */
  if (h1) try { h1.focus({ preventScroll: true }); } catch (e) { }
  rdRunButtons(wrap);
  aiAfterRender(p, wrap);
}

/* ---------- прогресс чтения и позиция ---------- */
function rdRatio() {
  if (!rd || !rd.art.isConnected) return 0;
  var top = rd.wrap.getBoundingClientRect().top + window.scrollY, h = rd.wrap.offsetHeight, vh = window.innerHeight;
  var span = Math.max(1, h - vh * 0.5);
  return Math.max(0, Math.min(1, (window.scrollY + vh * 0.5 - top) / span));
}
function rdUpdate() {
  if (!rd) return;
  if (!rd.art.isConnected) { rd = null; return; }
  var r = rdRatio(); rd.ratio = r; rd.bar.style.transform = 'scaleX(' + r.toFixed(3) + ')';
  clearTimeout(rd.timer);
  var id = rd.id;
  rd.timer = setTimeout(function () {
    if (!rd || rd.id !== id) return;
    if (rd.chip && rd.ratio > 0.08) rdHideChip();
    if (rd.ratio < 0.03 || rd.ratio > 0.97) delete READPOS[id]; else READPOS[id] = { r: Math.round(rd.ratio * 1000) / 1000, t: Date.now() };
    var ks = Object.keys(READPOS); if (ks.length > 120) ks.sort(function (a, b) { return READPOS[a].t - READPOS[b].t; }).slice(0, ks.length - 120).forEach(function (k) { delete READPOS[k]; });
    Store.set('readpos', READPOS);
  }, 500);
}
window.addEventListener('scroll', function () { if (rd && !rd.raf) rd.raf = requestAnimationFrame(function () { if (rd) rd.raf = 0; rdUpdate(); }); }, { passive: true });
window.addEventListener('resize', function () { rdUpdate(); });
function rdScrollToRatio(r) {
  var top = rd.wrap.getBoundingClientRect().top + window.scrollY, span = Math.max(1, rd.wrap.offsetHeight - window.innerHeight * 0.5);
  window.scrollTo({ top: top + r * span - window.innerHeight * 0.5, behavior: DS.motionOK() ? 'smooth' : 'auto' });
}
function rdResumeChip(r) {
  var c = document.createElement('div'); c.className = 'rd-resume';
  c.innerHTML = '<button type="button" class="ds-btn pri" data-rd-resume>Вернуться к месту, где остановился · ' + Math.round(r * 100) + '%</button><button type="button" class="ds-btn ghost" data-rd-x aria-label="Скрыть подсказку">×</button>';
  rd.art.appendChild(c); rd.chip = c;
  c.addEventListener('click', function (e) {
    if (e.target.closest('[data-rd-resume]')) { rdScrollToRatio(r); rdHideChip(); }
    else if (e.target.closest('[data-rd-x]')) { rdHideChip(); }
  });
  var id = rd.id; setTimeout(function () { if (rd && rd.id === id) rdHideChip(); }, 15000);
}
function rdHideChip() { if (rd && rd.chip) { var c = rd.chip; rd.chip = null; if (c.parentNode) c.parentNode.removeChild(c); } }

/* ---------- «Запустить» в мини-IDE: только для фрагментов, которые реально запускаются ---------- */
var RD_RUN = {};
function rdIdle(fn) { if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 500 }); else setTimeout(fn, 40); }
var rdModal = null;
function rdRunButtons(root) {
  var blocks = $$('.code', root).filter(function (c) { var l = $('.code-lang', c); return l && /^C#$/i.test(l.textContent.trim()); });
  if (!blocks.length) return;
  var q = blocks.slice(), id = rd ? rd.id : '';
  function step() {
    var c = q.shift(); if (!c || !c.isConnected) return;
    var src = $('pre', c).textContent, ok = RD_RUN[src];
    var canRun = /Console\./.test(src) && !c.hasAttribute('data-norun');
    if (ok === undefined && !canRun) ok = false;
    else if (ok === undefined) { try { var r = CS.run(src, { timeLimit: 1500 }); ok = RD_RUN[src] = !!r.ok && !(r.errors && r.errors.length) && !r.fatal; } catch (e) { ok = RD_RUN[src] = false; } }
    if (!canRun) ok = false;
    if (!ok && !$('.rd-norun', c)) {
      var nb = document.createElement('span'); nb.className = 'rd-norun'; nb.textContent = 'не запускается в браузерной IDE';
      nb.title = 'Фрагмент не укладывается в подмножество C#, которое понимает встроенный интерпретатор. Запускай его в своей среде (dotnet run).';
      var hh = $('.code-h', c); hh.insertBefore(nb, $('.copy', hh));
    }
    if (ok && !$('.rd-run', c)) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rd-run'; b.textContent = 'Запустить';
      var h = $('.code-h', c); h.insertBefore(b, $('.copy', h));
    }
    if (q.length) rdIdle(step);
  }
  rdIdle(step); void id;
}
function rdOpenRun(src) {
  if (!rdModal) {
    rdModal = DS.modal({ title: 'Мини-IDE', html: '<label class="sr-only" for="rdSrc">Код</label><textarea id="rdSrc" class="rd-src ds-input" spellcheck="false" rows="12"></textarea><div class="row"><button class="ds-btn pri" type="button" id="rdGo">Запустить</button><button class="ds-btn ghost" type="button" data-ds-close>Закрыть</button></div><pre class="rd-out" id="rdOut" aria-live="polite"></pre>' });
    rdModal.el.addEventListener('click', function (e) {
      if (!e.target.closest('#rdGo')) return;
      var out = $('#rdOut'), r;
      try { r = CS.run($('#rdSrc').value, { timeLimit: 3000 }); } catch (ex) { r = { out: '', errors: [], fatal: 'Внутренняя ошибка: ' + ex.message }; }
      var txt = r.out || '';
      if (r.errors && r.errors.length) txt += (txt ? '\n' : '') + r.errors.slice(0, 3).map(function (x) { return (x.line ? 'строка ' + x.line + ': ' : '') + x.msg; }).join('\n');
      if (r.fatal) txt += (txt ? '\n' : '') + r.fatal;
      out.textContent = txt || '(нет вывода)'; out.classList.toggle('err', !!(r.errors && r.errors.length || r.fatal));
    });
  }
  $('#rdSrc').value = src; $('#rdOut').textContent = ''; rdModal.open(); setTimeout(function () { $('#rdGo').click(); }, 50);
}
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('.rd-run'); if (!b) return;
  rdOpenRun($('pre', b.closest('.code')).textContent);
});
