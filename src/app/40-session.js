/* ===================== СЕССИЯ ПРАКТИКИ (Этап 5) =====================
   Один шаг на экран: сверху полоса прогресса, «Выйти» и XP сессии; внизу панель обратной связи
   («Верно» / «Не совсем» + разбор) и кнопка «Дальше». Шаги берутся из тех же блоков страницы
   (quiz, ide, ticket, compare, legacy, interview, cards): виджеты монтируются как есть, проверка и
   начисление XP остаются в LABUI. Сессия лишь наблюдает за их DOM и состоянием G/LabState. */
var SX = null;
var SX_NAME = { quiz: 'Квиз', ide: 'Задача', ticket: 'Тикет', compare: 'Как надо / как не надо', legacy: 'Поиск багов', interview: 'Вопрос с собеседования', cards: 'Карточки' };

function sessionDestroy() {
  if (!SX) return;
  clearInterval(SX.tick); if (SX.mo) SX.mo.disconnect();
  document.documentElement.classList.remove('sx-open');
  SX = null;
}
function sxUnits(l) { var d = LABDATA[l.id]; return l.type === 'quiz' ? d.qs.length : 1; }
function sxPlain(html) { var d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); }

function renderSession(p, atLid) {
  sessionDestroy(); current = null;
  var labs = practiceLabs(p).filter(function (l) { return LABDATA[l.id]; });
  if (atLid) { var at = labs.map(function (l) { return l.id; }).indexOf(atLid); if (at > 0) labs = labs.slice(at); }
  var c = $('#content');
  if (!labs.length) { location.replace('#/topic/' + p.id); return; }
  document.title = 'Практика · ' + p.title + ' · C# → Junior .NET';
  c.innerHTML = '<main class="sx" aria-label="Практика: ' + esc(p.title) + '">' +
    '<div class="sx-top"><button type="button" class="sx-x" id="sxExit" aria-label="Выйти из практики"><span aria-hidden="true">×</span></button>' +
    '<div class="sx-bar" role="progressbar" aria-label="Прогресс практики" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>' +
    '<span class="sx-xp" id="sxXp" aria-live="off">+0 XP</span></div>' +
    '<div class="sx-body" id="sxBody"><div class="sx-step" id="sxStep"></div></div>' +
    '<div class="sx-foot" id="sxFoot" data-state="idle"><div class="sx-msg" id="sxMsg" role="status" aria-live="polite"></div>' +
    '<div class="sx-btns"><button type="button" class="ds-btn ghost lg" id="sxSkip">Пропустить</button><button type="button" class="ds-btn pri lg" id="sxNext">Дальше</button></div></div></main>';
  document.documentElement.classList.add('sx-open');
  window.scrollTo(0, 0);
  var total = 0; labs.forEach(function (l) { total += sxUnits(l); });
  SX = { p: p, labs: labs, k: -1, total: total, base: 0, xp0: G.st.xp || 0, t0: Date.now(), results: {}, skipped: {}, wrongQ: [], el: null, mo: null, fb: null, tick: 0, units: 0, canNext: false, last: 0 };
  SX.tick = setInterval(sxXp, 300);
  $('#sxExit').addEventListener('click', function () { location.hash = '#/topic/' + p.id; });
  $('#sxNext').addEventListener('click', sxNext);
  $('#sxSkip').addEventListener('click', function () { SX.skipped[SX.labs[SX.k].id] = 1; sxAdvance(); });
  sxOpen(0);
}

function sxXp() {
  if (!SX) return;
  var d = Math.max(0, (G.st.xp || 0) - SX.xp0), e = $('#sxXp'); if (!e) return;
  if (SX.last !== d) { e.textContent = '+' + d + ' XP'; if (d > SX.last) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } SX.last = d; }
}
function sxProgress() {
  var done = SX.base + (SX.units || 0), pc = SX.total ? Math.min(100, Math.round(done * 100 / SX.total)) : 0, bar = $('.sx-bar');
  if (!bar) return; bar.setAttribute('aria-valuenow', pc); $('i', bar).style.width = pc + '%';
}

function sxOpen(k) {
  if (SX.mo) { SX.mo.disconnect(); SX.mo = null; }
  var l = SX.labs[k], d = LABDATA[l.id], host = $('#sxStep');
  SX.k = k; SX.fb = null; SX.units = 0; SX.checked = false;
  host.innerHTML = '';
  var head = document.createElement('div'); head.className = 'sx-kicker';
  head.innerHTML = '<span>' + esc(SX_NAME[l.type] || l.type) + '</span><small>' + (k + 1) + ' из ' + SX.labs.length + '</small>';
  var el = document.createElement('div'); el.className = 'widget lab sx-w sx-' + l.type; el.setAttribute('data-widget', 'lab'); el.setAttribute('data-lab', l.type); el.setAttribute('data-lid', l.id);
  host.appendChild(head); host.appendChild(el);
  WIDGETS.lab(el); SX.el = el;
  $('#sxBody').scrollTop = 0; window.scrollTo(0, 0);
  if (l.type === 'quiz') { var st = $('[data-a="start"]', el); if (st) st.click(); }
  if (l.type === 'ide' || l.type === 'ticket') { var ck = $('[data-a="check"]', el); if (ck) ck.textContent = '✔ Проверить'; }
  el.addEventListener('click', function (e) { if (e.target.closest('[data-a="check"]')) SX.checked = true; }, true);
  el.addEventListener('input', function () { if (SX.fb && SX.fb.kind === 'bad') { SX.checked = false; SX.fb = null; sxPaint(); } });
  SX.mo = new MutationObserver(function () { sxSync(); });
  SX.mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
  sxSync(true);
  var h = $('.lab-h b, .jtitle, .iv-q', el); void h;
  try { head.tabIndex = -1; head.focus({ preventScroll: true }); } catch (e) { }
}

/* состояние блока → {units, fb, canNext, label, canSkip} */
function sxSync(first) {
  if (!SX || !SX.el) return;
  var l = SX.labs[SX.k], d = LABDATA[l.id], el = SX.el, ls = LabState.get(l.id), fb = null, units = 0, canNext = false, label = 'Дальше', canSkip = true, done = false;
  if (l.type === 'quiz') {
    var sub = $('.lab-sub', el), m = sub && /вопрос (\d+) из/.exec(sub.textContent), idx = m ? +m[1] - 1 : 0, res = $('.res', el), f = $('.qfb .fb', el);
    if (res) {
      units = d.qs.length; canNext = true; canSkip = false; done = true;
      var ring = $('.ring b', el); SX.results[l.id] = { ok: ring ? +ring.textContent : 0, n: d.qs.length, wrong: $$('.dots i.bad', el).map(function (x) { return $$('.dots i', el).indexOf(x); }) };
    } else if (f) {
      units = idx + 1; canNext = true; canSkip = false;
      var Q = d.qs[idx], ok = f.classList.contains('ok'), right = Q.opts.filter(function (o) { return o.ok; })[0], clone = f.cloneNode(true), b0 = $('b', clone); if (b0) b0.parentNode.removeChild(b0);
      fb = { kind: ok ? 'ok' : 'bad', title: ok ? 'Верно' : 'Не совсем', html: (ok ? '' : '<p class="sx-right"><b>Верный ответ:</b> ' + right.html + '</p>') + clone.innerHTML };
      label = idx + 1 < d.qs.length ? 'Дальше' : 'Результат';
    } else { units = idx; canNext = false; label = 'Выбери ответ'; canSkip = true; }
  } else if (l.type === 'ide' || l.type === 'ticket') {
    var solved = G.done('ide:' + l.id) || !!ls.solved;
    done = solved; units = solved ? 1 : 0; canNext = solved; canSkip = !solved;
    var wb = $('.win-box', el);
    if (solved && (wb && SX.checked)) fb = { kind: 'ok', title: 'Верно', html: wb.innerHTML };
    else if (SX.checked && !solved) {
      var ts = $$('.tsum, .cl.err', el).map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
      fb = { kind: 'bad', title: 'Не совсем', html: '<p>' + esc(ts.slice(0, 2).join(' · ') || 'Проверка не пройдена: загляни во вкладки «Тесты» и «Ревью».') + '</p><p class="sx-sub">Подсказка уменьшает награду на 10 XP.</p>' };
    }
  } else if (l.type === 'compare') {
    done = G.done('cmp:' + l.id); units = done ? 1 : 0; canNext = done; canSkip = !done;
    if (done) fb = { kind: 'ok', title: 'Запомнил', html: '<p>+5 XP за сравнение.</p>' };
  } else if (l.type === 'legacy') {
    var sum = $('.lg-sum', el); done = !!sum; units = done ? 1 : 0; canNext = done; canSkip = !done;
    if (sum) fb = { kind: sum.classList.contains('ok') ? 'ok' : 'warn', title: sum.classList.contains('ok') ? 'Всё найдено' : 'Разбор', html: '<p>' + esc(sum.textContent.replace(/\s+/g, ' ').trim()) + '</p>' };
  } else if (l.type === 'interview') {
    done = !!$('.iv-g.done', el); units = done ? 1 : 0; canNext = done; canSkip = !done;
    if (done) fb = { kind: 'ok', title: 'Записано', html: '<p>' + esc($('.iv-g.done', el).textContent.replace(/\s+/g, ' ').trim()) + '</p>' };
  } else { units = 1; canNext = true; canSkip = false; done = true; }   // cards
  var lastBlock = SX.k + 1 >= SX.labs.length;
  if (label === 'Дальше' && lastBlock && (l.type !== 'quiz' || $('.res', el))) label = 'Завершить';
  var changedFb = JSON.stringify(fb) !== JSON.stringify(SX.fb);
  SX.units = units; SX.canNext = canNext; SX.label = label; SX.canSkip = canSkip; SX.fb = fb; SX.done = done;
  sxProgress();
  var nx = $('#sxNext'), sk = $('#sxSkip');
  nx.textContent = label; nx.disabled = !canNext; nx.hidden = !canNext && l.type !== 'quiz';
  sk.hidden = !canSkip || l.type === 'quiz'; sk.textContent = 'Пропустить';
  if (changedFb || first) { sxPaint(); if (fb && fb.kind === 'ok' && !first && l.type !== 'ide' && l.type !== 'ticket') nx.focus({ preventScroll: true }); else if (fb && l.type === 'quiz' && !first) nx.focus({ preventScroll: true }); }
}
function sxPaint() {
  var foot = $('#sxFoot'), msg = $('#sxMsg'), fb = SX.fb;
  if (fb && SX.labs[SX.k].type === 'quiz') setTimeout(function () { var r = SX && $('.opt.right', SX.el); if (r) r.scrollIntoView({ block: 'nearest' }); }, 30);
  foot.setAttribute('data-state', fb ? fb.kind : 'idle');
  msg.innerHTML = fb ? '<b class="sx-t">' + (fb.kind === 'ok' ? '✓ ' : fb.kind === 'bad' ? '✕ ' : '') + esc(fb.title) + '</b><div class="sx-d">' + fb.html + '</div>' : '';
}
function sxNext() {
  if (!SX || !SX.canNext) return;
  var l = SX.labs[SX.k], el = SX.el;
  if (l.type === 'quiz') {
    var nb = $('.qfb [data-a="next"]', el);
    if (nb) { nb.click(); sxSync(); if (!$('.res', el)) { $('#sxBody').scrollTop = 0; return; } else return; }
  }
  sxAdvance();
}
function sxAdvance() {
  var l = SX.labs[SX.k]; SX.base += sxUnits(l); SX.units = 0;
  if (SX.k + 1 < SX.labs.length) { var st = $('#sxStep'); st.classList.remove('in'); void st.offsetWidth; st.classList.add('in'); sxOpen(SX.k + 1); }
  else sxSummary();
}

function sxSummary() {
  if (SX.mo) { SX.mo.disconnect(); SX.mo = null; }
  clearInterval(SX.tick);
  var p = SX.p, xp = Math.max(0, (G.st.xp || 0) - SX.xp0), secs = Math.max(1, Math.round((Date.now() - SX.t0) / 1000));
  var qn = 0, qok = 0, again = [], tasks = 0, tdone = 0;
  SX.labs.forEach(function (l) {
    var d = LABDATA[l.id];
    if (l.type === 'quiz') {
      var r = SX.results[l.id]; qn += d.qs.length; if (r) { qok += r.ok; r.wrong.forEach(function (i) { var Q = d.qs[i]; if (!Q) return; var tx = sxPlain(Q.qhtml); if (Q.code && tx.length < 40) tx += ' — ' + Q.code.split('\n').filter(function (x) { return x.trim(); })[0].trim(); again.push(tx); }); }
    } else if (l.type === 'ide' || l.type === 'ticket') {
      tasks++; if (G.done('ide:' + l.id)) tdone++; else again.push((l.type === 'ticket' ? 'Тикет: ' : 'Задача: ') + d.title);
    }
  });
  var acc = qn ? Math.round(qok * 100 / qn) : tasks ? Math.round(tdone * 100 / tasks) : 100;
  var seq = pathSeq(), i = seq.indexOf(p), next = seq[i + 1], lab = function (x) { return x.kind === 'overview' ? 'Чекпойнт фазы ' + x.phase : x.title; };
  var mm = Math.floor(secs / 60), ss = secs % 60, time = mm + ':' + (ss < 10 ? '0' : '') + ss;
  var h = '<div class="sx-sum"><div class="sx-ring ' + (acc >= 80 ? 'ok' : acc >= 50 ? 'warn' : 'bad') + '" style="--p:' + acc + '"><b>' + acc + '%</b><small>точность</small></div>' +
    '<h1 tabindex="-1" id="sxH">' + (acc >= 80 ? 'Практика пройдена' : acc >= 50 ? 'Неплохо, есть что повторить' : 'Стоит вернуться к теме') + '</h1><p class="sx-s">' + esc(p.title) + '</p>' +
    '<dl class="sx-stats"><div><dt>XP</dt><dd>+' + xp + '</dd></div><div><dt>Время</dt><dd>' + time + '</dd></div>' +
    (qn ? '<div><dt>Вопросы</dt><dd>' + qok + ' из ' + qn + '</dd></div>' : '') + (tasks ? '<div><dt>Задачи</dt><dd>' + tdone + ' из ' + tasks + '</dd></div>' : '') + '</dl>';
  if (again.length) h += '<section class="sx-again"><h2>Что повторить</h2><ul>' + again.slice(0, 6).map(function (t) { return '<li>' + esc(t.length > 140 ? t.slice(0, 137) + '…' : t) + '</li>'; }).join('') + '</ul><p class="sx-s">Неверные ответы уже добавлены в карточки на повторение.</p></section>';
  h += '<div class="sx-end"><a class="ds-btn pri lg" href="' + (next ? '#/topic/' + next.id : '#/path/' + (p.phase || 8)) + '">' + (next ? 'Следующая тема: ' + esc(lab(next)) : 'К Пути') + '</a>' +
    '<a class="ds-btn sec lg" href="#/topic/' + p.id + '">Вернуться к теме</a><button type="button" class="ds-btn ghost lg" id="sxAgain">Пройти ещё раз</button><a class="ds-btn ghost lg" href="#/path/' + (p.phase || 8) + '">К Пути</a></div></div>';
  $('#sxStep').innerHTML = h; $('#sxFoot').hidden = true; $('.sx-bar i').style.width = '100%'; $('.sx-bar').setAttribute('aria-valuenow', 100); $('#sxXp').textContent = '+' + xp + ' XP';
  $('#sxAgain').addEventListener('click', function () { renderSession(p); });
  $('#sxBody').scrollTop = 0; var hh = $('#sxH'); if (hh) hh.focus({ preventScroll: true });
  if (acc >= 80 && DS.motionOK()) labBurst();
  updateRankChip();
}
