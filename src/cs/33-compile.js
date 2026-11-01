/* ---------- компиляция выражений в замыкания ---------- */
var STATICS = Object.create(null), NEWT = Object.create(null), SHORT = { short: 1 };
var NS_ROOTS = { System: 1, Microsoft: 1 };
var NS_PARTS = { Collections: 1, Generic: 1, Linq: 1, IO: 1, Text: 1, Threading: 1, Tasks: 1, Diagnostics: 1, Globalization: 1, Concurrent: 1, Runtime: 1, ComponentModel: 1, Reflection: 1, Net: 1, Http: 1, Extensions: 1, Hosting: 1, Json: 1, Numerics: 1, CompilerServices: 1 };
var PRIM_NAMES = { int: 1, long: 1, short: 1, byte: 1, sbyte: 1, uint: 1, ulong: 1, ushort: 1, double: 1, float: 1, decimal: 1, bool: 1, char: 1, string: 1, object: 1 };

function mkCx(cls, isStatic) { return { cls: cls, isStatic: !!isStatic, scopes: [new Map()], baseScope: 0, retT: null, async: false, iter: false, method: null, usingStatics: [], inLambda: 0 }; }
function pushScope(cx) { cx.scopes.push(new Map()); }
function popScope(cx) { cx.scopes.pop(); }
function lookupLocal(cx, name) { for (var i = cx.scopes.length - 1; i >= 0; i--) { var s = cx.scopes[i].get(name); if (s) return s; } return null; }
function declare(cx, name, t, st, node, opts) {
  opts = opts || {};
  if (name === '_' ) { return { t: t, st: st }; }
  if (!opts.leak) {
    var top = cx.scopes[cx.scopes.length - 1];
    if (top.has(name) && !top.get(name).leak) throw new CsError('CS0128', 'Локальная переменная «' + name + '» уже объявлена в этой области видимости', node ? node.line : 0, node ? node.col : 0);
    if (!opts.param) for (var i = cx.scopes.length - 2; i >= cx.baseScope; i--) { var o = cx.scopes[i].get(name); if (o && !o.leak && !o.lambdaParam && !opts.lambdaParam) throw new CsError('CS0136', 'Локальная переменная «' + name + '» не может быть объявлена в этой области, так как конфликтует с переменной во внешней области', node ? node.line : 0, node ? node.col : 0); }
  }
  var ent = { t: t, st: st, leak: !!opts.leak, lambdaParam: !!opts.lambdaParam };
  cx.scopes[cx.scopes.length - 1].set(name, ent);
  return ent;
}
function stName(t) { // простое имя статического типа или null
  if (!t || t.n === 'var') return null;
  if (t.arr || t.tuple || (t.args && t.args.length)) return null;
  if (t.nullable) return null;
  return t.n;
}
function lookupMember(cx, name) {
  for (var c = cx.cls; c; c = c.outer) {
    for (var k = c; k; k = k.base) {
      for (var i = 0; i < k.fields.length; i++) if (k.fields[i].n === name) return { kind: 'field', cls: k, f: k.fields[i], isStatic: false };
      for (var j = 0; j < k.sfields.length; j++) if (k.sfields[j].n === name) return { kind: 'field', cls: k, f: k.sfields[j], isStatic: true };
      if (k.props[name]) return { kind: 'prop', cls: k, pr: k.props[name], isStatic: k.props[name].isStatic };
      if (k.methods[name]) return { kind: 'method', cls: k, isStatic: false, owner: c };
      if (k.primary) { for (var q = 0; q < k.primary.length; q++) if (k.primary[q].n === name) return { kind: 'pcparam', cls: k }; }
      if (k.nested[name]) return { kind: 'type', def: k.nested[name] };
    }
    if (c.isIface === false || true) c.ifaces.forEach(function () { });
  }
  return null;
}
function isNsNode(n) {
  if (n.k === 'Id') return !!NS_ROOTS[n.n];
  if (n.k === 'Mem') return isNsNode(n.o) && (NS_PARTS[n.n] || false);
  return false;
}
var BUILTIN_TYPE_NAMES = {};
function typeRef(n, cx) {
  if (n.k === 'Id') {
    if (lookupLocal(cx, n.n)) return null;
    var m = lookupMember(cx, n.n);
    if (m) return m.kind === 'type' ? { user: m.def } : null;
    if (USER[n.n]) return { user: USER[n.n] };
    if (STATICS[n.n] || PRIM_NAMES[n.n]) return { builtin: n.n };
    if (EXC[n.n]) return { exc: EXC[n.n] };
    if (NEWT[n.n] || BUILTIN_TYPE_NAMES[n.n]) return { builtin: n.n };
    return null;
  }
  if (n.k === 'Mem') {
    if (isNsNode(n.o)) { if (USER[n.n]) return { user: USER[n.n] }; if (STATICS[n.n] || PRIM_NAMES[n.n] || NEWT[n.n]) return { builtin: n.n }; if (EXC[n.n]) return { exc: EXC[n.n] }; return null; }
    var t = typeRef(n.o, cx);
    if (t && t.user && t.user.nested[n.n]) return { user: t.user.nested[n.n] };
    return null;
  }
  return null;
}
function typeRefOfT(t) { // для узлов типов (T)
  if (USER[t.n]) return { user: USER[t.n] };
  return null;
}

/* ---- статические типы и проверки присваивания ---- */
var NUMR = { byte: 0, sbyte: 0, short: 0, ushort: 0, char: 0.5, int: 1, uint: 1, long: 2, ulong: 2, float: 3, double: 4, decimal: 5 };
function stOf(n, cx) {
  switch (n.k) {
    case 'Lit': return n.ty === 'null' ? 'null' : n.ty;
    case 'Interp': return 'string';
    case 'Paren': return stOf(n.e, cx);
    case 'Id': { var sc = lookupLocal(cx, n.n); return sc ? sc.st : null; }
    case 'Cast': return stName(n.t);
    case 'New': return n.t ? stName(n.t) : null;
    case 'Un': if (n.op === '!') return 'bool'; if (n.op === '-' || n.op === '+') { var u = stOf(n.e, cx); return u && NUMR[u] !== undefined ? u : null; } return null;
    case 'Bin': {
      var op = n.op;
      if (op === '&&' || op === '||' || op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=') return 'bool';
      var a = stOf(n.l, cx), b = stOf(n.r, cx);
      if (!a || !b) return null;
      if (op === '+' && (a === 'string' || b === 'string')) return 'string';
      if (NUMR[a] === undefined || NUMR[b] === undefined) return null;
      if (op === '<<' || op === '>>') return NUMR[a] <= 1 ? 'int' : a;
      var r = Math.max(NUMR[a], NUMR[b]);
      if ((NUMR[a] === 5 && (NUMR[b] === 3 || NUMR[b] === 4)) || (NUMR[b] === 5 && (NUMR[a] === 3 || NUMR[a] === 4))) return null;
      return r <= 1 ? 'int' : r === 2 ? 'long' : r === 3 ? 'float' : r === 4 ? 'double' : 'decimal';
    }
    case 'Cond': { var x = stOf(n.a, cx), y = stOf(n.b, cx); return x && x === y ? x : null; }
    case 'Call': {
      var f = n.f;
      if (f.k === 'Id' && !lookupLocal(cx, f.n)) { var mm = lookupMember(cx, f.n); if (mm && mm.kind === 'method') { var ret = uniqueRet(mm.cls, f.n); return ret; } }
      return null;
    }
  }
  return null;
}
function uniqueRet(cls, name) {
  var r = null, cnt = 0;
  for (var k = cls; k; k = k.base) { (k.methods[name] || []).forEach(function (m) { cnt++; var s = m.isAsync || m.isIter || (m.tparams && m.tparams.length) ? '?' : stName(m.ret); if (r === null) r = s; else if (r !== s) r = '?'; }); }
  return r === '?' || r === 'void' ? null : r;
}
function tn(s) { var m = { Int32: 'int' }; return m[s] || s; }
function checkAssign(dst, src, node, isLit) {
  if (!dst || !src || dst === src || dst === 'object' || dst === 'var') return;
  var p = function (x) { return NUMR[x] !== undefined; };
  if (src === 'null') {
    if (p(dst) || dst === 'bool') throw new CsError('CS0037', 'Не удаётся преобразовать null в «' + dst + '», так как это тип значения, не допускающий значения NULL', node.line, node.col);
    return;
  }
  var isP = function (x) { return p(x) || x === 'bool' || x === 'string'; };
  if (!isP(dst) || !isP(src)) return;
  if (p(dst) && p(src)) {
    if (isLit && src === 'int' && (dst === 'byte' || dst === 'sbyte' || dst === 'short' || dst === 'ushort' || dst === 'uint' || dst === 'ulong' || dst === 'char' && false)) return;
    if (isLit && src === 'double' && dst === 'float') throw new CsError('CS0664', 'Литерал типа double нельзя неявно преобразовать в тип float; используйте суффикс «F»', node.line, node.col);
    if (isLit && src === 'double' && dst === 'decimal') throw new CsError('CS0664', 'Литерал типа double нельзя неявно преобразовать в тип decimal; используйте суффикс «M»', node.line, node.col);
    var rs = NUMR[src], rd = NUMR[dst], ok = rs < rd;
    if (src === 'char') ok = rd >= 1; else if (dst === 'char') ok = false;
    if (dst === 'decimal' && (src === 'float' || src === 'double')) ok = false;
    if (src === 'decimal' && dst !== 'decimal') ok = false;
    if ((src === 'uint' || src === 'ulong') && rd >= 1 && rd > rs) ok = true;
    if (!ok) throw new CsError('CS0266', 'Не удаётся неявно преобразовать тип «' + src + '» в «' + dst + '». Существует явное преобразование (возможно, пропущено приведение типа)', node.line, node.col);
    return;
  }
  throw new CsError('CS0029', 'Не удаётся неявно преобразовать тип «' + src + '» в «' + dst + '»', node.line, node.col);
}

/* ---- общие помощники времени выполнения ---- */
function callFn(f, args) { if (f === null || f === undefined) npe(); if (!(f instanceof Fn)) throw new CsError('CS1955', 'Невызываемый элемент', 0, 0); return f.call(args); }
function refBox(get, set) { var b = new Box(null); Object.defineProperty(b, 'v', { get: get, set: set }); return b; }
function storeBox(b, v) {
  if (b.co !== null) v = b.co(v); else if (v instanceof Obj && v.c.isStruct) v = cloneStruct(v);
  b.v = v; return v;
}
function mkBoxFor(v, t, co) { var b = new Box(v, t); b.co = co; return b; }
function inferCo(v) { // коэффициент приведения для var по значению
  if (v instanceof D) return v.f ? mkCoerce({ n: 'float' }) : mkCoerce({ n: 'double' });
  if (v instanceof Dec) return mkCoerce({ n: 'decimal' });
  if (typeof v === 'bigint') return mkCoerce({ n: 'long' });
  if (typeof v === 'number') return mkCoerce({ n: 'int' });
  return null;
}
var CO_INT = null;

/* ---- приведение выражения ---- */
var cExprRaw;
function cExpr(n, cx, expT) {
  var f = cExprRaw(n, cx, expT);
  if ((n.k === 'Mem' || n.k === 'Idx' || n.k === 'Call') && hasNullc(n)) return function (e) { var r = f(e); return r === SHORT ? null : r; };
  return f;
}
function hasNullc(n) {
  for (var c = n; c; ) {
    if (c.k === 'Mem') { if (c.nullc) return true; c = c.o; }
    else if (c.k === 'Idx') { if (c.nullc) return true; c = c.o; }
    else if (c.k === 'Call') { c = c.f; }
    else return false;
  }
  return false;
}
function cRecv(n, cx) { return (n.k === 'Mem' || n.k === 'Idx' || n.k === 'Call') ? cExprRaw(n, cx) : cExpr(n, cx); }

function litValue(n) {
  switch (n.ty) {
    case 'int': return n.v;
    case 'long': return typeof n.v === 'bigint' ? n.v : BigInt(n.v);
    case 'double': return new D(n.v, 0);
    case 'float': return new D(Math.fround(n.v), 1);
    case 'decimal': return decFromStr(n.v);
    case 'string': return n.v;
    case 'char': return mkChar(n.v.charCodeAt(0));
    case 'bool': return n.v;
    case 'null': return null;
  }
}
function argFns(args, cx, ps) {
  return args.map(function (a, i) {
    if (a.mod === 'out' || a.mod === 'ref') return cRefArg(a, cx);
    if (a.mod === 'in') return cExpr(a.e, cx);
    return cExpr(a.e, cx, ps && ps[i] ? ps[i].t : null);
  });
}
function cRefArg(a, cx) {
  if (a.decl) {
    var name = a.decl.n; declare(cx, name, a.decl.t, stName(a.decl.t), a, { leak: true });
    var dv = a.decl.t.n === 'var' ? null : defaultOfT(a.decl.t), co = mkCoerce(a.decl.t);
    return function (e) { var b = mkBoxFor(dv, a.decl.t, co); e[name] = b; return b; };
  }
  var n = a.e;
  if (n.k === 'Id') {
    var sc = lookupLocal(cx, n.n);
    if (sc) { var nm = n.n; return function (e) { return e[nm]; }; }
    if (n.n === '_') return function () { return new Box(null); };
  }
  var lv = cLvalue(n, cx);
  return function (e) { var l = lv(e); return refBox(l.get, l.set); };
}
function hasRefArgs(args) { return args.some(function (a) { return a.mod === 'out' || a.mod === 'ref'; }); }
function argEval(args, cx, ps) {
  var fns = argFns(args, cx, ps), n = fns.length;
  var names = args.map(function (a) { return a.name; });
  var anyNamed = names.some(Boolean);
  var ev;
  if (n === 0) ev = function () { return []; };
  else if (n === 1) { var f0 = fns[0]; ev = function (e) { return [f0(e)]; }; }
  else if (n === 2) { var g0 = fns[0], g1 = fns[1]; ev = function (e) { return [g0(e), g1(e)]; }; }
  else ev = function (e) { var r = new Array(n); for (var i = 0; i < n; i++) r[i] = fns[i](e); return r; };
  ev.names = anyNamed ? names : null;
  return ev;
}

cExprRaw = function (n, cx, expT) {
  switch (n.k) {
    case 'Lit': { var v = litValue(n); return function () { return v; }; }
    case 'Paren': return cExpr(n.e, cx, expT);
    case 'Interp': return cInterp(n, cx);
    case 'Id': return cId(n, cx);
    case 'This': if (cx.isStatic) throw new CsError('CS0026', 'Ключевое слово this недопустимо в статическом контексте', n.line, n.col); return function (e) { return e.$this; };
    case 'Mem': return cMem(n, cx);
    case 'Idx': return cIdx(n, cx);
    case 'Call': return cCall(n, cx);
    case 'New': return cNew(n, cx, expT);
    case 'NewArr': return cNewArr(n, cx);
    case 'ArrLit': return cArrLit(n, cx, expT);
    case 'Anon': return cAnon(n, cx);
    case 'Bin': return cBin(n, cx);
    case 'Un': return cUn(n, cx);
    case 'Post': return cPost(n, cx);
    case 'Asg': return cAsg(n, cx);
    case 'Cond': { var c = cExpr(n.c, cx), a = cExpr(n.a, cx, expT), b = cExpr(n.b, cx, expT); return function (e) { var t = c(e); if (t !== true && t !== false) condErr(); return t ? a(e) : b(e); }; }
    case 'Lam': return cLambda(n, cx, expT);
    case 'Cast': return cCast(n, cx);
    case 'Is': { var ie = cExpr(n.e, cx), pt = cPattern(n.pat, cx); return function (e) { return pt(e, ie(e)); }; }
    case 'As': { var ae = cExpr(n.e, cx), tt = mkTypeTest(n.t); var tdef = n.t; return function (e) { var v = ae(e); return (v !== null && tt(v)) ? v : null; }; }
    case 'SwE': return cSwitchExpr(n, cx);
    case 'Tup': { var items = n.items.map(function (it) { return cExpr(it.e, cx); }), names = n.items.some(function (it) { return it.name; }) ? n.items.map(function (it) { return it.name; }) : null; return function (e) { var r = new Array(items.length); for (var i = 0; i < items.length; i++) r[i] = cp(items[i](e)); return new Tup(r, names); }; }
    case 'Def': { var dt = n.t || expT; return function () { return defaultOfT(dt); }; }
    case 'TypeOf': { var tt2 = n.t; return function () { return new TypeInfo(tt2.n, SYS_FULL[capType(tt2.n)] || tt2.n, USER[tt2.n] || null); }; }
    case 'Await': throw new CsError('CS4032', 'Оператор await можно использовать только в асинхронном методе (добавьте модификатор async)', n.line, n.col);
    case 'ThrowE': { var te = cExpr(n.e, cx); return function (e) { var x = te(e); if (x === null) npe(); throw new CsThrow(x); }; }
    case 'With': return cWith(n, cx);
    case 'Rng': { var ra = n.a ? cExpr(n.a, cx) : null, rb = n.b ? cExpr(n.b, cx) : null; return function (e) { return mkRange(ra ? ra(e) : null, rb ? rb(e) : null); }; }
    case 'ChkE': { var ce = cExpr(n.e, cx), on = n.on; return function (e) { var old = CHK; CHK = on ? 1 : 0; try { return ce(e); } finally { CHK = old; } }; }
    case 'Slot': { var si = n.i; return function (e) { return e.$s[si]; }; }
    case 'Base': throw new CsError('CS0175', 'Ключевое слово base недопустимо в этом контексте', n.line, n.col);
  }
  throw new CsError('CS8652', 'Выражение «' + n.k + '» не поддерживается мини-интерпретатором', n.line, n.col);
};
function condErr() { throw new CsError('CS0029', 'Не удаётся неявно преобразовать тип в «bool»', 0, 0); }
function mkRange(a, b) { return { isRange: true, a: a, b: b, tn: 'Range' }; }

/* ---- интерполяция ---- */
function fmtValue(v, spec) {
  if (spec === null || spec === undefined) return str(v);
  if (v === null) return '';
  if (numRank(v) >= 0 && !(v instanceof Ch) && !(v instanceof EnumVal)) return fmtNumber(v, spec);
  if (v instanceof EnumVal) { if (spec === 'D' || spec === 'd') return String(v.v); if (spec === 'X' || spec === 'x') return v.v.toString(16).toUpperCase(); return enumName(v); }
  if (v instanceof Obj) { var m = findMethod(v.c, 'ToString', 1); if (m) return str(invoke(m, v, [spec])); return str(v); }
  if (v && typeof v.ToStringFmt === 'function') return v.ToStringFmt(spec);
  return str(v);
}
function cInterp(n, cx) {
  var parts = n.parts.map(function (p) {
    if (typeof p === 'string') return p;
    return { f: cExpr(p.e, cx), fmt: p.fmt, al: p.align };
  });
  return function (e) {
    var s = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (typeof p === 'string') { s += p; continue; }
      var t = fmtValue(p.f(e), p.fmt);
      if (p.al) { var w = Math.abs(p.al); if (t.length < w) t = p.al < 0 ? t + new Array(w - t.length + 1).join(' ') : new Array(w - t.length + 1).join(' ') + t; }
      s += t;
    }
    return s;
  };
}

/* ---- идентификаторы ---- */
function cId(n, cx) {
  var name = n.n;
  var sc = lookupLocal(cx, name);
  if (sc) return function (e) { return e[name].v; };
  var m = lookupMember(cx, name);
  if (m) {
    switch (m.kind) {
      case 'field': {
        var cls = m.cls;
        if (m.isStatic) return function () { if (!cls.inited) ensureInit(cls); return cls.st[name]; };
        if (cx.isStatic) throw new CsError('CS0120', 'Для нестатического поля, метода или свойства «' + name + '» требуется ссылка на объект', n.line, n.col);
        return function (e) { return e.$this.f[name]; };
      }
      case 'prop': {
        var pr = m.pr;
        if (pr.isStatic) return function () { return getProp(null, pr); };
        if (cx.isStatic) throw new CsError('CS0120', 'Для нестатического поля, метода или свойства «' + name + '» требуется ссылка на объект', n.line, n.col);
        return function (e) { var t = e.$this; if (t.c !== pr.cls && t.c.pmap[name] && t.c.pmap[name] !== pr) return getProp(t, t.c.pmap[name]); return getProp(t, pr); };
      }
      case 'pcparam': return function (e) { return e.$this.f.$pc[name].v; };
      case 'method': {
        return function (e) { return methodGroup(e.$this, name, m.cls); };
      }
      case 'type': throw new CsError('CS0119', '«' + name + '» — это тип, который недопустим в данном контексте', n.line, n.col);
    }
  }
  if (name === '_') return function () { return null; };
  for (var i = 0; i < cx.usingStatics.length; i++) { var us = STATICS[cx.usingStatics[i]]; if (us && name in us) { var val = us[name]; return typeof val === 'function' ? function () { return new Fn(function (a) { return val.apply(null, a); }, -1, name); } : function () { return val; }; } }
  if (USER[name] || STATICS[name] || NEWT[name] || PRIM_NAMES[name] || EXC[name]) throw new CsError('CS0119', '«' + name + '» — это тип, который недопустим в данном контексте', n.line, n.col);
  throw new CsError('CS0103', 'Имя «' + name + '» не существует в текущем контексте', n.line, n.col);
}
function methodGroup(self, name, cls) {
  var lst;
  if (self instanceof Obj) { if (!self.c.mmap) finalizeClass(self.c); lst = self.c.mmap[name]; }
  else { if (!cls.mmap) finalizeClass(cls); lst = cls.mmap[name]; }
  var f = new Fn(function (args) {
    var m = lst.length === 1 ? lst[0] : pickMethod(lst, args, name);
    if (!m) throw new CsError('CS1501', 'Нет перегрузки метода «' + name + '», принимающей ' + args.length + ' арг.', 0, 0);
    return invoke(m, m.isStatic ? null : self, args);
  }, lst[0].ps.length, name);
  return f;
}

/* ---- доступ к члену ---- */
function declTypeOf(n, cx) {
  if (n.k === 'Id') { var sc = lookupLocal(cx, n.n); if (sc) return sc.t; var m = lookupMember(cx, n.n); if (m && m.f) return m.f.t; if (m && m.pr) return m.pr.t; }
  return null;
}
function cMem(n, cx) {
  var name = n.n;
  // тип.член
  if (n.o.k === 'Id' || n.o.k === 'Mem') {
    var tr = typeRef(n.o, cx);
    if (tr) return cStaticMember(tr, name, n, cx);
  }
  if (n.o.k === 'Base') {
    return function (e) { return getMemberFrom(e.$this, name, cx.cls.base); };
  }
  if (isNsNode(n)) throw new CsError('CS0118', 'Пространство имён «' + name + '» используется как значение', n.line, n.col);
  var of = cRecv(n.o, cx), nullc = n.nullc;
  // проверка существования члена пользовательского типа
  var st = stOf(n.o, cx), sdef = st && USER[st];
  if (sdef && !sdef.isEnum && !sdef.isIface && !sdef.kind !== 'delegate') pendingChecks.push(function () { checkMemberExists(sdef, name, n, cx.cls); });
  if (n.o.k === 'This') return function (e) { var o = e.$this; var pr = o.c.pmap[name]; if (pr) return getProp(o, pr); var v = o.f[name]; if (v !== undefined) return v; return getMember(o, name); };
  var nnT = (name === 'HasValue' || name === 'Value') ? declTypeOf(n.o, cx) : null, nn = !!(nnT && nnT.nullable);
  return function (e) {
    var o = of(e);
    if (o === null || o === undefined) { if (o === SHORT) return SHORT; if (nullc) return SHORT; if (nn) { if (name === 'HasValue') return false; throwNew('InvalidOperationException', 'Nullable object must have a value.'); } npe(); }
    if (o === SHORT) return SHORT;
    return getMember(o, name);
  };
}
var pendingChecks = [];
function accessible(owner, mods, from) {
  if (!mods || !from) return true;
  if (mods.public || mods.internal) return true;
  var priv = mods.private || (!mods.protected);
  for (var c = from; c; c = c.outer) if (c === owner) return true;
  if (mods.protected) return isSubclass(from, owner);
  return false;
}
function checkMemberExists(def, name, n, from) {
  finalizeClass(def);
  var prx = def.pmap[name] || null;
  if (prx || def.mmap[name]) { if (prx && from && !accessible(prx.cls, prx.mods, from)) throw new CsError('CS0122', '«' + def.name + '.' + name + '» недоступен из-за его уровня защиты', n.nline || n.line, n.ncol || n.col); if (!prx && def.mmap[name]) { var ml = def.mmap[name]; if (from && ml.every(function (m) { return !m.cls || m.cls.isIface || !accessible(m.cls, m.mods, from); })) throw new CsError('CS0122', '«' + def.name + '.' + name + '» недоступен из-за его уровня защиты', n.nline || n.line, n.ncol || n.col); } return; }
  for (var k = def; k; k = k.base) { var ff = k.fields.concat(k.sfields).filter(function (f) { return f.n === name; })[0]; if (ff) { if (from && ff.mods && !accessible(k, ff.mods, from)) throw new CsError('CS0122', '«' + def.name + '.' + name + '» недоступен из-за его уровня защиты', n.nline || n.line, n.ncol || n.col); return; } if ((k.primary && k.primary.some(function (p) { return p.n === name; }))) return; if (k.nested[name]) return; }
  if (def.isExc || objectMembers[name] || def.ifaceNames.length || def.kind === 'delegate') return;
  if (def.base && !def.base.mmap) finalizeClass(def.base);
  if (nativeHasMember(def, name)) return;
  throw new CsError('CS1061', '«' + def.name + '» не содержит определения «' + name + '» и не удалось найти доступный метод расширения «' + name + '», принимающий первый аргумент типа «' + def.name + '»', n.nline || n.line, n.ncol || n.col);
}
var objectMembers = { ToString: 1, Equals: 1, GetHashCode: 1, GetType: 1, ReferenceEquals: 1, MemberwiseClone: 1 };
function getMember(o, n) {
  if (o instanceof Obj) {
    var c = o.c;
    if (!c.pmap) finalizeClass(c);
    var pr = c.pmap[n]; if (pr) return getProp(o, pr);
    var fv = o.f[n]; if (fv !== undefined) return fv;
    if (c.mmap[n]) return methodGroup(o, n, c);
    return objMember(o, n);
  }
  return nativeMember(o, n);
}
function getMemberFrom(o, n, fromCls) { // base.X
  if (!fromCls.pmap) finalizeClass(fromCls);
  var pr = fromCls.pmap[n]; if (pr) return getProp(o, pr);
  var fv = o.f[n]; if (fv !== undefined) return fv;
  return objMember(o, n);
}
function cStaticMember(tr, name, n, cx) {
  if (tr.user) {
    var def = tr.user;
    if (def.isEnum) {
      var em = def.members.filter(function (m) { return m.name === name; })[0];
      if (em) { var ev = enumOf(def, em.v); return function () { return ev; }; }
      throw new CsError('CS0117', '«' + def.name + '» не содержит определения «' + name + '»', n.line, n.col);
    }
    finalizeClass(def);
    var sf = null; for (var k = def; k && !sf; k = k.base) for (var i = 0; i < k.sfields.length; i++) if (k.sfields[i].n === name) { sf = { f: k.sfields[i], cls: k }; break; }
    if (sf) return function () { if (!sf.cls.inited) ensureInit(sf.cls); return sf.cls.st[name]; };
    var pr = null; for (var k2 = def; k2 && !pr; k2 = k2.base) if (k2.props[name] && k2.props[name].isStatic) pr = k2.props[name];
    if (pr) return function () { return getProp(null, pr); };
    if (def.mmap[name]) return function () { return methodGroup(null, name, def); };
    if (def.nested[name]) throw new CsError('CS0119', 'Тип не является значением', n.line, n.col);
    throw new CsError('CS0117', '«' + def.name + '» не содержит определения «' + name + '»', n.line, n.col);
  }
  if (tr.exc) { throw new CsError('CS0117', '«' + tr.exc.name + '» не содержит определения «' + name + '»', n.line, n.col); }
  var tab = STATICS[tr.builtin];
  if (tab && name in tab) {
    var desc = Object.getOwnPropertyDescriptor(tab, name);
    if (desc && desc.get) return function () { return tab[name]; };
    var val = tab[name];
    if (typeof val === 'function' && !val.isConst) return function () { return new Fn(function (a) { return val.apply(null, a); }, -1, name); };
    if (typeof val === 'function' && val.isConst) return function () { return val(); };
    return function () { return val; };
  }
  throw new CsError('CS0117', '«' + tr.builtin + '» не содержит определения «' + name + '»', n.line, n.col);
}

/* ---- индексатор ---- */
function cIdx(n, cx) {
  var of = cRecv(n.o, cx), nullc = n.nullc;
  var fns = n.args.map(function (a) { return a.k === 'Rng' || true ? cExpr(a, cx) : null; });
  if (fns.length === 1) {
    var f0 = fns[0];
    return function (e) {
      var o = of(e);
      if (o === SHORT) return SHORT;
      if (o === null) { if (nullc) return SHORT; npe(); }
      var i = f0(e);
      if (o instanceof Arr && typeof i === 'number') { var a = o.a; if (i < 0 || i >= a.length) throwNew('IndexOutOfRangeException', 'Index was outside the bounds of the array.'); return a[i]; }
      return getIndex(o, [i]);
    };
  }
  return function (e) {
    var o = of(e);
    if (o === SHORT) return SHORT; if (o === null) { if (nullc) return SHORT; npe(); }
    return getIndex(o, fns.map(function (f) { return f(e); }));
  };
}

/* ---- лvalue ---- */
function cLvalue(n, cx) { // возвращает e → {get,set}
  if (n.k === 'Paren') return cLvalue(n.e, cx);
  if (n.k === 'Id') {
    var name = n.n, sc = lookupLocal(cx, name);
    if (sc) return function (e) { var b = e[name]; return { get: function () { return b.v; }, set: function (v) { storeBox(b, v); }, box: b }; };
    var m = lookupMember(cx, name);
    if (!m) { if (name === '_') return function () { return { get: function () { return null; }, set: function () { } }; }; throw new CsError('CS0103', 'Имя «' + name + '» не существует в текущем контексте', n.line, n.col); }
    if (m.kind === 'field') {
      var fcls = m.cls, f = m.f;
      if (f.isConst) throw new CsError('CS0131', 'Нельзя присвоить значение константе «' + name + '»', n.line, n.col);
      if (m.isStatic) return function () { if (!fcls.inited) ensureInit(fcls); return { get: function () { return fcls.st[name]; }, set: function (v) { fcls.st[name] = f.storeFn ? f.storeFn(v) : cp(v); } }; };
      if (cx.isStatic) throw new CsError('CS0120', 'Для нестатического поля «' + name + '» требуется ссылка на объект', n.line, n.col);
      if (f.isReadonly && !cx.inCtor) pendingErr('CS0191', 'Полю «' + name + '» (readonly) нельзя присвоить значение вне конструктора', n);
      return function (e) { var o = e.$this; return { get: function () { return o.f[name]; }, set: function (v) { o.f[name] = f.storeFn ? f.storeFn(v) : cp(v); } }; };
    }
    if (m.kind === 'prop') { var pr = m.pr; return function (e) { var o = pr.isStatic ? null : e.$this; return { get: function () { return getProp(o, pr); }, set: function (v) { setProp(o, pr, v); } }; }; }
    if (m.kind === 'pcparam') return function (e) { var b = e.$this.f.$pc[name]; return { get: function () { return b.v; }, set: function (v) { storeBox(b, v); } }; };
    throw new CsError('CS0131', 'Левая часть присваивания должна быть переменной, свойством или индексатором', n.line, n.col);
  }
  if (n.k === 'Mem') {
    var name2 = n.n;
    if (n.o.k === 'Id' || n.o.k === 'Mem') {
      var tr = typeRef(n.o, cx);
      if (tr && tr.user) {
        var def = tr.user; finalizeClass(def);
        var sf = null; for (var k = def; k && !sf; k = k.base) for (var i = 0; i < k.sfields.length; i++) if (k.sfields[i].n === name2) sf = { f: k.sfields[i], cls: k };
        if (sf) { if (sf.f.isConst) throw new CsError('CS0131', 'Нельзя присвоить значение константе «' + name2 + '»', n.line, n.col); return function () { ensureInit(sf.cls); return { get: function () { return sf.cls.st[name2]; }, set: function (v) { sf.cls.st[name2] = sf.f.storeFn ? sf.f.storeFn(v) : cp(v); } }; }; }
        var spr = null; for (var k2 = def; k2 && !spr; k2 = k2.base) if (k2.props[name2] && k2.props[name2].isStatic) spr = k2.props[name2];
        if (spr) return function () { return { get: function () { return getProp(null, spr); }, set: function (v) { setProp(null, spr, v); } }; };
        throw new CsError('CS0117', '«' + def.name + '» не содержит определения «' + name2 + '»', n.line, n.col);
      }
      if (tr) throw new CsError('CS0131', 'Левая часть присваивания должна быть переменной', n.line, n.col);
    }
    var of = n.o.k === 'Base' ? function (e) { return e.$this; } : cRecv(n.o, cx), nullc = n.nullc;
    var st = stOf(n.o, cx), sdef = st && USER[st];
    if (sdef) pendingChecks.push(function () { checkMemberExists(sdef, name2, n, cx.cls); });
    return function (e) {
      var o = of(e); if (o === null) npe();
      return { get: function () { return getMember(o, name2); }, set: function (v) { setMember(o, name2, v); } };
    };
  }
  if (n.k === 'Idx') {
    var of2 = cRecv(n.o, cx), fns = n.args.map(function (a) { return cExpr(a, cx); });
    return function (e) {
      var o = of2(e); if (o === null) npe();
      var idx = fns.map(function (f) { return f(e); });
      return { get: function () { return getIndex(o, idx); }, set: function (v) { setIndex(o, idx, v); } };
    };
  }
  if (n.k === 'Un' && n.op === '*') { }
  throw new CsError('CS0131', 'Левая часть присваивания должна быть переменной, свойством или индексатором', n.line, n.col);
}
var pendingErrs = [];
function pendingErr(code, msg, n) { pendingErrs.push(new CsError(code, msg, n.line, n.col)); }
function setMember(o, n, v) {
  if (o instanceof Obj) {
    var c = o.c; if (!c.pmap) finalizeClass(c);
    var pr = c.pmap[n];
    if (pr) { setProp(o, pr, v); return; }
    if (n in o.f) { o.f[n] = cp(v); return; }
    if (c.isExc && (n === 'Message' || n === 'Source' || n === 'HelpLink')) { o.f[n] = v; return; }
    throw new CsError('CS1061', '«' + c.name + '» не содержит определения «' + n + '»', 0, 0);
  }
  nativeSetMember(o, n, v);
}

/* ---- присваивание ---- */
function cAsg(n, cx) {
  var op = n.op, bop = op.length > 1 ? op.slice(0, -1) : null;
  var tgt = n.l;
  if (tgt.k === 'Tup') return cDeconAsg(n, cx);
  // быстрый путь: локальная переменная
  if (tgt.k === 'Id' && lookupLocal(cx, tgt.n)) {
    var name = tgt.n, sc = lookupLocal(cx, name);
    var rf = cExpr(n.r, cx, sc.t);
    if (!bop) {
      if (sc.st) { var rst = stOf(n.r, cx); checkAssign(sc.st, rst, n.r, n.r.k === 'Lit'); }
      return function (e) { var b = e[name]; var v = rf(e); if (b.co !== null) v = b.co(v); else if (v instanceof Obj && v.c.isStruct) v = cloneStruct(v); b.v = v; return v; };
    }
    if (bop === '??') return function (e) { var b = e[name]; if (b.v !== null) return b.v; var v = rf(e); return storeBox(b, v); };
    return function (e) { var b = e[name]; var r = rf(e); var a = b.v; var v; if (bop === '+' && typeof a === 'number' && typeof r === 'number') { v = a + r; if (v > 2147483647 || v < -2147483648) v = ovf32(v); } else v = arith(bop, a, r); if (b.co !== null) { if (typeof a === 'number' && !(v instanceof D) || true) v = castBack(b, a, v); } b.v = v; return v; };
  }
  var lv = cLvalue(tgt, cx), rf2 = cExpr(n.r, cx, tgt.k === 'Id' ? null : null);
  if (!bop) return function (e) { var l = lv(e); var v = rf2(e); l.set(v); return v; };
  if (bop === '??') return function (e) { var l = lv(e); var cur = l.get(); if (cur !== null) return cur; var v = rf2(e); l.set(v); return v; };
  return function (e) { var l = lv(e); var r = rf2(e); var cur = l.get(); var v = arith(bop, cur, r); v = castBackV(cur, v); l.set(v); return v; };
}
function castBack(b, a, v) { // составное присваивание: результат приводится к типу переменной
  if (typeof a === 'number' && (v instanceof D || typeof v === 'bigint')) return b.co(v);
  if (b.t && (b.t.n === 'byte' || b.t.n === 'short' || b.t.n === 'sbyte' || b.t.n === 'ushort')) return castTo(b.t, v);
  return b.co(v);
}
function castBackV(cur, v) {
  if (typeof cur === 'number' && v instanceof D) throw new CsError('CS0266', 'Не удаётся неявно преобразовать тип «double» в «int». Существует явное преобразование', 0, 0);
  if (cur instanceof D && !(v instanceof D)) return v instanceof Dec ? v : new D(toNum(v), cur.f);
  if (typeof cur === 'bigint' && typeof v === 'number') return BigInt(v);
  if (cur instanceof Ch && typeof v === 'number') return mkChar(v & 0xFFFF);
  return v;
}
function cDeconAsg(n, cx) {
  var targets = n.l.items.map(function (it) { return cLvalue(it.e, cx); }), rf = cExpr(n.r, cx);
  return function (e) { var v = rf(e); var vals = deconstruct(v, targets.length); var ls = targets.map(function (t) { return t(e); }); ls.forEach(function (l, i) { l.set(vals[i]); }); return v; };
}
function deconstruct(v, n) {
  if (v instanceof Tup) return v.items;
  if (v instanceof Obj) {
    var m = findMethod(v.c, 'Deconstruct', n);
    if (m) { var boxes = []; for (var i = 0; i < n; i++) boxes.push(new Box(null)); invoke(m, v, boxes); return boxes.map(function (b) { return b.v; }); }
    if (v.c.isRecord && v.c.primary) return v.c.primary.map(function (p) { return getMember(v, p.n); });
  }
  if (v && v.isKvp) return [v.Key, v.Value];
  throwNew('InvalidCastException', 'Нельзя деконструировать значение');
}
function cPost(n, cx) {
  var op = n.op === '++' ? '+' : '-', tgt = n.e;
  if (tgt.k === 'Id' && lookupLocal(cx, tgt.n)) {
    var name = tgt.n;
    return function (e) {
      var b = e[name], a = b.v;
      if (typeof a === 'number') { var r = op === '+' ? a + 1 : a - 1; if (r > 2147483647 || r < -2147483648) r = ovf32(r); b.v = r; return a; }
      var nv = arith(op, a, 1); if (a instanceof Ch) nv = mkChar(nv & 0xFFFF); else if (b.co !== null) nv = castBack(b, a, nv); b.v = nv; return a;
    };
  }
  var lv = cLvalue(tgt, cx);
  return function (e) { var l = lv(e); var a = l.get(); var nv = arith(op, a, 1); if (a instanceof Ch) nv = mkChar(nv & 0xFFFF); l.set(castBackV(a, nv)); return a; };
}
function cUn(n, cx) {
  var op = n.op;
  if (op === '++' || op === '--') {
    var bop = op === '++' ? '+' : '-', tgt = n.e;
    if (tgt.k === 'Id' && lookupLocal(cx, tgt.n)) {
      var name = tgt.n;
      return function (e) { var b = e[name], a = b.v; var nv; if (typeof a === 'number') { nv = bop === '+' ? a + 1 : a - 1; if (nv > 2147483647 || nv < -2147483648) nv = ovf32(nv); } else { nv = arith(bop, a, 1); if (a instanceof Ch) nv = mkChar(nv & 0xFFFF); else if (b.co !== null) nv = castBack(b, a, nv); } b.v = nv; return nv; };
    }
    var lv = cLvalue(tgt, cx);
    return function (e) { var l = lv(e); var a = l.get(); var nv = arith(bop, a, 1); if (a instanceof Ch) nv = mkChar(nv & 0xFFFF); nv = castBackV(a, nv); l.set(nv); return nv; };
  }
  var f = cExpr(n.e, cx);
  if (op === '^') return function (e) { return { fromEnd: true, v: f(e), tn: 'Index' }; };
  if (op === '!') { return function (e) { var v = f(e); if (v === true) return false; if (v === false) return true; return unop('!', v); }; }
  return function (e) { return unop(op, f(e)); };
}

/* ---- бинарные операторы ---- */
function cBin(n, cx) {
  var op = n.op;
  if (op === '&&') { var a = cExpr(n.l, cx), b = cExpr(n.r, cx); return function (e) { var x = a(e); if (x === false) return false; if (x !== true) condErr(); var y = b(e); if (y !== true && y !== false) condErr(); return y; }; }
  if (op === '||') { var a2 = cExpr(n.l, cx), b2 = cExpr(n.r, cx); return function (e) { var x = a2(e); if (x === true) return true; if (x !== false) condErr(); var y = b2(e); if (y !== true && y !== false) condErr(); return y; }; }
  if (op === '??') { var a3 = cExpr(n.l, cx), b3 = cExpr(n.r, cx); return function (e) { var x = a3(e); return x !== null && x !== undefined ? x : b3(e); }; }
  var lf = cExpr(n.l, cx), rf = cExpr(n.r, cx);
  // статические проверки несовместимых операндов
  var sa = stOf(n.l, cx), sb = stOf(n.r, cx);
  var primSt = function (x) { return NUMR[x] !== undefined || x === 'string' || x === 'bool'; };
  if (sa && sb && sa !== 'null' && sb !== 'null' && primSt(sa) && primSt(sb)) {
    var pa = NUMR[sa] !== undefined, pb = NUMR[sb] !== undefined;
    var bad = false;
    if (op === '+' ) bad = !((sa === 'string' || sb === 'string') || (pa && pb));
    else if (op === '-' || op === '*' || op === '/' || op === '%') bad = !(pa && pb);
    else if (op === '<' || op === '>' || op === '<=' || op === '>=') bad = !(pa && pb);
    else if (op === '==' || op === '!=') bad = (pa && pb ? false : ((sa === 'string') !== (sb === 'string') && (pa || pb || sa === 'bool' || sb === 'bool' || sa === 'string' || sb === 'string')) || ((sa === 'bool') !== (sb === 'bool') && (pa || pb)));
    if (bad || ((NUMR[sa] === 5 && (NUMR[sb] === 3 || NUMR[sb] === 4)) || (NUMR[sb] === 5 && (NUMR[sa] === 3 || NUMR[sa] === 4)))) {
      if ((op === '==' || op === '!=') && !(pa && pb)) throw new CsError('CS0019', 'Оператор «' + op + '» нельзя применить к операндам типов «' + sa + '» и «' + sb + '»', n.line, n.col);
      if (bad || ((NUMR[sa] === 5 || NUMR[sb] === 5) && pa && pb)) throw new CsError('CS0019', 'Оператор «' + op + '» нельзя применить к операндам типов «' + sa + '» и «' + sb + '»', n.line, n.col);
    }
  }
  switch (op) {
    case '+': return function (e) { var x = lf(e), y = rf(e); if (typeof x === 'number' && typeof y === 'number') { var r = x + y; return (r > 2147483647 || r < -2147483648) ? ovf32(r) : r; } if (typeof x === 'string' && typeof y === 'string') return x + y; return arith('+', x, y); };
    case '-': return function (e) { var x = lf(e), y = rf(e); if (typeof x === 'number' && typeof y === 'number') { var r = x - y; return (r > 2147483647 || r < -2147483648) ? ovf32(r) : r; } return arith('-', x, y); };
    case '*': return function (e) { var x = lf(e), y = rf(e); if (typeof x === 'number' && typeof y === 'number') { var r = x * y; if (r > 2147483647 || r < -2147483648) { if (CHK) ovf(); return Math.imul(x, y); } return r; } return arith('*', x, y); };
    case '/': case '%': case '&': case '|': case '^': case '<<': case '>>': return function (e) { return arith(op, lf(e), rf(e)); };
    case '<': return function (e) { var x = lf(e), y = rf(e); if (typeof x === 'number' && typeof y === 'number') return x < y; return cmpOp('<', x, y); };
    case '>': return function (e) { var x = lf(e), y = rf(e); if (typeof x === 'number' && typeof y === 'number') return x > y; return cmpOp('>', x, y); };
    case '<=': return function (e) { var x = lf(e), y = rf(e); if (typeof x === 'number' && typeof y === 'number') return x <= y; return cmpOp('<=', x, y); };
    case '>=': return function (e) { var x = lf(e), y = rf(e); if (typeof x === 'number' && typeof y === 'number') return x >= y; return cmpOp('>=', x, y); };
    case '==': {
      var objEq = isObjStatic(n.l, cx) && isObjStatic(n.r, cx);
      if (objEq) return function (e) { var x = lf(e), y = rf(e); return refEqBoxed(x, y); };
      return function (e) { var x = lf(e), y = rf(e); if (typeof x === 'number' && typeof y === 'number') return x === y; if (typeof x === 'string' && typeof y === 'string') return x === y; return eqOp(x, y); };
    }
    case '!=': {
      var objEq2 = isObjStatic(n.l, cx) && isObjStatic(n.r, cx);
      if (objEq2) return function (e) { return !refEqBoxed(lf(e), rf(e)); };
      return function (e) { var x = lf(e), y = rf(e); if (typeof x === 'number' && typeof y === 'number') return x !== y; if (typeof x === 'string' && typeof y === 'string') return x !== y; return !eqOp(x, y); };
    }
  }
  throw new CsError('CS8652', 'Оператор «' + op + '» не поддерживается', n.line, n.col);
}
function isObjStatic(n, cx) {
  if (n.k === 'Cast' && n.t.n === 'object') return true;
  if (n.k === 'Id') { var sc = lookupLocal(cx, n.n); return !!(sc && sc.t && sc.t.n === 'object'); }
  return false;
}
function refEqBoxed(x, y) { // сравнение ссылок object == object: упакованные значения — разные объекты
  if (x === null || y === null) return x === y;
  if (typeof x === 'string' && typeof y === 'string') return x === y;
  if (typeof x === 'number' || typeof x === 'bigint' || typeof x === 'boolean' || x instanceof D || x instanceof Dec || x instanceof Ch) return false;
  return x === y;
}
