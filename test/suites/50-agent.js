/* ElevenLabs Agents: the tier, the tools, and the rule that the agent can only
   touch data through them. */
module.exports = async function({ browser, H }){
  const R = H.results();
  const t = R.t;
  const page = await H.openApp(browser);

  t('the SDK exposes Conversation', await page.evaluate(()=>!!(window.ElevenLabsClient && ElevenLabsClient.Conversation)));

  /* ---- the three tiers ---- */
  await H.useProxy(page, {agentId:'agent_test123'});
  const tier = await page.evaluate(()=>({stt:VOICE.stt, chip:$('engChip').textContent, cls:$('engChip').className}));
  t('an agent id gives Voice: Agent, green', tier.stt==='agent' && /Voice: Agent/.test(tier.chip) && / el\b/.test(tier.cls), JSON.stringify(tier));

  await page.evaluate(()=>{ S.voice.agentId=''; save(); return probeVoice(); });
  await page.waitForTimeout(700);
  t('no agent id falls to Scribe, still green',
    await page.evaluate(()=>VOICE.stt)==='eleven' && /Voice: Scribe/.test(await page.evaluate(()=>$('engChip').textContent)),
    await page.evaluate(()=>$('engChip').textContent));

  const amber = await page.evaluate(async ()=>{
    const keep = window.ElevenLabsClient; window.ElevenLabsClient = undefined;
    S.voice.agentId='agent_test123'; save(); await probeVoice();
    const r = {stt:VOICE.stt, chip:$('engChip').textContent, cls:$('engChip').className};
    window.ElevenLabsClient = keep; return r;
  });
  t('an agent configured but no SDK goes amber, on Scribe',
    amber.stt==='eleven' && /warn/.test(amber.cls) && /SDK did not load/.test(amber.chip), JSON.stringify(amber));
  await page.evaluate(()=>probeVoice()); await page.waitForTimeout(700);

  /* ---- find_item ---- */
  const find = await page.evaluate(()=>AGENT_TOOLS.find_item({spoken_text:'nine metre poles'}));
  t('find_item returns candidates with a confidence',
    find.found===true && find.candidates[0].code==='POLE-9' && find.candidates[0].confidence>0, JSON.stringify(find).slice(0,140));
  t('find_item returns at most three',
    (await page.evaluate(()=>AGENT_TOOLS.find_item({spoken_text:'fibre'}))).candidates.length<=3);
  const none = await page.evaluate(()=>AGENT_TOOLS.find_item({spoken_text:'flibbertigibbet'}));
  t('find_item says none rather than guessing', none.found===false && none.candidates.length===0, JSON.stringify(none));
  const weak = await page.evaluate(()=>AGENT_TOOLS.find_item({spoken_text:'ml pole bolt'}));
  t('a weak match is flagged not confident', weak.found===true && weak.confident===false, JSON.stringify(weak).slice(0,120));

  /* ---- record_count ---- */
  await page.evaluate(()=>{ $('setup').classList.add('hidden'); SPOT='Shelf A1'; });
  const rec = await page.evaluate(()=>AGENT_TOOLS.record_count({item_code:'POLE-9', quantity:12, unit_as_spoken:'each'}));
  t('record_count writes a line and returns the readback',
    rec.recorded===true && rec.short_name==='9m pole' && rec.quantity===12 && !!rec.line_id, JSON.stringify(rec));
  const conv = await page.evaluate(()=>AGENT_TOOLS.record_count({item_code:'FIB-96F', quantity:3, unit_as_spoken:'drums'}));
  t('the app converts the unit, not the agent', conv.recorded===true && /drum/.test(conv.uom), JSON.stringify(conv));
  t('an unknown item code is refused, not invented',
    (await page.evaluate(()=>AGENT_TOOLS.record_count({item_code:'NOPE', quantity:1, unit_as_spoken:'each'}))).error!=null);
  t('a non-numeric quantity is refused',
    (await page.evaluate(()=>AGENT_TOOLS.record_count({item_code:'POLE-9', quantity:'lots', unit_as_spoken:'each'}))).error!=null);

  /* ---- the rest ---- */
  const before = await page.evaluate(()=>cur().lines.length);
  const un = await page.evaluate(()=>AGENT_TOOLS.undo_last());
  t('undo_last removes the last line and names it',
    un.removed===true && (await page.evaluate(()=>cur().lines.length))===before-1, JSON.stringify(un));

  const tot = await page.evaluate(()=>AGENT_TOOLS.read_total());
  t('read_total returns lines, items and a real value',
    tot.lines>0 && tot.items>0 && /^€[\d,]+\.\d\d$/.test(tot.value), JSON.stringify(tot).slice(0,150));

  const pz = await page.evaluate(async ()=>{ await AGENT_TOOLS.pause(); const a=PAUSED;
    await AGENT_TOOLS.resume(); return {a, b:PAUSED}; });
  t('pause and resume work as tools', pz.a===true && pz.b===false, JSON.stringify(pz));

  await page.evaluate(()=>{ S.locs={fibre:[{name:'Claremorris',da:'DA008',org:$('fOrg').value},
                                           {name:'Castlebar',da:'DA005',org:$('fOrg').value}]}; save(); });
  const loc = await page.evaluate(()=>AGENT_TOOLS.set_location({spoken_text:'Claremorris'}));
  t('set_location matches the uploaded list', loc.set===true && loc.location==='Claremorris' && loc.da==='DA008', JSON.stringify(loc));
  const near = await page.evaluate(()=>AGENT_TOOLS.set_location({spoken_text:'Claremoris'}));
  t('a near miss comes back as candidates, not a guess', near.set===false && near.candidates.length>0, JSON.stringify(near));
  const no = await page.evaluate(()=>AGENT_TOOLS.set_location({spoken_text:'Timbuktu'}));
  t('set_location never creates one', no.set===false && (await page.evaluate(()=>S.locs.fibre.length))===2, JSON.stringify(no));

  /* ---- logging ---- */
  const log = await page.evaluate(()=>S.vlog.filter(e=>e.kind==='tool').map(e=>({what:e.what,res:e.result,t:!!e.t,eng:e.eng})));
  t('every tool call is logged with its result and a timestamp',
    log.length>=10 && log.every(x=>x.t && x.eng==='ag' && x.res), 'n=' + log.length);
  t('the CSV carries the tool column',
    /^when,engine,event,mode,text,understood,result,tool result/.test(await page.evaluate(()=>vlogCsv())));

  /* ---- the agent owns the voice and the mic ---- */
  const owns = await page.evaluate(async ()=>{
    AGENT.on = true;
    let spoke = false;
    const keep = window.browserSpeak; window.browserSpeak = ()=>{ spoke = true; };
    await new Promise(r=>speakThen('this must not be spoken', ()=>r()));
    window.browserSpeak = keep;
    const b4 = TURN; wantListen = true; openEar(); const after = TURN; wantListen = false;
    AGENT.on = false;
    return {spoke, b4, after};
  });
  t('nothing else speaks while the agent runs', owns.spoke===false, JSON.stringify(owns));
  t('nothing else opens the microphone either', owns.after===owns.b4, JSON.stringify(owns));

  /* ---- the fallback keyterm cap still holds ---- */
  const kt = await page.evaluate(()=>keytermsFor());
  t('the fallback keyterm list stays within 50 x 20 characters',
    kt.length<=50 && kt.every(x=>x.length<=20), 'n=' + kt.length);

  const out = R.report('agent — tiers, tools and ownership', page.errs);
  await page.ctx.close();
  return out;
};
