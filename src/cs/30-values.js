/* ---------- значения ---------- */
function D(v, f) { this.v = v; this.f = f ? 1 : 0; }           // double / float
function Dec(m, s) { this.m = m; this.s = s; }                 // decimal = m * 10^-s
function Ch(c) { this.c = c; }                                 // char
function Arr(a, et) { this.a = a; this.et = et || null; this.ver = 0; }
function Obj(c) { this.c = c; this.f = Object.create(null); this.id = ++OBJID; }
var OBJID = 0;
function Box(v, t) { this.v = v; this.t = t || null; this.co = null; }
function EnumVal(def, v) { this.def = def; this.v = v; }
function Fn(call, n, name) { this.call = call; this.n = n === undefined ? -1 : n; this.name = name || ''; this.list = null; }
function TypeInfo(name, full, def) { this.Name = name; this.FullName = full; this.def = def || null; }
function Tup(items, names) { this.items = items; this.names = names || null; }
function Anon(names, vals) { this.names = names; this.vals = vals; }
Tup.prototype.toString = function () { return '(' + this.items.map(str).join(', ') + ')'; };

var CHAR_CACHE = [];
function mkChar(c) { return c < 256 ? (CHAR_CACHE[c] || (CHAR_CACHE[c] = new Ch(c))) : new Ch(c); }
var ZERO_D = new D(0);
function dbl(v) { return new D(v, 0); }
function flt(v) { return new D(Math.fround(v), 1); }

/* исключения: CsThrow несёт объект-исключение C# */
function CsThrow(obj) { this.obj = obj; }
function Fatal(msg) { this.msg = msg; }
var EXC = {}; // имя → ClassDef (заполняется в библиотеке)
var CUR_STACK = [];
function throwNew(name, msg, inner) {
  var def = EXC[name];
  var o = new Obj(def);
  o.f.Message = msg === undefined ? def.defMsg : msg;
  o.f.InnerException = inner || null;
  o.f.$trace = CUR_STACK.slice(-8).reverse();
  throw new CsThrow(o);
}
function npe() { throwNew('NullReferenceException', 'Object reference not set to an instance of an object.'); }

/* ---------- числа: классификация ---------- */
// ранги: 0 int, 1 long, 2 float, 3 double, 4 decimal
function numRank(v) {
  if (typeof v === 'number') return 0;
  if (typeof v === 'bigint') return 1;
  if (v instanceof D) return v.f ? 2 : 3;
  if (v instanceof Dec) return 4;
  if (v instanceof Ch) return 0;
  if (v instanceof EnumVal) return 0;
  return -1;
}
function toNum(v) { // как JS number
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof D) return v.v;
  if (v instanceof Dec) return decToNum(v);
  if (v instanceof Ch) return v.c;
  if (v instanceof EnumVal) return v.v;
  return NaN;
}
function toInt32(n) { return n | 0; }
function wrap64(b) { return BigInt.asIntN(64, b); }

/* decimal */
var POW10 = [1n]; for (var pi = 1; pi < 40; pi++) POW10.push(POW10[pi - 1] * 10n);
function pow10(n) { return n < POW10.length ? POW10[n] : 10n ** BigInt(n); }
function decFromStr(s) {
  s = String(s).trim(); var neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
  var em = /e([+-]?\d+)$/i.exec(s), ex = 0; if (em) { ex = parseInt(em[1], 10); s = s.slice(0, em.index); }
  var dot = s.indexOf('.'), scale = 0, digits = s;
  if (dot >= 0) { scale = s.length - dot - 1; digits = s.slice(0, dot) + s.slice(dot + 1); }
  if (!/^\d+$/.test(digits)) throwNew('FormatException', 'Input string was not in a correct format.');
  var m = BigInt(digits); scale -= ex; if (scale < 0) { m *= pow10(-scale); scale = 0; }
  return normDec(new Dec(neg ? -m : m, scale));
}
function normDec(d) { // ограничим масштаб 28
  if (d.s > 28) { var drop = d.s - 28; d = new Dec(roundDiv(d.m, pow10(drop)), 28); }
  return d;
}
function roundDiv(a, b) { // округление «до ближайшего чётного» не нужно: decimal округляет от нуля при делении усечением; используем банковское для Round отдельно
  var q = a / b, r = a % b; if (r < 0n) r = -r; if (r * 2n >= (b < 0n ? -b : b)) q += (a < 0n) === (b < 0n) ? 1n : -1n; return q;
}
function decToNum(d) { return Number(d.m) / Math.pow(10, d.s); }
function decFromNum(n) {
  if (!isFinite(n)) throwNew('OverflowException', 'Value was either too large or too small for a Decimal.');
  var s = String(n); if (/e/i.test(s)) s = n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
  else { var p = parseFloat(n.toPrecision(15)); s = String(p); if (/e/i.test(s)) s = p.toFixed(20).replace(/0+$/, '').replace(/\.$/, ''); }
  return decFromStr(s);
}
function decStr(d) {
  var neg = d.m < 0n, a = (neg ? -d.m : d.m).toString();
  if (d.s > 0) { while (a.length <= d.s) a = '0' + a; a = a.slice(0, a.length - d.s) + '.' + a.slice(a.length - d.s); }
  return (neg ? '-' : '') + a;
}
function decAlign(a, b) { var s = Math.max(a.s, b.s); return [a.m * pow10(s - a.s), b.m * pow10(s - b.s), s]; }
function decArith(op, a, b) {
  var r;
  switch (op) {
    case '+': r = decAlign(a, b); return normDec(new Dec(r[0] + r[1], r[2]));
    case '-': r = decAlign(a, b); return normDec(new Dec(r[0] - r[1], r[2]));
    case '*': return normDec(new Dec(a.m * b.m, a.s + b.s));
    case '/': {
      if (b.m === 0n) throwNew('DivideByZeroException', 'Attempted to divide by zero.');
      // 28 значащих знаков
      var scale = 28 + b.s - a.s; if (scale < 0) scale = 0;
      var num = a.m * pow10(scale + 0), q = num / b.m;
      var res = new Dec(q, a.s + scale - b.s);
      // убрать лишние нули справа до масштаба 28 -> .NET сохраняет минимально необходимый масштаб
      while (res.s > 0 && res.m % 10n === 0n) { res = new Dec(res.m / 10n, res.s - 1); }
      return res;
    }
    case '%': { if (b.m === 0n) throwNew('DivideByZeroException', 'Attempted to divide by zero.'); r = decAlign(a, b); return new Dec(r[0] % r[1], r[2]); }
  }
}
function decCmp(a, b) { var r = decAlign(a, b); return r[0] < r[1] ? -1 : r[0] > r[1] ? 1 : 0; }
function decRound(d, digits, mode) { // mode 0 — банковское, 1 — от нуля
  if (d.s <= digits) return d;
  var drop = d.s - digits, p = pow10(drop), q = d.m / p, r = d.m % p, ar = r < 0n ? -r : r, half = p / 2n;
  var up;
  if (ar > half) up = true; else if (ar < half) up = false; else up = mode === 1 ? true : ((q < 0n ? -q : q) % 2n === 1n);
  if (up) q += d.m < 0n ? -1n : 1n;
  return new Dec(q, digits);
}

/* ---------- форматирование чисел ---------- */
function sciParts(v) { // v — конечное положительное; возвращает {digits, exp} для кратчайшего round-trip (double)
  var s = v.toExponential(), m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  return { digits: m[1] + (m[2] || ''), exp: parseInt(m[3], 10) };
}
function fmtDoubleParts(parts, neg) {
  var digits = parts.digits, exp = parts.exp, out;
  if (exp >= 15 || exp < -5) {
    out = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'E' + (exp < 0 ? '-' : '+') + (Math.abs(exp) < 10 ? '0' : '') + Math.abs(exp);
  } else if (exp >= 0) {
    if (digits.length <= exp + 1) out = digits + new Array(exp + 2 - digits.length).join('0');
    else out = digits.slice(0, exp + 1) + '.' + digits.slice(exp + 1);
  } else out = '0.' + new Array(-exp).join('0') + digits;
  return (neg ? '-' : '') + out;
}
function fmtDouble(d) {
  var v = d.v;
  if (v !== v) return 'NaN';
  if (v === Infinity) return 'Infinity'; if (v === -Infinity) return '-Infinity';
  if (v === 0) return (1 / v < 0) ? '-0' : '0';
  var neg = v < 0; if (neg) v = -v;
  if (d.f) { // float: кратчайшее представление, которое возвращается через fround
    for (var p = 1; p <= 9; p++) { var t = parseFloat(v.toPrecision(p)); if (Math.fround(t) === v) { return fmtDoubleParts(sciParts(t), neg); } }
  }
  return fmtDoubleParts(sciParts(v), neg);
}
function groupDigits(s, sep) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, sep); }
function toFixedExact(v, n) { // как в .NET Core 3.0+ (точное десятичное разложение), toFixed ведёт себя так же; для больших n дополняем
  if (Math.abs(v) >= 1e21) { return BigInt(Math.round(v)).toString() + (n > 0 ? '.' + new Array(n + 1).join('0') : ''); }
  if (n > 100) n = 100;
  var s = Math.abs(v).toFixed(n);
  return (v < 0 && /[1-9]/.test(s) ? '-' : (v < 0 && Object.is(v, -0) ? '' : (v < 0 ? '-' : ''))) + s;
}
function fmtNumber(v, spec) {
  // v: number|bigint|D|Dec ; spec строка
  var rank = numRank(v);
  var m = /^([A-Za-z])(\d{0,3})$/.exec(spec);
  if (m && !/^[0#]/.test(spec)) {
    var c = m[1], hasN = m[2] !== '', n = hasN ? parseInt(m[2], 10) : -1, up = c === c.toUpperCase();
    var neg, absStr, num = (rank === 4) ? decToNum(v) : toNum(v);
    if (rank === 4 && 'FfNnCcPp'.indexOf(c) >= 0) { // точные операции для decimal
      var dd = v; if (c === 'P' || c === 'p') dd = new Dec(v.m * 100n, v.s);
      var dg = hasN ? n : 2; var rd = decRound(dd, dg, 1); var sx = decStr(new Dec(rd.m < 0n ? -rd.m : rd.m, rd.s));
      if (rd.s < dg) { sx = sx + (rd.s === 0 ? '.' : '') + new Array(dg - rd.s + 1).join('0'); }
      if (dg === 0) sx = sx.replace(/\.$/, '');
      neg = rd.m < 0n;
      var ip = sx.split('.'); 
      if (c === 'N' || c === 'n' || c === 'C' || c === 'c') ip[0] = groupDigits(ip[0], ',');
      sx = ip.join('.');
      if (c === 'C' || c === 'c') return (neg ? '-' : '') + '$' + sx;
      if (c === 'P' || c === 'p') return (neg ? '-' : '') + sx + '%';
      return (neg ? '-' : '') + sx;
    }
    switch (c.toLowerCase()) {
      case 'f': case 'n': case 'c': case 'p': {
        var dg2 = hasN ? n : 2, x = num; if (c === 'P' || c === 'p') x = x * 100;
        if (!isFinite(x)) return x !== x ? 'NaN' : (x > 0 ? 'Infinity' : '-Infinity');
        var s2 = toFixedExact(x, dg2), ng = s2[0] === '-'; if (ng) s2 = s2.slice(1);
        var parts = s2.split('.');
        if (c === 'N' || c === 'n' || c === 'C' || c === 'c') parts[0] = groupDigits(parts[0], ',');
        s2 = parts.join('.');
        if (c === 'C' || c === 'c') return (ng ? '-' : '') + '$' + s2;
        if (c === 'P' || c === 'p') return (ng ? '-' : '') + s2 + '%';
        return (ng ? '-' : '') + s2;
      }
      case 'd': { if (rank > 1 && rank !== -1) throwNew('FormatException', 'Format specifier was invalid.'); var iv = typeof v === 'bigint' ? v : BigInt(toNum(v)); var ng3 = iv < 0n; var ds = (ng3 ? -iv : iv).toString(); while (ds.length < n) ds = '0' + ds; return (ng3 ? '-' : '') + ds; }
      case 'x': { var xv = typeof v === 'bigint' ? BigInt.asUintN(64, v) : BigInt.asUintN(32, BigInt(toNum(v))); var xs = xv.toString(16); xs = up ? xs.toUpperCase() : xs; while (xs.length < n) xs = '0' + xs; return xs; }
      case 'b': { var bv = typeof v === 'bigint' ? BigInt.asUintN(64, v) : BigInt.asUintN(32, BigInt(toNum(v))); var bs = bv.toString(2); while (bs.length < n) bs = '0' + bs; return bs; }
      case 'e': { var e1 = num.toExponential(hasN ? n : 6); return e1.replace(/e([+-])(\d)$/, 'e$10$2').replace(/e([+-])(\d\d)$/, 'e$10$2').replace('e', up ? 'E' : 'e'); }
      case 'g': {
        if (!hasN || n === 0) return rank === 4 ? decStr(v) : (rank <= 1 ? String(v) : fmtDouble(typeof v === 'number' ? dbl(v) : v));
        var gs = Number(num.toPrecision(n)); return String(gs).replace('e', 'E');
      }
      case 'r': return rank <= 1 ? String(v) : fmtDouble(v);
    }
    throwNew('FormatException', 'Format specifier was invalid.');
  }
  return fmtCustom(rank === 4 ? decToNum(v) : toNum(v), spec, rank === 4 ? v : null);
}
function roundHalfUpStr(x, n) { // как кастомные форматы .NET: 15 значащих цифр, затем округление «от нуля»
  if (x === 0) return n ? '0.' + new Array(n + 1).join('0') : '0';
  var e = x.toExponential(14), m = /^(\d)\.(\d+)e([+-]\d+)$/.exec(e), digits = m[1] + m[2], exp = parseInt(m[3], 10), pp = exp + 1, ip, fr;
  if (pp <= 0) { ip = '0'; fr = new Array(-pp + 1).join('0') + digits; } else if (pp >= digits.length) { ip = digits + new Array(pp - digits.length + 1).join('0'); fr = ''; } else { ip = digits.slice(0, pp); fr = digits.slice(pp); }
  if (fr.length <= n) { fr = fr + new Array(n - fr.length + 1).join('0'); return n ? ip + '.' + fr : ip; }
  var up = fr.charCodeAt(n) >= 53; fr = fr.slice(0, n);
  var all = ip + fr;
  if (up) { var arr = all.split(''), i = arr.length - 1; while (i >= 0) { if (arr[i] === '9') { arr[i] = '0'; i--; } else { arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1); break; } } if (i < 0) arr.unshift('1'); all = arr.join(''); }
  var k = all.length - n; return n ? all.slice(0, k) + '.' + all.slice(k) : all;
}
function fmtCustom(x, spec, dec) {
  // секции через ;
  var secs = []; var cur = '', inq = null;
  for (var i = 0; i < spec.length; i++) { var ch = spec[i]; if (inq) { cur += ch; if (ch === inq) inq = null; } else if (ch === '\'' || ch === '"') { inq = ch; cur += ch; } else if (ch === ';') { secs.push(cur); cur = ''; } else cur += ch; }
  secs.push(cur);
  var sec = secs[0];
  if (x < 0 && secs.length > 1) { sec = secs[1]; x = -x; } else if (x === 0 && secs.length > 2) sec = secs[2];
  var neg = x < 0 || Object.is(x, -0) && false; if (neg) x = -x;
  // разбор шаблона
  var pct = 0, tokens = [], q = null;
  for (var j = 0; j < sec.length; j++) {
    var c = sec[j];
    if (q) { if (c === q) q = null; else tokens.push({ lit: c }); continue; }
    if (c === '\'' || c === '"') { q = c; continue; }
    if (c === '\\') { j++; tokens.push({ lit: sec[j] || '' }); continue; }
    if (c === '%') { pct++; tokens.push({ lit: '%' }); continue; }
    tokens.push({ c: c });
  }
  x = x * Math.pow(100, pct > 0 ? 1 : 0) * (pct > 1 ? Math.pow(100, pct - 1) : 1);
  if (pct > 0) { x = x; }
  var dotIdx = -1; tokens.forEach(function (t, i) { if (t.c === '.' && dotIdx < 0) dotIdx = i; });
  var intT = dotIdx < 0 ? tokens : tokens.slice(0, dotIdx), fracT = dotIdx < 0 ? [] : tokens.slice(dotIdx + 1);
  var fracDigits = fracT.filter(function (t) { return t.c === '0' || t.c === '#'; }).length;
  var minFrac = fracT.filter(function (t) { return t.c === '0'; }).length;
  var group = intT.some(function (t) { return t.c === ','; });
  var s = (!dec && isFinite(x)) ? roundHalfUpStr(x, fracDigits) : toFixedExact(x, fracDigits); if (s[0] === '-') s = s.slice(1);
  var ip = s.split('.')[0], fp = (s.split('.')[1] || '');
  while (fp.length > minFrac && fp[fp.length - 1] === '0') fp = fp.slice(0, -1);
  var intPh = intT.filter(function (t) { return t.c === '0' || t.c === '#'; }).length;
  var minInt = intT.filter(function (t) { return t.c === '0'; }).length;
  if (ip === '0' && minInt === 0) ip = '';
  while (ip.length < minInt) ip = '0' + ip;
  if (group) ip = groupDigits(ip, ',');
  // собрать: placeholder-ы целой части заменяем цифрами
  var out = '', placed = false;
  var digitsLeft = ip.replace(/,/g, '');
  var out2 = '';
  var phSeen = 0;
  intT.forEach(function (t) {
    if (t.lit !== undefined) { out2 += t.lit; return; }
    if (t.c === '0' || t.c === '#') {
      if (!placed) { out2 += ip; placed = true; }
      return;
    }
    if (t.c === ',') return;
    out2 += t.c;
  });
  if (!placed && (fracT.length === 0 || true) && intPh === 0) { }
  var fout = '';
  if (fracDigits > 0 && fp.length) fout = '.' + fp; else if (fracT.length && fracT.some(function (t) { return t.lit !== undefined; })) { }
  var tail = ''; fracT.forEach(function (t) { if (t.lit !== undefined) tail += t.lit; else if (t.c !== '0' && t.c !== '#') tail += t.c; });
  var res = out2 + fout + tail;
  return (neg ? '-' : '') + res;
}

/* ---------- строковое представление ---------- */
function typeNameOf(v) {
  if (v === null) return 'null';
  if (typeof v === 'number') return 'Int32';
  if (typeof v === 'bigint') return 'Int64';
  if (typeof v === 'string') return 'String';
  if (typeof v === 'boolean') return 'Boolean';
  if (v instanceof D) return v.f ? 'Single' : 'Double';
  if (v instanceof Dec) return 'Decimal';
  if (v instanceof Ch) return 'Char';
  if (v instanceof Obj) return v.c.name;
  if (v instanceof EnumVal) return v.def.name;
  if (v instanceof Arr) return typeNameOf(v.a.length ? v.a[0] : 0) + '[]';
  if (v instanceof Tup) return 'ValueTuple';
  if (v instanceof Fn) return 'Func';
  if (v && v.tn) return v.tn;
  return 'Object';
}
var SYS_FULL = { Int32: 'System.Int32', Int64: 'System.Int64', String: 'System.String', Boolean: 'System.Boolean', Double: 'System.Double', Single: 'System.Single', Decimal: 'System.Decimal', Char: 'System.Char', Object: 'System.Object' };
function fullTypeName(v) {
  var n = typeNameOf(v);
  if (v instanceof Obj) return v.c.full || v.c.name;
  return SYS_FULL[n] || (v && v.fullName) || ('System.' + n);
}
function str(v) {
  if (v === null || v === undefined) return '';
  switch (typeof v) {
    case 'string': return v;
    case 'number': return String(v);
    case 'bigint': return v.toString();
    case 'boolean': return v ? 'True' : 'False';
  }
  if (v instanceof D) return fmtDouble(v);
  if (v instanceof Ch) return String.fromCharCode(v.c);
  if (v instanceof Dec) return decStr(v);
  if (v instanceof Obj) return objToString(v);
  if (v instanceof EnumVal) return enumName(v);
  if (v instanceof Tup) return v.toString();
  if (v instanceof Anon) return '{ ' + v.names.map(function (n, i) { return n + ' = ' + str(v.vals[i]); }).join(', ') + ' }';
  if (v instanceof Arr) return (v.et ? (SYS_FULL[capType(v.et)] || v.et) : 'System.Object') + '[]';
  if (v instanceof Fn) return 'System.Func';
  if (v instanceof TypeInfo) return v.FullName;
  if (v && typeof v.ToString === 'function') return v.ToString();
  if (v && v.fullName) return v.fullName;
  return String(v);
}
function capType(n) { var m = { int: 'Int32', long: 'Int64', string: 'String', double: 'Double', bool: 'Boolean', char: 'Char', float: 'Single', decimal: 'Decimal', object: 'Object', byte: 'Byte', short: 'Int16' }; return m[n] || n; }
function enumName(ev) {
  var def = ev.def, names = [];
  for (var i = 0; i < def.members.length; i++) if (def.members[i].v === ev.v) return def.members[i].name;
  if (def.flags) {
    var rem = ev.v, parts = [];
    def.members.forEach(function (m) { if (m.v !== 0 && (rem & m.v) === m.v) { parts.push(m.name); rem &= ~m.v; } });
    if (parts.length && rem === 0) return parts.join(', ');
  }
  return String(ev.v);
}
function objToString(o) {
  var m = findMethod(o.c, 'ToString', 0);
  if (m) { return str(invoke(m, o, [])); }
  if (o.c.isRecord) return recordToString(o);
  if (o.c.isExc) return excToString(o);
  return o.c.full || o.c.name;
}
function excToString(o) {
  var msg = o.f.Message;
  if (msg === undefined || msg === null) msg = defMsgOf(o.c);
  var mp = findProp(o.c, 'Message'); if (mp) msg = getProp(o, mp);
  var s = (o.c.full || o.c.name) + (msg !== null && msg !== undefined && msg !== '' ? ': ' + msg : '');
  if (o.f.InnerException) s += ' ---> ' + excToString(o.f.InnerException);
  return s;
}
function recordToString(o) {
  var c = o.c, names = [];
  var chain = []; for (var k = c; k; k = k.base) chain.unshift(k);
  chain.forEach(function (k) { (k.recProps || []).forEach(function (n) { names.push(n); }); });
  return c.name + ' { ' + names.map(function (n) { var p = findProp(c, n); return n + ' = ' + str1(p ? getProp(o, p) : o.f[n]); }).join(', ') + ' }';
}
function str1(v) { return v === null ? '' : str(v); }

/* ---------- равенство / сравнение / хэш ---------- */
function valEq(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  var ta = typeof a;
  if (ta === 'number' || ta === 'bigint' || a instanceof D || a instanceof Dec || a instanceof Ch) {
    if (numRank(b) < 0) return false;
    if (a instanceof Ch && !(b instanceof Ch)) return false;
    if (b instanceof Ch && !(a instanceof Ch)) return false;
    return numCmp(a, b) === 0;
  }
  if (ta === 'string' || ta === 'boolean') return false;
  if (a instanceof EnumVal) return b instanceof EnumVal && a.def === b.def && a.v === b.v;
  if (a instanceof Tup) return b instanceof Tup && a.items.length === b.items.length && a.items.every(function (x, i) { return valEq(x, b.items[i]); });
  if (a instanceof Anon) return b instanceof Anon && a.vals.every(function (x, i) { return valEq(x, b.vals[i]); });
  if (a instanceof Obj) {
    var m = findMethod(a.c, 'Equals', 1);
    if (m && m.cls !== OBJ_DEF) return truthy(invoke(m, a, [b]));
    if (a.c.isRecord) return b instanceof Obj && a.c === b.c && fieldsEq(a, b);
    if (a.c.isStruct) return b instanceof Obj && a.c === b.c && fieldsEq(a, b);
    return false;
  }
  if (a && typeof a.Equals === 'function') return a.Equals(b);
  return false;
}
function truthy(v) { return v === true; }
function fieldsEq(a, b) {
  for (var k in a.f) { if (k.charCodeAt(0) === 36) continue; if (!valEq(a.f[k], b.f[k])) return false; }
  return true;
}
function numCmp(a, b) {
  var ra = numRank(a), rb = numRank(b), r = Math.max(ra, rb);
  if (r === 4) { var x = a instanceof Dec ? a : (ra === 1 ? new Dec(a, 0) : new Dec(BigInt(toNum(a)), 0)), y = b instanceof Dec ? b : (rb === 1 ? new Dec(b, 0) : new Dec(BigInt(toNum(b)), 0)); return decCmp(x, y); }
  if (r === 1 && ra <= 1 && rb <= 1) { var p = BigInt(a instanceof Ch ? a.c : a), q = BigInt(b instanceof Ch ? b.c : b); return p < q ? -1 : p > q ? 1 : 0; }
  var u = toNum(a), w = toNum(b);
  return u < w ? -1 : u > w ? 1 : u === w ? 0 : NaN;
}
function strCmp(a, b) { // культурно-зависимое сравнение (как en-US ICU)
  if (a === b) return 0;
  var r = a.localeCompare(b, 'en');
  return r < 0 ? -1 : r > 0 ? 1 : 0;
}
function ordCmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function cmpVals(a, b) {
  if (a === null || a === undefined) return (b === null || b === undefined) ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'string') { if (typeof b !== 'string') throwNew('ArgumentException', 'Object must be of type String.'); return strCmp(a, b); }
  if (typeof a === 'boolean') return a === b ? 0 : (a ? 1 : -1);
  if (numRank(a) >= 0) { var c = numCmp(a, b); return c; }
  if (a instanceof Obj) {
    var m = findMethod(a.c, 'CompareTo', 1);
    if (m) return toNum(invoke(m, a, [b]));
    throwNew('InvalidOperationException', 'Failed to compare two elements in the array.', mkExc('ArgumentException', "At least one object must implement IComparable."));
  }
  if (a instanceof Tup) { for (var i = 0; i < a.items.length; i++) { var cc = cmpVals(a.items[i], b.items[i]); if (cc) return cc; } return 0; }
  if (a && typeof a.CompareTo === 'function') return a.CompareTo(b);
  throwNew('InvalidOperationException', 'Failed to compare two elements in the array.');
}
function mkExc(name, msg) { var o = new Obj(EXC[name]); o.f.Message = msg; o.f.InnerException = null; return o; }
var STR_HASH = Object.create(null);
function hashStr(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0; return h; }
function hashOf(v) {
  if (v === null || v === undefined) return 0;
  switch (typeof v) {
    case 'number': return v | 0;
    case 'bigint': return Number(BigInt.asIntN(32, v ^ (v >> 32n)));
    case 'string': return hashStr(v);
    case 'boolean': return v ? 1 : 0;
  }
  if (v instanceof D) return hashStr(String(v.v));
  if (v instanceof Dec) return hashStr(decStr(v));
  if (v instanceof Ch) return v.c;
  if (v instanceof EnumVal) return v.v;
  if (v instanceof Tup) { var h = 17; v.items.forEach(function (x) { h = (Math.imul(h, 31) + hashOf(x)) | 0; }); return h; }
  if (v instanceof Anon) { var ha = 17; v.vals.forEach(function (x) { ha = (Math.imul(ha, 31) + hashOf(x)) | 0; }); return ha; }
  if (v instanceof Obj) {
    var m = findMethod(v.c, 'GetHashCode', 0);
    if (m && m.cls !== OBJ_DEF) return toNum(invoke(m, v, []));
    if (v.c.isRecord || v.c.isStruct) { var hh = 17; for (var k in v.f) { if (k.charCodeAt(0) !== 36) hh = (Math.imul(hh, 31) + hashOf(v.f[k])) | 0; } return hh; }
    return (v.id * 2654435761) | 0;
  }
  if (!v.$id) v.$id = ++OBJID;
  return (v.$id * 2654435761) | 0;
}
