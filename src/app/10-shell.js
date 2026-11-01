/* ===================== ОБОЛОЧКА (Этап 2): маршруты, «Сегодня», меню «⋯», поиск, вид ===================== */

/* ---------- маршруты: новые адреса + редирект старых ---------- */
var HELP_IDS = { how: 1, calibration: 1, structure: 1, lab: 1, 'rabbit-holes': 1 };
var HELP_LIST = [
  ['how', 'Как пользоваться и как учиться', 'Режим занятий и цикл одной темы'],
  ['calibration', 'Калибровка и правило 20 минут', 'Как не провалиться в кроличью нору'],
  ['structure', 'Общая структура пути', 'Семь фаз и критерии их закрытия'],
  ['rabbit-holes', 'Если застрял: блокнот кроличьих нор', 'Запиши вопрос и вернись к фазе'],
  ['jobs', 'Трекер откликов', 'Воронка откликов на вакансии'],
  ['lab', 'Лаборатория: как играть', 'Квизы, IDE, тикеты, XP и ранги']
];
function hashOf(r) {
  var h = r.view;
  if (r.view === 'path') h += r.id ? '/' + r.id : '';
  else if (r.view === 'topic') h += '/' + r.id + (r.sec ? '/' + r.sec : '');
  else if (r.view === 'practice') h += '/' + r.id;
  else if (r.view === 'ref') h += (r.id ? '/' + r.id : '') + (r.entry ? '/' + r.entry : '') + (r.entry && r.sec ? '/' + r.sec : '');
  else if (r.view === 'profile' || r.view === 'help') h += r.id ? '/' + r.id : '';
  return '#/' + h + (r.query ? '?' + r.query : '');
}
function routeForPage(id, sec) {
  var p = byId[id];
  if (!p || id === 'home') return { view: 'today', id: '', sec: '', query: '' };
  if (id === 'path') return { view: 'path', id: '', sec: '', query: '' };
  if (id === 'profile') return { view: 'profile', id: '', sec: '', query: '' };
  if (id === 'review') return { view: 'profile', id: 'review', sec: '', query: '' };
  if (HELP_IDS[id]) return { view: 'help', id: id, sec: '', query: '' };
  if (p.kind === 'overview') return { view: 'path', id: String(p.phase), sec: '', query: '' };
  return { view: 'topic', id: id, sec: sec || '', query: '' };
}
function practiceQuery(p, query) {     // ?at=<lid блока>: начать сессию с этого блока
  var m = /(?:^|&)at=([\w.-]+)/.exec(query || '');
  return m && practiceLabs(p).some(function (l) { return l.id === m[1]; }) ? 'at=' + m[1] : '';
}
function canonicalRoute() {
  var raw = location.hash.replace(/^#\/?/, ''), query = '', qi = raw.indexOf('?');
  if (qi >= 0) { query = raw.slice(qi + 1); raw = raw.slice(0, qi); }
  var parts = raw.split('/').filter(function (x) { return x !== ''; }).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
  var a = parts[0] || '', b = parts[1] || '', c = parts[2] || '', r;
  if (a === 'today' || a === '' || a === 'home') r = { view: 'today', id: '', sec: '', query: '' };
  else if (a === 'path') r = { view: 'path', id: /^[1-8]$/.test(b) ? b : '', sec: '', query: /(?:^|&)view=(tree|track)(?:&|$)/.test(query) ? 'view=' + /view=(tree|track)/.exec(query)[1] : '' };
  else if (a === 'topic' || a === 'practice') {
    r = byId[b] ? (byId[b].kind === 'overview' ? { view: 'topic', id: b, sec: c, query: '' } : routeForPage(b, c)) : { view: 'today', id: '', sec: '', query: '' };
    if (a === 'practice' && r.view === 'topic' && readerPage(byId[b]) && practiceLabs(byId[b]).length) r = { view: 'practice', id: b, sec: '', query: practiceQuery(byId[b], query) };   // сессия практики (Этап 5) заменит этот режим
  }   // практика-сессия появится в Этапе 5
  else if (a === 'ref') r = refRoute(b, c, parts[3] || '');
  else if (a === 'profile') r = { view: 'profile', id: b === 'review' ? 'review' : '', sec: '', query: '' };
  else if (a === 'help') r = { view: 'help', id: (HELP_IDS[b] || b === 'jobs') ? b : '', sec: '', query: '' };
  else if (byId[a]) r = routeForPage(a, b);
  else r = { view: 'today', id: '', sec: '', query: '' };
  r.hash = hashOf(r);
  return r;
}
function markNav(view) {
  var sect = (view === 'topic' || view === 'practice') ? 'path' : view;
  $$('[data-nav]').forEach(function (a) { if (a.getAttribute('data-nav') === sect) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
function renderCustom(title, html, keep) {
  current = null;
  var c = $('#content');
  c.innerHTML = '<div class="page-grid"><article>' + html + '</article></div>';
  syncChecks(c); mountWidgets(c); syncLangButtons();
  document.title = title + ' · C# → Junior .NET';
  if (!keep) window.scrollTo(0, 0);
}
function showView(r) {
  sessionDestroy();
  var sameTopic = current && r.view === 'topic' && current.id === r.id && r.sec;
  if (sameTopic) { var el = document.getElementById('h-' + r.sec); if (el) { el.scrollIntoView(); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); return; } }
  if (r.view === 'today') { render('home'); document.title = 'Сегодня · C# → Junior .NET'; }
  else if (r.view === 'path') renderPath(r);
  else if (r.view === 'topic') render(r.id, r.sec);
  else if (r.view === 'practice') renderSession(byId[r.id], (/^at=(.+)$/.exec(r.query || '') || [])[1]);
  else if (r.view === 'profile') render(r.id === 'review' ? 'review' : 'profile');
  else if (r.view === 'help') {
    if (HELP_IDS[r.id]) render(r.id);
    else if (r.id === 'jobs') renderCustom('Трекер откликов', '<h1 class="page-title">Трекер откликов</h1><div class="widget" data-widget="jobs"></div>');
    else renderCustom('Помощь', '<h1 class="page-title">Помощь</h1><div class="help-list">' + HELP_LIST.map(function (h) { return '<a class="ds-card link" href="#/help/' + h[0] + '"><b>' + esc(h[1]) + '</b><small>' + esc(h[2]) + '</small></a>'; }).join('') + '</div>');
  }
  else if (r.view === 'ref') renderRef(r);
  markNav(r.view);
}

/* ---------- экран «Сегодня» ---------- */
function topicsOf(n) { return phasePages(n).filter(function (p) { return p.kind !== 'overview'; }); }
function nextTask(from) {
  var start = from ? pages.indexOf(from) : 0, i, k;
  for (i = Math.max(0, start); i < pages.length; i++) {
    var labs = pages[i].labs || [];
    for (k = 0; k < labs.length; k++) {
      if ((labs[k].type === 'ide' || labs[k].type === 'ticket') && labDone(labs[k]) === false) return { p: pages[i], d: LABDATA[labs[k].id] };
    }
  }
  return null;
}
WIDGETS.home = function (el) {
  var topic = currentNodePage(), n = topic ? (topic.phase || 8) : 8, nn = Math.min(n, 7), s = G.streak(), info = nextRankInfo(G.st.xp), due = Cards.due().length;
  var tot = totalStat(), h = '<div class="today">';
  h += '<p class="t-greet">Привет. ' + (s ? 'Серия: <b>' + s + ' ' + plural(s, 'день', 'дня', 'дней') + '</b> подряд.' : 'Серия начнётся с первого занятия.') + '</p>';
  if (topic) {
    var tl = pathPages(n).filter(function (x) { return x.kind === 'topic'; }), q = pageProgress(topic), pc = pct(q.d, q.t), fresh = !pc && !visited[topic.id], where;
    if (topic.kind === 'topic' && tl.indexOf(topic) >= 0) where = 'тема ' + (tl.indexOf(topic) + 1) + ' из ' + tl.length;
    else where = NODE_TAG[nodeType(topic)].toLowerCase();
    h += '<section class="ds-card hero t-continue" aria-labelledby="tcTitle"><div class="t-kicker">' + DS.phaseDot(nn) + '<span>' + (n <= 7 ? 'Фаза ' + n : 'Финиш') + ' · ' + where + '</span></div>' +
      '<h2 id="tcTitle">' + esc(topic.kind === 'overview' ? 'Чекпойнт фазы ' + n + ': итоговый тест и критерии' : topic.title) + '</h2>' +
      '<div class="t-meta">' + (topic.est ? '<span>≈ ' + esc(topic.est) + '</span>' : '') + '<span class="t-prog">' + DS.bar(pc, { label: 'Прогресс', color: 'var(--ds-ph' + nn + ')' }) + '</span><span>' + pc + '%</span></div>' +
      '<div class="t-btns"><a class="ds-btn pri lg" href="#/topic/' + topic.id + '">' + (fresh ? 'Начать' : 'Продолжить') + ' →</a><a class="ds-btn sec lg" href="#/path/' + n + '">Путь</a></div></section>';
  } else {
    h += '<section class="ds-card hero t-continue"><h2>Все шаги пути пройдены</h2><div class="t-meta"><span>Осталось довести до результата: резюме, профили, отклики.</span></div><div class="t-btns"><a class="ds-btn pri lg" href="#/topic/p7-applications">К откликам →</a><a class="ds-btn sec lg" href="#/path">Путь</a></div></section>';
  }
  h += '<div class="t-phases"><div class="ds-segbar">';
  for (var i = 1; i <= 7; i++) { var st = phaseStat(i), p2 = pct(st.d, st.t); h += '<a href="#/path/' + i + '" style="--p:' + p2 + ';--c:var(--ds-ph' + i + ')" aria-label="Фаза ' + i + ': ' + esc(PHASES[i].title) + ', ' + p2 + '%" title="Фаза ' + i + ' · ' + p2 + '%"></a>'; }
  h += '</div><small>7 фаз · пройдено ' + pct(tot.d, tot.t) + '%</small></div>';
  var task = nextTask(topic);
  h += '<div class="t-cards">' +
    '<a class="ds-card link t-mini' + (due ? ' hot' : '') + '" href="#/profile/review"><span class="t-ic" aria-hidden="true">🃏</span><b>' + due + '</b><small>' + (due ? plural(due, 'карточка', 'карточки', 'карточек') + ' на повторение сегодня' : 'Карточек на сегодня нет') + '</small><span class="t-act">' + (due ? 'Повторить' : 'Открыть') + '</span></a>' +
    (task ? '<a class="ds-card link t-mini" href="#/practice/' + task.p.id + '?at=' + task.d.lid + '"><span class="t-ic" aria-hidden="true">🎫</span><b>+' + task.d.xp + ' XP</b><small>' + esc(task.d.title) + '</small><span class="t-act">К заданию</span></a>'
          : '<div class="ds-card t-mini"><span class="t-ic" aria-hidden="true">🎫</span><b>—</b><small>Все практические задания пройдены</small></div>') +
    '<a class="ds-card link t-mini" href="#/profile"><span class="t-ic" aria-hidden="true">' + info.cur.ic + '</span><b>' + esc(info.cur.n) + '</b><small>' + (info.nx ? 'до «' + esc(info.nx.n) + '»: ' + info.left + ' XP' : 'максимальный ранг') + '</small>' + DS.bar(info.pc, { label: 'До следующего ранга', thin: true }) + '</a></div></div>';
  el.innerHTML = h;
};

/* ---------- меню «⋯» (drawer) ---------- */
var menu = DS.drawer({ title: 'Меню', label: 'Меню' });
(function () {
  var src = $('#menuSrc'), body = menu.body;
  while (src.firstChild) body.appendChild(src.firstChild);
  src.parentNode.removeChild(src);
  body.addEventListener('click', function (e) { if (e.target.closest('a[href^="#/"]')) menu.close(); });
  $('#moreBtn').addEventListener('click', function () { menu.open(); });
})();

/* ---------- яркая тема и анимации (ключи vibe, motion) ---------- */
var vibe = Store.get('vibe', 'calm'), motion = Store.get('motion', 'on');
function applyVibe() { if (vibe === 'neon') document.documentElement.setAttribute('data-vibe', 'neon'); else document.documentElement.removeAttribute('data-vibe'); $('#vibeChk').checked = vibe === 'neon'; }
function applyMotion() { if (motion === 'off') document.documentElement.setAttribute('data-motion', 'off'); else document.documentElement.removeAttribute('data-motion'); $('#motionChk').checked = motion !== 'off'; }
$('#vibeChk').addEventListener('change', function () { vibe = this.checked ? 'neon' : 'calm'; Store.set('vibe', vibe); applyVibe(); });
$('#motionChk').addEventListener('change', function () { motion = this.checked ? 'on' : 'off'; Store.set('motion', motion); applyMotion(); });

/* ---------- поиск: иконка → раскрывается; Ctrl+K, «/» ---------- */
function openSearch() { var sb = $('.search'); sb.classList.add('open'); $('#searchBtn').setAttribute('aria-expanded', 'true'); q.focus(); q.select(); if (q.value.trim().length >= 2) doSearch(q.value); }
$('#searchBtn').addEventListener('click', function () { if ($('.search').classList.contains('open')) closeSearch(); else openSearch(); });

/* ---------- таймер: чип в шапке, пока идёт отсчёт ---------- */
var _tick = tick;
tick = function () {
  _tick();
  var chip = $('#timerChip'), running = !!Store.get('timerEnd', 0);
  chip.hidden = !running; if (running) chip.textContent = '⏱ ' + $('#timerTxt').textContent;
};
