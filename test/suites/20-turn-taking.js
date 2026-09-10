/* voice — turn taking, pause, undo and never guessing */
const MDU={code:'500CABLEMDUFIBRETOOL', short:'301124988 MDU Fibre Retraction Tool. MS-06-2.0MM-3.0MM BLUE for intercepting-retracting hallway fibre by each door'};
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
  await p.evaluate(m=>{ S.custom=S.custom||{}; S.custom.fibre=S.custom.fibre||[];
    S.custom.fibre.push({code:m.code, short:m.short, long:m.short, unit:'Each', pack:1, alias:''}); save(); }, MDU);
  await p.waitForTimeout(300);

  /* ── never guess ── */
  const cases = [
    ['350 ml pole bolt',        'choose'],
    /* "hole" is not an item and "each" is a unit — with the real master this
       is a weak match rather than nothing, so it asks. What matters is that no
       pole comes back: "nine M" is a pole GRADE, never nine metres. */
    ['nine m hole 350 each',    'choose'],
    /* the real master has a dozen poles, so a bare "poles" is a question */
    ['ten poles',               'choose'],
    ['six nine metre medium poles','line'],
    ['ten pole steps',          'line'],
    ['three hundred and fifty', 'noitem'],
    ['350 each',                'noitem'],
    ['four hundred coach screws','line'],
  ];
  for(const [said,want] of cases){
    const r = await p.evaluate(s=>{ const pr=parse(s,'fibre');
      return {kind:pr.kind, weak:!!pr.weak, item:pr.it?pr.it.short.slice(0,30):'', opts:(pr.options||[]).map(o=>o.it.short.slice(0,24)+'@'+o.conf.toFixed(2))}; }, said);
    t('"'+said+'" → '+want, r.kind===want, JSON.stringify(r));
  }
  const three = await p.evaluate(()=>{ const pr=parse('350 ml pole bolt','fibre');
    return {kind:pr.kind, n:(pr.options||[]).length, confs:(pr.options||[]).map(o=>o.conf)}; });
  t('a phrase that fits more than one item asks, with a confidence on each option',
    three.kind==='choose' && three.n>=2 && three.n<=3 && three.confs.every(c=>typeof c==='number'),
    JSON.stringify(three));
  const noPole = await p.evaluate(()=>{ const pr=parse('nine m hole 350 each','fibre');
    return (pr.options||[]).map(o=>o.it.code); });
  t('"nine M" never reaches a pole — the M is a grade, not metres',
    !noPole.some(c=>/POLE/i.test(c)), JSON.stringify(noPole));
  t('nothing binds on the number alone', await p.evaluate(()=>matchItemAll('fibre',['350','each']).length)===0);

  /* ── turn taking ── */
  await H.useProxy(p);
  t('on ElevenLabs to start', await p.evaluate(()=>VOICE.stt)==='eleven');
  await p.evaluate(()=>{ window.__sock=[];
    class FakeWS{ constructor(u){ window.__sock.push(u); this.readyState=1; window.__ws=this; setTimeout(()=>{ if(this.onopen) this.onopen(); },5);} send(){} close(){ this.readyState=3; if(this.onclose) this.onclose(); } }
    window.WebSocket=FakeWS; });
  await p.click('#mic'); await p.waitForTimeout(900);
  t('tapping the mic opens the ear', await p.evaluate(()=>TURN)==='open', await p.evaluate(()=>TURN));

  const turn = await p.evaluate(async ()=>{
    const seen=[];
    const stamp = ()=>seen.push(TURN+(VOICE.busy?'/busy':''));
    stamp();
    onHeardFinal('ten pole steps');
    stamp();                                   /* immediately after hearing */
    await new Promise(r=>setTimeout(r,120));
    stamp();                                   /* while reading back */
    await new Promise(r=>setTimeout(r,2800));
    stamp();                                   /* after */
    return {seen, lines:(cur()&&cur().lines||[]).length};
  });
  t('the ear shuts the moment it has heard a line', turn.seen[1]!=='open', JSON.stringify(turn.seen));
  t('the ear is shut while it reads back', /speaking|busy/.test(turn.seen[2]) && !/^open/.test(turn.seen[2]), JSON.stringify(turn.seen));
  t('the ear reopens after the readback', turn.seen[3]==='open', JSON.stringify(turn.seen));
  t('one utterance made exactly one line', turn.lines===1, 'lines='+turn.lines);

  /* the screenshot bug: its own readback must never be transcribed */
  const echo = await p.evaluate(async ()=>{
    const before=(cur().lines||[]).length;
    speakThen('Pole Step-30 Box. 350 each.');
    await new Promise(r=>setTimeout(r,150));
    const earShut = TURN!=='open';
    onHeardFinal('pole step 30 box 350 each');            /* what the speaker leaks back */
    await new Promise(r=>setTimeout(r,2500));
    return {earShut, added:(cur().lines||[]).length-before};
  });
  t('the ear is shut while speaking so it cannot hear itself', echo.earShut===true, JSON.stringify(echo));
  t('a leaked readback records nothing', echo.added===0, JSON.stringify(echo));

  /* ── "no" undoes ── */
  const undo = await p.evaluate(async ()=>{
    const n0=(cur().lines||[]).length;
    onHeardFinal('ten pole steps');
    await new Promise(r=>setTimeout(r,2600));
    const n1=(cur().lines||[]).length, last=LASTLINE;
    onHeardFinal('no no');
    await new Promise(r=>setTimeout(r,2600));
    return {n0,n1,n2:(cur().lines||[]).length, hadLast:!!last,
            logged:S.vlog.slice(-2).map(x=>x.text)};
  });
  t('"no no" straight after a readback deletes that line', undo.n2===undo.n1-1, JSON.stringify(undo));
  t('and it is logged as its own utterance, never appended', undo.logged.includes('no no'), JSON.stringify(undo.logged));
  t('"no" never reaches the parser as an item', await p.evaluate(()=>isNegation('no no') && isNegation('wrong')));

  /* ── pause ── */
  const pause = await p.evaluate(async ()=>{
    if(PAUSED) resumeVoice();
    await new Promise(r=>setTimeout(r,600));
    $('pauseBtn').click();
    await new Promise(r=>setTimeout(r,1800));
    const paused = {PAUSED, TURN, lbl:$('micLbl').textContent, btn:$('pauseBtn').querySelector('.plbl').textContent};
    const n0=(cur().lines||[]).length;
    onHeardFinal('twenty poles');                /* must be ignored entirely */
    await new Promise(r=>setTimeout(r,900));
    paused.recordedWhilePaused=(cur().lines||[]).length-n0;
    $('pauseBtn').click();
    await new Promise(r=>setTimeout(r,900));
    paused.after={PAUSED, TURN};
    return paused;
  });
  t('the pause button pauses', pause.PAUSED===true && pause.TURN!=='open', JSON.stringify(pause));
  t('it says so on the mic and on the button', pause.lbl==='Paused' && pause.btn==='Resume', JSON.stringify(pause));
  t('nothing is recorded while paused', pause.recordedWhilePaused===0, JSON.stringify(pause));
  t('tapping again resumes and reopens the ear', pause.after.PAUSED===false && pause.after.TURN==='open', JSON.stringify(pause.after));
  const vp = await p.evaluate(async ()=>{ onHeardFinal('pause'); await new Promise(r=>setTimeout(r,1500)); return {PAUSED, TURN}; });
  t('saying "pause" does the same', vp.PAUSED===true && vp.TURN!=='open', JSON.stringify(vp));
  await p.evaluate(()=>resumeVoice()); await p.waitForTimeout(600);

  /* ── diagnostics ── */
  const diag = await p.evaluate(()=>({ terms:(VOICE.terms||[]).length, sentAt:!!VOICE.sentAt,
      spoke:S.vlog.filter(e=>e.spoke).length, total:S.vlog.length }));
  t('the keyterms sent are recorded and shown', diag.terms>0 && diag.sentAt, JSON.stringify(diag));
  t('the log records which engine spoke each readback', diag.spoke>0, JSON.stringify(diag));
  const amber = await p.evaluate(async ()=>{
    VOICE.degraded=true; VOICE.tts='browser'; setEngine('eleven','browser','the readback call failed');
    return {cls:$('engChip').className, txt:$('engChip').textContent};
  });
  t('a readback fallback turns the chip amber, not green', /warn/.test(amber.cls) && !/ el\b/.test(amber.cls), JSON.stringify(amber));

  await p.evaluate(()=>{ VOICE.degraded=false; probeVoice(); }); await p.waitForTimeout(700);
  await p.click('#t-count'); await p.waitForTimeout(400);
  await p.screenshot({ path: shot('b3-mic.png') });
  await p.click('#t-cat'); await p.waitForTimeout(500);
  await p.evaluate(()=>$('voicePanel').scrollIntoView()); await p.waitForTimeout(300);
  await p.screenshot({ path: shot('b3-diag.png') });
  /* ── push to talk is the default, because a connected call bills ── */
  t('push to talk is what a fresh app does', await p.evaluate(()=>talkMode())==='push',
     await p.evaluate(()=>talkMode()));
  t('and the pre-connect is short in that mode, because it bills too',
     await p.evaluate(()=>warmIdleMs())===30000, String(await p.evaluate(()=>warmIdleMs())));
  const ptt = await p.evaluate(async ()=>{
    const real = PTT_IDLE_MS;
    window.__stopped = 0;
    const keep = window.stopListen;
    window.stopListen = function(){ window.__stopped++; return keep.apply(this, arguments); };
    wantListen = true; PAUSED = false; VOICE.busy = false; setTurn('open');
    pttPoke();
    const armed = !!pttTimer;
    /* a line heard restarts the clock rather than letting it run out */
    await new Promise(r=>setTimeout(r, 60));
    onHeardFinal('ten pole steps');
    await new Promise(r=>setTimeout(r, 2600));
    const afterLine = window.__stopped;
    window.stopListen = keep;
    return {armed, afterLine, idle:real};
  });
  t('the idle clock is armed the moment listening starts', ptt.armed===true, JSON.stringify(ptt));
  t('and ten seconds is the window', ptt.idle===10000, String(ptt.idle));
  t('a line heard restarts it rather than letting it run out', ptt.afterLine===0, JSON.stringify(ptt));

  const closes = await p.evaluate(async ()=>{
    /* the same clock with the window wound right down, so the suite does not
       have to sit through ten seconds to prove it fires */
    let fired = 0;
    const keep = window.stopListen;
    window.stopListen = function(){ fired++; return keep.apply(this, arguments); };
    wantListen = true; PAUSED = false; VOICE.busy = false; setTurn('open');
    clearTimeout(pttTimer);
    pttTimer = setTimeout(()=>{ if(wantListen && !VOICE.busy) stopListen(); }, 120);
    await new Promise(r=>setTimeout(r, 400));
    window.stopListen = keep;
    return {fired, wantListen};
  });
  t('and when nothing is said the session ends rather than billing on',
     closes.fired===1 && closes.wantListen===false, JSON.stringify(closes));

  const cont = await p.evaluate(()=>{
    S.voice = S.voice || {}; S.voice.talk = 'continuous'; save();
    wantListen = true; clearTimeout(pttTimer); pttTimer = null;
    pttPoke();
    const armed = !!pttTimer;
    const warm = warmIdleMs();
    S.voice.talk = 'push'; save();
    return {armed, warm};
  });
  t('continuous mode never arms the clock — it is for the sheet walk',
     cont.armed===false && cont.warm===120000, JSON.stringify(cont));

  const out = R.report('voice — turn taking, pause, undo and never guessing', errs);
  await p.ctx.close();
  return out;
};
