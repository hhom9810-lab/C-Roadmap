/* ---------- типы, преобразования, операторы ---------- */
var TYPECHK = Object.create(null);
var INTLIKE = { int: 1, short: 1, byte: 1, sbyte: 1, uint: 1, ushort: 1, Int32: 1, Int16: 1, Byte: 1, SByte: 1, UInt32: 1, UInt16: 1, nint: 1 };
var LONGLIKE = { long: 1, ulong: 1, Int64: 1, UInt64: 1, nuint: 1 };
function isEnumerable(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' || v instanceof Arr) return true;
  if (v instanceof Obj) return !!(findMethod(v.c, 'GetEnumerator', 0) || implementsName(v.c, 'IEnumerable'));
  return v instanceof Seq || typeof v.iter === 'function' || typeof v[Symbol.iterator] === 'function';
}
function lookupType(name) { return USER[name] || null; }
function mkTypeTest(t) {
  if (!t) return function (v) { return v !== null; };
  var inner = mkTypeTest1(t);
  if (t.nullable) return function (v) { return v === null || inner(v); };
  return function (v) { return v !== null && v !== undefined && inner(v); };
}
function mkTypeTest1(t) {
  if (t.arr) return function (v) { return v instanceof Arr; };
  if (t.tuple) return function (v) { return v instanceof Tup; };
  var n = t.n;
  switch (n) {
    case 'int': case 'Int32': case 'short': case 'byte': case 'sbyte': case 'uint': case 'ushort': case 'Int16': case 'Byte': return function (v) { return typeof v === 'number'; };
    case 'long': case 'Int64': case 'ulong': return function (v) { return typeof v === 'bigint'; };
    case 'double': case 'Double': return function (v) { return v instanceof D && !v.f; };
    case 'float': case 'Single': return function (v) { return v instanceof D && !!v.f; };
    case 'decimal': case 'Decimal': return function (v) { return v instanceof Dec; };
    case 'bool': case 'Boolean': return function (v) { return typeof v === 'boolean'; };
    case 'char': case 'Char': return function (v) { return v instanceof Ch; };
    case 'string': case 'String': return function (v) { return typeof v === 'string'; };
    case 'object': case 'Object': case 'var': case 'dynamic': return function (v) { return true; };
    case 'ValueType': return function (v) { return typeof v !== 'string' && !(v instanceof Obj && !v.c.isStruct) && !(v instanceof Arr); };
    case 'Enum': return function (v) { return v instanceof EnumVal; };
  }
  return function (v) {
    var def = USER[n];
    if (def) {
      if (def.isEnum) return v instanceof EnumVal && v.def === def;
      if (def.kind === 'delegate') return v instanceof Fn;
      return v instanceof Obj && isSubclass(v.c, def);
    }
    if (EXC[n]) return v instanceof Obj && isSubclass(v.c, EXC[n]);
    var chk = TYPECHK[n];
    if (chk) return chk(v);
    if (v instanceof Obj) return implementsName(v.c, n);
    return false;
  };
}
function typeDisplay(v) {
  if (v === null) return 'null';
  var n = typeNameOf(v);
  if (v instanceof Obj) return v.c.full || v.c.name;
  return SYS_FULL[n] || ('System.' + n);
}
function csTypeName(t) { // для сообщений об ошибках компиляции
  if (!t) return '?';
  var s = t.n; if (t.args && t.args.length && !t.tuple) s += '<' + t.args.map(csTypeName).join(', ') + '>';
  if (t.arr) s = csTypeName(t.arrOf) + '[]';
  if (t.nullable) s += '?';
  return s;
}
function ovf() { throwNew('OverflowException', 'Arithmetic operation resulted in an overflow.'); }
function ovf32(r) { if (CHK) ovf(); return r | 0; }
function numErr(op, a, b) { throw new CsError('CS0019', 'Оператор «' + op + '» нельзя применить к операндам типов «' + opType(a) + '» и «' + opType(b) + '»', 0, 0); }
function opType(v) { var m = { Int32: 'int', Int64: 'long', Double: 'double', Single: 'float', Decimal: 'decimal', String: 'string', Boolean: 'bool', Char: 'char' }; var n = typeNameOf(v); return v instanceof Obj ? v.c.name : (m[n] || n); }

function findOp(a, b, name) {
  var cands = [];
  [a, b].forEach(function (x) {
    if (x instanceof Obj) { if (!x.c.mmap) finalizeClass(x.c); var l = x.c.mmap[name]; if (l) l.forEach(function (m) { if (cands.indexOf(m) < 0) cands.push(m); }); }
    else if (x instanceof EnumVal) { }
  });
  return cands;
}
function userOp(name, args) {
  var cands = findOp(args[0], args.length > 1 ? args[1] : undefined, name);
  if (!cands.length) return undefined;
  var m = pickMethod(cands.filter(function (c) { return c.isStatic; }), args, name);
  if (!m) return undefined;
  return { v: invoke(m, null, args) };
}
function arith(op, a, b) {
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && a.tn && b.tn && (op === '+' || op === '-')) {
    if (a.tn === 'DateTime' && b.tn === 'DateTime' && op === '-') return new TimeSpan(a.ms - b.ms);
    if (a.tn === 'DateTime' && b.tn === 'TimeSpan') return new DT(op === '+' ? a.ms + b.ms : a.ms - b.ms, a.utc);
    if (a.tn === 'TimeSpan' && b.tn === 'TimeSpan') return new TimeSpan(op === '+' ? a.ms + b.ms : a.ms - b.ms);
  }
  if (op === '+') {
    if (typeof a === 'string' || typeof b === 'string') {
      if (a instanceof Obj && !(typeof b === 'string')) { }
      return str(a) + str(b);
    }
  }
  if ((a instanceof Obj || b instanceof Obj)) {
    var u = userOp('operator ' + op, [a, b]); if (u) return u.v;
    if (a instanceof Obj && b instanceof Obj || true) {
      if (a === null || b === null) npe();
      numErr(op, a, b);
    }
  }
  if (a === null || b === null) {
    if (op === '+' && (a instanceof Fn || b instanceof Fn)) return a || b;
    if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') { return null; } // lifted-null (int?) — упрощённо
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    if (op === '&') return a && b; if (op === '|') return a || b; if (op === '^') return a !== b; numErr(op, a, b);
  }
  if (a instanceof EnumVal || b instanceof EnumVal) {
    var ea = a instanceof EnumVal ? a : null, eb = b instanceof EnumVal ? b : null, def = (ea || eb).def;
    var x = ea ? ea.v : toNum(a), y = eb ? eb.v : toNum(b);
    switch (op) { case '|': return enumOf(def, x | y); case '&': return enumOf(def, x & y); case '^': return enumOf(def, x ^ y);
      case '+': return enumOf(def, x + y); case '-': return (ea && eb) ? (x - y) : enumOf(def, x - y); }
    numErr(op, a, b);
  }
  if (a instanceof Fn || b instanceof Fn) { if (op === '+') return combineFn(a, b); if (op === '-') return removeFn(a, b); numErr(op, a, b); }
  var ra = numRank(a), rb = numRank(b);
  if (ra < 0 || rb < 0) numErr(op, a, b);
  var r = Math.max(ra, rb);
  if (r === 4) {
    if (ra === 2 || ra === 3 || rb === 2 || rb === 3) numErr(op, a, b);
    var da = a instanceof Dec ? a : new Dec(BigInt(toNum(a instanceof Ch ? a.c : typeof a === 'bigint' ? Number(a) : a)), 0);
    if (typeof a === 'bigint') da = new Dec(a, 0);
    var db = b instanceof Dec ? b : (typeof b === 'bigint' ? new Dec(b, 0) : new Dec(BigInt(toNum(b)), 0));
    if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') return decArith(op, da, db);
    numErr(op, a, b);
  }
  if (r === 0) {
    var x0 = a instanceof Ch ? a.c : a instanceof EnumVal ? a.v : a, y0 = b instanceof Ch ? b.c : b instanceof EnumVal ? b.v : b;
    switch (op) {
      case '+': { var s = x0 + y0; return (s > 2147483647 || s < -2147483648) ? ovf32(s) : s; }
      case '-': { var d = x0 - y0; return (d > 2147483647 || d < -2147483648) ? ovf32(d) : d; }
      case '*': { var m = x0 * y0; if (m > 2147483647 || m < -2147483648) { if (CHK) ovf(); return Math.imul(x0, y0); } return m; }
      case '/': if (y0 === 0) throwNew('DivideByZeroException', 'Attempted to divide by zero.'); { var q = x0 / y0; if (q === 2147483648) return ovf32(q); return q < 0 ? Math.ceil(q) : Math.floor(q); }
      case '%': if (y0 === 0) throwNew('DivideByZeroException', 'Attempted to divide by zero.'); return x0 % y0 | 0;
      case '&': return x0 & y0; case '|': return x0 | y0; case '^': return x0 ^ y0;
      case '<<': return x0 << (y0 & 31); case '>>': return x0 >> (y0 & 31);
    }
  }
  if (r === 1) {
    var bx = BigInt(a instanceof Ch ? a.c : a), by = BigInt(b instanceof Ch ? b.c : b), rs;
    switch (op) {
      case '+': rs = bx + by; break; case '-': rs = bx - by; break; case '*': rs = bx * by; break;
      case '/': if (by === 0n) throwNew('DivideByZeroException', 'Attempted to divide by zero.'); rs = bx / by; break;
      case '%': if (by === 0n) throwNew('DivideByZeroException', 'Attempted to divide by zero.'); rs = bx % by; break;
      case '&': rs = bx & by; break; case '|': rs = bx | by; break; case '^': rs = bx ^ by; break;
      case '<<': rs = bx << (by & 63n); break; case '>>': rs = bx >> (by & 63n); break;
    }
    if (rs > 9223372036854775807n || rs < -9223372036854775808n) { if (CHK) ovf(); rs = wrap64(rs); }
    return rs;
  }
  // double / float
  var fx = toNum(a), fy = toNum(b), fr;
  switch (op) {
    case '+': fr = fx + fy; break; case '-': fr = fx - fy; break; case '*': fr = fx * fy; break;
    case '/': fr = fx / fy; break; case '%': fr = fx % fy; break;
    default: numErr(op, a, b);
  }
  return r === 2 ? new D(Math.fround(fr), 1) : new D(fr, 0);
}
function combineFn(a, b) {
  if (a === null) return b; if (b === null) return a;
  var f = new Fn(function (args) { var res; f.list.forEach(function (x) { res = x.call(args); }); return res; }, a.n);
  f.list = (a.list || [a]).concat(b.list || [b]); return f;
}
function removeFn(a, b) {
  if (a === null) return null; if (b === null) return a;
  var lst = (a.list || [a]).slice(), rm = b.list || [b];
  rm.forEach(function (r) { var i = lst.lastIndexOf(r); if (i >= 0) lst.splice(i, 1); });
  if (!lst.length) return null; if (lst.length === 1) return lst[0];
  var f = new Fn(function (args) { var res; f.list.forEach(function (x) { res = x.call(args); }); return res; }, a.n); f.list = lst; return f;
}
function cmpOp(op, a, b) {
  if (a instanceof Obj || b instanceof Obj) {
    var u = userOp('operator ' + op, [a, b]); if (u) return u.v;
    numErr(op, a, b);
  }
  if (a === null || b === null) return false;
  var ra = numRank(a), rb = numRank(b);
  if (ra < 0 || rb < 0) {
    if (a instanceof EnumVal && b instanceof EnumVal) { var ec = a.v - b.v; return cmpRes(op, ec); }
    numErr(op, a, b);
  }
  var c = numCmp(a, b);
  if (c !== c) return false;
  return cmpRes(op, c);
}
function cmpRes(op, c) { switch (op) { case '<': return c < 0; case '>': return c > 0; case '<=': return c <= 0; default: return c >= 0; } }
function eqOp(a, b) {
  if (a === b) { if (a instanceof D) return a.v === a.v; return true; }
  if (a === null || b === null) { if (a === null && b === null) return true; var o = a === null ? b : a; if (o instanceof Obj) { var u0 = userOp('operator ==', [a, b]); if (u0) return u0.v; } return false; }
  var ta = typeof a;
  if (ta === 'string' || ta === 'boolean') return false; // разные значения
  if (ta === 'number' || ta === 'bigint' || a instanceof D || a instanceof Dec || a instanceof Ch) {
    if (numRank(b) < 0) return false;
    if ((a instanceof Ch) !== (b instanceof Ch)) { if (a instanceof Ch || b instanceof Ch) { /* char == int допустимо */ } }
    return numCmp(a, b) === 0;
  }
  if (a instanceof EnumVal) return b instanceof EnumVal && a.def === b.def && a.v === b.v;
  if (a instanceof Obj || b instanceof Obj) {
    var u = userOp('operator ==', [a, b]); if (u) return u.v;
    if (a instanceof Obj && b instanceof Obj && a.c === b.c && (a.c.isRecord)) return valEq(a, b);
    return false;
  }
  if (a instanceof Tup) return valEq(a, b);
  return false;
}
function unop(op, v) {
  if (v instanceof Obj) { var u = userOp('operator ' + op, [v]); if (u) return u.v; numErr(op, v, v); }
  switch (op) {
    case '-':
      if (typeof v === 'number') { if (v === -2147483648) return ovf32(2147483648); return -v; }
      if (typeof v === 'bigint') return wrap64(-v);
      if (v instanceof D) return new D(-v.v, v.f);
      if (v instanceof Dec) return new Dec(-v.m, v.s);
      if (v instanceof Ch) return -v.c;
      break;
    case '+': if (numRank(v) >= 0) return v instanceof Ch ? v.c : v; break;
    case '~': if (typeof v === 'number') return ~v; if (typeof v === 'bigint') return ~v; if (v instanceof EnumVal) return enumOf(v.def, ~v.v); if (v instanceof Ch) return ~v.c; break;
    case '!': if (typeof v === 'boolean') return !v; break;
  }
  throw new CsError('CS0023', 'Оператор «' + op + '» нельзя применить к операнду типа «' + opType(v) + '»', 0, 0);
}

/* ---- приведения ---- */
function toIntTrunc(n) { return n < 0 ? Math.ceil(n) : Math.floor(n); }
function convInt(v, bits, signed) {
  var n;
  if (typeof v === 'number') n = v; else if (typeof v === 'bigint') n = Number(BigInt.asIntN(32, v)); else if (v instanceof D) { n = v.v; if (n !== n) return CHK ? ovf() : -2147483648; n = toIntTrunc(n); if (n > 2147483647 || n < -2147483648) { if (CHK) ovf(); return -2147483648; } }
  else if (v instanceof Dec) n = toIntTrunc(decToNum(v)); else if (v instanceof Ch) n = v.c; else if (v instanceof EnumVal) n = v.v; else return invalidCast(v, 'Int32');
  if (typeof v === 'bigint' && CHK && (v > 2147483647n || v < -2147483648n)) ovf();
  return n | 0;
}
function invalidCast(v, to) { throwNew('InvalidCastException', "Unable to cast object of type '" + typeDisplay(v) + "' to type '" + (SYS_FULL[to] || to) + "'."); }
function castTo(t, v, strict) {
  var n = t.n, nul = t.nullable;
  if (v === null) {
    if (nul || !(INTLIKE[n] || LONGLIKE[n] || n === 'double' || n === 'bool' || n === 'char' || n === 'decimal' || n === 'float')) return null;
    throwNew('NullReferenceException', 'Object reference not set to an instance of an object.');
  }
  if (t.arr) { if (!(v instanceof Arr)) invalidCast(v, csTypeName(t)); return v; }
  if (strict) { // распаковка object → T
    var tt = mkTypeTest1(t);
    if ((INTLIKE[n] || LONGLIKE[n] || n === 'double' || n === 'float' || n === 'decimal' || n === 'bool' || n === 'char') && !tt(v)) invalidCast(v, capType(n));
  }
  switch (n) {
    case 'int': case 'Int32': return convInt(v);
    case 'uint': return convInt(v) >>> 0;
    case 'short': case 'Int16': return convInt(v) << 16 >> 16;
    case 'ushort': return convInt(v) & 0xFFFF;
    case 'byte': case 'Byte': { var bn = convInt(v); if (CHK && (bn < 0 || bn > 255)) ovf(); return bn & 255; }
    case 'sbyte': return convInt(v) << 24 >> 24;
    case 'long': case 'Int64': case 'ulong':
      if (typeof v === 'bigint') return v;
      if (typeof v === 'number') return BigInt(v);
      if (v instanceof D) { if (v.v !== v.v || Math.abs(v.v) >= 9.3e18) return -9223372036854775808n; return BigInt(toIntTrunc(v.v)); }
      if (v instanceof Dec) return v.m / pow10(v.s);
      if (v instanceof Ch) return BigInt(v.c); if (v instanceof EnumVal) return BigInt(v.v);
      return invalidCast(v, 'Int64');
    case 'double': case 'Double': if (v instanceof D) return v.f ? new D(v.v, 0) : v; if (v instanceof Dec) return new D(decToNum(v), 0); if (numRank(v) >= 0) return new D(toNum(v), 0); return invalidCast(v, 'Double');
    case 'float': case 'Single': if (numRank(v) >= 0) return new D(Math.fround(toNum(v)), 1); return invalidCast(v, 'Single');
    case 'decimal': case 'Decimal': if (v instanceof Dec) return v; if (typeof v === 'bigint') return new Dec(v, 0); if (typeof v === 'number') return new Dec(BigInt(v), 0); if (v instanceof D) return decFromNum(v.v); if (v instanceof Ch) return new Dec(BigInt(v.c), 0); return invalidCast(v, 'Decimal');
    case 'char': case 'Char': if (v instanceof Ch) return v; if (typeof v === 'number') return mkChar(v & 0xFFFF); if (typeof v === 'bigint') return mkChar(Number(v) & 0xFFFF); if (v instanceof D) return mkChar(toIntTrunc(v.v) & 0xFFFF); return invalidCast(v, 'Char');
    case 'bool': case 'Boolean': if (typeof v === 'boolean') return v; return invalidCast(v, 'Boolean');
    case 'string': case 'String': if (typeof v === 'string') return v; return invalidCast(v, 'String');
    case 'object': case 'Object': case 'var': case 'dynamic': return v;
  }
  var def = USER[n];
  if (def && def.isEnum) { if (v instanceof EnumVal) return v; return enumOf(def, convInt(v)); }
  if (v instanceof Obj && def) {
    if (isSubclass(v.c, def)) return v;
    // пользовательские операторы приведения
    var cv = userConv(v, def); if (cv) return cv.v;
    invalidCast(v, def.name);
  }
  if (def && !(v instanceof Obj)) {
    if (def.kind === 'delegate' && v instanceof Fn) return v;
    var cv2 = userConvFrom(v, def); if (cv2) return cv2.v;
    invalidCast(v, def.name);
  }
  if (v instanceof Obj && !def) {
    var chk = mkTypeTest1(t);
    if (EXC[n]) { if (!isSubclass(v.c, EXC[n])) invalidCast(v, n); return v; }
    var cv3 = userConvTo(v, n); if (cv3) return cv3.v;
    if (!chk(v) && !isIfaceLike(n)) invalidCast(v, n);
    return v;
  }
  return v;
}
function isIfaceLike(n) { return /^I[A-Z]/.test(n); }
function userConv(v, def) { // v: Obj, цель def: ищем operator в v.c или def
  var res = null;
  [v.c, def].forEach(function (c) { if (res || !c.mmap) { if (!c.mmap) finalizeClass(c); } if (res) return; ['implicit operator', 'explicit operator'].forEach(function (nm) { var l = c.mmap[nm]; if (l && !res) l.forEach(function (m) { if (!res && m.ret && m.ret.n === def.name && m.ps.length === 1 && matchScore(v, m.ps[0].t) > 0) res = { v: invoke(m, null, [v]) }; }); }); });
  return res;
}
function userConvFrom(v, def) {
  if (!def.mmap) finalizeClass(def);
  var res = null;
  ['implicit operator', 'explicit operator'].forEach(function (nm) { var l = def.mmap[nm]; if (l && !res) l.forEach(function (m) { if (!res && m.ps.length === 1 && matchScore(v, m.ps[0].t) > 0 && m.ret.n === def.name) res = { v: invoke(m, null, [v]) }; }); });
  return res;
}
function userConvTo(v, tname) {
  var c = v.c; if (!c.mmap) finalizeClass(c);
  var res = null;
  ['implicit operator', 'explicit operator'].forEach(function (nm) { var l = c.mmap[nm]; if (l && !res) l.forEach(function (m) { if (!res && m.ret && m.ret.n === tname) res = { v: invoke(m, null, [v]) }; }); });
  return res;
}
// неявное преобразование при присваивании (в объявление/поле/параметр/возврат)
function mkCoerce(t) {
  if (!t) return null;
  var n = t.n;
  if (t.arr || t.tuple) return null;
  if (n === 'double' || n === 'Double') return function (v) {
    if (v instanceof D) return v.f ? new D(v.v, 0) : v;
    if (typeof v === 'number') return new D(v, 0);
    if (typeof v === 'bigint') return new D(Number(v), 0);
    if (v instanceof Ch) return new D(v.c, 0);
    if (v instanceof Dec) throw new CsError('CS0266', 'Не удаётся неявно преобразовать тип «decimal» в «double». Существует явное преобразование', 0, 0);
    return v;
  };
  if (n === 'float' || n === 'Single') return function (v) {
    if (v instanceof D) return v.f ? v : new D(Math.fround(v.v), 1);
    if (typeof v === 'number') return new D(Math.fround(v), 1);
    if (typeof v === 'bigint') return new D(Math.fround(Number(v)), 1);
    if (v instanceof Ch) return new D(v.c, 1);
    return v;
  };
  if (n === 'decimal' || n === 'Decimal') return function (v) {
    if (v instanceof Dec) return v;
    if (typeof v === 'number') return new Dec(BigInt(v), 0);
    if (typeof v === 'bigint') return new Dec(v, 0);
    if (v instanceof Ch) return new Dec(BigInt(v.c), 0);
    if (v instanceof D) throw new CsError('CS0266', 'Не удаётся неявно преобразовать тип «' + (v.f ? 'float' : 'double') + '» в «decimal». Существует явное преобразование', 0, 0);
    return v;
  };
  if (LONGLIKE[n]) return function (v) {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number') return BigInt(v);
    if (v instanceof Ch) return BigInt(v.c);
    if (v instanceof D || v instanceof Dec) throw new CsError('CS0266', 'Не удаётся неявно преобразовать тип «' + opType(v) + '» в «long». Существует явное преобразование', 0, 0);
    return v;
  };
  if (INTLIKE[n]) return function (v) {
    if (typeof v === 'number') return v;
    if (v instanceof Ch) return v.c;
    if (v === null) return v;
    if (typeof v === 'bigint' || v instanceof D || v instanceof Dec) throw new CsError('CS0266', 'Не удаётся неявно преобразовать тип «' + opType(v) + '» в «' + n + '». Существует явное преобразование (возможно, пропущено приведение типа)', 0, 0);
    return v;
  };
  var def = USER[n];
  if (def && def.isStruct) return function (v) { return cp(v); };
  return null;
}
function mkStore(t) { // coerce + копирование структур
  var co = mkCoerce(t);
  if (co) return co;
  return null;
}
