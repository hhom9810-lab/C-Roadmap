/* ==========================================================================
   Этап 6. «Не понятно? Спроси ИИ»: панель, промпт, Gemini (прямой запрос из
   браузера) и запасной путь (скопировать промпт + открыть Gemini), история,
   настройки ключа. Ключ живёт ТОЛЬКО в localStorage `csroad:gemini-key`:
   его нет ни в KEYS (экспорт), ни в сборке.
   ========================================================================== */
var AI_MODEL = 'gemini-3.8-flash';              /* единственное место, где задана модель по умолчанию */
var AI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
var AI_GEMINI_URL = 'https://gemini.google.com/app';
var AI_KEY_URL = 'https://aistudio.google.com/apikey';
var AI_MAX_FRAG = 1500;
var AI_HIST_PER_TOPIC = 15, AI_HIST_MAX_CHARS = 350000, AI_ANS_MAX = 8000;

/* ---------- ключ и модель ---------- */
function aiKey() { var k = Store.get('gemini-key', ''); return typeof k === 'string' ? k : ''; }
function aiModel() { var m = Store.get('gemini-model', ''); return (typeof m === 'string' && /^[\w.\-]{3,60}$/.test(m)) ? m : AI_MODEL; }

/* ---------- безопасный Markdown → HTML (ответы ИИ — недоверенный текст) ---------- */
function aiInline(t) {
  return String(t).split(/(`[^`\n]+`)/).map(function (s, i) {
    if (i % 2) return '<code>' + esc(s.slice(1, -1)) + '</code>';
    s = esc(s);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, '$1<em>$2</em>');
    return s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }).join('');
}
function aiCodeBlock(lng, code) {
  lng = String(lng || '').toLowerCase();
  if (lng === 'c#' || lng === 'csharp' || lng === 'cs') lng = 'csharp';
  var label = LANG_LABEL[lng] !== undefined ? LANG_LABEL[lng] : (lng || 'код');
  return '<div class="code"><div class="code-h"><span class="code-lang">' + esc(label) + '</span><button class="copy" type="button">Копировать</button></div><pre><code>' + highlight(code, lng) + '</code></pre></div>';
}
function aiMd(src) {
  var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n'), out = [], para = [], list = null, i, m;
  function fp() { if (para.length) { out.push('<p>' + aiInline(para.join(' ')) + '</p>'); para = []; } }
  function fl() { if (list) { out.push('<' + list.t + '>' + list.items.map(function (x) { return '<li>' + aiInline(x) + '</li>'; }).join('') + '</' + list.t + '>'); list = null; } }
  function cells(l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
  for (i = 0; i < lines.length; i++) {
    var ln = lines[i];
    if ((m = /^\s*```\s*([\w#+.\-]*)\s*$/.exec(ln))) {
      fp(); fl(); var code = []; i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      out.push(aiCodeBlock(m[1], code.join('\n'))); continue;
    }
    if (!ln.trim()) { fp(); fl(); continue; }
    if ((m = /^(#{1,4})\s+(.*)$/.exec(ln))) { fp(); fl(); var lv = m[1].length + 2; out.push('<h' + lv + '>' + aiInline(m[2]) + '</h' + lv + '>'); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(ln)) { fp(); fl(); out.push('<hr>'); continue; }
    if (ln.indexOf('|') >= 0 && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      fp(); fl(); var hd = cells(ln), rows = []; i += 2;
      while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) rows.push(cells(lines[i++]));
      i--;
      out.push('<div class="tbl-w"><table><thead><tr>' + hd.map(function (c) { return '<th>' + aiInline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + aiInline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
      continue;
    }
    if ((m = /^\s*[-*+]\s+(.*)$/.exec(ln))) { fp(); if (!list || list.t !== 'ul') { fl(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) { fp(); if (!list || list.t !== 'ol') { fl(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\s*>\s?(.*)$/.exec(ln))) { fp(); fl(); out.push('<blockquote>' + aiInline(m[1]) + '</blockquote>'); continue; }
    if (list && /^\s{2,}\S/.test(ln)) { list.items[list.items.length - 1] += ' ' + ln.trim(); continue; }
    fl(); para.push(ln.trim());
  }
  fp(); fl();
  return out.join('');
}

/* ---------- контекст и промпт ---------- */
function aiRank() { try { return nextRankInfo(G.st.xp).cur.n; } catch (e) { return 'новичок'; } }
function aiPromptText(ctx, q) {
  var p = ctx.p, ph = p.phase ? 'фаза ' + p.phase + ' «' + PHASES[p.phase].title + '»' : 'общий раздел курса';
  var frag = ctx.frag ? ctx.frag.replace(/\s+/g, ' ').trim().slice(0, AI_MAX_FRAG) : '';
  return 'Ты — терпеливый наставник по C# и .NET. Объясняй по-русски, простым языком, но технически точно.\n' +
    'Контекст: я изучаю курс «C# → Junior .NET», сейчас ' + ph + ', тема «' + p.title + '», раздел «' + (ctx.sec || 'вся тема целиком') + '». Мой уровень: ' + aiRank() + '.\n' +
    'Фрагмент, который мне непонятен: «' + (frag || 'не выделен — вопрос ко всей теме или разделу') + '»\n' +
    'Мой вопрос/что именно непонятно: ' + ((q || '').trim() || 'объясни это проще') + '\n' +
    'Как отвечать: 1) объясни интуитивно на бытовой аналогии; 2) затем строго и технически; 3) покажи минимальный пример кода на C# с ожидаемым выводом; 4) назови 2–3 типичные ошибки новичков; 5) задай мне 2 проверочных вопроса. Если что-то зависит от версии C#/.NET — укажи. Если не уверен — скажи об этом, не выдумывай.';
}

/* ---------- Gemini: потоковый запрос ---------- */
function aiError(kind, msg) { var e = new Error(msg); e.aiKind = kind; return e; }
function aiHttpError(status, body) {
  var msg = ''; try { var j = JSON.parse(body); msg = j.error && j.error.message || ''; } catch (e) { }
  if (status === 400 && /API key|API_KEY/i.test(msg + body)) return aiError('key', 'Ключ не принят: проверьте, что он скопирован целиком (⋯ → ИИ-помощник).');
  if (status === 401 || status === 403) return aiError('key', 'Ключ не принят или у него нет доступа к Gemini API (код ' + status + '). Проверьте ключ в ⋯ → ИИ-помощник. Если ключ верный, возможно, API недоступен в вашем регионе.');
  if (status === 404) return aiError('model', 'Модель «' + aiModel() + '» недоступна для этого ключа. Укажите другую в ⋯ → ИИ-помощник → «Модель».');
  if (status === 429) return aiError('rate', 'Превышен лимит запросов Gemini. Подождите минуту и нажмите «Повторить» — или скопируйте промпт и откройте Gemini вручную.');
  if (status >= 500) return aiError('server', 'Сервис Gemini временно недоступен (код ' + status + '). Попробуйте позже.');
  return aiError('http', 'Gemini вернул ошибку ' + status + (msg ? ': ' + msg.slice(0, 200) : '') + '.');
}
var AI_BLOCK_MSG = 'Gemini отказался отвечать на этот запрос (фильтры безопасности). Переформулируйте вопрос или выберите другой фрагмент.';
function geminiStream(prompt, key, model, onText, signal) {
  var url = AI_ENDPOINT + encodeURIComponent(model) + ':streamGenerateContent?alt=sse';
  var full = '', blocked = '', finish = '', buf = '';
  function handle(obj) {
    if (obj.error) throw aiHttpError(obj.error.code || 500, JSON.stringify({ error: obj.error }));
    if (obj.promptFeedback && obj.promptFeedback.blockReason) blocked = obj.promptFeedback.blockReason;
    (obj.candidates || []).forEach(function (c) {
      ((c.content && c.content.parts) || []).forEach(function (pt) { if (typeof pt.text === 'string' && !pt.thought) full += pt.text; });
      if (c.finishReason && c.finishReason !== 'STOP') finish = c.finishReason;
    });
    onText(full);
  }
  function feed(chunk, last) {
    buf += chunk;
    var parts = buf.split(/\r?\n\r?\n/); buf = last ? '' : parts.pop();
    parts.forEach(function (ev) {
      var data = ev.split(/\r?\n/).filter(function (l) { return l.indexOf('data:') === 0; }).map(function (l) { return l.slice(5).replace(/^ /, ''); }).join('\n');
      if (!data || data === '[DONE]') return;
      var obj; try { obj = JSON.parse(data); } catch (e) { return; }
      handle(obj);
    });
  }
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }), signal: signal })
    .then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw aiHttpError(res.status, t); });
      if (res.body && res.body.getReader) {
        var rd = res.body.getReader(), dec = new TextDecoder('utf-8');
        return (function pump() { return rd.read().then(function (r) { if (r.done) { feed(dec.decode(), true); return; } feed(dec.decode(r.value, { stream: true }), false); return pump(); }); })();
      }
      return res.text().then(function (t) { feed(t, true); });
    }, function (e) {
      if (e && e.name === 'AbortError') throw e;
      throw aiError('network', 'Не удалось связаться с Gemini: нет сети или запрос заблокирован (VPN, расширение, файрвол). Можно скопировать промпт и открыть Gemini вручную.');
    })
    .then(function () {
      if (!full.trim()) {
        if (blocked || /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(finish)) throw aiError('block', AI_BLOCK_MSG);
        throw aiError('empty', 'Gemini вернул пустой ответ. Нажмите «Повторить» или переформулируйте вопрос.');
      }
      return { text: full, finish: finish };
    });
}

/* ---------- история ---------- */
function aiHistAll() { var h = Store.get('aihist', {}); return h && typeof h === 'object' && !Array.isArray(h) ? h : {}; }
function aiHistFor(pid) { return aiHistAll()[pid] || []; }
function aiHistAdd(pid, e) {
  var h = aiHistAll(), arr = h[pid] || [];
  e.id = e.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (e.a) e.a = e.a.slice(0, AI_ANS_MAX);
  arr = arr.filter(function (x) { return x.id !== e.id; }); arr.push(e);
  if (arr.length > AI_HIST_PER_TOPIC) arr = arr.slice(arr.length - AI_HIST_PER_TOPIC);
  h[pid] = arr;
  /* общий лимит размера: выбрасываем самые старые записи по всем темам */
  var guard = 0;
  while (JSON.stringify(h).length > AI_HIST_MAX_CHARS && guard++ < 500) {
    var oldest = null;
    Object.keys(h).forEach(function (k) { if (h[k].length && (!oldest || h[k][0].t < h[oldest][0].t)) oldest = k; });
    if (!oldest) break; h[oldest].shift(); if (!h[oldest].length) delete h[oldest];
  }
  Store.set('aihist', h); return e;
}
function aiHistClear(pid) { var h = aiHistAll(); if (pid) delete h[pid]; else h = {}; Store.set('aihist', h); }
function aiWhen(t) { var d = new Date(t); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function aiEntryTitle(e) { return e.q || (e.frag ? '«' + e.frag.slice(0, 70) + (e.frag.length > 70 ? '…' : '') + '»' : e.sec || 'Вопрос по теме'); }

/* ---------- панель ---------- */
var AI = { drawer: null, ctx: null, dirty: false, ans: '', busy: false, ctrl: null, entry: null, raf: 0, armClear: 0 };
function aiEnsureDrawer() {
  if (AI.drawer) return AI.drawer;
  AI.drawer = DS.drawer({ title: 'Не понятно? Спроси ИИ', label: 'Спросить ИИ', onClose: function () { if (AI.busy && AI.ctrl) { try { AI.ctrl.abort(); } catch (e) { } } } });
  AI.drawer.el.classList.add('ai-panel');
  AI.drawer.el.addEventListener('click', aiPanelClick);
  AI.drawer.el.addEventListener('input', function (e) {
    if (e.target.id === 'aiQ' && !AI.dirty) $('#aiPrompt').value = aiPromptText(AI.ctx, e.target.value);
    else if (e.target.id === 'aiPrompt') { AI.dirty = true; $('#aiReset').hidden = false; }
  });
  return AI.drawer;
}
function aiOpen(ctx) {
  var d = aiEnsureDrawer();
  AI.ctx = ctx; AI.dirty = false; AI.ans = ''; AI.entry = null;
  if (AI.busy && AI.ctrl) { try { AI.ctrl.abort(); } catch (e) { } }
  var p = ctx.p, hist = aiHistFor(p.id);
  d.setContent(
    '<p class="ai-ctx">' + (p.phase ? 'Фаза ' + p.phase + ' · ' : '') + esc(p.title) + (ctx.sec ? ' · <b>' + esc(ctx.sec) + '</b>' : '') + '</p>' +
    (ctx.frag ? '<blockquote class="ai-frag" tabindex="0" aria-label="Выбранный фрагмент">' + esc(ctx.frag.slice(0, AI_MAX_FRAG)) + (ctx.frag.length > AI_MAX_FRAG ? '…' : '') + '</blockquote>' : '') +
    '<label class="ai-l" for="aiQ">Что именно непонятно <small>(необязательно)</small></label>' +
    '<textarea id="aiQ" class="ds-input ai-q" rows="2" maxlength="600" placeholder="Например: почему здесь нет new? Если пусто — «объясни это проще»" data-ds-autofocus></textarea>' +
    '<details class="ai-pr"><summary>Промпт (можно править)</summary><textarea id="aiPrompt" class="ds-input ai-prompt" rows="9" spellcheck="false" aria-label="Текст промпта">' + esc(aiPromptText(ctx, '')) + '</textarea>' +
    '<button class="ds-btn sm ghost" type="button" id="aiReset" data-ai="reset" hidden>Вернуть исходный промпт</button></details>' +
    '<div class="ai-acts"><button class="ds-btn pri" type="button" id="aiAsk" data-ai="ask">Спросить Gemini</button>' +
    '<button class="ds-btn sec" type="button" data-ai="copy">Скопировать промпт</button>' +
    '<a class="ds-btn sec" href="' + AI_GEMINI_URL + '" target="_blank" rel="noopener noreferrer" data-ai="gem">Открыть Gemini<span class="sr-only"> (новая вкладка)</span> ↗</a></div>' +
    '<p class="ai-hint" id="aiHint"></p>' +
    '<div class="ai-out" id="aiOut" aria-busy="false"></div><div class="sr-only" id="aiLive" role="status" aria-live="polite"></div>' +
    '<details class="ai-hist" id="aiHist"' + (ctx.openHist ? ' open' : '') + '><summary>История по теме <span id="aiHistN">(' + hist.length + ')</span></summary><div id="aiHistBody"></div></details>');
  aiPaintHint(); aiPaintHist();
  d.open();
}
function aiPaintHint() {
  var h = $('#aiHint'); if (!h) return;
  h.innerHTML = aiKey() ? 'Запрос уйдёт напрямую из браузера в Gemini API с вашим ключом. Ответ может быть неточным — сверяйтесь с документацией.'
    : 'Ключа Gemini пока нет: <button class="ds-btn sm ghost" type="button" data-ai="settings">добавить ключ</button> — или скопируйте промпт и откройте Gemini вручную.';
}
function aiPaintHist() {
  var host = $('#aiHistBody'); if (!host) return;
  var arr = aiHistFor(AI.ctx.p.id).slice().reverse(); $('#aiHistN').textContent = '(' + arr.length + ')';
  host.innerHTML = arr.length
    ? '<ul class="ai-hl">' + arr.map(function (e) { return '<li><button type="button" data-ai-h="' + e.id + '"><span>' + esc(aiEntryTitle(e)) + '</span><small>' + aiWhen(e.t) + (e.a ? '' : ' · только промпт') + '</small></button></li>'; }).join('') + '</ul><button class="ds-btn sm ghost" type="button" data-ai="clear">Очистить историю темы</button>'
    : '<p class="ai-empty">Пока пусто. Вопросы и ответы по этой теме появятся здесь.</p>';
}
function aiOut() { return $('#aiOut'); }
function aiSetBusy(b) {
  AI.busy = b; var a = $('#aiAsk'); if (!a) return;
  a.textContent = b ? 'Остановить' : 'Спросить Gemini'; a.setAttribute('data-ai', b ? 'stop' : 'ask');
  var o = aiOut(); if (o) o.setAttribute('aria-busy', String(b));
}
function aiPaintAnswer(text, done, note) {
  var o = aiOut(); if (!o) return;
  o.innerHTML = '<div class="ai-md">' + aiMd(text) + '</div>' + (note ? '<p class="ai-note">' + esc(note) + '</p>' : '') +
    (done ? '<div class="ai-acts2"><button class="ds-btn sm sec" type="button" data-ai="copy-ans">Копировать ответ</button><button class="ds-btn sm sec" type="button" data-ai="note">Сохранить в блокнот</button><button class="ds-btn sm ghost" type="button" data-ai="ask">Повторить</button></div>' : '');
}
function aiPaintError(err) {
  var o = aiOut(); if (!o) return;
  var k = err.aiKind || 'http', acts = '';
  if (k === 'key') acts = '<button class="ds-btn sm" type="button" data-ai="settings">Открыть настройки ключа</button>';
  else acts = '<button class="ds-btn sm pri" type="button" data-ai="ask">Повторить</button>';
  o.innerHTML = '<div class="ai-err" role="alert"><b>' + (k === 'nokey' ? 'Нет ключа Gemini' : 'Не получилось') + '</b><p>' + esc(err.message) + '</p><div class="ai-acts2">' + acts +
    '<button class="ds-btn sm" type="button" data-ai="copy">Скопировать промпт</button></div></div>';
  var l = $('#aiLive'); if (l) l.textContent = 'Ошибка: ' + err.message;
}
function aiCtxEntry(extra) {
  var c = AI.ctx, e = { t: Date.now(), q: ($('#aiQ').value || '').trim().slice(0, 600), sec: c.sec || '', frag: (c.frag || '').replace(/\s+/g, ' ').trim().slice(0, 200), a: '', via: 'copy' };
  for (var k in extra) e[k] = extra[k]; return e;
}
function aiAsk() {
  if (AI.busy) return;
  var key = aiKey(); if (!key) { aiPaintError(aiError('nokey', 'Чтобы спрашивать прямо отсюда, добавьте личный ключ Gemini API в ⋯ → ИИ-помощник. Без ключа работает запасной путь: скопируйте промпт и вставьте его в Gemini.')); return; }
  var prompt = ($('#aiPrompt').value || '').trim(); if (!prompt) return;
  AI.ans = ''; AI.entry = null; aiSetBusy(true);
  var o = aiOut(); o.innerHTML = '<p class="ai-wait">Gemini думает…</p>';
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null; AI.ctrl = ctrl;
  var l = $('#aiLive'); if (l) l.textContent = 'Запрос отправлен';
  function paint(t) { AI.ans = t; if (!AI.raf) AI.raf = requestAnimationFrame(function () { AI.raf = 0; if (AI.busy) aiPaintAnswer(AI.ans, false); }); }
  geminiStream(prompt, key, aiModel(), paint, ctrl && ctrl.signal).then(function (r) {
    AI.ans = r.text; aiSetBusy(false);
    aiPaintAnswer(r.text, true, r.finish === 'MAX_TOKENS' ? 'Ответ обрезан по длине. Попросите продолжить отдельным вопросом.' : '');
    AI.entry = aiHistAdd(AI.ctx.p.id, aiCtxEntry({ a: r.text, via: 'gemini' })); aiPaintHist();
    if (l) l.textContent = 'Ответ получен';
  }, function (err) {
    aiSetBusy(false);
    if (err && err.name === 'AbortError') { if (AI.ans) aiPaintAnswer(AI.ans, true, 'Остановлено — показан частичный ответ.'); else if (aiOut()) aiOut().innerHTML = ''; return; }
    if (AI.ans && err.aiKind !== 'key') { aiPaintAnswer(AI.ans, true, 'Ответ оборвался: ' + err.message); return; }
    aiPaintError(err.aiKind ? err : aiError('http', 'Неожиданная ошибка: ' + (err && err.message || err)));
  });
}
function aiCopyText(text, okMsg) {
  function fb() { try { var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); DS.toast(ok ? okMsg : 'Не удалось скопировать — выделите текст вручную', ok ? {} : { kind: 'bad' }); } catch (e) { DS.toast('Не удалось скопировать', { kind: 'bad' }); } }
  try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { DS.toast(okMsg); }, fb); else fb(); } catch (e) { fb(); }
}
function aiToNotebook() {
  if (!AI.ans) return;
  var c = AI.ctx, list = Store.get('rabbit', []) || [], q = ($('#aiQ').value || '').trim();
  list.push({ id: Date.now().toString(36), t: ('ИИ: ' + (q || c.sec || c.p.title)).slice(0, 400), d: todayISO(), ph: c.p.phase && c.p.phase <= 7 ? c.p.phase : 7, st: 'open', a: AI.ans.slice(0, AI_ANS_MAX), src: c.p.id });
  Store.set('rabbit', list); DS.toast('Сохранено в блокнот кроличьих нор');
}
function aiPanelClick(e) {
  var h = e.target.closest('[data-ai-h]');
  if (h) {
    var en = aiHistFor(AI.ctx.p.id).filter(function (x) { return x.id === h.getAttribute('data-ai-h'); })[0]; if (!en) return;
    $('#aiQ').value = en.q || ''; AI.ans = en.a || ''; AI.entry = en;
    if (en.a) { aiPaintAnswer(en.a, true, 'Из истории · ' + aiWhen(en.t)); var l = $('#aiLive'); if (l) l.textContent = 'Открыт ответ из истории'; }
    else aiOut().innerHTML = '<p class="ai-note">Для этой записи сохранён только вопрос — ответ вы получали вне сайта.</p>';
    return;
  }
  var b = e.target.closest('[data-ai]'); if (!b) return;
  var a = b.getAttribute('data-ai');
  if (a === 'ask') aiAsk();
  else if (a === 'stop') { if (AI.ctrl) try { AI.ctrl.abort(); } catch (x) { } }
  else if (a === 'reset') { AI.dirty = false; $('#aiPrompt').value = aiPromptText(AI.ctx, $('#aiQ').value); b.hidden = true; }
  else if (a === 'copy') {
    aiCopyText($('#aiPrompt').value, 'Промпт скопирован — вставьте его в Gemini');
    var hist = aiHistFor(AI.ctx.p.id), last = hist[hist.length - 1], q = ($('#aiQ').value || '').trim();
    if (!(last && !last.a && last.q === q && last.sec === (AI.ctx.sec || '') && Date.now() - last.t < 6e5)) { aiHistAdd(AI.ctx.p.id, aiCtxEntry({})); aiPaintHist(); }
  }
  else if (a === 'copy-ans') aiCopyText(AI.ans, 'Ответ скопирован');
  else if (a === 'note') aiToNotebook();
  else if (a === 'settings') aiSettings();
  else if (a === 'clear') {
    if (Date.now() - AI.armClear > 4000) { AI.armClear = Date.now(); b.textContent = 'Точно? Нажми ещё раз'; setTimeout(function () { if (b.isConnected) b.textContent = 'Очистить историю темы'; }, 4000); return; }
    aiHistClear(AI.ctx.p.id); AI.armClear = 0; aiPaintHist(); DS.toast('История темы очищена');
  }
}

/* ---------- настройки ключа: ⋯ → ИИ-помощник ---------- */
var aiModal = null;
function aiKeyNote() {
  var n = $('#aiKeyNote'), k = aiKey(); if (n) n.textContent = k ? 'Ключ сохранён · …' + k.slice(-4) : 'Ключ не задан';
}
function aiSettings() {
  if (!aiModal) {
    aiModal = DS.modal({ title: 'ИИ-помощник: ключ Gemini' });
    aiModal.el.classList.add('ai-set');
    aiModal.el.addEventListener('click', aiSetClick);
  }
  var k = aiKey();
  aiModal.setContent(
    '<p>Ответы строит Gemini (Google). Нужен личный ключ API: <a href="' + AI_KEY_URL + '" target="_blank" rel="noopener noreferrer">получить в Google AI Studio ↗</a>. Без ключа остаётся запасной путь: скопировать промпт и вставить в Gemini.</p>' +
    '<label class="ai-l" for="aiKeyIn">Ключ API</label><input id="aiKeyIn" class="ds-input" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(k) + '" data-ds-autofocus>' +
    '<label class="ai-chk"><input type="checkbox" id="aiShow"> Показать ключ</label>' +
    '<label class="ai-l" for="aiModelIn">Модель <small>(необязательно)</small></label><input id="aiModelIn" class="ds-input" type="text" autocomplete="off" spellcheck="false" placeholder="' + esc(AI_MODEL) + '" value="' + esc(Store.get('gemini-model', '') || '') + '">' +
    '<div class="ai-warn" id="aiWarn" role="note" hidden><b>Перед сохранением</b><ul><li>Ключ хранится только в этом браузере — не в файле сайта и не в экспорте прогресса.</li><li>Не вводите его на чужом или общем компьютере, не публикуйте скриншоты этих настроек.</li><li>Ответы ИИ бывают неверными: важное сверяйте с документацией Microsoft Learn.</li></ul></div>' +
    '<p class="ai-err-in" id="aiKeyErr" role="alert" hidden></p>' +
    '<div class="row"><button class="ds-btn pri" type="button" data-ais="save">Сохранить</button>' + (k ? '<button class="ds-btn" type="button" data-ais="del">Удалить ключ</button>' : '') + '<button class="ds-btn ghost" type="button" data-ds-close>Закрыть</button></div>');
  aiModal.open();
}
function aiSetClick(e) {
  var s = e.target.closest('[data-ais]'), sh = e.target.id === 'aiShow';
  if (sh) { $('#aiKeyIn').type = e.target.checked ? 'text' : 'password'; return; }
  if (!s) return;
  var a = s.getAttribute('data-ais'), err = $('#aiKeyErr');
  if (a === 'del') { Store.del('gemini-key'); aiKeyNote(); aiPaintHint(); aiModal.close(); DS.toast('Ключ удалён из этого браузера'); return; }
  var key = $('#aiKeyIn').value.trim(), model = $('#aiModelIn').value.trim();
  if (!key) { err.textContent = 'Вставьте ключ или нажмите «Закрыть».'; err.hidden = false; return; }
  if (!/^[\w\-]{20,}$/.test(key)) { err.textContent = 'Ключ выглядит неверно: он должен быть одной строкой из латинских букв, цифр, «-» и «_», не короче 20 символов.'; err.hidden = false; return; }
  if (model && !/^[\w.\-]{3,60}$/.test(model)) { err.textContent = 'Название модели: латиница, цифры, точка и дефис, например gemini-3.8-flash.'; err.hidden = false; return; }
  if (!Store.get('ai-warned', false)) { var w = $('#aiWarn'); if (w.hidden) { w.hidden = false; err.hidden = true; s.textContent = 'Понятно, сохранить ключ'; w.scrollIntoView({ block: 'nearest' }); return; } Store.set('ai-warned', true); }
  Store.set('gemini-key', key); if (model) Store.set('gemini-model', model); else Store.del('gemini-model');
  aiKeyNote(); aiPaintHint(); aiModal.close(); DS.toast('Ключ сохранён в этом браузере');
}
$('#aiSetBtn').addEventListener('click', function () { menu.close(); setTimeout(aiSettings, 0); });
aiKeyNote();

/* ---------- встраивание в читалку ---------- */
function aiCountTopic(pid) { return aiHistFor(pid).length; }
function aiEndBlock(p) {
  var s = document.createElement('section'); s.className = 'rd-ai ds-card'; s.setAttribute('aria-labelledby', 'h-rd-ai');
  var n = aiCountTopic(p.id);
  s.innerHTML = '<h2 id="h-rd-ai" class="rd-h">Не понятно? Спроси ИИ</h2><p>Выдели непонятное место в тексте и нажми «Объяснить это» — или спроси про тему целиком. Промпт перед отправкой можно поправить, а ответ нужно проверять по документации.</p>' +
    '<div class="ai-row"><button class="ds-btn pri" type="button" data-ai-open="topic">Спросить про эту тему</button>' +
    (n ? '<button class="ds-btn" type="button" data-ai-open="hist">История по теме (' + n + ')</button>' : '') + '</div>';
  return s;
}
function aiSectionText(h) {
  var out = [], n = h.nextElementSibling;
  while (n && n.tagName !== 'H2') { if (!/^(PRE|SCRIPT|STYLE)$/.test(n.tagName)) out.push(n.textContent); n = n.nextElementSibling; }
  return out.join(' ').replace(/\s+/g, ' ').trim().slice(0, AI_MAX_FRAG);
}
function aiHeadText(h) { var c = h.cloneNode(true); $$('.rd-a,.rd-q', c).forEach(function (x) { x.parentNode.removeChild(x); }); return c.textContent.trim(); }
function aiAfterRender(p, wrap) {
  $$('h2[id^="h-"]', wrap).forEach(function (h) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'rd-q'; b.setAttribute('data-ai-open', 'h2'); b.setAttribute('data-hid', h.id);
    var t = aiHeadText(h); b.setAttribute('aria-label', 'Не понятно? Спросить ИИ про раздел «' + t + '»'); b.title = 'Не понятно? Спроси ИИ'; b.textContent = '?';
    h.appendChild(b);
  });
}
function aiPageNow() { return typeof current !== 'undefined' ? current : null; }
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('[data-ai-open]'); if (!b) return;
  var p = aiPageNow(); if (!p) return;
  var k = b.getAttribute('data-ai-open');
  if (k === 'h2') {
    var h = document.getElementById(b.getAttribute('data-hid')); if (!h) return;
    aiOpen({ p: p, sec: aiHeadText(h), frag: aiSectionText(h) });
  } else if (k === 'sel') {
    var c = aiSel; aiHideSel(); if (c) aiOpen({ p: p, sec: c.sec, frag: c.text });
  } else aiOpen({ p: p, sec: '', frag: '', openHist: k === 'hist' });
});

/* ---------- «Объяснить это» при выделении текста ---------- */
var aiSel = null, aiSelBtn = null, aiSelT = 0;
function aiHideSel() { aiSel = null; if (aiSelBtn) aiSelBtn.hidden = true; }
function aiCheckSel() {
  var sel = window.getSelection(), p = aiPageNow();
  if (!p || !sel || sel.isCollapsed || !sel.rangeCount) return aiHideSel();
  var r = sel.getRangeAt(0), root = $('.rd-theory');
  if (!root || !root.contains(r.commonAncestorContainer)) return aiHideSel();
  var text = sel.toString().replace(/\s+/g, ' ').trim();
  if (text.length < 3) return aiHideSel();
  var node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode, h = null;
  /* ближайший h2 выше выделения */
  var all = $$('h2[id^="h-"]', root);
  for (var i = 0; i < all.length; i++) { if (all[i].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING || all[i] === node || all[i].contains(node)) h = all[i]; else break; }
  aiSel = { text: text.slice(0, AI_MAX_FRAG), sec: h ? aiHeadText(h) : '' };
  if (!aiSelBtn) {
    aiSelBtn = document.createElement('button'); aiSelBtn.type = 'button'; aiSelBtn.className = 'ai-sel ds-btn pri sm'; aiSelBtn.setAttribute('data-ai-open', 'sel');
    aiSelBtn.setAttribute('aria-keyshortcuts', 'Alt+E'); aiSelBtn.textContent = 'Объяснить это';
    aiSelBtn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    document.body.appendChild(aiSelBtn);
  }
  var rect = r.getBoundingClientRect(), coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  aiSelBtn.hidden = false;
  if (coarse) { aiSelBtn.classList.add('fixed'); aiSelBtn.style.left = aiSelBtn.style.top = ''; }
  else {
    aiSelBtn.classList.remove('fixed');
    var w = aiSelBtn.offsetWidth || 130, top = rect.bottom + 8; if (top + 44 > window.innerHeight) top = rect.top - 48;
    top = Math.max(8, Math.min(window.innerHeight - 48, top));
    aiSelBtn.style.top = Math.round(top) + 'px'; aiSelBtn.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2))) + 'px';
  }
}
document.addEventListener('selectionchange', function () { clearTimeout(aiSelT); aiSelT = setTimeout(aiCheckSel, 180); });
window.addEventListener('scroll', function () { if (aiSelBtn && !aiSelBtn.hidden && !aiSelBtn.classList.contains('fixed')) { clearTimeout(aiSelT); aiSelT = setTimeout(aiCheckSel, 60); } }, { passive: true });
document.addEventListener('keydown', function (e) {
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'e' || e.key === 'E' || e.code === 'KeyE') && aiSel && aiSelBtn && !aiSelBtn.hidden) { e.preventDefault(); aiSelBtn.click(); }
  else if (e.key === 'Escape' && aiSelBtn && !aiSelBtn.hidden) aiHideSel();
});

/* ---------- Профиль: «Мои вопросы» ---------- */
(function () {
  var base = WIDGETS.profile; if (!base) return;
  WIDGETS.profile = function (el) {
    base(el);
    var h = aiHistAll(), rows = [];
    Object.keys(h).forEach(function (pid) { h[pid].forEach(function (e) { rows.push({ pid: pid, e: e }); }); });
    rows.sort(function (a, b) { return b.e.t - a.e.t; });
    var s = document.createElement('section'); s.className = 'pf-ai';
    s.innerHTML = '<h3>Мои вопросы <small>' + rows.length + '</small></h3>' + (rows.length
      ? '<ul class="pf-ai-l">' + rows.slice(0, 40).map(function (r) {
          var pg = byId[r.pid];
          return '<li><details><summary><span>' + esc(aiEntryTitle(r.e)) + '</span><small>' + (pg ? esc(pg.title) + ' · ' : '') + aiWhen(r.e.t) + '</small></summary>' +
            (r.e.a ? '<div class="ai-md">' + aiMd(r.e.a) + '</div>' : '<p class="ai-note">Сохранён только вопрос — ответ вы получали вне сайта.</p>') +
            (pg ? '<a href="#/topic/' + esc(r.pid) + '">Открыть тему</a>' : '') + '</details></li>';
        }).join('') + '</ul><button class="btn sm" type="button" data-ai-clear-all>Очистить все вопросы</button>'
      : '<p class="ai-empty">Пока нет. Выдели непонятное место в теме и нажми «Объяснить это» — вопросы появятся здесь.</p>');
    var foot = $('.pf-foot', el); foot ? foot.parentNode.insertBefore(s, foot) : el.appendChild(s);
    var cb = $('[data-ai-clear-all]', s), arm = 0;
    if (cb) cb.onclick = function () {
      if (Date.now() - arm > 4000) { arm = Date.now(); cb.textContent = 'Точно? Нажми ещё раз'; setTimeout(function () { if (cb.isConnected) cb.textContent = 'Очистить все вопросы'; }, 4000); return; }
      aiHistClear(); WIDGETS.profile(el); DS.toast('Вопросы очищены');
    };
  };
})();
