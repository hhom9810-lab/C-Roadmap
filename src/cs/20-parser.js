/* ---------- парсер ---------- */
var MODS = { public: 1, private: 1, protected: 1, internal: 1, static: 1, readonly: 1, abstract: 1, virtual: 1, override: 1, sealed: 1, partial: 1, async: 1, extern: 1, new: 1, const: 1, unsafe: 1, volatile: 1, required: 1, file: 1 };
var PREDEF = { int: 1, long: 1, short: 1, byte: 1, sbyte: 1, uint: 1, ulong: 1, ushort: 1, double: 1, float: 1, decimal: 1, bool: 1, char: 1, string: 1, object: 1, void: 1, nint: 1, nuint: 1 };
var RESERVED = { abstract: 1, as: 1, base: 1, bool: 1, break: 1, byte: 1, case: 1, catch: 1, char: 1, checked: 1, class: 1, const: 1, continue: 1, decimal: 1, default: 1, delegate: 1, do: 1, double: 1, else: 1, enum: 1, event: 1, explicit: 1, extern: 1, false: 1, finally: 1, fixed: 1, float: 1, for: 1, foreach: 1, goto: 1, if: 1, implicit: 1, in: 1, int: 1, interface: 1, internal: 1, is: 1, lock: 1, long: 1, namespace: 1, new: 1, null: 1, object: 1, operator: 1, out: 1, override: 1, params: 1, private: 1, protected: 1, public: 1, readonly: 1, ref: 1, return: 1, sbyte: 1, sealed: 1, short: 1, sizeof: 1, stackalloc: 1, static: 1, string: 1, struct: 1, switch: 1, this: 1, throw: 1, true: 1, try: 1, typeof: 1, uint: 1, ulong: 1, unchecked: 1, unsafe: 1, ushort: 1, using: 1, virtual: 1, void: 1, volatile: 1, while: 1 };
var BINPREC = { '??': 1, '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6, '==': 7, '!=': 7, '<': 8, '>': 8, '<=': 8, '>=': 8, 'is': 8, 'as': 8, '<<': 9, '>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11 };
var ASSIGNOPS = { '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '&=': 1, '|=': 1, '^=': 1, '<<=': 1, '??=': 1 };

function Parser(toks, srcName) { this.t = toks; this.p = 0; }
var P = Parser.prototype;
P.cur = function () { return this.t[this.p]; };
P.peek = function (k) { return this.t[Math.min(this.p + (k || 0), this.t.length - 1)]; };
P.is = function (v, k) { var t = this.peek(k); return (t.t === 'op' || t.t === 'id') && t.v === v && !t.verbatim; };
P.isOp = function (v, k) { var t = this.peek(k); return t.t === 'op' && t.v === v; };
P.isId = function (k) { var t = this.peek(k); return t.t === 'id' && (!RESERVED[t.v] || t.verbatim); };
P.accept = function (v) { if (this.is(v)) { this.p++; return true; } return false; };
P.prevEnd = function () { var t = this.t[this.p - 1]; if (!t) return { line: 1, col: 1 }; var lines = 0, col = t.col + (t.end - t.pos); return { line: t.line, col: col }; };
P.fail = function (code, msg, tk) { tk = tk || this.cur(); throw new CsError(code, msg, tk.line, tk.col); };
P.expect = function (v) {
  if (this.is(v)) return this.t[this.p++];
  var code = 'CS1003', msg = 'Синтаксическая ошибка, ожидалось «' + v + '»';
  if (v === ';') { code = 'CS1002'; msg = 'Ожидалась ;'; var pe = this.prevEnd(); throw new CsError(code, msg, pe.line, pe.col); }
  if (v === ')') { code = 'CS1026'; msg = 'Ожидалась )'; }
  if (v === '}') { code = 'CS1513'; msg = 'Ожидалась }'; }
  if (v === '{') { code = 'CS1514'; msg = 'Ожидалась {'; }
  if (v === ']') { code = 'CS1003'; msg = 'Синтаксическая ошибка, ожидалось «]»'; }
  var tk = this.cur(); if (this.cur().t === 'eof' && v === '}') { throw new CsError(code, msg, tk.line, tk.col); }
  throw new CsError(code, msg + (tk.t !== 'eof' ? ' (найдено «' + tk.v + '»)' : ''), tk.line, tk.col);
};
P.ident = function () {
  var t = this.cur();
  if (t.t === 'id' && (!RESERVED[t.v] || t.verbatim)) { this.p++; return t.v; }
  if (t.t === 'id') this.fail('CS1001', 'Ожидался идентификатор (найдено ключевое слово «' + t.v + '»)');
  this.fail('CS1001', 'Ожидался идентификатор');
};
function node(k, tk, o) { o = o || {}; o.k = k; o.line = tk ? tk.line : 0; o.col = tk ? tk.col : 0; return o; }

/* ----- типы ----- */
// возвращает {t, next} либо null; без побочных эффектов
P.tryType = function (p, noNullable) {
  var t = this.t, start = p;
  function isid(i) { var x = t[i]; return x && x.t === 'id' && (!RESERVED[x.v] || PREDEF[x.v] || x.verbatim); }
  var self = this;
  function typeArgs(i) { // t[i] == '<'
    var args = [], j = i + 1;
    if (t[j] && t[j].t === 'op' && (t[j].v === '>')) return { args: [], next: j + 1 }; // open generic typeof(List<>)
    while (true) {
      while (t[j] && t[j].t === 'op' && t[j].v === ',') { args.push({ k: 'T', n: '?' }); j++; if (t[j] && t[j].v === '>') return { args: args, next: j + 1 }; }
      var r = self.tryType(j); if (!r) return null;
      args.push(r.t); j = r.next;
      if (t[j] && t[j].t === 'op' && t[j].v === ',') { j++; continue; }
      if (t[j] && t[j].t === 'op' && t[j].v === '>') return { args: args, next: j + 1 };
      return null;
    }
  }
  var ty;
  if (t[p].t === 'op' && t[p].v === '(') {
    // кортеж
    var items = [], j = p + 1;
    while (true) {
      var r = this.tryType(j); if (!r) return null; j = r.next;
      var nm = null; if (isid(j) && !(t[j + 1] && t[j + 1].v === '.')) { nm = t[j].v; j++; }
      items.push({ t: r.t, n: nm });
      if (t[j].t === 'op' && t[j].v === ',') { j++; continue; }
      if (t[j].t === 'op' && t[j].v === ')') { j++; break; }
      return null;
    }
    if (items.length < 2) return null;
    ty = { k: 'T', n: 'ValueTuple', args: items.map(function (x) { return x.t; }), names: items.map(function (x) { return x.n; }), tuple: true }; p = j;
  } else {
    if (!isid(p)) return null;
    var name = t[p].v; p++;
    var qual = [name];
    var targs = null;
    if (t[p] && t[p].t === 'op' && t[p].v === '<') { var ta = typeArgs(p); if (!ta) return null; targs = ta.args; p = ta.next; }
    while (t[p] && t[p].t === 'op' && (t[p].v === '.' || t[p].v === '::') && isid(p + 1)) {
      name = t[p + 1].v; qual.push(name); p += 2;
      if (t[p] && t[p].t === 'op' && t[p].v === '<') { var ta2 = typeArgs(p); if (!ta2) return null; targs = ta2.args; p = ta2.next; }
    }
    ty = { k: 'T', n: name, args: targs || [], q: qual };
  }
  // nullable / массивы
  while (true) {
    if (!noNullable && t[p] && t[p].t === 'op' && t[p].v === '?' ) {
      var nx = t[p + 1];
      // не путать с тернарным: nullable только если дальше идентификатор/[/)/,/;/=/>/{
      if (nx && (nx.t === 'id' || (nx.t === 'op' && (nx.v === '[' || nx.v === ')' || nx.v === ',' || nx.v === ';' || nx.v === '=' || nx.v === '>' || nx.v === '{' || nx.v === '?')) || nx.t === 'eof')) {
        if (nx.t === 'id' && (nx.v === 'is' || nx.v === 'as')) return { t: ty, next: p };
        ty = { k: 'T', n: ty.n, args: ty.args, names: ty.names, tuple: ty.tuple, arr: ty.arr, nullable: true }; p++; continue;
      }
      return { t: ty, next: p };
    }
    if (t[p] && t[p].t === 'op' && t[p].v === '[') {
      var q = p + 1, rank = 1;
      while (t[q] && t[q].t === 'op' && t[q].v === ',') { rank++; q++; }
      if (t[q] && t[q].t === 'op' && t[q].v === ']') { ty = { k: 'T', n: ty.n, args: ty.args, names: ty.names, tuple: ty.tuple, arrOf: ty, rank: rank, arr: true }; p = q + 1; continue; }
    }
    break;
  }
  return { t: ty, next: p };
};
P.parseType = function (what) {
  var r = this.tryType(this.p);
  if (!r) { var tk = this.cur(); this.fail('CS1031', 'Ожидался тип' + (tk.t !== 'eof' ? ' (найдено «' + tk.v + '»)' : '')); }
  this.p = r.next; return r.t;
};
P.typeParams = function () { // <T, U>
  var out = [];
  if (!this.isOp('<')) return out;
  this.p++;
  while (true) { if (this.is('in') || this.is('out')) this.p++; out.push(this.ident()); if (this.accept(',')) continue; break; }
  this.expect('>'); return out;
};
P.skipConstraints = function () {
  while (this.is('where') && this.peek(1).t === 'id' && this.isOp(':', 2)) {
    this.p += 3;
    while (!this.isOp('{') && !this.isOp('=>') && !this.isOp(';') && !this.is('where') && this.cur().t !== 'eof') {
      if (this.isOp('(')) { this.skipBal('(', ')'); continue; }
      if (this.isOp('<')) { this.skipBal('<', '>'); continue; }
      this.p++;
    }
  }
};
P.skipBal = function (o, c) { var d = 0; do { if (this.isOp(o)) d++; else if (this.isOp(c)) d--; this.p++; } while (d > 0 && this.cur().t !== 'eof'); };
P.skipAttrs = function () {
  while (this.isOp('[')) {
    var s0 = this.p;
    this.skipBal('[', ']');
    this.attrBuf = (this.attrBuf || '') + this.t.slice(s0, this.p).map(function (x) { return x.v; }).join('');
  }
};

/* ----- верхний уровень ----- */
P.parseUnit = function () {
  var unit = { types: [], stmts: [], usings: [] };
  while (this.cur().t !== 'eof') this.parseTop(unit);
  return unit;
};
P.parseTop = function (unit) {
  var tk = this.cur();
  if (this.is('using') && !(this.isOp('(', 1)) && !this.is('var', 1) && !(this.peek(1).t === 'id' && this.peek(2).t === 'id' && this.isOp('=', 3))) {
    this.p++; var nm = ''; if (this.is('static')) this.p++;
    while (!this.isOp(';') && this.cur().t !== 'eof') { nm += this.cur().v; this.p++; }
    this.expect(';'); unit.usings.push(nm); return;
  }
  if (this.is('global') && this.isOp('::', 1)) { this.p += 2; }
  if (this.is('namespace')) {
    this.p++; var ns = this.ident(); while (this.accept('.')) ns += '.' + this.ident();
    if (this.accept(';')) { return; }
    this.expect('{'); while (!this.isOp('}') && this.cur().t !== 'eof') this.parseTop(unit); this.expect('}'); return;
  }
  this.skipAttrs();
  var save = this.p, mods = this.parseMods();
  if (this.isTypeDeclStart()) { unit.types.push(this.parseTypeDecl(mods)); return; }
  this.p = save;
  unit.stmts.push(this.parseStatement());
};
P.parseMods = function () {
  var mods = {};
  while (this.cur().t === 'id' && MODS[this.cur().v] && !this.cur().verbatim) {
    var v = this.cur().v, nx = this.peek(1);
    if (v === 'async' && nx.t !== 'id') break;
    if (v === 'new' && nx.t !== 'id') break;
    if (v === 'static' && nx.t === 'op') break;
    mods[v] = true; this.p++;
  }
  if (this.attrBuf) { mods.$attrs = this.attrBuf; this.attrBuf = ''; }
  return mods;
};
P.isTypeDeclAfterMods = function () { return false; };
P.isTypeDeclStart = function () {
  var v = this.cur().v, c = this.cur();
  if (c.t !== 'id') return false;
  if (v === 'class' || v === 'struct' || v === 'interface' || v === 'enum' || v === 'delegate') return v !== 'delegate' || this.peek(1).t === 'id';
  if (v === 'record' && (this.peek(1).t === 'id')) return true;
  return false;
};
P.parseTypeDecl = function (mods) {
  var tk = this.cur(), kind = tk.v;
  this.p++;
  if (kind === 'delegate') {
    var rt = this.parseType(), nm = this.ident(), tp = this.typeParams();
    this.expect('('); var ps = this.parseParams(); this.expect(')'); this.skipConstraints(); this.expect(';');
    return node('Class', tk, { kind: 'delegate', name: nm, mods: mods, members: [], ret: rt, ps: ps });
  }
  if (kind === 'record') { if (this.is('class')) this.p++; else if (this.is('struct')) { this.p++; kind = 'recordstruct'; } }
  var name = this.ident(), tparams = this.typeParams(), primary = null, bases = [], baseArgs = null;
  if (this.isOp('(') && (kind === 'record' || kind === 'recordstruct' || kind === 'class' || kind === 'struct')) { this.p++; primary = this.parseParams(); this.expect(')'); }
  if (kind === 'enum' && this.accept(':')) this.parseType();
  if (this.accept(':')) {
    do {
      var bt = this.parseType();
      if (this.isOp('(')) { baseArgs = this.parseArgs(); }
      bases.push(bt);
    } while (this.accept(','));
  }
  this.skipConstraints();
  var decl = node('Class', tk, { kind: kind, name: name, mods: mods, tparams: tparams, bases: bases, primary: primary, baseArgs: baseArgs, members: [] });
  if (kind === 'record' || kind === 'recordstruct') { if (this.accept(';')) return decl; }
  this.expect('{');
  if (kind === 'enum') {
    var val = 0;
    while (!this.isOp('}') && this.cur().t !== 'eof') {
      this.skipAttrs(); var mt = this.cur(), mn = this.ident(), me = null;
      if (this.accept('=')) me = this.parseExpr();
      decl.members.push(node('EnumMember', mt, { name: mn, e: me }));
      if (!this.accept(',')) break;
    }
    this.expect('}'); return decl;
  }
  while (!this.isOp('}') && this.cur().t !== 'eof') this.parseMember(decl);
  this.expect('}');
  return decl;
};
P.parseParams = function () {
  var ps = [];
  if (this.isOp(')')) return ps;
  while (true) {
    this.skipAttrs();
    var tk = this.cur(), mod = null;
    var isThis = false;
    if (this.is('this') ) { this.p++; isThis = true; }
    while (this.is('ref') || this.is('out') || this.is('in') || this.is('params') || this.is('scoped') || this.is('readonly')) { mod = this.cur().v; this.p++; }
    var ty = this.parseType(), nm = this.ident(), def = null;
    if (this.accept('=')) def = this.parseExpr();
    ps.push({ t: ty, n: nm, mod: mod, def: def, isThis: isThis, line: tk.line, col: tk.col });
    if (this.accept(',')) continue; break;
  }
  return ps;
};
P.parseBodyOrExpr = function () {
  if (this.isOp('{')) return { body: this.parseBlock() };
  if (this.accept('=>')) { var e = this.parseExpr(); this.expect(';'); return { expr: e }; }
  return null;
};
P.parseMember = function (cls) {
  this.skipAttrs();
  var tk = this.cur(), mods = this.parseMods();
  if (this.isTypeDeclStart()) { var inner = this.parseTypeDecl(mods); cls.members.push(inner); return; }
  if (this.isOp('~')) { this.p++; this.ident(); this.expect('('); this.expect(')'); this.parseBlock(); return; }
  // конструктор
  if (this.cur().t === 'id' && this.cur().v === cls.name && this.isOp('(', 1)) {
    this.p++; this.expect('('); var ps = this.parseParams(); this.expect(')');
    var init = null;
    if (this.accept(':')) {
      var kw = this.cur().v; if (kw !== 'base' && kw !== 'this') this.fail('CS1002', 'Ожидалось base или this');
      this.p++; init = { kind: kw, args: this.parseArgs() };
    }
    var bd = this.parseBodyOrExpr();
    if (!bd) { if (this.accept(';')) bd = { body: node('Blk', tk, { ss: [] }) }; else this.fail('CS1002', 'Ожидалось тело конструктора'); }
    cls.members.push(node('Ctor', tk, { mods: mods, ps: ps, init: init, body: bd.body || null, expr: bd.expr || null })); return;
  }
  if (this.is('event')) {
    this.p++; var et = this.parseType(), en = this.ident();
    if (this.isOp('{')) { this.skipBal('{', '}'); } else this.expect(';');
    cls.members.push(node('Field', tk, { mods: mods, t: et, vars: [{ n: en, init: null }], isEvent: true })); return;
  }
  if (this.is('implicit') || this.is('explicit')) {
    var ik = this.cur().v; this.p++; this.expect('operator'); var rt0 = this.parseType(); this.expect('('); var ps0 = this.parseParams(); this.expect(')');
    var b0 = this.parseBodyOrExpr();
    cls.members.push(node('Method', tk, { mods: mods, name: ik + ' operator', ret: rt0, ps: ps0, body: b0.body, expr: b0.expr, conv: ik })); return;
  }
  var ty = this.parseType();
  if (this.is('operator')) {
    this.p++; var op = this.cur().v; this.p++;
    if (op === '>' && this.isOp('>') ) { op = '>>'; this.p++; }
    this.expect('('); var ps2 = this.parseParams(); this.expect(')');
    var b1 = this.parseBodyOrExpr();
    cls.members.push(node('Method', tk, { mods: mods, name: 'operator ' + op, ret: ty, ps: ps2, body: b1.body, expr: b1.expr, op: op })); return;
  }
  if (this.is('this') && this.isOp('[', 1)) {
    this.p++; this.expect('['); var ips = this.parseParams(); this.expect(']');
    var acc = this.parseAccessors(); acc.k = 'Indexer'; acc.t = ty; acc.ps = ips; acc.mods = mods; acc.line = tk.line; acc.col = tk.col; cls.members.push(acc); return;
  }
  var nameTk = this.cur(), name = this.ident();
  // явная реализация интерфейса: IFoo.Bar
  while (this.isOp('.') && this.peek(1).t === 'id') { this.p++; name = this.ident(); }
  if (this.isOp('<') || this.isOp('(')) {
    var tp = this.typeParams();
    this.expect('('); var ps3 = this.parseParams(); this.expect(')'); this.skipConstraints();
    var bd2 = this.parseBodyOrExpr();
    if (!bd2) { if (this.accept(';')) bd2 = {}; else { var tkk = this.cur(); this.fail('CS1002', 'Ожидалось ; или тело метода'); } }
    cls.members.push(node('Method', nameTk, { mods: mods, name: name, ret: ty, ps: ps3, tparams: tp, body: bd2.body || null, expr: bd2.expr || null })); return;
  }
  if (this.isOp('{')) {
    var ac = this.parseAccessors(); var init2 = null;
    if (this.accept('=')) { init2 = this.parseExpr(); this.expect(';'); }
    cls.members.push(node('Prop', nameTk, { mods: mods, t: ty, name: name, get: ac.get, set: ac.set, init: init2 })); return;
  }
  if (this.isOp('=>')) {
    this.p++; var pe = this.parseExpr(); this.expect(';');
    cls.members.push(node('Prop', nameTk, { mods: mods, t: ty, name: name, get: { expr: pe }, set: null })); return;
  }
  // поле
  var vars = [{ n: name, init: null, line: nameTk.line, col: nameTk.col }];
  if (this.accept('=')) vars[0].init = this.parseVarInit();
  while (this.accept(',')) { var vt = this.cur(), vn = this.ident(), vi = null; if (this.accept('=')) vi = this.parseVarInit(); vars.push({ n: vn, init: vi, line: vt.line, col: vt.col }); }
  this.expect(';');
  cls.members.push(node('Field', tk, { mods: mods, t: ty, vars: vars }));
};
P.parseAccessors = function () {
  this.expect('{'); var get = null, set = null;
  while (!this.isOp('}') && this.cur().t !== 'eof') {
    this.skipAttrs(); var mods = this.parseMods(); // private set
    var tk = this.cur(), kw = this.cur().v;
    if (kw !== 'get' && kw !== 'set' && kw !== 'init') this.fail('CS1014', 'Ожидался get, set или init');
    this.p++;
    var acc = { priv: !!(mods.private || mods.protected), line: tk.line };
    if (this.isOp('{')) acc.body = this.parseBlock();
    else if (this.accept('=>')) { acc.expr = this.parseExpr(); this.expect(';'); }
    else { this.expect(';'); acc.auto = true; }
    if (kw === 'get') get = acc; else { acc.isInit = kw === 'init'; set = acc; }
  }
  this.expect('}'); return { get: get, set: set };
};
P.parseVarInit = function () {
  if (this.isOp('{')) return this.parseArrayLit();
  return this.parseExpr();
};

/* ----- операторы ----- */
P.parseBlock = function () {
  var tk = this.expect('{'), ss = [];
  while (!this.isOp('}')) {
    if (this.cur().t === 'eof') throw new CsError('CS1513', 'Ожидалась }', this.cur().line, this.cur().col);
    ss.push(this.parseStatement());
  }
  this.expect('}');
  return node('Blk', tk, { ss: ss });
};
P.isDeclStart = function () {
  // «Type name» (= | ; | , | : в foreach обрабатывается отдельно)
  var c = this.cur();
  if (c.t !== 'id' && !(c.t === 'op' && c.v === '(')) return null;
  if (c.t === 'id' && RESERVED[c.v] && !PREDEF[c.v]) return null;
  if (c.t === 'id' && !c.verbatim && c.v === 'await') return null;
  if (c.t === 'id' && c.v === 'var' && this.isOp('(', 1)) {
    var q = this.p + 1, dp = 0;
    for (; q < this.t.length; q++) { var tt = this.t[q]; if (tt.t === 'op' && tt.v === '(') dp++; else if (tt.t === 'op' && tt.v === ')') { dp--; if (dp === 0) break; } else if (tt.t === 'eof') break; }
    var after = this.t[q + 1];
    if (after && after.t === 'op' && after.v === '=') return { t: { k: 'T', n: 'var' }, next: this.p + 1 };
    return null;
  }
  var r = this.tryType(this.p);
  if (!r) return null;
  var n = this.t[r.next];
  if (r.t.tuple && r.t.names && r.t.names.length && r.t.names.every(Boolean) && n.t === 'op' && n.v === '=') return r;
  if (n.t === 'id' && (!RESERVED[n.v] || n.verbatim) && n.v !== 'is' && n.v !== 'as' && n.v !== 'in') {
    var n2 = this.t[r.next + 1];
    if (n2.t === 'op' && (n2.v === '=' || n2.v === ';' || n2.v === ',' )) return r;
    if (n2.t === 'op' && n2.v === '(' ) return null; // локальная функция проверяется отдельно
    if (n2.t === 'op' && (n2.v === '[' || n2.v === ':')) return null;
    // пропущена «;» после объявления: «int x» перед новой строкой
    if (n2.nl || n2.t === 'eof') return r;
    return null;
  }
  return null;
};
P.parseStatement = function () {
  var tk = this.cur(), v = tk.v;
  if (tk.t === 'op') {
    if (v === '{') return this.parseBlock();
    if (v === ';') { this.p++; return node('Empty', tk); }
    if (v === '(') { // деконструкция «(int a, int b) = ...» / кортежное объявление
      var rd = this.isDeclStart(); if (rd) return this.parseLocalDecl(rd, tk, false);
    }
  }
  if (tk.t === 'id' && !tk.verbatim) {
    switch (v) {
      case 'if': return this.parseIf();
      case 'while': { this.p++; this.expect('('); var c = this.parseExpr(); this.expect(')'); return node('While', tk, { c: c, body: this.parseStatement() }); }
      case 'do': { this.p++; var body = this.parseStatement(); if (!this.is('while')) this.fail('CS1003', 'Ожидалось while'); this.p++; this.expect('('); var dc = this.parseExpr(); this.expect(')'); this.expect(';'); return node('Do', tk, { c: dc, body: body }); }
      case 'for': return this.parseFor();
      case 'foreach': return this.parseForeach();
      case 'return': { this.p++; var e = null; if (!this.isOp(';')) e = this.parseExpr(); this.expect(';'); return node('Ret', tk, { e: e }); }
      case 'break': this.p++; this.expect(';'); return node('Brk', tk);
      case 'continue': this.p++; this.expect(';'); return node('Cnt', tk);
      case 'throw': { this.p++; var te = null; if (!this.isOp(';')) te = this.parseExpr(); this.expect(';'); return node('Throw', tk, { e: te }); }
      case 'try': return this.parseTry();
      case 'switch': if (this.isOp('(', 1) || true) { var sv = this.parseSwitchStmt(); if (sv) return sv; } break;
      case 'lock': { this.p++; this.expect('('); var le = this.parseExpr(); this.expect(')'); return node('Lock', tk, { e: le, body: this.parseStatement() }); }
      case 'using': return this.parseUsing();
      case 'yield': if (this.is('return', 1)) { this.p += 2; var ye = this.parseExpr(); this.expect(';'); return node('Yield', tk, { e: ye }); } if (this.is('break', 1)) { this.p += 2; this.expect(';'); return node('YBrk', tk); } break;
      case 'checked': case 'unchecked': if (this.isOp('{', 1)) { this.p++; var cb = this.parseBlock(); return node('Chk', tk, { body: cb, on: v === 'checked' }); } break;
      case 'const': { this.p++; var cr = this.tryType(this.p); if (!cr) this.fail('CS1031', 'Ожидался тип'); var cd = this.parseLocalDecl(cr, tk, true); return cd; }
      case 'goto': case 'unsafe': case 'fixed': this.fail('CS8652', 'Оператор «' + v + '» не поддерживается этим мини-интерпретатором'); break;
      case 'else': this.fail('CS8641', '«else» без соответствующего «if»'); break;
      case 'case': case 'default': if (v === 'case' || !this.isOp('(', 1)) this.fail('CS8070', 'Метка «' + v + '» допустима только внутри switch'); break;
      case 'class': case 'struct': case 'interface': case 'enum': case 'record': case 'delegate': break;
    }
    // метка «имя:» (не поддерживаем goto, но не падаем)
    // локальная функция
    var lf = this.tryLocalFunc();
    if (lf) return lf;
    var r = this.isDeclStart();
    if (r) return this.parseLocalDecl(r, tk, false);
    // static/async лямбда как выражение — идём в выражение
  }
  var ex = this.parseExpr();
  // ошибка: выражение, не являющееся оператором
  if (!(ex.k === 'Call' || ex.k === 'Asg' || ex.k === 'Post' || ex.k === 'New' || ex.k === 'Await' || (ex.k === 'Un' && (ex.op === '++' || ex.op === '--')) || ex.k === 'ThrowE' || ex.k === 'Decon')) {
    if (this.isOp(';') || this.cur().nl || this.cur().t === 'eof') {
      if (!this.isOp(';')) { var pe = this.prevEnd(); throw new CsError('CS1002', 'Ожидалась ;', pe.line, pe.col); }
      throw new CsError('CS0201', 'В качестве оператора могут использоваться только выражения присваивания, вызова, инкремента, декремента, await и new', ex.line, ex.col);
    }
  }
  this.expect(';');
  return node('Expr', tk, { e: ex });
};
P.tryLocalFunc = function () {
  var save = this.p, mods = {};
  while (this.is('static') || this.is('async')) { mods[this.cur().v] = true; this.p++; }
  var r = this.tryType(this.p);
  if (r && this.t[r.next].t === 'id' && !RESERVED[this.t[r.next].v]) {
    var q = r.next + 1;
    if (this.t[q].t === 'op' && this.t[q].v === '<') { // generic
      var save2 = this.p; this.p = q; try { this.typeParams(); q = this.p; } catch (e) { q = -1; } this.p = save2;
    }
    if (q > 0 && this.t[q].t === 'op' && this.t[q].v === '(') {
      // найти парную )
      var d = 0, j = q;
      for (; j < this.t.length; j++) { var x = this.t[j]; if (x.t === 'op' && x.v === '(') d++; else if (x.t === 'op' && x.v === ')') { d--; if (d === 0) break; } }
      var after = this.t[j + 1];
      if (after && ((after.t === 'op' && (after.v === '{' || after.v === '=>')) || (after.t === 'id' && after.v === 'where'))) {
        var tk = this.t[r.next];
        this.p = r.next; var name = this.ident(); var tp = this.typeParams(); this.expect('('); var ps = this.parseParams(); this.expect(')'); this.skipConstraints();
        var bd = this.parseBodyOrExpr();
        return node('LFn', tk, { name: name, ps: ps, ret: r.t, body: bd.body || null, expr: bd.expr || null, mods: mods });
      }
    }
  }
  this.p = save; return null;
};
P.parseIf = function () {
  var tk = this.cur(); this.p++; this.expect('('); var c = this.parseExpr(); this.expect(')');
  var th = this.parseStatement(), el = null;
  if (this.is('else')) { this.p++; el = this.parseStatement(); }
  return node('If', tk, { c: c, th: th, el: el });
};
P.parseLocalDecl = function (r, tk, isConst) {
  // деконструкция: (a, b) = ..., var (a, b) = ...
  var ty = r.t;
  if (ty.tuple && this.t[r.next].t === 'op' && this.t[r.next].v === '=') {
    this.p = r.next + 1; var rhs = this.parseExpr(); this.expect(';');
    return node('Decl', tk, { t: { k: 'T', n: 'var' }, vars: [], decon: ty.names.map(function (nm, i) { return { n: nm, t: ty.args[i] }; }), init: rhs });
  }
  this.p = r.next;
  if (ty.n === 'var' && this.isOp('(')) { // var (a, b) = ...
    this.p++; var names = [];
    do { names.push({ n: this.ident(), t: { k: 'T', n: 'var' } }); } while (this.accept(','));
    this.expect(')'); this.expect('='); var rh = this.parseExpr(); this.expect(';');
    return node('Decl', tk, { t: ty, vars: [], decon: names, init: rh });
  }
  var vars = [];
  do {
    var vt = this.cur(), nm = this.ident(), init = null;
    if (this.accept('=')) init = this.parseVarInit();
    else if (isConst) this.fail('CS0145', 'Для константы нужно задать значение');
    vars.push({ n: nm, init: init, line: vt.line, col: vt.col });
  } while (this.accept(','));
  this.expect(';');
  return node('Decl', tk, { t: ty, vars: vars, isConst: isConst });
};
P.parseFor = function () {
  var tk = this.cur(); this.p++; this.expect('(');
  var init = null, cond = null, inc = [];
  if (!this.isOp(';')) {
    var r = this.isDeclStart();
    if (r) { var vt = this.cur(); this.p = r.next; var vars = []; do { var nt = this.cur(), nm = this.ident(), ie = null; if (this.accept('=')) ie = this.parseExpr(); vars.push({ n: nm, init: ie, line: nt.line, col: nt.col }); } while (this.accept(',')); init = node('Decl', vt, { t: r.t, vars: vars }); }
    else { var es = []; do { es.push(node('Expr', tk, { e: this.parseExpr() })); } while (this.accept(',')); init = es; }
  }
  this.expect(';');
  if (!this.isOp(';')) cond = this.parseExpr();
  this.expect(';');
  if (!this.isOp(')')) { do { inc.push(this.parseExpr()); } while (this.accept(',')); }
  this.expect(')');
  return node('For', tk, { init: init, c: cond, inc: inc, body: this.parseStatement() });
};
P.parseForeach = function () {
  var tk = this.cur(); this.p++; this.expect('(');
  var ty = null, name = null, decon = null;
  if (this.is('var') && this.isOp('(', 1)) { this.p += 2; decon = []; do { decon.push({ n: this.ident() }); } while (this.accept(',')); this.expect(')'); ty = { k: 'T', n: 'var' }; }
  else {
    var r = this.tryType(this.p);
    if (r && this.t[r.next].t === 'id' && this.t[r.next].v !== 'in') { ty = r.t; this.p = r.next; name = this.ident(); }
    else if (r && r.t.tuple && this.is('in', r.next - this.p)) { ty = r.t; decon = r.t.names.map(function (n) { return { n: n }; }); this.p = r.next; }
    else this.fail('CS1525', 'Недопустимый термин в foreach');
  }
  if (!this.is('in')) this.fail('CS1515', 'После переменной foreach ожидалось «in»');
  this.p++;
  var e = this.parseExpr(); this.expect(')');
  return node('Foreach', tk, { t: ty, n: name, decon: decon, e: e, body: this.parseStatement() });
};
P.parseTry = function () {
  var tk = this.cur(); this.p++;
  var b = this.parseBlock(), catches = [], fin = null;
  while (this.is('catch')) {
    var ct = this.cur(); this.p++;
    var ty = null, nm = null, when = null;
    if (this.accept('(')) { ty = this.parseType(); if (this.isId()) nm = this.ident(); this.expect(')'); }
    if (this.is('when')) { this.p++; this.expect('('); when = this.parseExpr(); this.expect(')'); }
    catches.push({ t: ty, n: nm, when: when, body: this.parseBlock(), line: ct.line });
  }
  if (this.is('finally')) { this.p++; fin = this.parseBlock(); }
  if (!catches.length && !fin) this.fail('CS1524', 'Ожидалось catch или finally');
  return node('Try', tk, { b: b, catches: catches, fin: fin });
};
P.parseUsing = function () {
  var tk = this.cur(); this.p++;
  if (this.accept('(')) {
    var r = this.isDeclStart(), decl = null, e = null;
    if (r) { this.p = r.next; var nm = this.ident(); this.expect('='); decl = { t: r.t, n: nm, init: this.parseExpr() }; } else e = this.parseExpr();
    this.expect(')');
    return node('Using', tk, { decl: decl, e: e, body: this.parseStatement() });
  }
  var r2 = this.isDeclStart();
  if (!r2) this.fail('CS1003', 'Ожидалось объявление после using');
  var d = this.parseLocalDecl(r2, tk, false);
  return node('Using', tk, { decl: { t: d.t, n: d.vars[0].n, init: d.vars[0].init }, e: null, body: null });
};
P.parseSwitchStmt = function () {
  var tk = this.cur();
  // switch (expr) { case ... }  — отличаем от switch-выражения «x switch {...}» (там switch не в начале оператора)
  this.p++;
  var hasParen = this.isOp('(');
  var e;
  if (hasParen) { this.p++; e = this.parseExpr(); this.expect(')'); } else e = this.parseExpr();
  this.expect('{');
  var sections = [];
  while (!this.isOp('}') && this.cur().t !== 'eof') {
    var labels = [];
    while (this.is('case') || (this.is('default') && this.isOp(':', 1))) {
      if (this.is('default')) { this.p++; this.expect(':'); labels.push({ dflt: true }); continue; }
      this.p++;
      var pat = this.parsePattern(), when = null;
      if (this.is('when')) { this.p++; when = this.parseExpr(); }
      this.expect(':'); labels.push({ pat: pat, when: when });
    }
    if (!labels.length) this.fail('CS1003', 'Ожидалась метка case или default');
    var body = [];
    while (!this.is('case') && !(this.is('default') && this.isOp(':', 1)) && !this.isOp('}') && this.cur().t !== 'eof') body.push(this.parseStatement());
    sections.push({ labels: labels, body: body });
  }
  this.expect('}');
  return node('Sw', tk, { e: e, sections: sections });
};

/* ----- паттерны ----- */
P.parsePattern = function () {
  var l = this.parseAndPat();
  while (this.is('or')) { var tk = this.cur(); this.p++; l = node('POr', tk, { l: l, r: this.parseAndPat() }); }
  return l;
};
P.parseAndPat = function () {
  var l = this.parseNotPat();
  while (this.is('and')) { var tk = this.cur(); this.p++; l = node('PAnd', tk, { l: l, r: this.parseNotPat() }); }
  return l;
};
P.parseNotPat = function () {
  if (this.is('not')) { var tk = this.cur(); this.p++; return node('PNot', tk, { p: this.parseNotPat() }); }
  return this.parsePrimaryPat();
};
P.parseDesignation = function () {
  var c = this.cur();
  if (c.t === 'id' && (!RESERVED[c.v]) && c.v !== 'and' && c.v !== 'or' && c.v !== 'when') { this.p++; return c.v; }
  return null;
};
P.parsePrimaryPat = function () {
  var tk = this.cur(), v = tk.v;
  if (tk.t === 'op') {
    if (v === '(') {
      this.p++; var items = [this.parsePattern()], comma = false;
      while (this.accept(',')) { comma = true; items.push(this.parsePattern()); }
      this.expect(')');
      if (!comma) { var d0 = this.parseDesignation(); if (d0) return node('PAnd', tk, { l: items[0], r: node('PVar', tk, { name: d0 }) }); return items[0]; }
      return node('PPos', tk, { t: null, items: items, name: this.parseDesignation() });
    }
    if (v === '<' || v === '>' || v === '<=' || v === '>=') { this.p++; return node('PRel', tk, { op: v, e: this.parseBinary(9) }); }
    if (v === '{') return this.parsePropPat(null);
    if (v === '[') { this.p++; var li = []; if (!this.isOp(']')) { do { li.push(this.parsePattern()); } while (this.accept(',')); } this.expect(']'); return node('PList', tk, { items: li }); }
    if (v === '-' || v === '!') return node('PConst', tk, { e: this.parseBinary(9) });
  }
  if (tk.t === 'num' || tk.t === 'str' || tk.t === 'chr' || tk.t === 'istr') return node('PConst', tk, { e: this.parseBinary(9) });
  if (tk.t === 'id') {
    if (v === 'null' || v === 'true' || v === 'false') { this.p++; return node('PConst', tk, { e: node('Lit', tk, { v: v === 'null' ? null : v === 'true', ty: v === 'null' ? 'null' : 'bool' }) }); }
    if (v === 'var' && !this.isOp('.', 1)) {
      this.p++;
      if (this.isOp('(')) { this.p++; var vs = []; do { vs.push(this.parsePattern()); } while (this.accept(',')); this.expect(')'); return node('PPos', tk, { t: null, items: vs }); }
      var nm = this.ident(); return node('PVar', tk, { name: nm });
    }
    if (v === '_' && !this.isOp('.', 1)) { this.p++; return node('PDisc', tk); }
    var r = this.tryType(this.p, true);
    if (r) {
      this.p = r.next; var ty = r.t;
      if (this.isOp('(')) { this.p++; var its = []; if (!this.isOp(')')) { do { its.push(this.parsePattern()); } while (this.accept(',')); } this.expect(')'); var pp = node('PPos', tk, { t: ty, items: its, name: null }); if (this.isOp('{')) { var pr = this.parsePropPat(null); pp.prop = pr; } pp.name = this.parseDesignation(); return pp; }
      if (this.isOp('{')) return this.parsePropPat(ty);
      var d = this.parseDesignation();
      return node('PType', tk, { t: ty, name: d });
    }
  }
  this.fail('CS8504', 'Недопустимый шаблон (pattern)');
};
P.parsePropPat = function (ty) {
  var tk = this.cur(); this.expect('{'); var props = [];
  while (!this.isOp('}')) {
    var nm = this.ident(); while (this.accept('.')) nm += '.' + this.ident();
    this.expect(':'); props.push({ n: nm, p: this.parsePattern() });
    if (!this.accept(',')) break;
  }
  this.expect('}');
  return node('PProp', tk, { t: ty, props: props, name: this.parseDesignation() });
};

/* ----- выражения ----- */
P.parseExpr = function () { return this.parseAssign(); };
P.parseAssign = function () {
  var l = this.parseTernary(), tk = this.cur();
  var op = null;
  if (tk.t === 'op') {
    if (ASSIGNOPS[tk.v]) op = tk.v;
    else if (tk.v === '>' && this.isOp('>=', 1) && this.peek(1).pos === tk.end) { op = '>>='; }
  }
  if (op) {
    if (!(l.k === 'Id' || l.k === 'Mem' || l.k === 'Idx' || l.k === 'Tup' || l.k === 'Un' && l.op === '*')) throw new CsError('CS0131', 'Левая часть присваивания должна быть переменной, свойством или индексатором', l.line, l.col);
    this.p += op === '>>=' ? 2 : 1;
    var r = this.parseAssign();
    return node('Asg', tk, { op: op, l: l, r: r, line: l.line, col: l.col });
  }
  return l;
};
P.parseTernary = function () {
  var c = this.parseBinary(1);
  if (this.isOp('?') ) {
    var tk = this.cur(); this.p++;
    var a = this.parseAssignNoTernaryLambda(); this.expect(':'); var b = this.parseAssignNoTernaryLambda();
    return node('Cond', tk, { c: c, a: a, b: b, line: c.line, col: c.col });
  }
  return c;
};
P.parseAssignNoTernaryLambda = function () { return this.parseAssign(); };
P.parseBinary = function (minPrec) {
  var l = this.parseUnary();
  while (true) {
    var tk = this.cur(), op = tk.v, prec;
    if (tk.t === 'op') {
      if (op === '>' && this.isOp('>', 1) && this.peek(1).pos === tk.end) { // >>
        if (this.isOp('>=', 2) && false) break;
        op = '>>'; prec = 9; if (prec < minPrec) break; this.p += 2; var rr = this.parseBinary(prec + 1); l = node('Bin', tk, { op: op, l: l, r: rr, line: l.line, col: l.col }); continue;
      }
      if (op === '>' && this.isOp('>=', 1) && this.peek(1).pos === tk.end) break; // >>=
      prec = BINPREC[op];
    } else if (tk.t === 'id' && (op === 'is' || op === 'as') && !tk.verbatim) prec = 8;
    else break;
    if (!prec || prec < minPrec) break;
    this.p++;
    if (op === 'is') {
      var pat = this.parsePattern();
      l = node('Is', tk, { e: l, pat: pat, line: l.line, col: l.col }); continue;
    }
    if (op === 'as') { var ty = this.parseType(); l = node('As', tk, { e: l, t: ty, line: l.line, col: l.col }); continue; }
    var r = this.parseBinary(op === '??' ? prec : prec + 1);
    l = node('Bin', tk, { op: op, l: l, r: r, line: l.line, col: l.col });
  }
  return l;
};
P.parseUnary = function () {
  var tk = this.cur(), v = tk.v;
  if (tk.t === 'op') {
    if (v === '!' || v === '-' || v === '+' || v === '~') { this.p++; var e = this.parseUnary(); if (v === '-' && e.k === 'Lit' && (e.ty === 'int' || e.ty === 'long' || e.ty === 'double' || e.ty === 'float') && !e.neg && e.raw) { e.v = typeof e.v === 'bigint' ? -e.v : -e.v; e.neg = true; return e; } return node('Un', tk, { op: v, e: e }); }
    if (v === '++' || v === '--') { this.p++; return node('Un', tk, { op: v, e: this.parseUnary() }); }
    if (v === '(' ) {
      // приведение типа?
      var cast = this.tryCast();
      if (cast) return cast;
    }
    if (v === '^') { this.p++; return node('Un', tk, { op: '^', e: this.parseUnary() }); }
  }
  if (tk.t === 'id' && v === 'await' && !tk.verbatim) {
    var nx = this.peek(1);
    if (!(nx.t === 'op' && (nx.v === ')' || nx.v === ';' || nx.v === ',' || nx.v === '=' || nx.v === '.'))) { this.p++; return node('Await', tk, { e: this.parseUnary() }); }
  }
  var pe = this.parsePostfix();
  return this.parseSwitchExprTail(pe);
};
P.parseSwitchExprTail = function (e) {
  while (this.is('switch') && this.isOp('{', 1)) {
    var tk = this.cur(); this.p += 2; var arms = [];
    while (!this.isOp('}')) {
      var pat = this.parsePattern(), when = null;
      if (this.is('when')) { this.p++; when = this.parseExpr(); }
      this.expect('=>'); var res = this.parseExpr();
      arms.push({ pat: pat, when: when, res: res });
      if (!this.accept(',')) break;
    }
    this.expect('}');
    e = node('SwE', tk, { e: e, arms: arms, line: e.line, col: e.col });
  }
  if (this.is('with') && this.isOp('{', 1)) {
    var wt = this.cur(); this.p++; var init = this.parseInitializer();
    e = node('With', wt, { e: e, init: init, line: e.line, col: e.col });
  }
  return e;
};
P.tryCast = function () {
  var save = this.p;
  // лямбда «(a, b) =>»
  if (this.lambdaAhead()) return null;
  var r = this.tryType(this.p + 1);
  if (r && this.t[r.next].t === 'op' && this.t[r.next].v === ')') {
    var n = this.t[r.next + 1], ty = r.t, predef = PREDEF[ty.n] && !ty.arr && !ty.tuple;
    var ok = false;
    if (predef || ty.arr) ok = !(n.t === 'op' && (n.v === ')' || n.v === ';' || n.v === ',' || n.v === '.' || n.v === ']' || n.v === '}'|| n.v === '=' || n.v === '?' || n.v === ':' )) && n.t !== 'eof' && !(n.t==='op' && BINPREC[n.v] && n.v !== '-' && n.v !== '+' && n.v !== '&' && n.v!=='*');
    else if (!ty.tuple) ok = n.t === 'id' && !(n.v === 'is' || n.v === 'as' || n.v === 'switch' || n.v==='and'||n.v==='or'||n.v==='when'||n.v==='with') || n.t === 'num' || n.t === 'str' || n.t === 'chr' || n.t === 'istr' || (n.t === 'op' && (n.v === '(' || n.v === '!' || n.v === '~'));
    if (ok && n.t === 'id' && n.v==='in') ok = false;
    if (ok) {
      var tk = this.cur(); this.p = r.next + 1;
      var e = this.parseUnary();
      return node('Cast', tk, { t: ty, e: e });
    }
  }
  this.p = save; return null;
};
P.lambdaAhead = function () {
  // на «(»: ищем парную «)», затем «=>»
  var d = 0, j = this.p;
  for (; j < this.t.length; j++) {
    var x = this.t[j];
    if (x.t === 'op' && x.v === '(') d++;
    else if (x.t === 'op' && x.v === ')') { d--; if (d === 0) break; }
    else if (x.t === 'eof') return false;
  }
  var a = this.t[j + 1];
  return !!(a && a.t === 'op' && a.v === '=>');
};
P.parseLambda = function (isAsync) {
  var tk = this.cur(), ps = [];
  if (this.isOp('(')) {
    this.p++;
    if (!this.isOp(')')) {
      do {
        var save = this.p, ty = null;
        while (this.is('ref') || this.is('out') || this.is('in')) this.p++;
        var r = this.tryType(this.p);
        if (r && this.t[r.next].t === 'id' && !RESERVED[this.t[r.next].v] ) { ty = r.t; this.p = r.next; }
        ps.push({ n: this.ident(), t: ty });
      } while (this.accept(','));
    }
    this.expect(')');
  } else { ps.push({ n: this.ident(), t: null }); }
  this.expect('=>');
  var body;
  if (this.isOp('{')) body = this.parseBlock(); else body = this.parseExpr();
  return node('Lam', tk, { ps: ps, body: body, isAsync: !!isAsync });
};
P.parseArgs = function () {
  this.expect('('); var args = [];
  if (!this.isOp(')')) {
    do {
      var tk = this.cur(), name = null, mod = null, decl = null;
      if (this.isId() && this.isOp(':', 1) && !this.isOp('::', 1)) { name = this.ident(); this.p++; }
      if (this.is('ref') || this.is('out') || this.is('in')) {
        mod = this.cur().v; this.p++;
        if (mod === 'out') {
          var r = this.tryType(this.p);
          if (r && this.t[r.next].t === 'id' && !RESERVED[this.t[r.next].v]) { this.p = r.next; decl = { t: r.t, n: this.ident() }; }
          else if (this.is('_') && false) { }
        }
      }
      var e = decl ? null : this.parseExpr();
      args.push({ e: e, name: name, mod: mod, decl: decl, line: tk.line, col: tk.col });
    } while (this.accept(','));
  }
  if (!this.isOp(')')) {
    var c = this.cur();
    if (c.t === 'eof' || c.nl) { throw new CsError('CS1026', 'Ожидалась )', this.prevEnd().line, this.prevEnd().col); }
    this.expect(')');
  }
  this.p++;
  return args;
};
P.parseInitializer = function () {
  var tk = this.expect('{'), items = [];
  while (!this.isOp('}')) {
    var it;
    if (this.isOp('[')) { this.p++; var ix = []; do { ix.push(this.parseExpr()); } while (this.accept(',')); this.expect(']'); this.expect('='); it = { idx: ix, v: this.parseInitVal() }; }
    else if (this.isId() && this.isOp('=', 1)) { var nt = this.cur(), nm = this.ident(); this.p++; it = { n: nm, v: this.parseInitVal(), line: nt.line, col: nt.col }; }
    else if (this.isOp('{')) { this.p++; var xs = []; do { xs.push(this.parseExpr()); } while (this.accept(',')); this.expect('}'); it = { add: xs }; }
    else it = { e: this.parseExpr() };
    items.push(it);
    if (!this.accept(',')) break;
  }
  this.expect('}');
  return { k: 'Init', items: items, line: tk.line, col: tk.col };
};
P.parseInitVal = function () { if (this.isOp('{')) { var save = this.p; var i = this.parseInitializer(); return { k: 'InitV', init: i }; } return this.parseExpr(); };
P.parseArrayLit = function () {
  var tk = this.expect('{'), items = [];
  while (!this.isOp('}')) { items.push(this.isOp('{') ? this.parseArrayLit() : this.parseExpr()); if (!this.accept(',')) break; }
  this.expect('}');
  return node('ArrLit', tk, { items: items });
};
P.parseInterp = function (tk) {
  var parts = tk.parts.map(function (pt) {
    if (typeof pt === 'string') return pt;
    var toks;
    try { toks = lex(pt.src, tk.line, 0); } catch (e) { if (e instanceof CsError) { e.line = tk.line; } throw e; }
    var sub = new Parser(toks);
    var ex = sub.parseExpr();
    if (sub.cur().t !== 'eof') throw new CsError('CS1002', 'Лишние символы в интерполированной строке: «' + sub.cur().v + '»', tk.line, tk.col);
    return { e: ex, fmt: pt.fmt, align: pt.align };
  });
  return node('Interp', tk, { parts: parts });
};
P.parsePostfix = function () {
  var e = this.parsePrimary();
  while (true) {
    var tk = this.cur();
    if (tk.t !== 'op') break;
    var v = tk.v;
    if (v === '.' || v === '?.') {
      this.p++;
      var nt = this.cur(), name;
      if (nt.t !== 'id') this.fail('CS1001', 'Ожидался идентификатор после «.»');
      name = nt.v; this.p++;
      var targs = null;
      if (this.isOp('<')) { var save = this.p, r = this.tryTypeArgsAt(this.p); if (r && (this.t[r.next].v === '(' || this.t[r.next].v === '.' || this.t[r.next].v === ')' )) { targs = r.args; this.p = r.next; } }
      e = node('Mem', nt, { o: e, n: name, nullc: v === '?.', targs: targs, line: e.line, col: e.col, nline: nt.line, ncol: nt.col });
      continue;
    }
    if (v === '?[' ) { this.p++; var ix = []; do { ix.push(this.parseExpr()); } while (this.accept(',')); this.expect(']'); e = node('Idx', tk, { o: e, args: ix, nullc: true, line: e.line, col: e.col }); continue; }
    if (v === '[' && !tk.nl) { this.p++; var ix2 = []; do { ix2.push(this.parseIndexArg()); } while (this.accept(',')); this.expect(']'); e = node('Idx', tk, { o: e, args: ix2, nullc: false, line: e.line, col: e.col }); continue; }
    if (v === '(') { var args = this.parseArgs(); e = node('Call', tk, { f: e, args: args, line: e.line, col: e.col, targs: e.targs || null }); continue; }
    if (v === '++' || v === '--') { this.p++; e = node('Post', tk, { op: v, e: e, line: e.line, col: e.col }); continue; }
    if (v === '!' && tk.pos === this.t[this.p - 1].end) {
      var n = this.peek(1);
      if (n.t === 'op' && (n.v === '.' || n.v === ')' || n.v === ';' || n.v === ',' || n.v === ']' || n.v === '[' || n.v === '?' || n.v === '}' || n.v === ':' || n.v === '=>' ) || n.t === 'eof' || (n.t === 'id' && (n.v === 'is' || n.v === 'as'))) { this.p++; continue; }
    }
    break;
  }
  return e;
};
P.parseIndexArg = function () {
  // a[1..3], a[^1], a[..2]
  var tk = this.cur();
  if (this.isOp('..')) { this.p++; var b = (this.isOp(']') ) ? null : this.parseBinary(10); return node('Rng', tk, { a: null, b: b }); }
  var a = this.parseExpr();
  if (this.isOp('..')) { this.p++; var b2 = (this.isOp(']') || this.isOp(',')) ? null : this.parseBinary(10); return node('Rng', tk, { a: a, b: b2 }); }
  return a;
};
P.tryTypeArgsAt = function (p) {
  var t = this.t, j = p + 1, args = [];
  while (true) {
    var r = this.tryType(j); if (!r) return null; args.push(r.t); j = r.next;
    if (t[j].t === 'op' && t[j].v === ',') { j++; continue; }
    if (t[j].t === 'op' && t[j].v === '>') return { args: args, next: j + 1 };
    return null;
  }
};
P.parsePrimary = function () {
  var tk = this.cur(), v = tk.v;
  switch (tk.t) {
    case 'num': this.p++; return node('Lit', tk, { v: tk.v, ty: tk.nk, raw: true });
    case 'str': this.p++; return node('Lit', tk, { v: tk.v, ty: 'string' });
    case 'chr': this.p++; return node('Lit', tk, { v: tk.v, ty: 'char' });
    case 'istr': this.p++; return this.parseInterp(tk);
    case 'eof': throw new CsError('CS1733', 'Ожидалось выражение (неожиданный конец файла)', tk.line, tk.col);
  }
  if (tk.t === 'op') {
    if (v === '(') {
      if (this.lambdaAhead()) return this.parseLambda(false);
      this.p++;
      var first = this.parseTupleItem();
      if (this.isOp(',')) {
        var items = [first];
        while (this.accept(',')) items.push(this.parseTupleItem());
        this.expect(')');
        return node('Tup', tk, { items: items });
      }
      this.expect(')');
      if (first.name) return node('Tup', tk, { items: [first] });
      return node('Paren', tk, { e: first.e, line: first.e.line, col: first.e.col });
    }
    if (v === '[') { // collection expression
      this.p++; var its = [];
      while (!this.isOp(']')) { its.push(this.parseExpr()); if (!this.accept(',')) break; }
      this.expect(']'); return node('ArrLit', tk, { items: its, coll: true });
    }
    if (v === '{' ) this.fail('CS1525', 'Недопустимый термин «{» в выражении');
    this.fail('CS1525', 'Недопустимый термин «' + v + '» в выражении');
  }
  // идентификаторы и ключевые слова
  if (!tk.verbatim) switch (v) {
    case 'true': this.p++; return node('Lit', tk, { v: true, ty: 'bool' });
    case 'false': this.p++; return node('Lit', tk, { v: false, ty: 'bool' });
    case 'null': this.p++; return node('Lit', tk, { v: null, ty: 'null' });
    case 'this': this.p++; return node('This', tk);
    case 'base': this.p++; return node('Base', tk);
    case 'new': return this.parseNew();
    case 'typeof': { this.p++; this.expect('('); var ty = this.parseType(); this.expect(')'); return node('TypeOf', tk, { t: ty }); }
    case 'default': { this.p++; if (this.isOp('(')) { this.p++; var dt = this.parseType(); this.expect(')'); return node('Def', tk, { t: dt }); } return node('Def', tk, { t: null }); }
    case 'nameof': if (this.isOp('(', 1)) { this.p += 2; var nm = ''; while (!this.isOp(')') && this.cur().t !== 'eof') { nm = this.cur().v; this.p++; } this.expect(')'); return node('Lit', tk, { v: nm, ty: 'string' }); } break;
    case 'checked': case 'unchecked': if (this.isOp('(', 1)) { this.p += 2; var ce = this.parseExpr(); this.expect(')'); return node('ChkE', tk, { e: ce, on: v === 'checked' }); } break;
    case 'throw': { this.p++; return node('ThrowE', tk, { e: this.parseUnary() }); }
    case 'async': if (this.isOp('(', 1) || (this.isId(1) && this.isOp('=>', 2)) || this.is('delegate', 1)) { this.p++; if (this.is('delegate')) { return this.parseAnonDelegate(true); } return this.parseLambda(true); } break;
    case 'static': if (this.isOp('(', 1) || this.isId(1)) { this.p++; return this.parsePrimary(); } break;
    case 'delegate': if (this.isOp('(', 1)) return this.parseAnonDelegate(false); break;
    case 'sizeof': case 'stackalloc': this.fail('CS8652', 'Конструкция «' + v + '» не поддерживается этим мини-интерпретатором'); break;
  }
  if (tk.t === 'id') {
    if (this.isOp('=>', 1)) return this.parseLambda(false);
    if (RESERVED[v] && !PREDEF[v] && !tk.verbatim) {
      if (v === 'else' ) this.fail('CS8641', '«else» без соответствующего «if»');
      this.fail('CS1525', 'Недопустимый термин «' + v + '» в выражении');
    }
    this.p++;
    // обобщённый вызов Foo<int>(..)
    var targs = null;
    if (this.isOp('<') && !PREDEF[v]) {
      var r = this.tryTypeArgsAt(this.p);
      if (r && this.t[r.next].t === 'op' && (this.t[r.next].v === '(' || (this.t[r.next].v === '.' && this.t[r.next + 1].t === 'id'))) { targs = r.args; this.p = r.next; }
    }
    return node('Id', tk, { n: v, targs: targs });
  }
  this.fail('CS1525', 'Недопустимый термин «' + v + '» в выражении');
};
P.parseTupleItem = function () {
  var tk = this.cur();
  if (this.isId() && this.isOp(':', 1)) { var nm = this.ident(); this.p++; return { name: nm, e: this.parseExpr() }; }
  return { name: null, e: this.parseExpr() };
};
P.parseAnonDelegate = function (isAsync) {
  var tk = this.cur(); this.p++; var ps = [];
  if (this.accept('(')) { ps = this.parseParams().map(function (p) { return { n: p.n, t: p.t }; }); this.expect(')'); }
  var body = this.parseBlock();
  return node('Lam', tk, { ps: ps, body: body, isAsync: !!isAsync });
};
P.parseNew = function () {
  var tk = this.cur(); this.p++;
  if (this.isOp('(')) { // target-typed new()
    var a0 = this.parseArgs(); var in0 = this.isOp('{') ? this.parseInitializer() : null;
    return node('New', tk, { t: null, args: a0, init: in0 });
  }
  if (this.isOp('{')) { // анонимный тип
    var init = this.parseInitializer();
    return node('Anon', tk, { init: init });
  }
  if (this.isOp('[')) { // new[] { ... }
    this.p++; this.expect(']'); var al = this.parseArrayLit(); return node('NewArr', tk, { et: null, dims: [], init: al });
  }
  // тип без массивных скобок
  var save = this.p;
  var r = this.tryType(this.p);
  if (!r) this.fail('CS1031', 'Ожидался тип после new');
  var ty = r.t;
  if (ty.arr) { // new int[5] / new int[] {..} — tryType съел [..] только если пустые; для [5] нужно иначе
  }
  // new T[expr]
  var base = this.tryTypeNoArr(this.p);
  this.p = base.next; var bt = base.t;
  if (this.isOp('[')) {
    this.p++; var dims = [];
    if (!this.isOp(']') && !this.isOp(',')) { do { dims.push(this.parseExpr()); } while (this.accept(',')); }
    else { while (this.accept(',')) { } }
    this.expect(']');
    var extra = 0; while (this.isOp('[') && this.isOp(']', 1)) { this.p += 2; extra++; }
    var ai = this.isOp('{') ? this.parseArrayLit() : null;
    return node('NewArr', tk, { et: bt, dims: dims, init: ai, jag: extra, rank: dims.length || 1 });
  }
  var args = [];
  if (this.isOp('(')) args = this.parseArgs();
  var ini = this.isOp('{') ? this.parseInitializer() : null;
  if (!ini && !args.length && !this.t[this.p - 1].v === ')' ) { }
  return node('New', tk, { t: bt, args: args, init: ini, hadParens: this.t[this.p - 1].v === ')' || !!ini });
};
P.tryTypeNoArr = function (p) {
  // как tryType, но не поглощает [...]
  var save = this.t[p], r = this.tryType(p);
  if (r && r.t.arr) { // откатываем массивные скобки: найдём позицию первой «[»
    var q = p, d = 0; var t = this.t;
    // пройти до первой «[» верхнего уровня
    var depth = 0;
    for (; q < r.next; q++) { var x = t[q]; if (x.t === 'op' && x.v === '<') depth++; else if (x.t === 'op' && x.v === '>') depth--; else if (x.t === 'op' && x.v === '[' && depth === 0) break; }
    var inner = r.t; while (inner.arr) inner = inner.arrOf;
    return { t: inner, next: q };
  }
  if (!r) this.fail('CS1031', 'Ожидался тип');
  return r;
};

function parseProgram(src) {
  var toks = lex(src);
  var ps = new Parser(toks);
  return ps.parseUnit();
}
X.parseProgram = parseProgram;
X.Parser = Parser;
