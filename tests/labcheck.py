import sys, json
from playwright.sync_api import sync_playwright
import os, pathlib
URL=pathlib.Path(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','dist','csharp-dotnet-roadmap.html')).resolve().as_uri()
JS = r"""
() => {
  const out = [];
  const D = window.__app.LABDATA;
  for (const id of Object.keys(D)) {
    const d = D[id];
    if (d.type === 'ide' || d.type === 'ticket') {
      const r = {id, title: d.title, type: d.type};
      const run = (src) => { try { return CS.run(src + '\n' + d.tests, {entry: d.entry, timeLimit: 5000}); } catch (e) { return {errors:[{code:'JS',msg:String(e)}], tests:[]}; } };
      const st = run(d.starter);
      r.starterErrs = (st.errors||[]).map(e=>e.code+'@'+e.line+':'+e.msg).slice(0,3);
      r.starterPass = (st.tests||[]).filter(t=>t.ok).length + '/' + (st.tests||[]).length;
      r.starterRuntime = st.runtime ? st.runtime.type : null;
      if (!d.solution) { r.nosol = true; out.push(r); continue; }
      const so = run(d.solution);
      r.solErrs = (so.errors||[]).map(e=>e.code+'@'+e.line+':'+e.msg).slice(0,3);
      const tests = so.tests||[];
      r.solPass = tests.filter(t=>t.ok).length + '/' + tests.length;
      r.solFails = tests.filter(t=>!t.ok).map(t=>t.label+' exp='+t.exp+' act='+t.act).slice(0,3);
      r.solRuntime = so.runtime ? so.runtime.type+': '+so.runtime.message : (so.fatal? String(so.fatal.message||so.fatal):null);
      let rv; try { rv = CS.review(d.solution); } catch(e) { rv = {score:-1, issues:[]}; }
      r.score = rv.score; r.min = d.minscore; r.issues = rv.issues.map(i=>i.id+'@'+i.line);
      const cl = d.solution.replace(/\/\/.*$/gm,'');
      r.ruleFails = d.rules.filter(x => { let re; try{re=new RegExp(x.rx,'m')}catch(e){return true} const hit = re.test(cl); return x.forbid ? hit : !hit; }).map(x=>x.msg);
      // стартер не должен сразу проходить
      r.starterOk = (st.tests||[]).length>0 && (st.tests||[]).every(t=>t.ok) && !st.runtime && !st.fatal && !(st.errors||[]).length; try { r.starterScore = CS.review(d.starter).score; r.starterIssues = CS.review(d.starter).issues.map(i=>i.id); } catch(e){}
      const own = CS.check(d.solution); r.ownErrs = (own.errors||[]).map(e=>e.code+':'+e.msg);
      out.push(r);
    } else if (d.type === 'legacy') {
      const n = d.code.split('\n').length;
      const bad = d.bugs.filter(b => b.from < 1 || b.to > n);
      out.push({id, title: d.title, type:'legacy', lines:n, bugs:d.bugs.length, badRange: bad.length});
    } else if (d.type === 'compare') {
      const r = {id, title:d.title, type:'compare'};
      if(!d.run){r.bad={err:[]};r.good={err:[]};} else for (const k of ['bad','good']) { try { const x = CS.run(d[k], {timeLimit:3000}); r[k] = {err:(x.errors||[]).map(e=>e.code+'@'+e.line+':'+e.msg).slice(0,2), rt: x.runtime? x.runtime.type:null, outLen:(x.out||'').length}; } catch(e) { r[k] = {err:[String(e)]}; } }
      out.push(r);
    } else if (d.type === 'quiz') {
      out.push({id, title:d.title, type:'quiz', n:d.qs.length});
    } else out.push({id, type:d.type, title:d.title});
  }
  return out;
}
"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(500)
    res=pg.evaluate(JS)
    filt = sys.argv[1] if len(sys.argv)>1 else ''
    probs=0
    for r in res:
        if filt and filt not in r['id']: continue
        t=r['type']
        if t in ('ide','ticket'):
            flag=[]
            if r.get('starterErrs') and not r.get('nosol') and 'compile-ok' in r.get('title',''): pass
            if r.get('nosol'): flag.append('NO SOLUTION')
            if r.get('solErrs'): flag.append('SOL COMPILE '+str(r['solErrs']))
            if r.get('solRuntime'): flag.append('SOL RUNTIME '+r['solRuntime'])
            if r.get('solFails'): flag.append('SOL FAILS '+str(r['solFails']))
            if r.get('solPass') and r['solPass'].split('/')[0]!=r['solPass'].split('/')[1]: flag.append('SOL partial '+r['solPass'])
            if r.get('solPass','0/0').startswith('0/'): flag.append('SOL ZERO TESTS')
            if r.get('score',100) < r.get('min',0): flag.append('SCORE %s<%s %s'%(r['score'],r['min'],r['issues']))
            if r.get('ruleFails'): flag.append('RULES '+str(r['ruleFails']))
            if r.get('starterOk') and r.get('starterScore',0) >= r.get('min',0): flag.append('STARTER ALREADY PASSES score=%s'%r.get('starterScore'))
            if r.get('ownErrs'): flag.append('OWN '+str(r['ownErrs']))
            print(('FAIL ' if flag else 'ok   ')+r['id'], '| starter', r.get('starterPass'), r.get('starterErrs')[:1] if r.get('starterErrs') else '', '| sol', r.get('solPass'), 'score', r.get('score'), r.get('issues',''), ('starterScore=%s %s'%(r.get('starterScore'),r.get('starterIssues')) if r.get('starterOk') else ''))
            for f in flag: print('      !!',f)
            probs+=bool(flag)
        elif t=='legacy':
            print(('FAIL ' if r['badRange'] else 'ok   ')+r['id'],r['lines'],'lines',r['bugs'],'bugs'); probs+=bool(r['badRange'])
        elif t=='compare':
            bad = (r['bad']['err'] or r['bad'].get('rt')) and False
            e = r['bad']['err'] or r['good']['err']
            print(('FAIL ' if e else 'ok   ')+r['id'],'bad',r['bad'],'good',r['good']) if e else print('ok   '+r['id']); probs+=bool(e)
    print('blocks', len(res), 'problems', probs, 'page errors', errs)
    b.close()
