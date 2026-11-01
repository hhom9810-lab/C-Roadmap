/* ---------- лексер ---------- */
function CsError(code, msg, line, col) { this.code = code; this.msg = msg; this.line = line || 0; this.col = col || 0; }
CsError.prototype.toString = function () { return 'error ' + this.code + ': ' + this.msg + ' (' + this.line + ',' + this.col + ')'; };
X.CsError = CsError;

var PUNCT3 = ['<<=', '??=', '...'];
var PUNCT2 = ['=>', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '??', '?.', '?[', '::', '->', '<<', '..'];
function isIdStart(c) { return /[A-Za-z_À-￿]/.test(c); }
function isIdPart(c) { return /[A-Za-z0-9_À-￿]/.test(c); }

function lex(src, baseLine, baseCol) {
  var toks = [], i = 0, n = src.length, line = baseLine || 1, lineStart = -(baseCol || 0) , nl = false;
  function err(code, msg) { throw new CsError(code, msg, line, i - lineStart + 1); }
  function push(t, v, s, extra) {
    var tk = { t: t, v: v, line: line, col: s - lineStart + 1, pos: s, end: i, nl: nl };
    if (extra) for (var k in extra) tk[k] = extra[k];
    toks.push(tk); nl = false; return tk;
  }
  while (i < n) {
    var c = src[i];
    if (c === '\n') { line++; i++; lineStart = i; nl = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '﻿') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      var sl = line, sc = i - lineStart + 1; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') { line++; lineStart = i + 1; nl = true; } i++; }
      if (i >= n) throw new CsError('CS1035', 'Не найден конец комментария (*/)', sl, sc);
      i += 2; continue;
    }
    if (c === '#' && /^[ \t]*$/.test(src.slice(lineStart < 0 ? 0 : lineStart, i))) { while (i < n && src[i] !== '\n') i++; continue; }
    var s = i;
    // строки
    if (c === '"' || ((c === '$' || c === '@') && (src[i + 1] === '"' || ((src[i + 1] === '$' || src[i + 1] === '@') && src[i + 2] === '"')))) {
      var interp = false, verb = false;
      while (src[i] === '$' || src[i] === '@') { if (src[i] === '$') interp = true; else verb = true; i++; }
      if (src.substr(i, 3) === '"""') {
        // raw string
        var q = 0; while (src[i + q] === '"') q++;
        var closeRe = new RegExp('"{' + q + '}'), startLine = line, sc2 = s - lineStart + 1;
        var rest = src.slice(i + q), m = closeRe.exec(rest);
        if (!m) throw new CsError('CS8997', 'Не завершена сырая строка', startLine, sc2);
        var body = rest.slice(0, m.index), consumed = q + m.index + q;
        for (var z = 0; z < consumed; z++) { if (src[i + z] === '\n') { line++; lineStart = i + z + 1; } }
        i += consumed;
        var ls = body.split('\n'); if (ls.length > 1) { ls.shift(); var lastL = ls[ls.length - 1]; var ind = lastL.match(/^\s*/)[0]; if (/^\s*$/.test(lastL)) ls.pop(); ls = ls.map(function (l) { return l.indexOf(ind) === 0 ? l.slice(ind.length) : l.replace(/^\s+/, ''); }); body = ls.join('\n'); }
        if (interp) toks.push({ t: 'istr', parts: splitInterp(body, true, line, 0, err), line: startLine, col: sc2, pos: s, end: i, nl: nl }); else toks.push({ t: 'str', v: body, line: startLine, col: sc2, pos: s, end: i, nl: nl });
        nl = false; continue;
      }
      i++; // открывающая "
      var buf = '', startLine2 = line, startCol = s - lineStart + 1;
      var raw = '';
      while (true) {
        if (i >= n) throw new CsError('CS1010', 'Незавершённая строка (нет закрывающей кавычки)', startLine2, startCol);
        var ch = src[i];
        if (ch === '"') {
          if (verb && src[i + 1] === '"') { raw += '""'; i += 2; continue; }
          i++; break;
        }
        if (ch === '\n') {
          if (!verb) throw new CsError('CS1010', 'Новая строка в константе (забыта закрывающая кавычка?)', startLine2, startCol);
          line++; lineStart = i + 1;
        }
        if (interp && ch === '{') {
          // читаем «дырку» до парной }
          if (src[i + 1] === '{') { raw += '{{'; i += 2; continue; }
          var d = 0, j = i;
          while (j < n) {
            var cj = src[j];
            if (cj === '"') { j++; while (j < n && src[j] !== '"') { if (src[j] === '\\') j++; j++; } }
            else if (cj === '\'') { j++; while (j < n && src[j] !== '\'') { if (src[j] === '\\') j++; j++; } }
            else if (cj === '{') d++;
            else if (cj === '}') { d--; if (d === 0) break; }
            else if (cj === '\n') { line++; lineStart = j + 1; }
            j++;
          }
          if (j >= n) throw new CsError('CS8077', 'Незакрытая {} в интерполированной строке', startLine2, startCol);
          raw += src.slice(i, j + 1); i = j + 1; continue;
        }
        if (!verb && ch === '\\') { raw += ch + (src[i + 1] || ''); i += 2; continue; }
        raw += ch; i++;
      }
      if (interp) toks.push({ t: 'istr', parts: splitInterp(raw, false, startLine2, 0, err, verb), line: startLine2, col: startCol, pos: s, end: i, nl: nl });
      else toks.push({ t: 'str', v: verb ? raw.replace(/""/g, '"') : unescape(raw, err, startLine2, startCol), line: startLine2, col: startCol, pos: s, end: i, nl: nl });
      nl = false; continue;
    }
    if (c === '\'') {
      i++; var cv = '';
      if (src[i] === '\\') { var e2 = src.slice(i, i + 2); if (e2 === '\\u') { cv = src.slice(i, i + 6); i += 6; } else { cv = src.slice(i, i + 2); i += 2; } }
      else { cv = src[i]; i++; }
      if (src[i] !== '\'') err('CS1012', 'Слишком много символов в символьной константе');
      i++;
      push('chr', unescape(cv, err, line, 0), s); continue;
    }
    if (isIdStart(c) || (c === '@' && isIdStart(src[i + 1] || ''))) {
      if (c === '@') i++;
      var st = i; while (i < n && isIdPart(src[i])) i++;
      push('id', src.slice(st, i), s, c === '@' ? { verbatim: true } : null); continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      var mm;
      var rest2 = src.slice(i, i + 80);
      if ((mm = /^0[xX][0-9a-fA-F_]+/.exec(rest2))) { i += mm[0].length; var hx = mm[0].replace(/_/g, ''), suf = /^[uUlL]+/.exec(src.slice(i, i + 3)); if (suf) i += suf[0].length; var hv = BigInt(hx); var big = suf && /l/i.test(suf[0]); push('num', big ? hv : (hv > 2147483647n ? Number(BigInt.asIntN(32, hv)) : Number(hv)), s, { nk: big ? 'long' : 'int' }); continue; }
      if ((mm = /^0[bB][01_]+/.exec(rest2))) { i += mm[0].length; push('num', parseInt(mm[0].slice(2).replace(/_/g, ''), 2), s, { nk: 'int' }); continue; }
      mm = /^(?:\d[\d_]*)?(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/.exec(rest2);
      var txt = mm[0]; if (!txt) err('CS1056', 'Неожиданный символ');
      // «1.ToString()» — точка не относится к числу
      if (/^\d[\d_]*\.$/.test(txt)) txt = txt.slice(0, -1);
      i += txt.length;
      var clean = txt.replace(/_/g, ''), isReal = /[.eE]/.test(clean);
      var sm = /^[fFdDmMuUlL]{1,2}/.exec(src.slice(i, i + 2)), sfx = '';
      if (sm && !isIdPart(src[i + sm[0].length] || '')) { sfx = sm[0].toLowerCase(); i += sm[0].length; }
      var nk, nv;
      if (sfx === 'm') { nk = 'decimal'; nv = clean; }
      else if (sfx === 'f') { nk = 'float'; nv = parseFloat(clean); }
      else if (sfx === 'd' || isReal) { nk = 'double'; nv = parseFloat(clean); }
      else if (sfx.indexOf('l') >= 0) { nk = 'long'; nv = BigInt(clean); }
      else { var bv = BigInt(clean); if (bv > 2147483647n) { nk = 'long'; nv = bv; } else { nk = 'int'; nv = Number(bv); } }
      push('num', nv, s, { nk: nk }); continue;
    }
    var p3 = src.substr(i, 3), p2 = src.substr(i, 2);
    if (PUNCT3.indexOf(p3) >= 0) { i += 3; push('op', p3, s); continue; }
    if (PUNCT2.indexOf(p2) >= 0) { i += 2; push('op', p2, s); continue; }
    if ('{}()[];,.:?=<>+-*/%&|^!~@'.indexOf(c) >= 0) { i++; push('op', c, s, { adj: src[i] === '>' || src[i] === '=' }); continue; }
    err('CS1056', 'Недопустимый символ «' + c + '»');
  }
  toks.push({ t: 'eof', v: '<конец файла>', line: line, col: i - lineStart + 1, pos: i, end: i, nl: true });
  return toks;
}
function unescape(s, err, line, col) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,4}|.)/g, function (m, e) {
    switch (e[0]) {
      case 'n': return '\n'; case 't': return '\t'; case 'r': return '\r'; case '0': return '\0'; case '\\': return '\\';
      case '"': return '"'; case '\'': return '\''; case 'a': return '\x07'; case 'b': return '\b'; case 'f': return '\f'; case 'v': return '\v';
      case 'u': case 'x': return String.fromCharCode(parseInt(e.slice(1), 16));
    }
    throw new CsError('CS1009', 'Нераспознанная escape-последовательность «\\' + e + '»', line, col);
  });
}
// разбор интерполированной строки на части
function splitInterp(raw, isRaw, line, col, err, verb) {
  var parts = [], i = 0, lit = '';
  function flush() { if (lit) { parts.push(isRaw || verb ? lit : unescape(lit, err, line, col)); lit = ''; } }
  while (i < raw.length) {
    var c = raw[i];
    if (c === '{' && raw[i + 1] === '{') { lit += '{'; i += 2; continue; }
    if (c === '}' && raw[i + 1] === '}') { lit += '}'; i += 2; continue; }
    if (c === '{') {
      flush();
      var d = 0, j = i;
      for (; j < raw.length; j++) {
        var cj = raw[j];
        if (cj === '"') { j++; while (j < raw.length && raw[j] !== '"') { if (raw[j] === '\\') j++; j++; } }
        else if (cj === '\'') { j++; while (j < raw.length && raw[j] !== '\'') { if (raw[j] === '\\') j++; j++; } }
        else if (cj === '{' || cj === '(' || cj === '[') d++;
        else if (cj === '}' || cj === ')' || cj === ']') { d--; if (d === 0) break; }
      }
      var inner = raw.slice(i + 1, j);
      // формат/выравнивание на верхнем уровне
      var dd = 0, expr = inner, fmt = null, align = null, k;
      for (k = 0; k < inner.length; k++) {
        var ck = inner[k];
        if (ck === '"') { k++; while (k < inner.length && inner[k] !== '"') k++; }
        else if (ck === '\'') { k++; while (k < inner.length && inner[k] !== '\'') k++; }
        else if (ck === '(' || ck === '[' || ck === '{') dd++;
        else if (ck === ')' || ck === ']' || ck === '}') dd--;
        else if (dd === 0 && ck === ':' && inner[k + 1] !== ':') { expr = inner.slice(0, k); fmt = inner.slice(k + 1); break; }
      }
      var am = /,\s*(-?\d+)\s*$/.exec(expr);
      if (am && (expr.slice(0, am.index).split('(').length === expr.slice(0, am.index).split(')').length)) { align = parseInt(am[1], 10); expr = expr.slice(0, am.index); }
      parts.push({ src: expr, fmt: fmt, align: align, line: line });
      i = j + 1; continue;
    }
    lit += c; i++;
  }
  flush();
  return parts;
}
X.lex = lex;
