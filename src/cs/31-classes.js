/* ---------- классы, методы, вызовы ---------- */
var OBJ_DEF = null;
var ROOT = Object.create(null);
var USER = Object.create(null);        // имя → ClassDef (пользовательские типы)
var DEPTH = 0, MAXDEPTH = 700;
var RV = undefined;                    // значение return
var SIG_BRK = 1, SIG_CNT = 2, SIG_RET = 3;
var STEPS = 0, DEADLINE = Infinity;
function TICK() { if ((++STEPS & 1023) === 0 && Date.now() > DEADLINE) throw new Fatal('Превышено время выполнения (бесконечный цикл или слишком тяжёлые вычисления).'); }
var CHK = 0;                           // checked-контекст
var RUN = null;                        // состояние текущего запуска

function ClassDef(name, kind) {
  this.name = name; this.full = name; this.kind = kind || 'class'; this.base = null; this.ifaces = []; this.ifaceNames = [];
  this.methods = Object.create(null); this.props = Object.create(null); this.fields = []; this.sfields = []; this.ctors = [];
  this.st = Object.create(null); this.inited = 0; this.initing = 0;
  this.isStruct = false; this.isRecord = false; this.isAbstract = false; this.isIface = false; this.isEnum = false; this.isExc = false; this.isStatic = false;
  this.mmap = null; this.pmap = null; this.outer = null; this.decl = null; this.cctor = null; this.members = [];
  this.nested = Object.create(null); this.defMsg = null; this.tparams = [];
}
function MethodDef(name, cls) { this.name = name; this.cls = cls; this.ps = []; this.mods = {}; this.body = null; this.isStatic = false; this.isAsync = false; this.isIter = false; this.ret = null; this.native = null; this.sig = ''; this.nreq = 0; this.hasParams = false; }

function typeKey(t) { if (!t) return '?'; return t.n + (t.arr ? '[]' : ''); }
function sigOf(ps) { return ps.map(function (p) { return typeKey(p.t); }).join(','); }

function isSubclass(c, target) {
  for (var k = c; k; k = k.base) {
    if (k === target) return true;
    for (var i = 0; i < k.ifaces.length; i++) if (isSubclass(k.ifaces[i], target)) return true;
  }
  return false;
}
function implementsName(c, name) {
  for (var k = c; k; k = k.base) {
    if (k.name === name) return true;
    if (k.ifaceNames.indexOf(name) >= 0) return true;
    for (var i = 0; i < k.ifaces.length; i++) if (implementsName(k.ifaces[i], name)) return true;
  }
  return false;
}
function finalizeClass(c) {
  if (c.mmap) return;
  if (c.base) finalizeClass(c.base);
  c.ifaces.forEach(finalizeClass);
  var mm = Object.create(null), pm = Object.create(c.base ? c.base.pmap : null);
  // унаследованные методы
  if (c.base) for (var n in c.base.mmap) mm[n] = c.base.mmap[n].slice();
  // методы интерфейсов с телом (default interface methods) — только если нет реализации
  c.ifaces.forEach(function (ic) { for (var n in ic.mmap) { ic.mmap[n].forEach(function (m) { if (!m.body) return; var lst = mm[n] || (mm[n] = []); if (!lst.some(function (x) { return x.sig === m.sig; })) lst.push(m); }); } });
  for (var n2 in c.methods) {
    var own = c.methods[n2], lst2 = mm[n2] || (mm[n2] = []);
    own.forEach(function (m) {
      // свои методы идут первыми; переопределённые (та же подпись) убираем
      for (var i = lst2.length - 1; i >= 0; i--) if (lst2[i].sig === m.sig && lst2[i].cls !== c) { m.overridden = lst2[i]; lst2.splice(i, 1); }
    });
    mm[n2] = own.concat(lst2.filter(function (x) { return x.cls !== c; }));
  }
  for (var pn in c.props) pm[pn] = c.props[pn];
  c.ifaces.forEach(function (ic) { for (var pn2 in ic.pmap) if (!(pn2 in pm)) pm[pn2] = ic.pmap[pn2]; });
  c.mmap = mm; c.pmap = pm;
}
function findMethod(c, name, argc) {
  if (!c.mmap) finalizeClass(c);
  var lst = c.mmap[name]; if (!lst) return null;
  for (var i = 0; i < lst.length; i++) { var m = lst[i]; if (m.ps.length === argc && !m.isStatic && m.body) return m; }
  return null;
}
function findProp(c, name) { if (!c.pmap) finalizeClass(c); return c.pmap[name] || null; }

/* вызов */
function ensureInit(c) {
  if (c.inited) return;
  c.inited = 1;
  if (c.base) ensureInit(c.base);
  c.sfields.forEach(function (f) {
    c.st[f.n] = defaultOfT(f.t);
  });
  (c.sautoProps || []).forEach(function (p) { c.st[p.name] = defaultOfT(p.t); });
  var e = Object.create(ROOT); e.$cls = c;
  c.sfields.forEach(function (f) { if (f.initFn) { c.st[f.n] = f.storeFn ? f.storeFn(f.initFn(e)) : f.initFn(e); } });
  (c.sautoProps || []).forEach(function (p) { if (p.initFn) c.st[p.name] = p.co ? p.co(p.initFn(e)) : cp(p.initFn(e)); });
  if (c.cctor) { var env = Object.create(ROOT); env.$cls = c; var s = c.cctor.body(env); }
}
function bindArgs(m, env, args) {
  var ps = m.ps, n = ps.length;
  for (var i = 0; i < n; i++) {
    var p = ps[i], v;
    if (p.mod === 'params' && !(args.length === n && (args[i] instanceof Arr))) {
      var rest = args.slice(i); v = new Arr(rest.map(function (x) { return p.co ? p.co(x) : x; }), p.t.arrOf ? p.t.arrOf.n : 'object'); env[p.n] = new Box(v, p.t); break;
    }
    if (i < args.length) {
      v = args[i];
      if (p.mod === 'ref' || p.mod === 'out') { env[p.n] = v instanceof Box ? v : new Box(v, p.t); continue; }
      if (p.co) v = p.co(v);
    } else if (p.defFn) v = p.co ? p.co(p.defFn(env)) : p.defFn(env);
    else throwNew('ArgumentException', 'Missing argument for parameter ' + p.n);
    var bx = new Box(v, p.t); bx.co = p.co || null; env[p.n] = bx;
  }
}
function invoke(m, self, args) {
  if (m.native) return m.native(self, args);
  var env = Object.create(m.isStatic || !m.cls ? ROOT : ROOT);
  env.$this = self; env.$cls = m.cls;
  bindArgs(m, env, args);
  if (m.isAsync || m.isIter) return m.start(env, self);
  if (++DEPTH > MAXDEPTH) { DEPTH = 0; throw new Fatal('Stack overflow.'); }
  TICK();
  CUR_STACK.push(m);
  var sig;
  try {
    if (m.exprFn) { var rv = m.exprFn(env); return m.co ? m.co(rv) : rv; }
    sig = m.body(env);
  } finally { DEPTH--; CUR_STACK.pop(); }
  if (sig === SIG_RET) { var r = RV; RV = undefined; return m.co ? m.co(r) : r; }
  return undefined;
}
function matchScore(v, t) {
  if (!t) return 1;
  var n = t.n;
  if (t.arr) return v instanceof Arr ? 3 : (v === null ? 1 : -1e9);
  if (v === null || v === undefined) { return (n === 'int' || n === 'long' || n === 'double' || n === 'bool' || n === 'char' || n === 'decimal' || n === 'float') && !t.nullable ? -1e9 : 1; }
  switch (n) {
    case 'int': case 'short': case 'byte': case 'sbyte': case 'uint': case 'ushort': return typeof v === 'number' ? 3 : (v instanceof Ch ? 1 : -1e9);
    case 'long': case 'ulong': return typeof v === 'bigint' ? 3 : typeof v === 'number' ? 1.5 : (v instanceof Ch ? 1 : -1e9);
    case 'double': return (v instanceof D && !v.f) ? 3 : v instanceof D ? 2 : (typeof v === 'number' ? 1 : typeof v === 'bigint' ? 1 : v instanceof Ch ? .5 : -1e9);
    case 'float': return (v instanceof D && v.f) ? 3 : (typeof v === 'number' || typeof v === 'bigint') ? 1 : -1e9;
    case 'decimal': return v instanceof Dec ? 3 : (typeof v === 'number' || typeof v === 'bigint') ? 1 : -1e9;
    case 'bool': return typeof v === 'boolean' ? 3 : -1e9;
    case 'char': return v instanceof Ch ? 3 : -1e9;
    case 'string': return typeof v === 'string' ? 3 : -1e9;
    case 'object': return .5;
    case 'var': return 1;
  }
  var def = USER[n];
  if (def) {
    if (v instanceof Obj) { if (v.c === def) return 3; if (isSubclass(v.c, def)) return 2; return -1e9; }
    if (v instanceof EnumVal) return v.def === def ? 3 : -1e9;
    if (v instanceof Fn && def.kind === 'delegate') return 3;
    return -1e9;
  }
  var chk = TYPECHK[n];
  if (chk) return chk(v) ? 2 : -1e9;
  if (EXC[n]) return v instanceof Obj && isSubclass(v.c, EXC[n]) ? (v.c === EXC[n] ? 3 : 2) : -1e9;
  return 1; // параметр типа T и прочее
}
function pickMethod(lst, args, name) {
  var best = null, bs = -1e18, argc = args.length;
  for (var i = 0; i < lst.length; i++) {
    var m = lst[i], ps = m.ps;
    if (argc > ps.length && !m.hasParams) continue;
    if (argc < m.nreq) continue;
    var sc = 0, ok = true;
    for (var j = 0; j < argc; j++) {
      var p = ps[Math.min(j, ps.length - 1)];
      if (p.mod === 'params') {
        if (j === ps.length - 1 && args.length === ps.length && args[j] instanceof Arr) sc += 3;
        else sc += matchScore(args[j], p.t.arrOf || p.t) - 0.5;
        continue;
      }
      var s = args[j] instanceof Box ? 2 : matchScore(args[j], p.t);
      if (s < -1e8) { ok = false; break; }
      sc += s;
    }
    if (!ok) continue;
    sc -= Math.abs(ps.length - argc) * 0.1;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
function nameArgs(m, args, names) { // именованные аргументы → позиционные
  var out = [], ps = m.ps;
  var pos = args.length - names.filter(Boolean).length;
  for (var i = 0; i < pos; i++) out[i] = args[i];
  for (var j = pos; j < args.length; j++) {
    var idx = -1; for (var k = 0; k < ps.length; k++) if (ps[k].n === names[j]) idx = k;
    if (idx < 0) throw new CsError('CS1739', 'Метод «' + m.name + '» не имеет параметра «' + names[j] + '»', 0, 0);
    out[idx] = args[j];
  }
  for (var q = 0; q < ps.length; q++) if (out[q] === undefined && ps[q].defFn) out[q] = ps[q].defFn(ROOT);
  return out;
}

/* создание объектов */
function defaultOfT(t) {
  if (!t) return null;
  if (t.arr) return null;
  if (t.nullable) return null;
  switch (t.n) {
    case 'int': case 'short': case 'byte': case 'sbyte': case 'uint': case 'ushort': return 0;
    case 'long': case 'ulong': return 0n;
    case 'double': return ZERO_D;
    case 'float': return new D(0, 1);
    case 'decimal': return new Dec(0n, 0);
    case 'bool': return false;
    case 'char': return mkChar(0);
    case 'ValueTuple': return new Tup((t.args || []).map(defaultOfT), t.names);
  }
  var def = USER[t.n];
  if (def) {
    if (def.isEnum) return enumOf(def, 0);
    if (def.isStruct) { var o = new Obj(def); ensureInit(def); initFields(def, o); return o; }
  }
  return null;
}
var ENUMCACHE = new Map();
function enumOf(def, v) {
  var key = def.name + ':' + v, e = ENUMCACHE.get(key);
  if (!e) { e = new EnumVal(def, v); ENUMCACHE.set(key, e); }
  return e;
}
function cloneObj(o) { var c = new Obj(o.c); for (var k in o.f) c.f[k] = o.f[k]; return c; }
function cp(v) { return (v instanceof Obj && v.c.isStruct) ? cloneStruct(v) : v; }
function cloneStruct(o) { var c = new Obj(o.c); for (var k in o.f) { var x = o.f[k]; c.f[k] = (x instanceof Obj && x.c.isStruct) ? cloneStruct(x) : x; } return c; }
function initFields(c, o) {
  var chain = []; for (var k = c; k; k = k.base) chain.unshift(k);
  chain.forEach(function (k) { k.fields.forEach(function (f) { if (!(f.n in o.f)) o.f[f.n] = defaultOfT(f.t); }); (k.autoProps || []).forEach(function (p) { if (!(p.name in o.f)) o.f[p.name] = defaultOfT(p.t); }); });
}
function runFieldInits(c, o) {
  if (!c.fields.length && !(c.autoProps && c.autoProps.length)) return;
  var env = Object.create(ROOT); env.$this = o; env.$cls = c;
  (c.autoProps || []).forEach(function (p) { if (p.initFn) o.f[p.name] = p.co ? p.co(p.initFn(env)) : cp(p.initFn(env)); });
  c.fields.forEach(function (f) { if (f.initFn) { var v = f.initFn(env); o.f[f.n] = f.storeFn ? f.storeFn(v) : cp(v); } });
}
function instantiate(c, args, names) {
  if (c.isAbstract) throw new CsError('CS0144', 'Нельзя создать экземпляр абстрактного типа или интерфейса «' + c.name + '»', 0, 0);
  ensureInit(c);
  var o = new Obj(c);
  initFields(c, o);
  construct(c, o, args, names);
  return o;
}
function constructBase(b, o, args) { if (b.native) b.native(o, args); else construct(b, o, args); }
function pickCtor(c, args) {
  if (!c.ctors.length) return null;
  return pickMethod(c.ctors, args, c.name);
}
function construct(c, o, args, names) {
  var ct = pickCtor(c, args);
  if (c.ctors.length && !ct) {
    if (!(c.isStruct && !args.length)) throw new CsError('CS1729', 'У типа «' + c.name + '» нет конструктора, принимающего ' + args.length + ' арг.', 0, 0);
  }
  if (ct && names && names.some(Boolean)) args = nameArgs(ct, args, names);
  if (!ct) {
    // конструктор по умолчанию (или первичный)
    var penv = null;
    if (c.primary) {
      penv = Object.create(ROOT); penv.$this = o; penv.$cls = c;
      bindArgs({ ps: c.primary }, penv, args);
      c.primary.forEach(function (p) { if (c.isRecord || c.fields.some(function (f) { return f.n === p.n; })) { /* свойство записи */ } });
      o.f.$pc = penv;
      if (c.isRecord) c.primary.forEach(function (p) { o.f[p.n] = penv[p.n].v; });
    }
    if (c.base) {
      if (c.baseArgsFn && penv) { var bargs = c.baseArgsFn(penv); constructBase(c.base, o, bargs); }
      else constructBase(c.base, o, []);
    }
    runFieldInits(c, o);
    if (c.isExc && o.f.Message === undefined) o.f.Message = undefined;
    return;
  }
  var env = Object.create(ROOT); env.$this = o; env.$cls = c;
  bindArgs(ct, env, args);
  if (c.primary) o.f.$pc = env;
  var init = ct.init;
  if (init && init.kind === 'this') {
    var targs = init.argFns.map(function (f) { return f(env); });
    construct(c, o, targs);
  } else {
    runFieldInits(c, o);
    if (c.base) {
      var bargs2 = init ? init.argFns.map(function (f) { return f(env); }) : [];
      constructBase(c.base, o, bargs2);
    }
  }
  if (++DEPTH > MAXDEPTH) { DEPTH = 0; throw new Fatal('Stack overflow.'); }
  try {
    if (ct.exprFn) ct.exprFn(env); else if (ct.body) { var sig = ct.body(env); }
  } finally { DEPTH--; }
}

/* свойства */
function getProp(o, pr) {
  if (pr.isStatic) { ensureInit(pr.cls); if (pr.auto) return pr.cls.st[pr.name]; return invoke(pr.getter, null, []); }
  if (pr.auto) return o.f[pr.name];
  if (!pr.getter) throw new CsError('CS0154', 'Свойство «' + pr.name + '» не имеет метода доступа get', 0, 0);
  return invoke(pr.getter, o, []);
}
function setProp(o, pr, v) {
  if (pr.isStatic) { ensureInit(pr.cls); if (pr.auto) { pr.cls.st[pr.name] = pr.co ? pr.co(v) : cp(v); return; } invoke(pr.setter, null, [v]); return; }
  if (pr.auto) {
    if (!pr.setter && !pr.hasSet) throw new CsError('CS0200', 'Свойство «' + pr.name + '» доступно только для чтения', 0, 0);
    o.f[pr.name] = pr.co ? pr.co(v) : cp(v); return;
  }
  if (!pr.setter) throw new CsError('CS0200', 'Свойство «' + pr.name + '» доступно только для чтения', 0, 0);
  invoke(pr.setter, o, [v]);
}
