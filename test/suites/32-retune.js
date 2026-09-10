/* voice — retune, echo and the heard log */

module.exports = async function({ browser, H }){
  const R = H.results(); const { t, ok, bad } = R;
  const PAGE  = 'http://127.0.0.1:' + H.PAGE_PORT;
  const PROXY = 'http://127.0.0.1:' + H.PROXY_PORT;
  const sample = n => require('path').join(H.ROOT, 'sample-data', n);
  const shot   = n => require('path').join(__dirname, '..', 'screenshots', n);
  /* This suite is about the Scribe tier — the ear and voice pair we drive
     ourselves — so it opens without the Vapi stub and the app falls to it. */
  const p = await H.openApp(browser, {vapi:false});
  const errs = p.errs;
  await H.useProxy(p);
  t('on ElevenLabs', await p.evaluate(()=>VOICE.stt)==='eleven');

  /* ---------- A. keyterms are the spoken forms, not the sheet's prose ---------- */
  let kt = await p.evaluate(()=>keytermsFor());
  t('commands are all words a parser acts on', await p.evaluate(()=>
      CMD_TERMS.every(w=> reviewParse(w).cmd!=='none' || parse(w,'fibre').kind!=='unclear')),
      JSON.stringify(await p.evaluate(()=>CMD_TERMS.filter(w=> reviewParse(w).cmd==='none' && parse(w,'fibre').kind==='unclear'))));
  /* the term spent on a row is one of the phrases the catalogue says people use,
     never the prose printed on the sheet */
  const spoken96 = await p.evaluate(()=>{
    const r = reviewRowList().find(x=>x.code==='500CABLEAER96F');
    return r && {term: trimTerm(spokenFor(r)), desc: r.desc,
                 aliases: String(r.alias||'').split(',').map(x=>x.trim())};
  });
  /* the term spent on a row comes from what people say, not from the prose the
     sheet prints. With 388 rows the tail cannot reach every one of them, so
     what is asserted is the choice, not that this row won a slot. */
  t('catalogue aliases are used as the spoken form',
      !!spoken96 && spoken96.aliases.includes(spoken96.term) && spoken96.term!==spoken96.desc,
      JSON.stringify(spoken96));

  /* ---------- B. the rotation actually reaches the socket ---------- */
  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(400);
  await p.click('#t-cat'); await p.waitForTimeout(400);
  await p.setInputFiles('#csFile', H.fixture('KN02_Stock_Take_Witness_Count_Sample.xlsx'));
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{ $('fOrg').value='KN Circet'; $('fVan').value='202-C-8871'; });
  await p.evaluate(()=>showSheet()); await p.waitForTimeout(500);

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
    out.logged = S.vlog.slice(before).filter(e=>e.kind!=='said').length;
    out.said   = S.vlog.slice(before).filter(e=>e.kind==='said').length;
    return out;
  });
  t('the ear is shut for the whole readback', barge.earShut===true && barge.busyDuring===true, JSON.stringify(barge));
  t('anything leaking in mid-readback is dropped, not recorded', barge.logged===0, JSON.stringify(barge));
  t('the readback itself is logged, as the app talking', barge.said===1, JSON.stringify(barge));

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
  await p.click('#t-count'); await p.evaluate(()=>showMode('voice')); await p.waitForTimeout(300);
  for(const line of ['six nine metre medium poles','flibbertigibbet wotsits','five sump hole gratings','one thousand two hundred and fifty pole steps']){
    await p.evaluate(l=>onHeardFinal(l), line); await p.waitForTimeout(3000);
  }
  const all = await p.evaluate(()=>S.vlog.map(e=>({eng:e.eng, ok:e.ok, what:e.what, text:e.text, kind:e.kind||'heard', result:e.result||''})));
  const log  = all.filter(e=>e.kind!=='said');
  const said = all.filter(e=>e.kind==='said');
  t('every spoken line is logged', log.length===4, JSON.stringify(log));
  t('good lines are marked understood', log.filter(x=>x.ok).length===3, JSON.stringify(log.map(x=>x.ok+':'+x.what)));
  t('the nonsense line is marked a miss', log.some(x=>!x.ok && /flibberti/.test(x.text)), JSON.stringify(log));
  t('the engine is recorded per line', log.length===4 && log.every(x=>x.eng==='el'), JSON.stringify(log.map(x=>x.eng)));
  /* the whole point of the readback rows: which engine actually made the sound */
  t('every readback is logged too', said.length===4, JSON.stringify(said.map(x=>x.text)));
  t('and names the engine that actually spoke it',
     said.length===4 && said.every(x=>x.eng==='el' && x.what==='ElevenLabs voice'),
     JSON.stringify(said.map(x=>x.eng+':'+x.what)));
  await p.fill('#typeIn','four in home ntus'); await p.press('#typeIn','Enter'); await p.waitForTimeout(700);
  t('typing is not counted as something the ear heard',
     await p.evaluate(()=>S.vlog.filter(e=>e.kind!=='said').length)===4,
     'log grew to '+(await p.evaluate(()=>S.vlog.filter(e=>e.kind!=='said').length)));
  const st = await p.evaluate(()=>vlogStats());
  t('the hit rate is computed', st.el.n===4 && st.el.ok===3, JSON.stringify(st));
  t('readbacks are counted apart from the hit rate', st.said.el>=4 && st.said.br===0, JSON.stringify(st.said));
  await p.click('#t-cat'); await p.waitForTimeout(400);
  const box = await p.textContent('#vlogBox');
  t('the log renders with the rate', /Scribe 75% of 4/.test(box), box.slice(0,90));
  t('and says how many readbacks were the real voice', /Readbacks\s*\d+ ElevenLabs/.test(box.replace(/\s+/g,' ')), box.slice(0,160));
  const csv = await p.evaluate(()=>vlogCsv());
  const rows = await p.evaluate(()=>S.vlog.length);
  t('the CSV exports with headers and rows',
     /^when,engine,event,mode,text,understood,result,tool result/.test(csv) && csv.split('\n').length===rows+1,
     csv.split('\n')[0]);
  t('a readback is a "said" row in the CSV', /,said,/.test(csv), (csv.split('\n')[2]||'').slice(0,90));

  /* ---------- E. a blocked phone falls back loudly, and comes back ---------- */
  const blocked = await p.evaluate(async ()=>{
    const el = ttsEl();
    const real = el.play.bind(el);
    el.play = ()=>{ const e = new Error('blocked'); e.name = 'NotAllowedError'; return Promise.reject(e); };
    S.vlog = [];
    await new Promise(r=>speakThen('Nine metre pole. Six each.', ()=>r()));
    const row = S.vlog.filter(e=>e.kind==='said').pop() || {};
    const chip = $('engChip2');
    const out = {spoke:row.eng, why:row.result, what:row.what,
                 amber:/warn/.test(chip.className), chip:chip.textContent,
                 stillEleven: VOICE.tts==='eleven', note: VOICE.note};
    /* the tap that fixes it */
    el.play = real; audioPrimed = false;
    primeAudio();
    await new Promise(r=>setTimeout(r,300));
    out.greenAgain = !/warn/.test($('engChip2').className);
    out.backOnEleven = VOICE.tts==='eleven';
    return out;
  });
  t('a blocked phone still says the line, in the browser voice', blocked.spoke==='br' && blocked.what==='browser voice', JSON.stringify(blocked));
  t('and the row says why', /blocked/.test(blocked.why||''), JSON.stringify(blocked));
  t('and the chip goes amber and says what to do', blocked.amber===true && /tap the mic/.test(blocked.note||''), JSON.stringify(blocked));
  t('being blocked does not demote the voice for the session', blocked.stillEleven===true, JSON.stringify(blocked));
  t('one tap puts it back on ElevenLabs', blocked.greenAgain===true && blocked.backOnEleven===true, JSON.stringify(blocked));

  /* the cause, asserted: one element for the whole app. A fresh Audio per
     readback is the thing iOS refuses however many times the page was tapped. */
  const oneEl = await p.evaluate(async ()=>{
    const a = ttsEl();
    await new Promise(r=>speakThen('One.', ()=>r()));
    const b = ttsAudio;
    await new Promise(r=>speakThen('Two.', ()=>r()));
    return {same: a===b && b===ttsAudio, primed: audioPrimed};
  });
  t('every readback goes through the one element the tap unlocked', oneEl.same===true && oneEl.primed===true, JSON.stringify(oneEl));

  /* the app shows the model the Worker is really running, not the one we hope */
  const spec = await p.evaluate(()=>{ voiceNote(); return $('vNote').textContent; });
  t('the deployed model is shown on the Setup tab',
     /eleven_multilingual_v2/.test(spec) && /stability 0\.5/.test(spec) && /similarity 0\.8/.test(spec), spec);

  console.log('\nsockets opened:', await p.evaluate(()=>window.__sock.length));
  console.log('terms while in "'+s2.group+'":', JSON.stringify(terms2.slice(0,16)));
  console.log('\nlog:'); log.forEach(l=>console.log('  ['+l.eng+'] '+(l.ok?'✓':'✗')+' '+l.text+'  ->  '+l.what));
  const out = R.report('voice — retune, echo and the heard log', errs);
  await p.ctx.close();
  return out;
};
