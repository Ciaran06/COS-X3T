/* voice — retune, echo and the heard log */

module.exports = async function({ browser, H }){
  const R = H.results(); const { t, ok, bad } = R;
  const PAGE  = 'http://127.0.0.1:' + H.PAGE_PORT;
  const PROXY = 'http://127.0.0.1:' + H.PROXY_PORT;
  const sample = n => require('path').join(H.ROOT, 'sample-data', n);
  const shot   = n => require('path').join(__dirname, '..', 'screenshots', n);
  const p = await H.openApp(browser);
  const errs = p.errs;
  await H.useProxy(p);
  t('on ElevenLabs', await p.evaluate(()=>VOICE.stt)==='eleven');

  /* ---------- A. keyterms are the spoken forms, not the sheet's prose ---------- */
  let kt = await p.evaluate(()=>keytermsFor());
  t('commands are all words a parser acts on', await p.evaluate(()=>
      CMD_TERMS.every(w=> reviewParse(w).cmd!=='none' || parse(w,'fibre').kind!=='unclear')),
      JSON.stringify(await p.evaluate(()=>CMD_TERMS.filter(w=> reviewParse(w).cmd==='none' && parse(w,'fibre').kind==='unclear'))));
  t('catalogue aliases are used as the spoken form', kt.includes('ninety six fibre'),
      JSON.stringify(kt.filter(x=>/fibre/i.test(x))));

  /* ---------- B. the rotation actually reaches the socket ---------- */
  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(400);
  await p.click('#t-cat'); await p.waitForTimeout(400);
  await p.setInputFiles('#csFile', H.fixture('KN02_Stock_Take_Witness_Count_Sample.xlsx'));
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{ $('fOrg').value='KN Circet'; $('fVan').value='202-C-8871'; });
  await p.click('#t-sheet'); await p.waitForTimeout(500);

  /* record every socket URL the app opens */
  await p.evaluate(()=>{
    window.__sock=[];
    const W = window.WebSocket;
    window.WebSocket = function(u,pr){ window.__sock.push(u); const w = new W(u,pr); return w; };
    window.WebSocket.prototype = W.prototype;
    Object.assign(window.WebSocket, {OPEN:1, CLOSED:3, CONNECTING:0, CLOSING:2});
  });
  /* make the socket succeed locally so a live session can be observed */
  await p.evaluate(()=>{
    window.__fake=[];
    class FakeWS {
      constructor(u){ window.__sock.push(u); this.url=u; this.readyState=1; window.__fake.push(this);
        setTimeout(()=>{ if(this.onopen) this.onopen(); }, 5); }
      send(){}
      close(){ this.readyState=3; if(this.onclose) this.onclose(); }
    }
    window.WebSocket = FakeWS;
  });

  await p.evaluate(()=>reviewStart('all', false));
  await p.waitForTimeout(2000);
  const s1 = await p.evaluate(()=>({n:window.__sock.length, sig:VOICE.sig, group:(reviewRow()||{}).group}));
  t('a socket opened for the walk', s1.n>=1, JSON.stringify(s1));
  const terms1 = new URL(await p.evaluate(()=>window.__sock[window.__sock.length-1])).searchParams.getAll('keyterms');
  t('the walked group is boosted at open', terms1.some(x=>/pole/i.test(x)), JSON.stringify(terms1.slice(0,12)));

  /* walk into the next group */
  await p.evaluate(async ()=>{
    const g0 = reviewRow().group;
    for(let i=0;i<400 && reviewRow() && reviewRow().group===g0;i++) reviewMove(1);
  });
  await p.waitForTimeout(3000);
  const s2 = await p.evaluate(()=>({n:window.__sock.length, group:(reviewRow()||{}).group}));
  t('crossing into a new group reopens the socket', s2.n>s1.n, JSON.stringify({before:s1, after:s2}));
  const terms2 = new URL(await p.evaluate(()=>window.__sock[window.__sock.length-1])).searchParams.getAll('keyterms');
  t('the new group is now boosted', JSON.stringify(terms1)!==JSON.stringify(terms2) && terms2.some(x=>/hanger|screw/i.test(x)),
      JSON.stringify(terms2.slice(0,12)));
  t('still within the API limits after retune', terms2.length<=50 && terms2.every(x=>x.length<=20), 'n='+terms2.length);

  /* The ear now reopens after every readback, so socket count is no longer the
     measure — what must not change inside a group is the boosted vocabulary. */
  const sigBefore = await p.evaluate(()=>VOICE.sig);
  await p.evaluate(()=>{ const g=reviewRow().group; if(reviewWalk()[reviewSaved().idx+1] && reviewWalk()[reviewSaved().idx+1].group===g) reviewMove(1); });
  await p.waitForTimeout(2500);
  const terms3 = new URL(await p.evaluate(()=>window.__sock[window.__sock.length-1])).searchParams.getAll('keyterms');
  /* The signature tracks the group, so no reconnect is forced inside one. The
     cursor window still slides row to row and is picked up free, because the
     ear reopens after every readback anyway. */
  t('moving within a group forces no reconnect', await p.evaluate(()=>VOICE.sig)===sigBefore, 'sig '+sigBefore);
  t('the group being walked stays boosted as the cursor moves',
     terms3.length<=50 && terms3.slice(0,7).join()===terms2.slice(0,7).join() && terms3.some(x=>/hanger|screw/i.test(x)),
     JSON.stringify(terms3.slice(0,18)));

  /* ---------- C. barge-in ---------- */
  const echo = await p.evaluate(()=>{
    SPEAK={text:'9m creosote pole — currently 12 each', cut:false};
    return {selfEcho:isEcho('nine m creosote pole currently 12 each'),
            partialEcho:isEcho('creosote pole currently'),
            command:isEcho('zero'),
            realCount:isEcho('four hundred and fifty metres'),
            twoWord:isEcho('next one')};
  });
  t('our own readback is recognised as echo', echo.selfEcho===true, JSON.stringify(echo));
  t('a fragment of it is echo too', echo.partialEcho===true, JSON.stringify(echo));
  t('a one-word command is not echo', echo.command===false, JSON.stringify(echo));
  t('a real count is not echo', echo.realCount===false, JSON.stringify(echo));

  /* Microphone barge-in is gone on purpose: the ear is shut while we speak, so
     a readback can never be transcribed. Anything that does leak in is dropped. */
  const barge = await p.evaluate(async ()=>{
    const out={};
    const before = S.vlog.length;
    speakThen('9m creosote pole. 12 each.');
    await new Promise(r=>setTimeout(r,120));
    out.earShut = TURN!=='open';
    out.busyDuring = VOICE.busy;
    onHeardFinal('four hundred and fifty');      /* leaked out of the speaker */
    await new Promise(r=>setTimeout(r,2500));
    out.logged = S.vlog.length - before;
    return out;
  });
  t('the ear is shut for the whole readback', barge.earShut===true && barge.busyDuring===true, JSON.stringify(barge));
  t('anything leaking in mid-readback is dropped, not recorded', barge.logged===0, JSON.stringify(barge));

  /* tapping the mic is how you interrupt now */
  const tap = await p.evaluate(async ()=>{
    speakThen('A long readback that should be cut short by a tap.');
    await new Promise(r=>setTimeout(r,120));
    const wasBusy = VOICE.busy;
    $('mic').click();
    await new Promise(r=>setTimeout(r,600));
    return {wasBusy, busyAfter:VOICE.busy};
  });
  t('tapping the mic mid-readback stops it talking', tap.wasBusy===true && tap.busyAfter===false, JSON.stringify(tap));

  /* ---------- D. the log ---------- */
  await p.evaluate(()=>{ reviewStop(); S.vlog=[]; save(); });
  await p.click('#t-count'); await p.waitForTimeout(300);
  for(const line of ['six nine metre poles','flibbertigibbet wotsits','two manhole covers','one thousand two hundred and fifty fixing screws']){
    await p.evaluate(l=>onHeardFinal(l), line); await p.waitForTimeout(3000);
  }
  const log = await p.evaluate(()=>S.vlog.map(e=>({eng:e.eng, ok:e.ok, what:e.what, text:e.text})));
  t('every spoken line is logged', log.length===4, JSON.stringify(log));
  t('good lines are marked understood', log.filter(x=>x.ok).length===3, JSON.stringify(log.map(x=>x.ok+':'+x.what)));
  t('the nonsense line is marked a miss', log.some(x=>!x.ok && /flibberti/.test(x.text)), JSON.stringify(log));
  t('the engine is recorded per line', log.length===4 && log.every(x=>x.eng==='el'), JSON.stringify(log.map(x=>x.eng)));
  await p.fill('#typeIn','four connection kits'); await p.press('#typeIn','Enter'); await p.waitForTimeout(700);
  t('typing is not counted as something the ear heard', await p.evaluate(()=>S.vlog.length)===4,
     'log grew to '+(await p.evaluate(()=>S.vlog.length)));
  const st = await p.evaluate(()=>vlogStats());
  t('the hit rate is computed', st.el.n===4 && st.el.ok===3, JSON.stringify(st));
  await p.click('#t-cat'); await p.waitForTimeout(400);
  const box = await p.textContent('#vlogBox');
  t('the log renders with the rate', /Scribe 75% of 4/.test(box), box.slice(0,90));
  const csv = await p.evaluate(()=>vlogCsv());
  t('the CSV exports with headers and rows',
     /^when,engine,event,mode,text,understood,result,tool result/.test(csv) && csv.split('\n').length===5,
     csv.split('\n')[0]);

  console.log('\nsockets opened:', await p.evaluate(()=>window.__sock.length));
  console.log('terms while in "'+s2.group+'":', JSON.stringify(terms2.slice(0,16)));
  console.log('\nlog:'); log.forEach(l=>console.log('  ['+l.eng+'] '+(l.ok?'✓':'✗')+' '+l.text+'  ->  '+l.what));
  const out = R.report('voice — retune, echo and the heard log', errs);
  await p.ctx.close();
  return out;
};
