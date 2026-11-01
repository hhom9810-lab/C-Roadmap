/* ---------- async / итераторы на генераторах + планировщик ---------- */
var SIG_YBRK = 4;
var TASKID = 0;
function Task() { this.done = false; this.res = undefined; this.exc = null; this.conts = []; this.cancelled = false; this.tn = 'Task'; this.id = ++TASKID; }
var SCHED = { micro: [], timers: [], now: 0, seq: 0, thread: 1, poolN: 0 };
function resetSched() { SCHED.micro = []; SCHED.timers = []; SCHED.now = 0; SCHED.seq = 0; SCHED.thread = 1; SCHED.poolN = 0; TASKID = 0; }
function poolThread() { SCHED.poolN++; return 3 + ((SCHED.poolN - 1) % 4); }
Task.prototype.complete = function (v) {
  if (this.done) return; this.done = true; this.res = v;
  var cs = this.conts; this.conts = []; var th = SCHED.thread;
  cs.forEach(function (c) { SCHED.micro.push({ fn: c, th: th }); });
};
Task.prototype.fail = function (obj, cancelled) {
  if (this.done) return; this.done = true; this.exc = obj; this.cancelled = !!cancelled;
  var cs = this.conts; this.conts = []; var th = SCHED.thread;
  cs.forEach(function (c) { SCHED.micro.push({ fn: c, th: th }); });
};
Task.prototype.then = function (cb) { if (this.done) SCHED.micro.push({ fn: cb, th: SCHED.thread }); else this.conts.push(cb); };
function runMicro() {
  var m = SCHED.micro.shift();
  var old = SCHED.thread; SCHED.thread = m.th; try { m.fn(); } finally { SCHED.thread = old === undefined ? 1 : SCHED.thread; }
}
function runTimer() {
  var best = -1;
  for (var i = 0; i < SCHED.timers.length; i++) { var t = SCHED.timers[i]; if (best < 0 || t.at < SCHED.timers[best].at || (t.at === SCHED.timers[best].at && t.seq < SCHED.timers[best].seq)) best = i; }
  var tm = SCHED.timers.splice(best, 1)[0];
  if (tm.at > SCHED.now) SCHED.now = tm.at;
  SCHED.thread = poolThread();
  tm.fn();
}
function runLoopUntil(task) {
  var guard = 0;
  while (!task.done) {
    if (++guard > 5000000) throw new Fatal('Превышен лимит шагов планировщика');
    if (SCHED.micro.length) { var th = SCHED.thread; runMicro(); continue; }
    if (SCHED.timers.length) { runTimer(); continue; }
    break;
  }
  return task.done;
}
function sleepFor(ms) {
  var target = SCHED.now + ms, mainTh = SCHED.thread;
  while (true) {
    if (SCHED.micro.length) { runMicro(); continue; }
    var best = null; SCHED.timers.forEach(function (t) { if (t.at <= target && (!best || t.at < best.at || (t.at === best.at && t.seq < best.seq))) best = t; });
    if (best) { SCHED.timers.splice(SCHED.timers.indexOf(best), 1); if (best.at > SCHED.now) SCHED.now = best.at; SCHED.thread = poolThread(); best.fn(); continue; }
    break;
  }
  SCHED.now = target; SCHED.thread = mainTh;
}
function addTimer(ms, fn) { SCHED.timers.push({ at: SCHED.now + ms, seq: ++SCHED.seq, fn: fn }); }
function waitTask(t) {
  if (!t.done) { runLoopUntil(t); }
  if (!t.done) throw new Fatal('Взаимная блокировка: задача никогда не завершится (в реальном приложении программа бы зависла).');
}
function aggregateOf(exc) {
  var a = new Obj(EXC.AggregateException); a.f.Message = 'One or more errors occurred. (' + (exc.f.Message === undefined ? exc.c.defMsg : exc.f.Message) + ')'; a.f.InnerException = exc; a.f.$inner = [exc]; a.f.$trace = []; return a;
}
function taskResult(t) { // .Result
  waitTask(t);
  if (t.exc) throw new CsThrow(t.cancelled ? aggregateOf(t.exc) : aggregateOf(t.exc));
  return t.res;
}
function awaitOf(aw) { // приводим к Task
  if (aw instanceof Task) return aw;
  if (aw === null || aw === undefined) npe();
  if (aw && aw.isTcs) return aw.task;
  var t = new Task(); t.done = true; t.res = aw; return t;
}

function runAsync(genFn, env, isVoid, co) {
  var task = new Task();
  var gen = genFn(env);
  function finish(ex) {
    if (ex instanceof CsThrow) { if (isVoid) throw ex; task.fail(ex.obj, ex.obj.c === EXC.OperationCanceledException || ex.obj.c === EXC.TaskCanceledException); return task; }
    throw ex;
  }
  function step(mode, val) {
    while (true) {
      var r;
      var savedThread = SCHED.thread;
      try { r = mode === 0 ? gen.next(val) : gen.throw(val); }
      catch (ex) { finish(ex); return; }
      if (r.done) {
        var sig = r.value, rv = undefined;
        if (sig === SIG_RET) { rv = RV; RV = undefined; }
        task.complete(co && rv !== undefined ? co(rv) : rv);
        return;
      }
      var aw;
      try { aw = awaitOf(r.value.a); } catch (ex2) { mode = 1; val = ex2; continue; }
      if (aw.done) {
        if (aw.exc) { mode = 1; val = new CsThrow(aw.exc); } else { mode = 0; val = aw.res; }
        continue;
      }
      aw.conts.push(function () { if (aw.exc) step(1, new CsThrow(aw.exc)); else step(0, aw.res); });
      return;
    }
  }
  step(0, undefined);
  return isVoid ? undefined : task;
}
function cloneEnvForIter(env) {
  var e2 = Object.create(ROOT);
  Object.keys(env).forEach(function (k) { var v = env[k]; e2[k] = (v instanceof Box) ? (function () { var b = new Box(v.v, v.t); b.co = v.co; return b; })() : v; });
  return e2;
}
function makeIterSeq(genFn, env) {
  var seq = new Seq(function () {
    var e2 = cloneEnvForIter(env);
    var gen = genFn(e2);
    return (function* () {
      while (true) {
        var r = gen.next();
        if (r.done) return;
        if (r.value && r.value.y) yield r.value.v;
      }
    })();
  });
  seq.isUserIter = true;
  return seq;
}

/* --- слотовая трансформация выражений --- */
function getPath(n, path) { var c = n; for (var i = 0; i < path.length; i++) c = c[path[i]]; return c; }
function setPath(n, path, val) {
  var c = Object.assign({}, n); c._s = undefined;
  if (path.length === 1) { c[path[0]] = val; return c; }
  var k = path[0], child = n[k];
  if (Array.isArray(child)) {
    var arr = child.slice(), idx = path[1], rest = path.slice(2);
    arr[idx] = rest.length ? setPath(child[idx], rest, val) : val; c[k] = arr; return c;
  }
  c[k] = setPath(child, path.slice(1), val); return c;
}
function kidsOf(n, cx) {
  var out = [];
  switch (n.k) {
    case 'Bin': out.push(['l'], ['r']); break;
    case 'Un': if (n.op !== '++' && n.op !== '--') out.push(['e']); break;
    case 'Cast': case 'Paren': case 'Is': case 'As': case 'SwE': case 'With': case 'ChkE': out.push(['e']); break;
    case 'Mem': out.push(['o']); break;
    case 'Idx': out.push(['o']); n.args.forEach(function (a, i) { out.push(['args', i]); }); break;
    case 'Call': {
      var f = n.f;
      if (f.k === 'Mem') { if (!(f.o.k === 'Base' || f.o.k === 'This' || ((f.o.k === 'Id' || f.o.k === 'Mem') && typeRef(f.o, cx)))) out.push(['f', 'o']); }
      else if (f.k !== 'Id') out.push(['f']);
      n.args.forEach(function (a, i) { if (a.e && !a.decl) out.push(['args', i, 'e']); });
      break;
    }
    case 'New': n.args.forEach(function (a, i) { if (a.e) out.push(['args', i, 'e']); }); break;
    case 'NewArr': n.dims.forEach(function (d, i) { out.push(['dims', i]); }); break;
    case 'ArrLit': n.items.forEach(function (d, i) { out.push(['items', i]); }); break;
    case 'Interp': n.parts.forEach(function (p, i) { if (typeof p !== 'string') out.push(['parts', i, 'e']); }); break;
    case 'Tup': n.items.forEach(function (d, i) { out.push(['items', i, 'e']); }); break;
    case 'Asg': { var l = n.l; if (l.k === 'Mem') out.push(['l', 'o']); else if (l.k === 'Idx') { out.push(['l', 'o']); l.args.forEach(function (a, i) { out.push(['l', 'args', i]); }); } out.push(['r']); break; }
    case 'Rng': if (n.a) out.push(['a']); if (n.b) out.push(['b']); break;
  }
  return out;
}
function gExpr(n, cx) {
  if (!suspends(n)) { var f = cExpr(n, cx); return function* (e) { return f(e); }; }
  switch (n.k) {
    case 'Await': { var inner = gExpr(n.e, cx); return function* (e) { var t = yield* inner(e); return yield { a: t }; }; }
    case 'Paren': return gExpr(n.e, cx);
    case 'Cond': { var c = gExpr(n.c, cx), a = gExpr(n.a, cx), b = gExpr(n.b, cx); return function* (e) { var t = yield* c(e); return t ? yield* a(e) : yield* b(e); }; }
    case 'Bin': if (n.op === '&&' || n.op === '||' || n.op === '??') {
      var l = gExpr(n.l, cx), r = gExpr(n.r, cx), op = n.op;
      return function* (e) { var x = yield* l(e); if (op === '&&') { if (x === false) return false; return yield* r(e); } if (op === '||') { if (x === true) return true; return yield* r(e); } return (x !== null && x !== undefined) ? x : yield* r(e); };
    } break;
    case 'ThrowE': { var te = gExpr(n.e, cx); return function* (e) { var x = yield* te(e); if (x === null) npe(); throw new CsThrow(x); }; }
    case 'Lam': break;
  }
  var paths = kidsOf(n, cx), last = -1;
  paths.forEach(function (p, i) { if (suspends(getPath(n, p))) last = i; });
  if (last < 0) throw new CsError('CS8652', 'await в этом месте не поддерживается мини-интерпретатором', n.line, n.col);
  var fns = [], n2 = n;
  for (var i = 0; i <= last; i++) { fns.push(gExpr(getPath(n, paths[i]), cx)); n2 = setPath(n2, paths[i], { k: 'Slot', i: i, line: n.line, col: n.col }); }
  var comb = cExpr(n2, cx);
  return function* (e) {
    var slots = new Array(fns.length);
    for (var j = 0; j < fns.length; j++) slots[j] = yield* fns[j](e);
    var old = e.$s; e.$s = slots;
    try { return comb(e); } finally { e.$s = old; }
  };
}
function gCond(c, cx) {
  if (!suspends(c)) { var f = cCond(c, cx); return function* (e) { return f(e); }; }
  var g = gExpr(c, cx);
  return function* (e) { var v = yield* g(e); return v === true; };
}
function sG(n, cx) {
  if (!suspends(n)) { var f = cStmt(n, cx); return { f: f }; }
  return { g: cStmtG(n, cx) };
}
function sGscoped(n, cx) {
  if (!suspends(n)) { var f = cStmtScoped(n, cx); return { f: f }; }
  if (n.k === 'Blk') return { g: cBlockG(n, cx, false) };
  pushScope(cx); var g = cStmtG(n, cx); var sz = cx.scopes[cx.scopes.length - 1].size; popScope(cx);
  return { g: sz ? function* (e) { return yield* g(Object.create(e)); } : g };
}
function runPart(p, e) { return p.g ? p.g(e) : null; }
function cBlockG(n, cx, reuse) {
  pushScope(cx);
  var scope = cx.scopes[cx.scopes.length - 1];
  var lfns = n.ss.filter(function (s) { return s.k === 'LFn'; });
  lfns.forEach(function (lf) { declare(cx, lf.name, null, null, lf, {}); });
  var ss = n.ss.slice();
  for (var i = 0; i < ss.length; i++) {
    if (ss[i].k === 'Using' && !ss[i].body) { var rest = ss.splice(i + 1); ss[i] = Object.assign({}, ss[i], { body: { k: 'Blk', ss: rest, line: ss[i].line, col: ss[i].col } }); ss[i]._s = undefined; break; }
  }
  var parts = [], lfInit = [];
  ss.forEach(function (s) { if (s.k === 'LFn') { lfInit.push(cLocalFn(s, cx)); return; } parts.push(sG(s, cx)); });
  var needsEnv = scope.size > 0;
  popScope(cx);
  return function* (e0) {
    var e = (reuse || !needsEnv) ? e0 : Object.create(e0);
    for (var j = 0; j < lfInit.length; j++) lfInit[j](e);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], s;
      if (p.g) s = yield* p.g(e); else s = p.f(e);
      if (s) return s;
    }
  };
}
function cStmtG(n, cx) {
  switch (n.k) {
    case 'Blk': return cBlockG(n, cx, false);
    case 'Expr': { var ef = gExpr(n.e, cx); return function* (e) { yield* ef(e); }; }
    case 'Decl': {
      if (n.decon) { var rg = gExpr(n.init, cx); var n3 = Object.assign({}, n, { init: { k: 'Slot', i: 0, line: n.line, col: n.col } }); n3._s = undefined; var dc = cStmt(n3, cx); return function* (e) { var v = yield* rg(e); var old = e.$s; e.$s = [v]; try { dc(e); } finally { e.$s = old; } }; }
      var paths = []; n.vars.forEach(function (v, i) { if (v.init) paths.push(['vars', i, 'init']); });
      var last = -1; paths.forEach(function (p, i) { if (suspends(getPath(n, p))) last = i; });
      var fns = [], n2 = n;
      for (var i = 0; i <= last; i++) { fns.push(gExpr(getPath(n, paths[i]), cx)); n2 = setPath(n2, paths[i], { k: 'Slot', i: i, line: n.line, col: n.col }); }
      var comb = cStmt(n2, cx);
      return function* (e) { var slots = new Array(fns.length); for (var j = 0; j < fns.length; j++) slots[j] = yield* fns[j](e); var old = e.$s; e.$s = slots; try { comb(e); } finally { e.$s = old; } };
    }
    case 'Ret': {
      var rt = cx.retT ? (cx.async ? unwrapRet(cx.retT, true) : cx.retT) : null;
      if (n.e && rt && !cx.inLambda) {
        if (rt.n === 'void') throw new CsError('CS0127', 'Метод возвращает void, возвращать значение нельзя', n.line, n.col);
        if (!cx.iter) checkAssign(stName(rt), stOf(n.e, cx), n.e, n.e.k === 'Lit');
      }
      if (!n.e) return function* () { RV = undefined; return SIG_RET; };
      var rg2 = gExpr(n.e, cx);
      return function* (e) { var v = yield* rg2(e); RV = (v instanceof Obj && v.c.isStruct) ? cloneStruct(v) : v; return SIG_RET; };
    }
    case 'Throw': {
      if (!n.e) return cStmt(n, cx) && function* (e) { var x = e.$exc; throw x; };
      var tg = gExpr(n.e, cx);
      return function* (e) { var x = yield* tg(e); if (x === null) npe(); if (!(x instanceof Obj) || !x.c.isExc) throw new CsError('CS0155', 'Можно генерировать только объекты, производные от System.Exception', n.line, n.col); if (!x.f.$trace || !x.f.$trace.length) x.f.$trace = CUR_STACK.slice(-8).reverse(); throw new CsThrow(x); };
    }
    case 'Yield': { var yg = gExpr(n.e, cx); return function* (e) { var v = yield* yg(e); yield { y: 1, v: cp(v) }; }; }
    case 'YBrk': return function* () { return SIG_YBRK; };
    case 'If': {
      var c = gCond(n.c, cx), th = sGscoped(n.th, cx), el = n.el ? sGscoped(n.el, cx) : null;
      return function* (e) {
        var t = yield* c(e);
        if (t) return th.g ? yield* th.g(e) : th.f(e);
        if (el) return el.g ? yield* el.g(e) : el.f(e);
      };
    }
    case 'While': case 'Do': {
      var wc = gCond(n.c, cx), wb = sGscoped(n.body, cx), isDo = n.k === 'Do';
      return function* (e) {
        var first = isDo;
        while (first || (yield* wc(e))) {
          first = false; TICK();
          var s = wb.g ? yield* wb.g(e) : wb.f(e);
          if (s) { if (s === SIG_BRK) break; if (s === SIG_CNT) { if (isDo && !(yield* wc(e))) break; continue; } return s; }
          if (isDo && !(yield* wc(e))) break;
        }
      };
    }
    case 'For': {
      pushScope(cx);
      var init = null;
      if (n.init) { if (Array.isArray(n.init)) { var fs = n.init.map(function (s) { return sG(s, cx); }); init = function* (e) { for (var i = 0; i < fs.length; i++) { if (fs[i].g) yield* fs[i].g(e); else fs[i].f(e); } }; } else { var di = sG(n.init, cx); init = di.g ? di.g : function* (e) { di.f(e); }; } }
      var cond = n.c ? gCond(n.c, cx) : null, inc = n.inc.map(function (x) { return gExpr(x, cx); });
      var body = sGscoped(n.body, cx);
      popScope(cx);
      return function* (e0) {
        var e = Object.create(e0);
        if (init) yield* init(e);
        while (cond === null || (yield* cond(e))) {
          TICK();
          var s = body.g ? yield* body.g(e) : body.f(e);
          if (s) { if (s === SIG_BRK) break; if (s !== SIG_CNT) return s; }
          for (var i = 0; i < inc.length; i++) yield* inc[i](e);
        }
      };
    }
    case 'Foreach': {
      var eg = gExpr(n.e, cx);
      pushScope(cx);
      var t = n.t, isVar = t.n === 'var', co = isVar ? null : mkCoerce(t), name = n.n, decon = null;
      if (n.decon) decon = n.decon.map(function (d) { declare(cx, d.n, null, null, n, {}); return d.n; }); else declare(cx, name, isVar ? null : t, isVar ? null : stName(t), n, {});
      var fb = sGscoped(n.body, cx);
      popScope(cx);
      return function* (e) {
        var coll = yield* eg(e); if (coll === null || coll === undefined) npe();
        var it = iterOf(coll);
        for (var r = it.next(); !r.done; r = it.next()) {
          TICK();
          var env2 = Object.create(e), v2 = r.value;
          if (decon) { var vals = deconstruct(v2, decon.length); for (var j = 0; j < decon.length; j++) env2[decon[j]] = new Box(cp(vals[j])); }
          else { var b2 = new Box(co ? co(v2) : cp(v2), t); b2.co = co; env2[name] = b2; }
          var s2 = fb.g ? yield* fb.g(env2) : fb.f(env2);
          if (s2) { if (s2 === SIG_BRK) break; if (s2 === SIG_CNT) continue; return s2; }
        }
      };
    }
    case 'Try': {
      var tb = cBlockG(n.b, cx, false);
      var catches = n.catches.map(function (c) {
        pushScope(cx);
        var test = c.t ? mkTypeTest(c.t) : null;
        if (c.n) declare(cx, c.n, c.t, null, c, {});
        var when = c.when ? cExpr(c.when, cx) : null;
        var b = cBlockG(c.body, cx, false);
        popScope(cx);
        return { test: test, name: c.n, when: when, body: b };
      });
      var fin = n.fin ? cBlockG(n.fin, cx, false) : null;
      return function* (e) {
        var sig, pending = null, has = false;
        try {
          try { sig = yield* tb(e); }
          catch (ex) {
            if (ex instanceof RangeError && /call stack/i.test(ex.message)) throw new Fatal('Stack overflow.');
            if (!(ex instanceof CsThrow)) throw ex;
            var handled = false;
            for (var i = 0; i < catches.length; i++) {
              var c = catches[i];
              if (c.test && !c.test(ex.obj)) continue;
              var env = Object.create(e); env.$exc = ex;
              if (c.name) env[c.name] = new Box(ex.obj);
              if (c.when && c.when(env) !== true) continue;
              handled = true; sig = yield* c.body(env); break;
            }
            if (!handled) throw ex;
          }
        } catch (ex2) { pending = ex2; has = true; }
        if (fin) { var saved = RV; var fs = yield* fin(e); if (fs) return fs; RV = saved; }
        if (has) throw pending;
        return sig;
      };
    }
    case 'Using': {
      pushScope(cx);
      var nm = null, initG;
      if (n.decl) { initG = gExpr(n.decl.init, cx); nm = n.decl.n; declare(cx, nm, n.decl.t.n === 'var' ? null : n.decl.t, null, n, {}); } else initG = gExpr(n.e, cx);
      var ub = n.body ? sGscoped(n.body, cx) : { f: function () { } };
      popScope(cx);
      return function* (e0) {
        var e = Object.create(e0), obj = yield* initG(e);
        if (nm) e[nm] = new Box(obj);
        var sig, err = null, has = false;
        try { sig = ub.g ? yield* ub.g(e) : ub.f(e); } catch (ex) { err = ex; has = true; }
        if (obj !== null && obj !== undefined) { try { disposeObj(obj); } catch (ex2) { if (!has) { err = ex2; has = true; } } }
        if (has) throw err;
        return sig;
      };
    }
    case 'Lock': case 'Chk': { var lb = sGscoped(n.body, cx); return function* (e) { return lb.g ? yield* lb.g(e) : lb.f(e); }; }
    case 'Sw': {
      var sg = gExpr(n.e, cx);
      pushScope(cx);
      var secs = n.sections.map(function (s) {
        var labs = s.labels.map(function (l) { if (l.dflt) return { dflt: true }; return { pt: cPattern(l.pat, cx), wf: l.when ? cExpr(l.when, cx) : null }; });
        pushScope(cx);
        if (s.body.length && !terminatesSw(s.body)) throw new CsError('CS8070', 'Управление не может переходить от одной метки case к другой (добавьте break, return или throw)', n.line, n.col);
        var b = cBlockG({ k: 'Blk', ss: s.body, line: n.line, col: n.col }, cx, true);
        popScope(cx);
        return { labs: labs, body: b };
      });
      popScope(cx);
      return function* (e0) {
        var v = yield* sg(e0), e = Object.create(e0), hit = null, dflt = null;
        outer: for (var i = 0; i < secs.length; i++) {
          for (var j = 0; j < secs[i].labs.length; j++) {
            var l = secs[i].labs[j];
            if (l.dflt) { dflt = secs[i]; continue; }
            if (l.pt(e, v) && (!l.wf || l.wf(e) === true)) { hit = secs[i]; break outer; }
          }
        }
        var sec = hit || dflt; if (!sec) return;
        var s = yield* sec.body(e);
        if (s === SIG_BRK) return;
        return s;
      };
    }
  }
  throw new CsError('CS8652', 'Оператор «' + n.k + '» с await/yield не поддерживается', n.line, n.col);
}
// тело async-метода/итератора → function(env)
function cMethodBodyG(bodyNode, cx, isAsync, m) {
  var g = cBlockG(bodyNode, cx, true);
  if (isAsync) {
    var isVoid = !!(m && m.ret && m.ret.n === 'void');
    var co = m && m.ret ? mkCoerce(unwrapRet(m.ret, true)) : null;
    return function (env) { return runAsync(g, env, isVoid, co); };
  }
  return function (env) { return makeIterSeq(g, env); };
}
function cLambdaAsyncBody(n, lcx) {
  var g;
  if (n.body.k === 'Blk') g = cBlockG(n.body, lcx, true);
  else { var eg = gExpr(n.body, lcx); g = function* (e) { var v = yield* eg(e); RV = v; return SIG_RET; }; }
  return function (env) { return runAsync(g, env, false, null); };
}
