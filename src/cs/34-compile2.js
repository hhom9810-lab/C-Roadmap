/* ---------- вызовы, создание объектов, лямбды, паттерны ---------- */
function cCall(n, cx) {
  var f = n.f, args = n.args;
  if (f.k === 'Id') {
    var name = f.n, sc = lookupLocal(cx, name);
    if (sc) { var ev0 = argEval(args, cx); return function (e) { var fv = e[name].v, a0 = ev0(e); if (ev0.names && fv && fv.ps) a0 = nameArgs({ ps: fv.ps, name: name }, a0, ev0.names); return callFn(fv, a0); }; }
    var m = lookupMember(cx, name);
    if (m && m.kind === 'method') {
      var cls = m.cls, owner = m.owner, inChain = owner === cx.cls;
      var ev = argEval(args, cx), names = ev.names;
      pendingChecks.push(function () { checkCallArity(cls, name, args.length, n, ev.names); });
      return function (e) {
        var a = ev(e), self = null, lst;
        if (!cx.isStatic && inChain) { self = e.$this; if (!self.c.mmap) finalizeClass(self.c); lst = self.c.mmap[name]; if (!lst) lst = cls.mmap[name]; }
        else { if (!owner.mmap) finalizeClass(owner); lst = owner.mmap[name] || (finalizeClass(cls), cls.mmap[name]); }
        var mm = lst.length === 1 ? lst[0] : pickMethod(lst, a, name);
        if (!mm) throw new CsError('CS1501', 'Нет перегрузки для метода «' + name + '», принимающей ' + a.length + ' арг.', n.line, n.col);
        if (names) a = nameArgs(mm, a, names);
        if (mm.isStatic) { if (!mm.cls.inited) ensureInit(mm.cls); return invoke(mm, null, a); }
        if (self === null) throw new CsError('CS0120', 'Для нестатического метода «' + name + '» требуется ссылка на объект', n.line, n.col);
        return invoke(mm, self, a);
      };
    }
    if (m && (m.kind === 'field' || m.kind === 'prop' || m.kind === 'pcparam')) { var gf = cId(f, cx), ev1 = argEval(args, cx); return function (e) { return callFn(gf(e), ev1(e)); }; }
    for (var i = 0; i < cx.usingStatics.length; i++) { var us = STATICS[cx.usingStatics[i]]; if (us && typeof us[name] === 'function') { var fn = us[name], ev2 = argEval(args, cx); return function (e) { return fn.apply(null, ev2(e)); }; } }
    if (name === 'nameof') return function () { return args[0] && args[0].e && args[0].e.n || ''; };
    if (USER[name] || NEWT[name] || EXC[name]) throw new CsError('CS1955', 'Нельзя вызвать тип «' + name + '» как метод. Нужно ключевое слово new?', n.line, n.col);
    throw new CsError('CS0103', 'Имя «' + name + '» не существует в текущем контексте', f.line, f.col);
  }
  if (f.k === 'Mem') {
    var o = f.o, mname = f.n;
    if (o.k === 'Base') {
      var evb = argEval(args, cx);
      return function (e) {
        var base = cx.cls.base, a = evb(e), self = e.$this;
        if (base) { if (!base.mmap) finalizeClass(base); var lst = base.mmap[mname]; if (lst) { var mm = lst.length === 1 ? lst[0] : pickMethod(lst, a, mname); if (mm && mm.body || mm && mm.exprFn || mm && mm.native) return invoke(mm, self, a); } }
        // реализация из интерфейса по умолчанию / object
        return objCall(self, mname, a, true);
      };
    }
    if (o.k === 'Id' || o.k === 'Mem') {
      var tr = typeRef(o, cx);
      if (tr) return cStaticCall(tr, mname, f, args, cx, n);
    }
    var of = cRecv(o, cx), evm = argEval(args, cx), nullc = f.nullc, names2 = evm.names;
    var st = stOf(o, cx), sdef = st && USER[st];
    if (sdef) pendingChecks.push(function () { checkCallArity(sdef, mname, args.length, n, evm.names, true); });
    var statT = sdef && !sdef.isIface ? sdef : null;
    return function (e) {
      var r = of(e);
      if (r === SHORT) return SHORT;
      if (r === null || r === undefined) { if (nullc) return SHORT; if (mname === 'GetValueOrDefault') { var a0 = evm(e); var dtn = declTypeOf(o, cx); return a0.length ? a0[0] : (dtn && dtn.n ? defaultOfT({ n: dtn.n }) : 0); } npe(); }
      var a = evm(e);
      if (r instanceof Obj) return callObj(r, mname, a, names2, statT);
      return callMember(r, mname, a, f.targs);
    };
  }
  // вызов результата выражения: (f)(x), arr[i](x)
  var cf = cExpr(f, cx), ev3 = argEval(args, cx);
  return function (e) { return callFn(cf(e), ev3(e)); };
}
function checkCallArity(def, name, argc, n, names, byRecv) {
  finalizeClass(def);
  var lst = def.mmap[name]; if (!lst) return;
  if (names) return;
  var ok = lst.some(function (m) { return argc >= m.nreq && (argc <= m.ps.length || m.hasParams); });
  if (!ok) throw new CsError('CS1501', 'Ни одна перегрузка метода «' + name + '» не принимает аргументов: ' + argc, n.line, n.col);
}
function callObj(o, name, args, names, statT) {
  var c = o.c; if (!c.mmap) finalizeClass(c);
  var lst = c.mmap[name];
  if (lst) {
    var m = lst.length === 1 ? lst[0] : pickMethod(lst, args, name);
    if (m && lst.length === 1 && (args.length > m.ps.length && !m.hasParams || args.length < m.nreq)) m = null;
    if (m) {
      if (statT && statT !== c && !(m.mods.override || m.mods.virtual || m.mods.abstract) && statT.mmap) {
        var l2 = statT.mmap[name]; if (l2) { var m2 = l2.length === 1 ? l2[0] : pickMethod(l2, args, name); if (m2) m = m2; }
      }
      if (names) args = nameArgs(m, args, names);
      if (m.isStatic) throw new CsError('CS0176', 'Доступ к статическому члену «' + name + '» нужно осуществлять через имя типа', 0, 0);
      return invoke(m, o, args);
    }
  }
  var fv = o.f[name]; if (fv instanceof Fn) return fv.call(args);
  var pr = c.pmap[name]; if (pr) { var pv = getProp(o, pr); if (pv instanceof Fn) return pv.call(args); }
  return objCall(o, name, args, false);
}
function cStaticCall(tr, name, f, args, cx, n) {
  var ev = argEval(args, cx), names = ev.names;
  if (tr.user) {
    var def = tr.user;
    pendingChecks.push(function () { finalizeClass(def); if (!def.mmap[name]) { if (def.isEnum || def.isExc) return; throw new CsError('CS0117', '«' + def.name + '» не содержит определения «' + name + '»', f.nline || n.line, f.ncol || n.col); } checkCallArity(def, name, args.length, n, ev.names); });
    return function (e) {
      var a = ev(e); if (!def.mmap) finalizeClass(def);
      var lst = def.mmap[name];
      if (!lst) {
        if (def.isEnum) return enumStatic(def, name, a);
        throw new CsError('CS0117', '«' + def.name + '» не содержит определения «' + name + '»', n.line, n.col);
      }
      var m = lst.length === 1 ? lst[0] : pickMethod(lst.filter(function (x) { return x.isStatic; }), a, name);
      if (!m) throw new CsError('CS1501', 'Нет перегрузки метода «' + name + '», принимающей ' + a.length + ' арг.', n.line, n.col);
      if (!m.isStatic) throw new CsError('CS0120', 'Для нестатического метода «' + name + '» требуется ссылка на объект', n.line, n.col);
      if (names) a = nameArgs(m, a, names);
      ensureInit(m.cls);
      return invoke(m, null, a);
    };
  }
  if (tr.exc) throw new CsError('CS0117', '«' + tr.exc.name + '» не содержит определения «' + name + '»', n.line, n.col);
  var tab = STATICS[tr.builtin];
  if (!tab || typeof tab[name] !== 'function') throw new CsError('CS0117', '«' + tr.builtin + '» не содержит определения «' + name + '»', f.nline || n.line, f.ncol || n.col);
  var fn = tab[name], targs = f.targs;
  if (fn.wantsT) return function (e) { return fn.call(null, ev(e), targs || (f.o.targs)); };
  return function (e) { return fn.apply(null, ev(e)); };
}

/* ---- new ---- */
function inferName(it) {
  var e = it.e; if (!e) return null;
  if (e.k === 'Id') return e.n; if (e.k === 'Mem') return e.n; return null;
}
function cAnon(n, cx) {
  var names = [], fns = [];
  n.init.items.forEach(function (it) {
    if (it.n) { names.push(it.n); fns.push(cExpr(it.v, cx)); }
    else { var nm = inferName(it); if (!nm) throw new CsError('CS0746', 'Недопустимый анонимный тип: не удаётся определить имя члена', n.line, n.col); names.push(nm); fns.push(cExpr(it.e, cx)); }
  });
  return function (e) { return new Anon(names, fns.map(function (f) { return cp(f(e)); })); };
}
function cInit(init, cx, targetT) {
  if (!init) return null;
  var steps = init.items.map(function (it) {
    if (it.n) {
      var name = it.n;
      if (it.v && it.v.k === 'InitV') { var sub = cInit(it.v.init, cx); return function (e, o) { var cur = getMember(o, name); sub(e, cur); }; }
      var vf = cExpr(it.v, cx);
      return function (e, o) { setMember(o, name, vf(e)); };
    }
    if (it.idx) { var ifs = it.idx.map(function (x) { return cExpr(x, cx); }), vf2 = cExpr(it.v && it.v.k === 'InitV' ? { k: 'Lit', ty: 'null' } : it.v, cx); return function (e, o) { setIndex(o, ifs.map(function (f) { return f(e); }), vf2(e)); }; }
    if (it.add) { var afs = it.add.map(function (x) { return cExpr(x, cx); }); return function (e, o) { callMember(o, 'Add', afs.map(function (f) { return f(e); })); }; }
    var ef = cExpr(it.e, cx);
    return function (e, o) { callMember(o, 'Add', [ef(e)]); };
  });
  return function (e, o) { for (var i = 0; i < steps.length; i++) steps[i](e, o); };
}
function cNew(n, cx, expT) {
  var t = n.t || expT;
  if (!t) throw new CsError('CS8754', 'Для new() не удаётся определить целевой тип', n.line, n.col);
  var name = t.n, ev = argEval(n.args, cx), names = ev.names, init = cInit(n.init, cx);
  var def = USER[name];
  if (def) {
    if (def.isEnum) throw new CsError('CS1503', 'Нельзя создать экземпляр enum', n.line, n.col);
    if (def.isAbstract || def.isIface) throw new CsError('CS0144', 'Нельзя создать экземпляр абстрактного типа или интерфейса «' + name + '»', n.line, n.col);
    if (def.isStatic) throw new CsError('CS0712', 'Нельзя создать экземпляр статического класса «' + name + '»', n.line, n.col);
    if (def.kind === 'delegate') { var ef = n.args.length ? cExpr(n.args[0].e, cx) : null; return function (e) { return ef(e); }; }
    return function (e) { var o = instantiate(def, ev(e), names); if (init) init(e, o); return o; };
  }
  if (EXC[name]) { var xdef = EXC[name]; return function (e) { var o = new Obj(xdef); o.f.InnerException = null; xdef.native(o, ev(e)); o.f.$trace = []; if (init) init(e, o); return o; }; }
  var ctor = NEWT[name];
  if (ctor) return function (e) { var o = ctor(ev(e), t); if (init) init(e, o); return o; };
  if (name === 'Func' || name === 'Action' || name === 'Predicate') { var ef2 = cExpr(n.args[0].e, cx); return function (e) { return ef2(e); }; }
  throw new CsError('CS0246', 'Не удалось найти тип или имя пространства имён «' + name + '» (возможно, отсутствует директива using или ссылка на сборку)', n.line, n.col);
}
function defaultsArr(len, et) {
  var a = new Array(len), dv = defaultOfT(et);
  if (dv instanceof Obj) for (var i = 0; i < len; i++) a[i] = defaultOfT(et); else for (var j = 0; j < len; j++) a[j] = dv;
  return a;
}
function etName(et) { return et ? (et.arr ? etName(et.arrOf) + '[]' : et.n) : 'object'; }
function cNewArr(n, cx) {
  var et = n.et, dims = n.dims.map(function (d) { return cExpr(d, cx); });
  var elemT = et;
  if (n.jag) { elemT = { k: 'T', n: et.n, arr: true, arrOf: et, args: [] }; for (var j = 1; j < n.jag; j++) elemT = { k: 'T', n: et.n, arr: true, arrOf: elemT, args: [] }; }
  if (n.init) {
    var il = cArrLit(n.init, cx, et ? { k: 'T', n: elemT.n, arr: true, arrOf: elemT, args: [] } : null, n.rank > 1 ? n.rank : 1);
    return il;
  }
  var chk = null;
  return function (e) {
    var sizes = dims.map(function (f) { return f(e); }).map(function (s) { if (typeof s !== 'number') s = toNum(s); if (s < 0) throwNew('OverflowException', 'Arithmetic operation resulted in an overflow.'); return s; });
    if (sizes.length === 1) { var arr = new Arr(n.jag ? new Array(sizes[0]).fill(null) : defaultsArr(sizes[0], elemT), etName(elemT)); return arr; }
    var total = 1; sizes.forEach(function (s) { total *= s; });
    var a = new Arr(defaultsArr(total, elemT), etName(elemT)); a.dims = sizes; return a;
  };
}
function inferElemT(vals) {
  var all = function (p) { return vals.length && vals.every(p); };
  if (all(function (v) { return typeof v === 'number'; })) return { k: 'T', n: 'int' };
  if (all(function (v) { return typeof v === 'string'; })) return { k: 'T', n: 'string' };
  if (all(function (v) { return v instanceof D || typeof v === 'number'; }) && vals.some(function (v) { return v instanceof D; })) return { k: 'T', n: 'double' };
  if (all(function (v) { return typeof v === 'boolean'; })) return { k: 'T', n: 'bool' };
  if (all(function (v) { return typeof v === 'bigint' || typeof v === 'number'; })) return { k: 'T', n: 'long' };
  return { k: 'T', n: 'object' };
}
function cArrLit(n, cx, expT, rank) {
  var elemT = expT && expT.arr ? expT.arrOf : null;
  var listT = expT && !expT.arr && expT.n ? expT : null;
  var itemFs = n.items.map(function (it) { return it.k === 'ArrLit' && !it.coll ? cArrLit(it, cx, elemT && elemT.arr ? elemT : null) : cExpr(it, cx, elemT); });
  var co = elemT ? mkCoerce(elemT) : null;
  return function (e) {
    var vals = itemFs.map(function (f) { var v = f(e); return v; });
    if (listT && !expT.arr) { var l = NEWT[listT.n] ? NEWT[listT.n]([], listT) : NEWT.List([], listT); vals.forEach(function (v) { callMember(l, 'Add', [v]); }); return l; }
    if (n.coll && !expT) { var l2 = NEWT.List([], null); vals.forEach(function (v) { callMember(l2, 'Add', [v]); }); return l2; }
    var et = elemT || inferElemT(vals), c2 = co || mkCoerce(et);
    if (rank > 1) { // многомерный: плоское хранение
      var flat = [], dims = [];
      (function walk(a, d) { if (a instanceof Arr && !a.isLeaf) { if (dims.length <= d) dims.push(a.a.length); a.a.forEach(function (x) { walk(x, d + 1); }); } else flat.push(a); })(new Arr(vals), 0);
      var r2 = new Arr(flat.map(function (v) { return c2 ? c2(v) : v; }), etName(et)); r2.dims = dims; r2.dims.shift(); r2.dims.unshift(vals.length); return r2;
    }
    return new Arr(vals.map(function (v) { return c2 ? c2(v) : cp(v); }), etName(et));
  };
}
function cWith(n, cx) {
  var of = cExpr(n.e, cx), init = cInit(n.init, cx);
  return function (e) { var o = of(e); if (o === null) npe(); var c = cloneStruct(o); c.id = ++OBJID; if (c.f.$pc) c.f.$pc = o.f.$pc; if (init) init(e, c); return c; };
}

/* ---- лямбды ---- */
function cLambda(n, cx, expT) {
  var lcx = Object.create(cx); lcx.retT = null; lcx.async = n.isAsync; lcx.iter = false; lcx.inLambda = (cx.inLambda || 0) + 1; lcx.method = null;
  pushScope(cx);
  var ps = n.ps.map(function (p) { declare(cx, p.n, p.t, p.t ? stName(p.t) : null, n, { lambdaParam: true, param: true }); return { n: p.n, co: p.t ? mkCoerce(p.t) : null, t: p.t }; });
  var np = ps.length, fn;
  if (n.isAsync) {
    var gb = cLambdaAsyncBody(n, lcx);
    popScope(cx);
    return function (e) { return new Fn(function (args) { var env = Object.create(e); for (var i = 0; i < np; i++) env[ps[i].n] = new Box(ps[i].co ? ps[i].co(args[i]) : args[i], ps[i].t); return gb(env); }, np); };
  }
  if (n.body.k === 'Blk') {
    var body = cBlockBody(n.body, lcx);
    popScope(cx);
    return function (e) { return new Fn(function (args) { var env = Object.create(e); for (var i = 0; i < np; i++) { var b = new Box(args[i], ps[i].t); b.co = ps[i].co; env[ps[i].n] = ps[i].co ? (b.v = ps[i].co(args[i]), b) : b; } var sig = body(env); if (sig === SIG_RET) { var r = RV; RV = undefined; return r; } return undefined; }, np); };
  }
  var ef = cExpr(n.body, lcx);
  popScope(cx);
  if (np === 1) { var p0 = ps[0]; return function (e) { return new Fn(function (args) { var env = Object.create(e); var b = new Box(args[0], p0.t); if (p0.co) b.v = p0.co(args[0]); b.co = p0.co; env[p0.n] = b; return ef(env); }, 1); }; }
  return function (e) { return new Fn(function (args) { var env = Object.create(e); for (var i = 0; i < np; i++) { var b = new Box(args[i], ps[i].t); if (ps[i].co) b.v = ps[i].co(args[i]); b.co = ps[i].co; env[ps[i].n] = b; } return ef(env); }, np); };
}

/* ---- приведение ---- */
function cCast(n, cx) {
  var f = cExpr(n.e, cx), t = n.t;
  var strict = isObjStatic(n.e, cx);
  var sst = stOf(n.e, cx);
  if (sst === 'string' && NUMR[t.n] !== undefined && !t.arr) throw new CsError('CS0030', 'Не удаётся преобразовать тип «string» в «' + t.n + '»', n.line, n.col);
  if (sst === 'bool' && NUMR[t.n] !== undefined && !t.arr) throw new CsError('CS0030', 'Не удаётся преобразовать тип «bool» в «' + t.n + '»', n.line, n.col);
  if (sst && NUMR[sst] !== undefined && t.n === 'string' && !t.arr) throw new CsError('CS0030', 'Не удаётся преобразовать тип «' + sst + '» в «string»', n.line, n.col);
  return function (e) { return castTo(t, f(e), strict); };
}

/* ---- паттерны ---- */
function qualToExpr(q, line, col) {
  var e = { k: 'Id', n: q[0], line: line, col: col };
  for (var i = 1; i < q.length; i++) e = { k: 'Mem', o: e, n: q[i], line: line, col: col };
  return e;
}
function isKnownTypeName(t, cx) {
  if (t.arr || t.tuple) return true;
  var n = t.n;
  if (PRIM_NAMES[n] || USER[n] || EXC[n] || NEWT[n] || TYPECHK[n] || BUILTIN_TYPE_NAMES[n]) return true;
  if (STATICS[n] && !t.q) return false;
  return /^I[A-Z]/.test(n) || n === 'Enum' || n === 'ValueType';
}
function bindVar(cx, name, t, line) { return declare(cx, name, t, t ? stName(t) : null, { line: line, col: 0 }, { leak: true }); }
function cPattern(p, cx) {
  switch (p.k) {
    case 'PConst': {
      var cf = cExpr(p.e, cx);
      return function (e, v) { var c = cf(e); if (v === null || v === undefined) return c === null; if (c === null) return false; return eqOp(v, c); };
    }
    case 'PDisc': return function () { return true; };
    case 'PVar': { bindVar(cx, p.name, null, p.line); var nm = p.name; return function (e, v) { e[nm] = new Box(v); return true; }; }
    case 'PType': {
      var t = p.t;
      if (!p.name && !isKnownTypeName(t, cx) ) {
        // это константа (enum-член, const)
        var ce = cExpr(t.q && t.q.length > 1 ? qualToExpr(t.q, p.line, p.col) : { k: 'Id', n: t.n, line: p.line, col: p.col }, cx);
        return function (e, v) { var c = ce(e); if (v === null) return c === null; return c !== null && eqOp(v, c); };
      }
      var test = mkTypeTest(t);
      if (p.name) { bindVar(cx, p.name, t, p.line); var nm2 = p.name; return function (e, v) { if (!test(v)) return false; e[nm2] = new Box(v); return true; }; }
      return function (e, v) { return test(v); };
    }
    case 'PRel': { var rf = cExpr(p.e, cx), op = p.op; return function (e, v) { if (v === null || v === undefined) return false; return cmpOp(op, v, rf(e)); }; }
    case 'PAnd': { var l = cPattern(p.l, cx), r = cPattern(p.r, cx); return function (e, v) { return l(e, v) && r(e, v); }; }
    case 'POr': { var l2 = cPattern(p.l, cx), r2 = cPattern(p.r, cx); return function (e, v) { return l2(e, v) || r2(e, v); }; }
    case 'PNot': { var in1 = cPattern(p.p, cx); return function (e, v) { return !in1(e, v); }; }
    case 'PProp': {
      var tt = p.t ? mkTypeTest(p.t) : null;
      var props = p.props.map(function (pp) { return { names: pp.n.split('.'), pat: cPattern(pp.p, cx) }; });
      var nm3 = p.name; if (nm3) bindVar(cx, nm3, p.t, p.line);
      return function (e, v) {
        if (v === null || v === undefined) return false;
        if (tt && !tt(v)) return false;
        for (var i = 0; i < props.length; i++) {
          var cur = v;
          for (var j = 0; j < props[i].names.length; j++) { if (cur === null) return false; cur = getMember(cur, props[i].names[j]); }
          if (!props[i].pat(e, cur)) return false;
        }
        if (nm3) e[nm3] = new Box(v);
        return true;
      };
    }
    case 'PPos': {
      var tt2 = p.t ? mkTypeTest(p.t) : null;
      var subs = p.items.map(function (x) { return cPattern(x, cx); });
      var pr = p.prop ? cPattern(p.prop, cx) : null;
      var nm4 = p.name; if (nm4) bindVar(cx, nm4, p.t, p.line);
      return function (e, v) {
        if (v === null) return false;
        if (tt2 && !tt2(v)) return false;
        var vals;
        try { vals = deconstruct(v, subs.length); } catch (ex) { return false; }
        if (vals.length !== subs.length) return false;
        for (var i = 0; i < subs.length; i++) if (!subs[i](e, vals[i])) return false;
        if (pr && !pr(e, v)) return false;
        if (nm4) e[nm4] = new Box(v);
        return true;
      };
    }
    case 'PList': {
      var ls = p.items.map(function (x) { return cPattern(x, cx); });
      return function (e, v) { if (!(v instanceof Arr) && !(v && v.items)) return false; var a = v instanceof Arr ? v.a : v.items; if (a.length !== ls.length) return false; for (var i = 0; i < ls.length; i++) if (!ls[i](e, a[i])) return false; return true; };
    }
  }
  throw new CsError('CS8504', 'Шаблон «' + p.k + '» не поддерживается', p.line, p.col);
}
function cSwitchExpr(n, cx) {
  var ef = cExpr(n.e, cx);
  var arms = n.arms.map(function (a) {
    pushScope(cx);
    var pt = cPattern(a.pat, cx), wf = a.when ? cExpr(a.when, cx) : null, rf = cExpr(a.res, cx);
    popScope(cx);
    return { pt: pt, wf: wf, rf: rf };
  });
  return function (e) {
    var v = ef(e), env = Object.create(e);
    for (var i = 0; i < arms.length; i++) {
      var a = arms[i];
      if (a.pt(env, v) && (!a.wf || a.wf(env) === true)) return a.rf(env);
    }
    throwNew('SwitchExpressionException', 'Non-exhaustive switch expression' + (v !== null && v !== undefined ? " (unhandled value: " + str(v) + ")" : '') + '.');
  };
}
