/* Batch B: counts leave the phone, and what other phones did comes back.
   The promise is the order — a count is saved locally the instant it is
   spoken, with no network in the path, and the outbox carries it up when there
   is coverage. Everything here is about proving nothing is lost in between. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser);

  const signIn = async (page, who) => {
    await page.evaluate(()=>saveRole('nbi')); await page.waitForTimeout(300);
    await page.click('#t-cat'); await page.waitForTimeout(400);
    await page.fill('#cbUrl','https://demo.supabase.co');
    await page.fill('#cbKey','anon-key');
    await page.click('#cbSave'); await page.waitForTimeout(400);
    await page.evaluate(w=>{
      window.__sbData.orgs = [{id:'o-kn', name:'KN Circet'}];
      window.__sbData.profiles = [{id:w.id, name:w.name, role:w.role, org_id:'o-kn',
                                   orgs:{id:'o-kn', name:'KN Circet'}}];
      window.__sbData.books = [{id:'b-nbi', name:'NBI stock', catalogue:'fibre',
                                org_id:'o-kn', master_id:'m-nbi', orgs:{name:'KN Circet'}}];
      window.__sbData.items = [
        {master_id:'m-nbi', code:'500POLESTEP', short:'Pole Step-30 Box', long:'Pole Step-30 Box',
         group_name:'02. Poles - Accessories', unit:'each', pack:30, pack_name:'case', alias:'pole step', price:null, expected:null, is_drum:false},
        {master_id:'m-nbi', code:'500CONPOLE9M', short:'Medium Pole 9.0m', long:'Medium Pole 9.0m',
         group_name:'01. Poles', unit:'each', pack:1, pack_name:null, alias:'nine metre medium pole', price:148, expected:null, is_drum:false}];
      window.__sbData.locations = [{name:'Claremorris', da:'DA008', alias:'', org_id:'o-kn', orgs:{name:'KN Circet'}}];
      window.__sb.session = {user:{id:w.id, email:w.email}};
    }, who);
    await page.evaluate(()=>cloudResume()); await page.waitForTimeout(700);
  };
  await signIn(p, {id:'u-1', name:'Seán M', role:'counter', email:'sean@kncircet.ie'});
  t('signed in with a book', await p.evaluate(()=>CLOUD.on && !!CLOUD.book), await p.evaluate(()=>CLOUD.on));

  /* ---------- A. a count is local first, always ---------- */
  const offline = await p.evaluate(async ()=>{
    Object.defineProperty(navigator, 'onLine', {configurable:true, get:()=>false});
    window.dispatchEvent(new Event('offline'));
    setLoc('Claremorris'); PTYPE=''; syncPlaceUI();
    startSession();
    const t0 = Date.now();
    writeLine(item('fibre','500POLESTEP'), 10, 'each', null, 'ten pole steps');
    writeLine(item('fibre','500CONPOLE9M'), 6, 'each', null, 'six nine metre medium poles');
    const took = Date.now() - t0;
    return {lines:cur().lines.length, took, queued:outbox().length,
            onServer:(window.__sbData.lines||[]).length,
            state:$('syncState').textContent, cls:$('syncState').className};
  });
  t('with no signal the count still lands, on the phone', offline.lines===2, JSON.stringify(offline.lines));
  t('and nothing waited on the network to do it', offline.took < 200, offline.took+'ms');
  t('nothing reached the server', offline.onServer===0, String(offline.onServer));
  /* the queue holds three entries — two lines and the session they belong to —
     but the counter said two lines, so two is the number they are shown */
  t('but it is queued, and the counter can see how many',
     offline.queued===3 && /^2 lines waiting — no signal/.test(offline.state),
     JSON.stringify({q:offline.queued, s:offline.state}));

  /* ---------- B. coverage comes back ---------- */
  const back = await p.evaluate(async ()=>{
    Object.defineProperty(navigator, 'onLine', {configurable:true, get:()=>true});
    window.dispatchEvent(new Event('online'));
    await new Promise(r=>setTimeout(r,900));
    return {queued:outbox().length,
            sessions:(window.__sbData.sessions||[]).length,
            lines:(window.__sbData.lines||[]).map(l=>l.code+':'+l.qty),
            rpc:window.__sb.rpc.map(r=>r.name),
            state:$('syncState').textContent};
  });
  t('coming back into coverage empties the outbox', back.queued===0, String(back.queued));
  t('the session goes up before its lines',
     back.rpc.indexOf('push_sessions') < back.rpc.indexOf('push_lines'), JSON.stringify(back.rpc));
  t('and both lines are on the server',
     back.sessions===1 && back.lines.join()==='500POLESTEP:10,500CONPOLE9M:6', JSON.stringify(back.lines));
  t('the counter is told', /All uploaded/.test(back.state), back.state);

  /* pushing the same rows again is an upsert, not a second copy */
  const again = await p.evaluate(async ()=>{
    const s = S.sessions[0] || cur();
    s.lines.forEach(l=>queueLine(s,l));
    await cloudFlush();
    return {lines:(window.__sbData.lines||[]).length, queued:outbox().length};
  });
  t('sending a line twice is the same line, not two', again.lines===2 && again.queued===0, JSON.stringify(again));

  /* ---------- C. a removal travels as a tombstone ---------- */
  const gone = await p.evaluate(async ()=>{
    const s = cur() || S.sessions[0];
    const l = s.lines[0];
    await removeLine(s.id, l.id);
    await cloudFlush();
    const row = (window.__sbData.lines||[]).find(x=>x.uid===l.uid);
    return {local:s.lines.length, stillThere:!!row, removed:!!(row&&row.removed_at)};
  });
  t('removing a line keeps the row and marks it, so another phone can learn it went',
     gone.local===1 && gone.stillThere===true && gone.removed===true, JSON.stringify(gone));

  /* ---------- D. what the other phone did comes back ---------- */
  const other = await p.evaluate(async ()=>{
    window.__sbData.sessions.push({uid:'11111111-1111-4111-8111-111111111111',
      book_id:'b-nbi', container:'', ctype:'', counted_name:'Aoife K', device_id:'other-phone',
      location_name:'Claremorris', da:'DA008', job_name:'', started_at:new Date().toISOString(),
      finished_at:new Date().toISOString(), updated_at:new Date().toISOString()});
    window.__sbData.lines.push({uid:'22222222-2222-4222-8222-222222222222',
      session_uid:'11111111-1111-4111-8111-111111111111', code:'500CONPOLE9M', qty:12,
      unit:'each', spot:'', drum_id:null, raw:null, engine:'Vapi',
      said_at:new Date().toISOString(), device_id:'other-phone', removed_at:null,
      updated_at:new Date().toISOString()});
    await cloudPullCounts();
    const s = (S.sessions||[]).find(x=>x.uid==='11111111-1111-4111-8111-111111111111');
    return {found:!!s, by:s&&s.by, loc:s&&s.loc, lines:s&&s.lines.map(l=>l.code+':'+l.qty+':'+l.eng)};
  });
  t('the other phone\'s count arrives', other.found===true && other.by==='Aoife K', JSON.stringify(other));
  t('with its location, its lines and the engine that heard them',
     other.loc==='Claremorris' && other.lines.join()==='500CONPOLE9M:12:Vapi', JSON.stringify(other.lines));

  /* it does not come back to the phone that made it — that copy is newer */
  const mine = await p.evaluate(async ()=>{
    const before = (S.sessions||[]).length + (cur()?1:0);
    S.syncAt = {};
    await cloudPullCounts();
    return {before, after:(S.sessions||[]).length + (cur()?1:0)};
  });
  t('and this phone\'s own counts do not come back as copies of themselves',
     mine.after===mine.before, JSON.stringify(mine));

  /* ---------- E. a failure keeps the work ---------- */
  const failed = await p.evaluate(async ()=>{
    window.__sbFail = {push_lines:'permission denied'};
    const s = cur() || S.sessions[0];
    writeLine(item('fibre','500POLESTEP'), 4, 'each', null, 'four pole steps');
    await cloudFlush();
    const held = outbox().length, note = $('syncState').textContent;
    window.__sbFail = null;
    await cloudFlush();
    return {held, note, after:outbox().length,
            onServer:(window.__sbData.lines||[]).filter(l=>l.qty===4).length};
  });
  t('a refused push keeps the line in the outbox rather than dropping it',
     failed.held>0 && /waiting to upload/.test(failed.note), JSON.stringify({h:failed.held, n:failed.note}));
  t('and the next attempt gets it up', failed.after===0 && failed.onServer===1, JSON.stringify(failed));

  /* ---------- F. the voice settings come with the account ---------- */
  const vs = await p.evaluate(async ()=>{
    window.__sbData.org_settings = [{org_id:'o-kn', voice:{proxy:'https://w.example', token:'tok',
      agentId:'aefc0a29-6dc2-41ec-be44-254316db923c', llm:'openai/gpt-4.1', prefer:'auto', talk:'push'}}];
    S.voice = {proxy:'', token:'', prefer:'auto'};
    await cloudPullSettings();
    return {proxy:voiceCfg().proxy, llm:voiceCfg().llm, note:$('vNote').textContent};
  });
  t('a new phone gets the voice engine settings from the organisation',
     vs.proxy==='https://w.example' && vs.llm==='openai/gpt-4.1', JSON.stringify(vs));
  t('and it says where they came from', /came with your account/.test(vs.note), vs.note.slice(-60));

  const cant = await p.evaluate(()=>({
    hidden:$('vOrgSave').classList.contains('hidden'), disabled:$('vOrgSave').disabled, role:cloudRole()}));
  t('a counter cannot set them for everybody',
     cant.hidden===false && cant.disabled===true && cant.role==='counter', JSON.stringify(cant));

  const can = await p.evaluate(async ()=>{
    CLOUD.profile.role = 'admin'; voiceNote();
    const off = $('vOrgSave').disabled;
    S.voice.llm = 'openai/gpt-5';
    await cloudPushSettings();
    const row = (window.__sbData.org_settings||[]).find(r=>r.org_id==='o-kn');
    CLOUD.profile.role = 'counter';
    return {off, saved: row && row.voice && row.voice.llm};
  });
  t('an admin can, and it lands on the organisation', can.off===false && can.saved==='openai/gpt-5', JSON.stringify(can));

  const out = R.report('sync — local first, outbox out, other phones in', p.errs);
  await p.ctx.close();
  return out;
};
