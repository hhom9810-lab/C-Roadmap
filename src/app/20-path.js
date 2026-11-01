/* ===================== СТРАНИЦА «ПУТЬ» (Этап 3): дерево, дорожка, фильтры, панель узла ===================== */
var META = /*{{META}}*/;
var NODES = Store.get('nodes', {}) || {};                 // явный выбор пользователя: pid → todo|progress|done|skipped
var PATH_FINISH = { n: 8, title: 'Финиш', focus: 'Портфолио, риски, итог', m: [24, 24], ratio: '' };
var NODE_TYPES = { req: 'Обязательная тема', opt: 'Дополнительная тема', practice: 'Практика', project: 'Проект', check: 'Чекпойнт фазы' };
var NODE_TAG = { req: 'Обязательная', opt: 'Дополнительная', practice: 'Практика', project: 'Проект', check: 'Чекпойнт' };
var ST_LABEL = { todo: 'Не начата', progress: 'В процессе', done: 'Пройдена', skipped: 'Пропущена' };
var ST_GLYPH = { todo: '', progress: '', done: '✓', skipped: '↷' };
var PV = { view: 'tree', phase: 0, filt: { status: 'all', req: false }, route: null, flash: null, drawer: null, openId: null };

function phInfo(n) { return n <= 7 ? PHASES[n] : PATH_FINISH; }
function pathPages(n) {
  var list = n <= 7 ? phasePages(n) : pages.filter(function (p) { return !p.phase && p.group === 'end'; });
  return list.filter(function (p) { return p.kind !== 'overview'; }).concat(list.filter(function (p) { return p.kind === 'overview'; }));   // чекпойнт — в конце фазы
}
function nodeType(p) {
  if (p.kind === 'overview') return 'check';
  if (p.kind === 'project') return 'project';
  if (p.kind === 'practice' || p.kind === 'tool') return 'practice';
  return META.optional.indexOf(p.id) >= 0 ? 'opt' : 'req';
}
function nodeTitle(p) { return p.kind === 'overview' ? 'Чекпойнт фазы ' + p.phase : p.nav; }
function doneIdOf(p) { return p.id + '.' + DONE_HASH; }

/* ---------- статусы ---------- */
function derivedStatus(p) {
  var q = pageProgress(p);
  if (p.kind === 'overview') { var st = phaseStat(p.phase); return st.closed ? 'done' : (st.cd > 0 || visited[p.id]) ? 'progress' : 'todo'; }
  if (p.kind === 'topic') { if (cb[doneIdOf(p)]) return 'done'; }
  else if (q.t && q.d === q.t) return 'done';
  return (q.d > 0 || visited[p.id]) ? 'progress' : 'todo';
}
function statusOf(p) {
  var o = NODES[p.id], d = derivedStatus(p);
  if (o === 'skipped' || o === 'done') return o;
  if (d === 'done') return 'done';
  return o || d;
}
function finished(st) { return st === 'done' || st === 'skipped'; }
function toggleDoneBox(id, on) {      // настоящий чекбокс + событие change: так начисляются XP, карточки и закрытие фазы, как на странице темы
  var inp = document.createElement('input'); inp.type = 'checkbox'; inp.setAttribute('data-cb', id); inp.hidden = true;
  document.body.appendChild(inp); inp.checked = on; inp.dispatchEvent(new Event('change', { bubbles: true })); document.body.removeChild(inp);
}
function setStatus(p, st) {
  var wasDone = statusOf(p) === 'done';
  if (p.kind === 'topic') {
    var id = doneIdOf(p), isOn = !!cb[id];
    if (st === 'done' && !isOn) toggleDoneBox(id, true);
    else if (st !== 'done' && isOn) toggleDoneBox(id, false);
    if (st === 'done') delete NODES[p.id]; else NODES[p.id] = st;
  } else NODES[p.id] = st;
  Store.set('nodes', NODES);
  if (st === 'done' && !wasDone) PV.flash = p.id;
}
function lockedByCheckboxes(p) { return p.kind !== 'topic' && derivedStatus(p) === 'done'; }   // галочки на странице сильнее кнопки: снимаются там же

/* ---------- модель узлов ---------- */
function depsOf(p) {
  var m = META.deps[p.id];
  if (m) return m.map(function (id) { return byId[id]; }).filter(Boolean);
  var list = pathPages(p.phase || 8), type = nodeType(p), i = list.indexOf(p);
  if (type === 'check' || type === 'project') return list.filter(function (x) { return x !== p && nodeType(x) === 'req'; });
  if (type === 'practice') return [];
  for (var j = i - 1; j >= 0; j--) if (nodeType(list[j]) === 'req') return [list[j]];
  return [];
}
function buildNodes() {
  var phases = [];
  for (var n = 1; n <= 8; n++) {
    var nodes = pathPages(n).map(function (p) {
      var type = nodeType(p), st = statusOf(p), q = pageProgress(p), deps = depsOf(p);
      var open = deps.filter(function (d) { return !finished(statusOf(d)); });
      return { p: p, id: p.id, type: type, status: st, pct: st === 'done' ? 100 : pct(q.d, q.t), deps: deps, open: open, locked: st === 'todo' && open.length > 0, cur: false, labs: (p.labs || []).length };
    });
    var core = nodes.filter(function (x) { return x.type !== 'opt'; });
    phases.push({ n: n, info: phInfo(n), nodes: nodes, total: core.length, done: core.filter(function (x) { return finished(x.status); }).length, closed: n <= 7 && phaseStat(n).closed });
  }
  var cur = currentNodePage(phases);
  phases.forEach(function (ph) { ph.nodes.forEach(function (x) { x.cur = cur === x.p; }); });
  phases.cur = cur;
  return phases;
}
/* единая «текущая тема» для «Сегодня» и «Пути»: последняя открытая незавершённая в первой незакрытой фазе, иначе первая незавершённая */
function currentNodePage(phases) {
  phases = phases || buildNodes();
  for (var i = 0; i < phases.length; i++) {
    var todo = phases[i].nodes.filter(function (x) { return x.type !== 'opt' && !finished(x.status); });
    if (!todo.length) continue;
    var best = null, bt = 0;
    todo.forEach(function (x) { if (visited[x.id] && visited[x.id] > bt && x.p.kind !== 'overview') { bt = visited[x.id]; best = x; } });
    return (best || todo[0]).p;
  }
  return null;
}
function firstPara(p) {
  if (p._desc !== undefined) return p._desc;
  var d = document.createElement('div'); d.innerHTML = p.html;
  var el = d.querySelector('.co.why .co-b p') || d.querySelector('.co-b p') || d.querySelector('p');
  var t = el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  p._desc = t.length > 260 ? t.slice(0, 257).replace(/\s+\S*$/, '') + '…' : t;
  return p._desc;
}

/* ---------- календарь (из прежней «Карты пути») ---------- */
function calState() {
  var start = Store.get('start', ''), r = { start: start, m: null, ph: null };
  if (start) { var sd = new Date(start + 'T00:00:00'); if (!isNaN(sd)) { r.m = Math.floor((Date.now() - sd.getTime()) / (864e5 * 30.44)) + 1; r.ph = r.m < 1 ? 0 : phaseOfMonth(Math.min(r.m, 24)); } }
  return r;
}
function calMessage(c, curPhase) {
  if (!c.start) return 'Укажи дату старта — страница покажет, где ты должен быть по календарю, и сравнит с тем, где ты есть.';
  if (c.m === null) return 'Не удалось разобрать дату.';
  if (c.m < 1) return 'Старт ещё впереди.';
  var msg = 'По календарю идёт месяц <b>' + c.m + '</b> из 24 → <b>Фаза ' + c.ph + '</b>. ', eff = Math.min(curPhase, 7);
  if (curPhase > 7) msg += 'Все фазы закрыты по критериям.';
  else if (eff < c.ph) msg += 'Ты на Фазе ' + eff + ': отставание на ' + (c.ph - eff) + ' ' + plural(c.ph - eff, 'фазу', 'фазы', 'фаз') + '. Не перескакивай критерии: срезай глубину (правило 20 минут), а не проверки.';
  else if (eff === c.ph) msg += 'Идёшь по графику.';
  else msg += 'Опережаешь график на ' + (eff - c.ph) + ' ' + plural(eff - c.ph, 'фазу', 'фазы', 'фаз') + '. Проверь, что критерии закрыты честно, а не «в целом понял».';
  if (c.m > 24) msg += ' Плановые 24 месяца прошли — это нормально, если идёт поиск работы.';
  return msg;
}
function calHTML() {
  var c = calState();
  return '<p class="cal-msg" id="calMsg">' + calMessage(c, currentPhase()) + '</p><div class="cal-row"><label for="startDate">Дата старта</label><input class="ds-input" type="date" id="startDate" value="' + esc(c.start) + '">' +
    '<button class="ds-btn sec sm" type="button" data-start="today">Сегодня</button>' + (c.start ? '<button class="ds-btn ghost sm" type="button" data-start="clear">Убрать</button>' : '') + '</div>';
}
function calShort() {
  var c = calState();
  if (!c.start || c.m === null) return 'Календарь не задан';
  if (c.m < 1) return 'Старт ещё впереди';
  var cp = Math.min(currentPhase(), 7), t = 'Месяц ' + Math.min(c.m, 24) + ' из 24 · по календарю фаза ' + c.ph;
  return t + (currentPhase() > 7 ? '' : cp < c.ph ? ' · отставание' : cp === c.ph ? ' · по графику' : ' · опережение');
}

/* ---------- HTML ---------- */
function stateText(x) { return ST_LABEL[x.status] + (x.cur ? ', текущая' : '') + (x.locked ? ', закрыта: сначала ' + x.open.map(function (d) { return d.nav; }).join(', ') : ''); }
function visibleNode(x) {
  if (PV.filt.req && x.type === 'opt') return false;
  return PV.filt.status === 'all' || x.status === PV.filt.status;
}
function nodeButton(x) {
  var meta = '<span class="pt-ty">' + NODE_TAG[x.type] + '</span>' + (x.p.est ? '<span>' + esc(x.p.est) + '</span>' : '') +
    (x.cur ? '<span class="pt-here">Ты здесь</span>' : '') + (x.locked ? '<span class="pt-lock" title="Сначала: ' + esc(x.open.map(function (d) { return d.nav; }).join(', ')) + '">🔒 сначала ' + esc(x.open[0].nav) + (x.open.length > 1 ? ' и ещё ' + (x.open.length - 1) : '') + '</span>' : '');
  return '<button type="button" class="pt-node t-' + x.type + ' s-' + x.status + (x.cur ? ' cur' : '') + (x.locked ? ' lock' : '') + '" data-nid="' + x.id + '" aria-haspopup="dialog">' + '<span class="sr-only">' + esc(stateText(x)) + '. </span>' +
    '<span class="pt-t">' + esc(nodeTitle(x.p)) + '</span><span class="pt-m">' + meta + '</span>' + (x.pct > 0 && x.status !== 'done' ? DS.bar(x.pct, { thin: true, label: 'Прогресс' }) : '') + '</button>';
}
function markerButton(x) {
  var next = x.status === 'todo' ? 'В процессе' : x.status === 'progress' ? 'Пройдена' : 'Не начата';
  return '<button type="button" class="pt-mk s-' + x.status + (x.cur ? ' cur' : '') + '" data-cycle="' + x.id + '" data-fl="' + x.id + '" aria-label="Статус: ' + ST_LABEL[x.status].toLowerCase() + '. Нажми, чтобы выбрать: ' + next.toLowerCase() + '" title="' + ST_LABEL[x.status] + ' → ' + next + '"><span aria-hidden="true">' + ST_GLYPH[x.status] + '</span></button>';
}
function treeHTML(ph) {
  var rows = [], vis = ph.nodes.filter(visibleNode);
  vis.forEach(function (x) {
    if (x.type === 'opt' && rows.length) rows[rows.length - 1].side.push(x);
    else rows.push({ main: x, side: [] });
  });
  return '<ol class="pt-tree" style="--c:var(--ds-ph' + (ph.n <= 7 ? ph.n : 7) + ')">' + rows.map(function (r) {
    return '<li class="pt-row' + (r.side.length ? ' has-side' : '') + '">' + markerButton(r.main) + '<div class="pt-main">' + nodeButton(r.main) + '</div>' +
      (r.side.length ? '<div class="pt-side">' + r.side.map(function (s) { return '<div class="pt-opt">' + markerButton(s) + nodeButton(s) + '</div>'; }).join('') + '</div>' : '') + '</li>';
  }).join('') + '</ol>';
}
var TK_DX = [0, 48, 76, 48, 0, -48, -76, -48], TK_ROW = 116;
function trackGlyph(x, i) {
  if (x.status === 'done') return '✓';
  if (x.status === 'skipped') return '↷';
  if (x.locked) return '🔒';
  return { project: '★', check: '⚑', practice: '✎', opt: '+' }[x.type] || String(i + 1);
}
function trackHTML(ph) {
  var vis = ph.nodes.filter(visibleNode), W = 360, h = vis.length * TK_ROW + 150, pts = vis.map(function (x, i) { return { x: W / 2 + TK_DX[i % 8], y: 44 + i * TK_ROW }; });
  var chestY = 44 + vis.length * TK_ROW + 20, svg = '';
  for (var i = 0; i < vis.length; i++) {
    var a = pts[i], b = i + 1 < vis.length ? pts[i + 1] : { x: W / 2, y: chestY + 10 }, my = (a.y + b.y) / 2, on = finished(vis[i].status);
    svg += '<path class="' + (on ? 'on' : '') + '" d="M' + a.x + ',' + a.y + ' C' + a.x + ',' + my + ' ' + b.x + ',' + my + ' ' + b.x + ',' + b.y + '"/>';
  }
  var nodes = vis.map(function (x, i) {
    return '<button type="button" class="tk-node t-' + x.type + ' s-' + x.status + (x.cur ? ' cur' : '') + (x.locked ? ' lock' : '') + '" data-nid="' + x.id + '" data-fl="' + x.id + '" style="left:' + pts[i].x + 'px;top:' + pts[i].y + 'px;--p:' + x.pct + '" aria-haspopup="dialog">' + '<span class="sr-only">' + esc(stateText(x)) + '. </span>' +
      '<span class="tk-c" aria-hidden="true">' + trackGlyph(x, i) + '</span><span class="tk-l">' + (x.cur ? '<em>Ты здесь</em>' : '') + esc(nodeTitle(x.p)) + '</span></button>';
  }).join('');
  var chest = ph.n <= 7 ? '<button type="button" class="tk-chest' + (ph.closed ? ' open' : '') + '" data-chest="' + ph.n + '" style="left:' + W / 2 + 'px;top:' + chestY + 'px" aria-label="Награда за фазу ' + ph.n + (ph.closed ? ': открыта' : ': закрыта, закрой критерии фазы') + '"><span class="tk-c" aria-hidden="true">' + (ph.closed ? '🏆' : '🎁') + '</span><span class="tk-l">' + (ph.closed ? 'Фаза закрыта' : 'Награда за фазу') + '</span></button>' : '';
  return '<div class="tk" style="--c:var(--ds-ph' + (ph.n <= 7 ? ph.n : 7) + ');height:' + h + 'px"><svg class="tk-svg" viewBox="0 0 ' + W + ' ' + h + '" width="' + W + '" height="' + h + '" aria-hidden="true">' + svg + '</svg>' + nodes + chest + '</div>';
}
function phaseHead(ph) {
  var pc = pct(ph.done, ph.total);
  return '<header class="pt-ph-h"><span class="ds-ph" data-p="' + (ph.n <= 7 ? ph.n : 7) + '" aria-hidden="true"></span><div class="pt-ph-t"><h2>' + (ph.n <= 7 ? 'Фаза ' + ph.n + '. ' : '') + esc(ph.info.title) + '</h2><small>' + (ph.n <= 7 ? 'Мес. ' + ph.info.m[0] + '–' + ph.info.m[1] + ' · ' + esc(ph.info.focus) + ' · теория / практика / проекты ' + ph.info.ratio : esc(ph.info.focus)) + '</small></div>' +
    '<div class="pt-ph-s"><span>' + ph.done + ' из ' + ph.total + '</span>' + DS.bar(pc, { thin: true, label: 'Прогресс фазы', color: 'var(--ds-ph' + (ph.n <= 7 ? ph.n : 7) + ')' }) + '</div></header>';
}
function pathHTML(phases, r) {
  var sel = PV.phase, vis = sel ? phases.filter(function (p) { return p.n === sel; }) : phases, cur = phases.cur;
  var tot = 0, dn = 0; phases.forEach(function (p) { tot += p.total; dn += p.done; });
  var tabs = '<a class="ds-tab" href="' + hashOf({ view: 'path', id: '', query: PV.qs }) + '"' + (!sel ? ' aria-current="page"' : '') + '>Все</a>' + phases.map(function (p) {
    var pc = pct(p.done, p.total), here = cur && (cur.phase || 8) === p.n;
    return '<a class="ds-tab" href="' + hashOf({ view: 'path', id: String(p.n), query: PV.qs }) + '"' + (sel === p.n ? ' aria-current="page"' : '') + ' title="' + esc(p.info.title) + ' · ' + pc + '%"><span class="ds-ph" data-p="' + (p.n <= 7 ? p.n : 7) + '" aria-hidden="true"></span>' + (p.n <= 7 ? p.n : 'Финиш') + (p.n <= 7 ? '<span class="pt-tab-t"> ' + esc(p.info.title.split(/[,:]/)[0]) + '</span>' : '') + (here ? '<span class="pt-here-dot" title="Ты здесь" aria-label="Ты здесь"></span>' : '') + '</a>';
  }).join('');
  var f = PV.filt, stBtn = function (v, t) { return '<button type="button" class="ds-chip-btn" data-fs="' + v + '" aria-pressed="' + (f.status === v) + '">' + t + '</button>'; };
  var h = '<div class="path" data-view="' + PV.view + '">' +
    '<div class="pt-top"><div><h1 class="page-title">Путь</h1><p class="pt-sub">' + dn + ' из ' + tot + ' шагов · ' + pct(dn, tot) + '% · <button type="button" class="linklike" id="ptCal">' + esc(calShort()) + '</button></p></div>' +
    '<div class="ds-seg" role="group" aria-label="Вид"><button type="button" data-view-set="tree" aria-pressed="' + (PV.view === 'tree') + '">Дерево</button><button type="button" data-view-set="track" aria-pressed="' + (PV.view === 'track') + '">Дорожка</button></div></div>' +
    '<nav class="ds-tabs pt-tabs" aria-label="Фазы">' + tabs + '</nav>' +
    '<div class="pt-filters" role="group" aria-label="Фильтры">' + stBtn('all', 'Все') + stBtn('todo', 'Не начаты') + stBtn('progress', 'В процессе') + stBtn('done', 'Пройдены') + stBtn('skipped', 'Пропущены') +
    '<label class="pt-req"><input type="checkbox" data-freq' + (f.req ? ' checked' : '') + '> Только обязательное</label></div>';
  var shown = 0;
  vis.forEach(function (ph) {
    var inner = PV.view === 'track' ? trackHTML(ph) : treeHTML(ph), cnt = ph.nodes.filter(visibleNode).length; shown += cnt;
    if (!cnt && (f.status !== 'all' || f.req)) return;
    h += '<section class="pt-phase" id="ph-' + ph.n + '" aria-labelledby="pth-' + ph.n + '">' + phaseHead(ph).replace('<h2>', '<h2 id="pth-' + ph.n + '">') + inner +
      (ph.n <= 7 ? '<p class="pt-ov"><a href="#/topic/p' + ph.n + '">Цели, границы и критерии фазы →</a></p>' : '') + '</section>';
  });
  if (!shown) h += '<div class="ds-card flat empty"><b>Ничего не найдено</b><p>Под выбранные фильтры не подходит ни один шаг.</p><button type="button" class="ds-btn sec" data-fclear>Сбросить фильтры</button></div>';
  h += '<aside class="pt-legend" aria-label="Обозначения"><b>Обозначения</b><ul>' +
    '<li><span class="pt-lg pt-lg-req"></span>Обязательная тема</li><li><span class="pt-lg pt-lg-opt"></span>Дополнительная</li><li><span class="pt-lg pt-lg-practice"></span>Практика</li><li><span class="pt-lg pt-lg-project"></span>Проект</li><li><span class="pt-lg pt-lg-check"></span>Чекпойнт фазы</li></ul><ul>' +
    '<li><span class="mk s-todo"></span>Не начата</li><li><span class="mk s-progress"></span>В процессе</li><li><span class="mk s-done">✓</span>Пройдена</li><li><span class="mk s-skipped">↷</span>Пропущена</li><li><span class="mk lockg">🔒</span>Сначала нужны другие темы (можно открыть и так)</li></ul></aside></div>';
  return h;
}

/* ---------- панель узла ---------- */
function nodeById(id) { var ph = PV.data; for (var i = 0; i < ph.length; i++) for (var k = 0; k < ph[i].nodes.length; k++) if (ph[i].nodes[k].id === id) return ph[i].nodes[k]; return null; }
function ensureDrawer() {
  if (PV.drawer) return PV.drawer;
  PV.drawer = DS.drawer({ title: 'Тема', footer: '<div class="nd-ft"></div>', onClose: function () { var id = PV.openId; PV.openId = null; setTimeout(function () { var el = id && document.querySelector('[data-nid="' + id + '"]'); if (el) el.focus(); }, 0); } });
  PV.drawer.el.classList.add('nd');
  PV.drawer.el.addEventListener('click', function (e) {
    var s = e.target.closest('[data-st]'), d = e.target.closest('[data-dep]'), a = e.target.closest('a[href^="#/"]'), t = e.target.closest('[data-toggle-done]');
    var x = PV.openId && nodeById(PV.openId);
    if (s && x && !s.disabled) { setStatus(x.p, s.getAttribute('data-st')); repaint(); }
    else if (t && x) { setStatus(x.p, statusOf(x.p) === 'done' ? 'todo' : 'done'); repaint(); }
    else if (d) { openNode(d.getAttribute('data-dep')); }
    else if (a) { PV.openId = null; PV.drawer.close(); }
  });
  return PV.drawer;
}
function drawerHTML(x) {
  var p = x.p, st = x.status, lockedBox = lockedByCheckboxes(p), desc = firstPara(p), nLabs = (p.labs || []).length;
  var h = '<div class="nd-chips"><span class="ds-chip ' + (x.type === 'req' ? 'req' : '') + '">' + NODE_TYPES[x.type] + '</span>' + DS.chip(st) + (x.cur ? '<span class="ds-chip progress">Ты здесь</span>' : '') + '</div>';
  h += '<dl class="nd-meta"><div><dt>Фаза</dt><dd>' + (p.phase ? p.phase + ' · ' + esc(phInfo(p.phase).title) : 'Финиш') + '</dd></div>' + (p.est ? '<div><dt>Оценка времени</dt><dd>' + esc(p.est) + '</dd></div>' : '') +
    (nLabs ? '<div><dt>Практика</dt><dd>' + nLabs + ' ' + plural(nLabs, 'блок', 'блока', 'блоков') + ' в закреплении</dd></div>' : '') + '</dl>';
  if (desc) h += '<p class="nd-desc">' + esc(desc) + '</p>';
  if (x.deps.length) {
    h += '<h3 class="nd-h">' + (x.open.length ? 'Сначала пройди' : 'Зависит от') + '</h3><ul class="nd-deps">' + x.deps.map(function (d) {
      var ds = statusOf(d); return '<li><button type="button" class="linklike" data-dep="' + d.id + '">' + esc(nodeTitle(d)) + '</button> ' + DS.chip(ds === 'done' ? 'done' : ds === 'skipped' ? 'skipped' : 'todo', ST_LABEL[ds]) + '</li>';
    }).join('') + '</ul>' + (x.open.length ? '<p class="nd-note">Это рекомендация, а не замок: тему можно открыть в любом порядке.</p>' : '');
  }
  h += '<h3 class="nd-h">Статус</h3><div class="ds-seg nd-seg" role="group" aria-label="Статус">' + ['todo', 'progress', 'done', 'skipped'].map(function (k) {
    return '<button type="button" data-st="' + k + '" aria-pressed="' + (st === k) + '"' + (lockedBox && k !== 'done' && k !== 'skipped' ? ' disabled' : '') + '>' + ST_LABEL[k] + '</button>';
  }).join('') + '</div>' + (lockedBox ? '<p class="nd-note">Все пункты на странице отмечены. Чтобы вернуть статус «В процессе», сними галочки на самой странице.</p>' : '');
  return h;
}
function footerHTML(x) {
  var p = x.p, isDone = x.status === 'done';
  return '<a class="ds-btn pri" href="#/topic/' + p.id + '">' + (p.kind === 'overview' ? 'Открыть чекпойнт' : 'Открыть тему') + '</a>' +
    (x.labs ? '<a class="ds-btn sec" href="#/practice/' + p.id + '">Практика</a>' : '') +
    (lockedByCheckboxes(p) ? '' : '<button type="button" class="ds-btn ghost" data-toggle-done>' + (isDone ? 'Снять отметку' : 'Отметить пройденным') + '</button>');
}
function openNode(id) {
  var x = nodeById(id); if (!x) return;
  var dr = ensureDrawer(); PV.openId = id;
  dr.setTitle(nodeTitle(x.p)); dr.setContent(drawerHTML(x)); dr.el.querySelector('.nd-ft').innerHTML = footerHTML(x);
  if (!dr.isOpen()) dr.open();
}

/* ---------- отрисовка ---------- */
function celebrate(phases) {
  var seen = Store.get('pathSeen', null), first = !seen; if (!seen) seen = { n: {}, p: {} };
  var fresh = [], closedNow = [];
  phases.forEach(function (ph) {
    ph.nodes.forEach(function (x) { if (x.status === 'done' && !seen.n[x.id]) { seen.n[x.id] = 1; fresh.push(x.id); } });
    if (ph.closed && !seen.p[ph.n]) { seen.p[ph.n] = 1; closedNow.push(ph.n); }
  });
  Store.set('pathSeen', seen);
  if (first) return;
  fresh.forEach(function (id) { var el = document.querySelector('[data-fl="' + id + '"]'); if (el) DS.flash(el); });
  if (closedNow.length && DS.motionOK()) { labBurst(); DS.toast('Фаза ' + closedNow[0] + ' закрыта', { kind: 'ok' }); }
}
function renderPath(r, keep) {
  PV.route = r;
  var q = /(?:^|&)view=(tree|track)(?:&|$)/.exec(r.query || '');
  PV.view = q ? q[1] : Store.get('pathView', 'tree'); if (PV.view !== 'track') PV.view = 'tree';
  PV.qs = q ? 'view=' + PV.view : '';
  PV.phase = r.id ? +r.id : 0;
  PV.data = buildNodes();
  var y = window.scrollY;
  renderCustom('Путь', pathHTML(PV.data, r), keep);
  if (keep) window.scrollTo(0, y);
  if (PV.flash) { var el = document.querySelector('[data-fl="' + PV.flash + '"]'); if (el) DS.flash(el); PV.flash = null; }
  celebrate(PV.data);
  if (!keep && !PV.phase) { var cn = document.querySelector('.pt-node.cur,.tk-node.cur'); if (cn && cn.scrollIntoView && window.innerWidth < 760) cn.scrollIntoView({ block: 'center' }); }
}
function repaint() {
  var open = PV.openId;
  renderPath(PV.route, true);
  if (open) { var x = nodeById(open); if (x) { PV.openId = open; PV.drawer.setContent(drawerHTML(x)); PV.drawer.el.querySelector('.nd-ft').innerHTML = footerHTML(x); } }
}
function cycleStatus(id) {
  var x = nodeById(id); if (!x || lockedByCheckboxes(x.p) && x.status === 'done') return;
  setStatus(x.p, x.status === 'todo' ? 'progress' : x.status === 'progress' ? 'done' : 'todo');
  repaint();
  var m = document.querySelector('[data-cycle="' + id + '"]'); if (m) m.focus();
}

/* ---------- события (делегирование на #content, ставится один раз) ---------- */
$('#content').addEventListener('click', function (e) {
  var root = e.target.closest('.path'); if (!root) return;
  var t;
  if ((t = e.target.closest('[data-cycle]'))) { cycleStatus(t.getAttribute('data-cycle')); return; }
  if ((t = e.target.closest('[data-nid]'))) { openNode(t.getAttribute('data-nid')); return; }
  if ((t = e.target.closest('[data-view-set]'))) { var v = t.getAttribute('data-view-set'); Store.set('pathView', v); location.hash = hashOf({ view: 'path', id: PV.phase ? String(PV.phase) : '', query: 'view=' + v }); return; }
  if ((t = e.target.closest('[data-fs]'))) { PV.filt.status = t.getAttribute('data-fs'); repaint(); var b = document.querySelector('[data-fs="' + PV.filt.status + '"]'); if (b) b.focus(); return; }
  if (e.target.closest('[data-fclear]')) { PV.filt = { status: 'all', req: false }; repaint(); return; }
  if ((t = e.target.closest('[data-chest]'))) {
    var n = +t.getAttribute('data-chest'), ph = PV.data[n - 1];
    if (!ph.closed) DS.toast('Награда откроется, когда на странице-чекпойнте будут отмечены все критерии фазы ' + n);
    else { var got = G.award('phase:' + n, 100, 'фаза ' + n + ' закрыта'); if (got) { if (DS.motionOK()) labBurst(); } else DS.toast('Награда за фазу ' + n + ' уже получена'); }
    return;
  }
  if (e.target.closest('#ptCal')) openCalendar();
});
$('#content').addEventListener('change', function (e) {
  if (e.target.matches && e.target.matches('[data-freq]')) { PV.filt.req = e.target.checked; repaint(); var c = document.querySelector('[data-freq]'); if (c) c.focus(); }
});
var calModal = null;
function openCalendar() {
  if (!calModal) {
    calModal = DS.modal({ title: 'Календарь старта', html: '<div id="calBody"></div><div class="row"><button class="ds-btn pri" data-ds-close type="button">Готово</button></div>', onClose: function () { if (PV.route && PV.route.view === 'path') repaint(); } });
    calModal.el.addEventListener('click', function (e) {
      var s = e.target.closest('[data-start]'); if (!s) return;
      if (s.getAttribute('data-start') === 'today') Store.set('start', todayISO()); else Store.del('start');
      $('#calBody').innerHTML = calHTML();
    });
    calModal.el.addEventListener('change', function (e) { if (e.target.id === 'startDate') { if (e.target.value) Store.set('start', e.target.value); else Store.del('start'); $('#calBody').innerHTML = calHTML(); } });
  }
  $('#calBody').innerHTML = calHTML(); calModal.open();
}
