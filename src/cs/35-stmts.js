/* ---------- операторы ---------- */
function terminates(s) {
  if (!s) return false;
  switch (s.k) {
    case 'Ret': case 'Throw': return true;
    case 'Blk': return s.ss.some(terminates);
    case 'If': return !!s.el && terminates(s.th) && terminates(s.el);
    case 'While': return isTrue(s.c) && !hasBreak(s.body);
    case 'Do': return (isTrue(s.c) && !hasBreak(s.body)) || (terminates(s.body) && !hasBreak(s.body) && false);
    case 'For': return (!s.c || isTrue(s.c)) && !hasBreak(s.body);
    case 'Try': { if (s.fin && terminates(s.fin)) return true; return terminates(s.b) && s.catches.every(function (c) { return terminates(c.body); }); }
    case 'Sw': { var hasDef = s.sections.some(function (x) { return x.labels.some(function (l) { return l.dflt; }); }); return hasDef && s.sections.every(function (x) { return x.body.some(terminates) || (x.body.length && lastTerm(x.body)); }) && !s.sections.some(function (x) { return x.body.some(function (b) { return hasBreak(b, true); }); }); }
    case 'Using': case 'Lock': case 'Chk': return terminates(s.body);
  }
  return false;
}
function lastTerm(body) { return terminates(body[body.length - 1]); }
function isTrue(c) { return c && c.k === 'Lit' && c.v === true; }
function hasBreak(s, inSwitch) {
  if (!s || typeof s !== 'object') return false;
  if (Array.isArray(s)) return s.some(function (x) { return hasBreak(x, inSwitch); });
  if (s.k === 'Brk') return true;
  if (s.k === 'While' || s.k === 'Do' || s.k === 'For' || s.k === 'Foreach' || s.k === 'Lam' || s.k === 'LFn') return false;
  if (s.k === 'Sw' && !inSwitch) return false;
  if (s.k === 'Blk') return s.ss.some(function (x) { return hasBreak(x, inSwitch); });
  if (s.k === 'If') return hasBreak(s.th, inSwitch) || hasBreak(s.el, inSwitch);
  if (s.k === 'Try') return hasBreak(s.b, inSwitch) || s.catches.some(function (c) { return hasBreak(c.body, inSwitch); }) || hasBreak(s.fin, inSwitch);
  if (s.k === 'Using' || s.k === 'Lock' || s.k === 'Chk') return hasBreak(s.body, inSwitch);
  if (s.k === 'Sw') return s.sections.some(function (x) { return hasBreak(x.body, inSwitch); });
  return false;
}
function suspends(n) {
  if (n === null || typeof n !== 'object') return false;
  if (Array.isArray(n)) { for (var i = 0; i < n.length; i++) if (suspends(n[i])) return true; return false; }
  if (n._s !== undefined) return n._s;
  var r = false, k = n.k;
  if (k === 'Await' || k === 'Yield' || k === 'YBrk') r = true;
  else if (k === 'Lam' || k === 'LFn' || k === 'Class' || k === 'T') r = false;
  else for (var key in n) { if (key === 'k' || key === 'line' || key === 'col' || key === '_s') continue; var v = n[key]; if (v && typeof v === 'object' && suspends(v)) { r = true; break; } }
  n._s = r; return r;
}
function hasYield(n) {
  if (n === null || typeof n !== 'object') return false;
  if (Array.isArray(n)) return n.some(hasYield);
  var k = n.k;
  if (k === 'Yield' || k === 'YBrk') return true;
  if (k === 'Lam' || k === 'LFn' || k === 'Class' || k === 'T') return false;
  for (var key in n) { if (key === 'k' || key === 'line' || key === 'col' || key === '_s') continue; var v = n[key]; if (v && typeof v === 'object' && hasYield(v)) return true; }
  return false;
}

function cBlockBody(n, cx) { return cBlock(n, cx, true); }
function cBlock(n, cx, reuse) {
  pushScope(cx);
  var scope = cx.scopes[cx.scopes.length - 1];
  var lfns = n.ss.filter(function (s) { return s.k === 'LFn'; });
  lfns.forEach(function (lf) { declare(cx, lf.name, null, null, lf, {}); });
  var ss = n.ss.slice();
  // using-объявление: остаток блока становится телом
  for (var i = 0; i < ss.length; i++) {
    if (ss[i].k === 'Using' && !ss[i].body) { var rest = ss.splice(i + 1); ss[i] = Object.assign({}, ss[i], { body: { k: 'Blk', ss: rest, line: ss[i].line, col: ss[i].col } }); break; }
  }
  var fns = [], lfInit = [];
  ss.forEach(function (s) {
    if (s.k === 'LFn') { lfInit.push(cLocalFn(s, cx)); return; }
    fns.push(cStmt(s, cx));
  });
  var needsEnv = scope.size > 0;
  popScope(cx);
  var nf = fns.length, nlf = lfInit.length;
  if (reuse || !needsEnv) {
    if (!nlf) {
      if (nf === 1) return fns[0];
      if (nf === 2) { var a = fns[0], b = fns[1]; return function (e) { var s = a(e); if (s) return s; return b(e); }; }
      return function (e) { for (var i = 0; i < nf; i++) { var s = fns[i](e); if (s) return s; } };
    }
    return function (e) { for (var j = 0; j < nlf; j++) lfInit[j](e); for (var i = 0; i < nf; i++) { var s = fns[i](e); if (s) return s; } };
  }
  return function (e0) {
    var e = Object.create(e0);
    for (var j = 0; j < nlf; j++) lfInit[j](e);
    for (var i = 0; i < nf; i++) { var s = fns[i](e); if (s) return s; }
  };
}
function cLocalFn(n, cx) {
  var m = new MethodDef(n.name, cx.cls);
  var lcx = Object.create(cx); lcx.retT = n.ret; lcx.async = !!n.mods.async; lcx.iter = false; lcx.inLambda = (cx.inLambda || 0) + 1;
  pushScope(cx);
  var ps = n.ps.map(function (p) { declare(cx, p.n, p.t, stName(p.t), n, { param: true, lambdaParam: true }); return { n: p.n, t: p.t, mod: p.mod, co: mkCoerce(p.t), defFn: p.def ? cExpr(p.def, cx) : null }; });
  var np = ps.length, nreq = ps.filter(function (p) { return !p.defFn && p.mod !== 'params'; }).length;
  var body = null, fn = n.name, retCo = n.ret && n.ret.n !== 'void' ? mkCoerce(unwrapRet(n.ret, lcx.async)) : null;
  var bodyNode = n.body || { k: 'Blk', ss: [{ k: 'Ret', e: n.expr, line: n.line, col: n.col }], line: n.line, col: n.col };
  var isIter = !lcx.async && hasYield(bodyNode), asyncB = null, iterB = null;
  if (lcx.async) asyncB = cMethodBodyG(bodyNode, lcx, true, { ret: n.ret });
  else if (isIter) iterB = cMethodBodyG(bodyNode, lcx, false, null);
  else body = cBlock(bodyNode, lcx, true);
  popScope(cx);
  return function (e) {
    var f = new Fn(function (args) {
      var env = Object.create(e);
      bindArgs({ ps: ps }, env, args);
      if (asyncB) return asyncB(env);
      if (iterB) return iterB(env);
      if (++DEPTH > MAXDEPTH) { DEPTH = 0; throw new Fatal('Stack overflow.'); }
      var sig; try { sig = body(env); } finally { DEPTH--; }
      if (sig === SIG_RET) { var r = RV; RV = undefined; return retCo ? retCo(r) : r; }
    }, np, fn);
    f.ps = ps;
    e[fn] = new Box(f);
  };
}
function unwrapRet(t, isAsync) { if (isAsync && t && (t.n === 'Task' || t.n === 'ValueTask') && t.args && t.args.length) return t.args[0]; return t; }

function cStmt(n, cx) {
  switch (n.k) {
    case 'Empty': return function () { };
    case 'Blk': return cBlock(n, cx, false);
    case 'Expr': {
      var f = cExpr(n.e, cx);
      return function (e) { f(e); };
    }
    case 'Decl': return cDecl(n, cx);
    case 'If': {
      var c = cCond(n.c, cx), th = cStmtScoped(n.th, cx), el = n.el ? cStmtScoped(n.el, cx) : null;
      if (!el) return function (e) { if (c(e)) return th(e); };
      return function (e) { if (c(e)) return th(e); return el(e); };
    }
    case 'While': {
      var wc = cCond(n.c, cx), wb = cStmtScoped(n.body, cx);
      return function (e) { while (wc(e)) { TICK(); var s = wb(e); if (s) { if (s === SIG_BRK) break; if (s === SIG_CNT) continue; return s; } } };
    }
    case 'Do': {
      var dc = cCond(n.c, cx), db = cStmtScoped(n.body, cx);
      return function (e) { do { TICK(); var s = db(e); if (s) { if (s === SIG_BRK) break; if (s === SIG_CNT) continue; return s; } } while (dc(e)); };
    }
    case 'For': return cFor(n, cx);
    case 'Foreach': return cForeach(n, cx);
    case 'Ret': return cReturn(n, cx);
    case 'Brk': return function () { return SIG_BRK; };
    case 'Cnt': return function () { return SIG_CNT; };
    case 'Throw': {
      if (!n.e) return function (e) { var x = e.$exc; if (!x) throw new CsError('CS0156', 'Оператор throw без выражения допустим только в блоке catch', n.line, n.col); throw x; };
      var te = cExpr(n.e, cx);
      return function (e) { var x = te(e); if (x === null || x === undefined) npe(); if (!(x instanceof Obj) || !x.c.isExc) throw new CsError('CS0155', 'Можно генерировать только объекты, производные от System.Exception', n.line, n.col); if (!x.f.$trace || !x.f.$trace.length) x.f.$trace = CUR_STACK.slice(-8).reverse(); throw new CsThrow(x); };
    }
    case 'Try': return cTry(n, cx);
    case 'Sw': return cSwitch(n, cx);
    case 'Using': return cUsing(n, cx);
    case 'Lock': { var le = cExpr(n.e, cx), lb = cStmtScoped(n.body, cx); return function (e) { var o = le(e); if (o === null) throwNew('ArgumentNullException', "Value cannot be null. (Parameter 'obj')"); return lb(e); }; }
    case 'Chk': { var cb = cBlock(n.body, cx, false), on = n.on; return function (e) { var old = CHK; CHK = on ? 1 : 0; try { return cb(e); } finally { CHK = old; } }; }
    case 'LFn': { declare(cx, n.name, null, null, n, {}); return cLocalFn(n, cx); }
    case 'Yield': case 'YBrk': throw new CsError('CS1624', 'Тело метода не может быть блоком итератора', n.line, n.col);
  }
  throw new CsError('CS8652', 'Оператор «' + n.k + '» не поддерживается', n.line, n.col);
}
function cStmtScoped(n, cx) { // вложенный оператор в собственной области видимости
  if (n.k === 'Blk') return cBlock(n, cx, false);
  pushScope(cx); var f = cStmt(n, cx); var sz = cx.scopes[cx.scopes.length - 1].size; popScope(cx);
  if (n.k === 'Decl') throw new CsError('CS1023', 'Встроенное выражение объявления недопустимо в этом контексте', n.line, n.col);
  return sz ? function (e) { return f(Object.create(e)); } : f;
}
function cCond(c, cx) {
  var st = stOf(c, cx);
  if (st && st !== 'bool' && st !== 'null') throw new CsError('CS0029', 'Не удаётся неявно преобразовать тип «' + st + '» в «bool»', c.line, c.col);
  var f = cExpr(c, cx);
  return function (e) { var v = f(e); if (v === true) return true; if (v === false) return false; if (v === null || v === undefined) return false; return condErr(); };
}
function cDecl(n, cx) {
  var t = n.t, isVar = t.n === 'var';
  if (n.decon) return cDeclDecon(n, cx);
  var co = isVar ? null : mkCoerce(t);
  var items = n.vars.map(function (v) {
    var initF = null;
    if (v.init) {
      var it = v.init.k === 'ArrLit' && !v.init.coll ? cArrLit(v.init, cx, t) : cExpr(v.init, cx, isVar ? null : t);
      initF = it;
      if (!isVar) {
        if (v.init.k !== 'ArrLit') checkAssign(stName(t), stOf(v.init, cx), v.init, v.init.k === 'Lit');
        if (v.init.k === 'Lit' && v.init.ty === 'null' && NUMR[t.n] !== undefined && !t.nullable && !t.arr) throw new CsError('CS0037', 'Не удаётся преобразовать null в «' + t.n + '», так как это тип значения, не допускающий значения NULL', v.init.line, v.init.col);
      } else if (v.init.k === 'Lit' && v.init.ty === 'null') throw new CsError('CS0815', 'Не удаётся присвоить null неявно типизированной переменной', v.init.line, v.init.col);
    } else if (isVar) throw new CsError('CS0818', 'Неявно типизированные переменные должны быть инициализированы', v.line, v.col);
    var st = isVar ? (v.init ? stOf(v.init, cx) : null) : stName(t);
    if (st === 'null') st = null;
    declare(cx, v.n, isVar ? null : t, st, v, {});
    return { n: v.n, initF: initF };
  });
  var dflt = isVar ? null : defaultOfT(t), isStructT = !isVar && USER[t.n] && USER[t.n].isStruct && !t.nullable;
  if (items.length === 1) {
    var it0 = items[0], nm = it0.n, ini = it0.initF;
    if (ini) return function (e) { var v = ini(e); var b; if (co) { b = new Box(co(v), t); b.co = co; } else if (isVar) { b = new Box(cp(v), t); b.co = inferCo(v); } else { b = new Box(cp(v), t); } e[nm] = b; };
    return function (e) { e[nm] = new Box(isStructT ? defaultOfT(t) : dflt, t); };
  }
  return function (e) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i], b;
      if (it.initF) { var v = it.initF(e); b = new Box(co ? co(v) : cp(v), t); b.co = co || (isVar ? inferCo(v) : null); } else b = new Box(isStructT ? defaultOfT(t) : dflt, t);
      e[it.n] = b;
    }
  };
}
function cDeclDecon(n, cx) {
  var rf = cExpr(n.init, cx);
  var names = n.decon.map(function (d) { declare(cx, d.n, d.t && d.t.n !== 'var' ? d.t : null, d.t && d.t.n !== 'var' ? stName(d.t) : null, n, {}); return { n: d.n, co: d.t && d.t.n !== 'var' ? mkCoerce(d.t) : null }; });
  return function (e) { var vals = deconstruct(rf(e), names.length); names.forEach(function (d, i) { var b = new Box(cp(vals[i])); if (d.co) b.v = d.co(vals[i]); b.co = d.co; e[d.n] = b; }); };
}
function cFor(n, cx) {
  pushScope(cx);
  var init = null;
  if (n.init) { if (Array.isArray(n.init)) { var fs = n.init.map(function (s) { return cStmt(s, cx); }); init = function (e) { fs.forEach(function (f) { f(e); }); }; } else init = cDecl(n.init, cx); }
  var cond = n.c ? cCond(n.c, cx) : null, inc = n.inc.map(function (x) { return cExpr(x, cx); });
  var body = cStmtScoped(n.body, cx);
  popScope(cx);
  var ni = inc.length, i0 = inc[0];
  return function (e0) {
    var e = Object.create(e0);
    if (init) init(e);
    for (; cond === null || cond(e); ) {
      TICK();
      var s = body(e);
      if (s) { if (s === SIG_BRK) break; if (s !== SIG_CNT) return s; }
      if (ni === 1) i0(e); else for (var i = 0; i < ni; i++) inc[i](e);
    }
  };
}
function cForeach(n, cx) {
  var ef = cExpr(n.e, cx);
  pushScope(cx);
  var t = n.t, isVar = t.n === 'var', co = isVar ? null : mkCoerce(t);
  var name = n.n, decon = null;
  if (n.decon) decon = n.decon.map(function (d) { declare(cx, d.n, null, null, n, {}); return d.n; });
  else declare(cx, name, isVar ? null : t, isVar ? null : stName(t), n, {});
  var body = cStmtScoped(n.body, cx);
  popScope(cx);
  return function (e) {
    var coll = ef(e);
    if (coll === null || coll === undefined) npe();
    if (coll instanceof Arr && !decon) {
      var a = coll.a;
      for (var i = 0; i < a.length; i++) {
        TICK();
        var env = Object.create(e), v = a[i];
        var b = new Box(co ? co(v) : cp(v), t); b.co = co; env[name] = b;
        var s = body(env);
        if (s) { if (s === SIG_BRK) break; if (s === SIG_CNT) continue; return s; }
      }
      return;
    }
    var it = iterOf(coll);
    for (var r = it.next(); !r.done; r = it.next()) {
      TICK();
      var env2 = Object.create(e), v2 = r.value;
      if (decon) { var vals = deconstruct(v2, decon.length); for (var j = 0; j < decon.length; j++) env2[decon[j]] = new Box(cp(vals[j])); }
      else { var b2 = new Box(co ? co(v2) : cp(v2), t); b2.co = co; env2[name] = b2; }
      var s2 = body(env2);
      if (s2) { if (s2 === SIG_BRK) { if (it.return) it.return(); break; } if (s2 === SIG_CNT) continue; if (it.return) it.return(); return s2; }
    }
  };
}
function cReturn(n, cx) {
  var rt = cx.retT;
  if (cx.async && rt) rt = unwrapRet(rt, true);
  if (!n.e) {
    if (rt && rt.n !== 'void' && !cx.inLambda && !cx.iter && !(cx.async && (cx.retT.n === 'Task' || cx.retT.n === 'ValueTask'))) throw new CsError('CS0126', 'Метод должен возвращать значение, так как его тип возврата не void', n.line, n.col);
    return function () { RV = undefined; return SIG_RET; };
  }
  if (rt && !cx.inLambda) {
    if (rt.n === 'void' && !rt.arr) throw new CsError('CS0127', 'Метод возвращает void, возвращать значение нельзя', n.line, n.col);
    if (cx.async && (cx.retT.n === 'Task' || cx.retT.n === 'ValueTask') && !cx.retT.args.length) throw new CsError('CS1997', 'Асинхронный метод Task не может возвращать значение', n.line, n.col);
    if (!cx.iter) checkAssign(stName(rt), stOf(n.e, cx), n.e, n.e.k === 'Lit');
  }
  var f = cExpr(n.e, cx, rt);
  return function (e) { var v = f(e); RV = (v instanceof Obj && v.c.isStruct) ? cloneStruct(v) : v; return SIG_RET; };
}
function isCatchAll(c) { return !c.t; }
function cTry(n, cx) {
  var body = cBlock(n.b, cx, false);
  var catches = n.catches.map(function (c) {
    pushScope(cx);
    var test = c.t ? mkTypeTest(c.t) : null;
    if (c.t && !EXC[c.t.n] && !USER[c.t.n] && c.t.n !== 'Exception') throw new CsError('CS0246', 'Не удалось найти тип «' + c.t.n + '»', c.line, 0);
    if (c.n) declare(cx, c.n, c.t, null, c, {});
    var when = c.when ? cExpr(c.when, cx) : null;
    var b = cBlock(c.body, cx, false);
    popScope(cx);
    return { test: test, name: c.n, when: when, body: b };
  });
  // CS0160: предыдущий catch уже перехватывает все исключения этого типа
  for (var i = 1; i < n.catches.length; i++) {
    var ci = n.catches[i];
    for (var j = 0; j < i; j++) { var cj = n.catches[j]; if (!cj.when && (!cj.t || (ci.t && isBaseExc(cj.t.n, ci.t.n)))) throw new CsError('CS0160', 'Предыдущий блок catch уже перехватывает все исключения этого или супертипа («' + (cj.t ? cj.t.n : 'System.Object') + '»)', ci.line, 0); }
  }
  var fin = n.fin ? cBlock(n.fin, cx, false) : null;
  return function (e) {
    var sig, pending = null, has = false;
    try {
      try { sig = body(e); }
      catch (ex) {
        var cs = ex;
        if (ex instanceof RangeError && /call stack/i.test(ex.message)) throw new Fatal('Stack overflow.');
        if (!(ex instanceof CsThrow)) throw ex;
        var handled = false;
        for (var i = 0; i < catches.length; i++) {
          var c = catches[i];
          if (c.test && !c.test(ex.obj)) continue;
          var env = Object.create(e); env.$exc = ex;
          if (c.name) env[c.name] = new Box(ex.obj);
          if (c.when && c.when(env) !== true) continue;
          handled = true; sig = c.body(env); break;
        }
        if (!handled) throw ex;
      }
    } catch (ex2) { pending = ex2; has = true; }
    if (fin) { var saved = RV; var fs = fin(e); if (fs) return fs; RV = saved; }
    if (has) throw pending;
    return sig;
  };
}
function isBaseExc(base, derived) { var d = EXC[derived] || USER[derived], b = EXC[base] || USER[base]; return d && b && isSubclass(d, b); }
function cUsing(n, cx) {
  pushScope(cx);
  var nm = null, initF;
  if (n.decl) { initF = cExpr(n.decl.init, cx, n.decl.t); nm = n.decl.n; declare(cx, nm, n.decl.t.n === 'var' ? null : n.decl.t, null, n, {}); } else initF = cExpr(n.e, cx);
  var body = n.body ? cStmtScoped(n.body, cx) : function () { };
  popScope(cx);
  return function (e0) {
    var e = Object.create(e0), obj = initF(e);
    if (nm) e[nm] = new Box(obj);
    var sig, err = null, has = false;
    try { sig = body(e); } catch (ex) { err = ex; has = true; }
    if (obj !== null && obj !== undefined) { try { disposeObj(obj); } catch (ex2) { if (!has) { err = ex2; has = true; } } }
    if (has) throw err;
    return sig;
  };
}
function disposeObj(o) {
  if (o instanceof Obj) { var m = findMethod(o.c, 'Dispose', 0); if (m) invoke(m, o, []); else { var m2 = findMethod(o.c, 'DisposeAsync', 0); if (m2) invoke(m2, o, []); } }
  else if (o && typeof o.Dispose === 'function') o.Dispose();
}
function cSwitch(n, cx) {
  var ef = cExpr(n.e, cx);
  pushScope(cx);
  var secs = n.sections.map(function (s) {
    var labs = s.labels.map(function (l) {
      if (l.dflt) return { dflt: true };
      var pt = cPattern(l.pat, cx), wf = l.when ? cExpr(l.when, cx) : null;
      return { pt: pt, wf: wf };
    });
    pushScope(cx);
    var bodyNode = { k: 'Blk', ss: s.body, line: n.line, col: n.col };
    // C# запрещает «проваливание» между секциями
    if (s.body.length && !terminatesSw(s.body)) throw new CsError('CS8070', 'Управление не может переходить от одной метки case к другой (добавьте break, return или throw)', s.body[s.body.length - 1].line || n.line, s.body[s.body.length - 1].col || n.col);
    var b = cBlock(bodyNode, cx, true);
    popScope(cx);
    return { labs: labs, body: b };
  });
  popScope(cx);
  return function (e0) {
    var v = ef(e0), e = Object.create(e0), hit = null, dflt = null;
    outer: for (var i = 0; i < secs.length; i++) {
      var labs = secs[i].labs;
      for (var j = 0; j < labs.length; j++) {
        var l = labs[j];
        if (l.dflt) { dflt = secs[i]; continue; }
        if (l.pt(e, v) && (!l.wf || l.wf(e) === true)) { hit = secs[i]; break outer; }
      }
    }
    var sec = hit || dflt;
    if (!sec) return;
    var s = sec.body(e);
    if (s === SIG_BRK) return;
    return s;
  };
}
function terminatesSw(body) {
  var last = body[body.length - 1];
  if (!last) return false;
  if (last.k === 'Brk' || last.k === 'Ret' || last.k === 'Throw' || last.k === 'Cnt') return true;
  return terminates(last) || (last.k === 'Blk' && (last.ss.length && terminatesSw(last.ss)));
}
