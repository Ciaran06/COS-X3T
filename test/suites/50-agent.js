/* Vapi: the tier, the tools, and the rule that the agent can only touch data
   through them. */
module.exports = async function({ browser, H }){
  const R = H.results();
  const t = R.t;
  const page = await H.openApp(browser);

  t('the SDK is there', await page.evaluate(()=>typeof window.Vapi==='function'));
  t('the public key and assistant id ship in the page',
    await page.evaluate(()=>/^[0-9a-f-]{36}$/.test(VAPI_PUBLIC_KEY) && agentId()==='aefc0a29-6dc2-41ec-be44-254316db923c'),
    await page.evaluate(()=>agentId()));

  /* ---- the tiers ---- */
  await H.useProxy(page);
  const tier = await page.evaluate(()=>({stt:VOICE.stt, chip:$('engChip').textContent, cls:$('engChip').className}));
  t('Vapi is the tier, green', tier.stt==='agent' && /Voice: Vapi/.test(tier.chip) && / el\b/.test(tier.cls), JSON.stringify(tier));

  /* Vapi needs nothing of ours — it is up before the proxy is */
  const noProxy = await page.evaluate(async ()=>{ S.voice.proxy=''; S.voice.token=''; save();
    await probeVoice(); return {stt:VOICE.stt, chip:$('engChip').textContent}; });
  t('and it does not need the Cloudflare proxy at all',
    noProxy.stt==='agent' && /Voice: Vapi/.test(noProxy.chip), JSON.stringify(noProxy));
  await H.useProxy(page);

  const amber = await page.evaluate(async ()=>{
    const keep = window.Vapi; window.Vapi = undefined;
    await probeVoice();
    const r = {stt:VOICE.stt, chip:$('engChip').textContent, cls:$('engChip').className};
    window.Vapi = keep; return r;
  });
  t('no SDK falls to Scribe and says so',
    amber.stt==='eleven' && /Voice: Scribe/.test(amber.chip), JSON.stringify(amber));
  await page.evaluate(()=>probeVoice()); await page.waitForTimeout(700);

  /* ---- find_item ---- */
  const find = await page.evaluate(()=>AGENT_TOOLS.find_item({spoken_text:'nine metre medium poles'}));
  t('find_item returns candidates with a confidence',
    find.found===true && find.candidates[0].code==='500CONPOLE9M' && find.candidates[0].confidence>0, JSON.stringify(find).slice(0,140));
  t('find_item returns at most three',
    (await page.evaluate(()=>AGENT_TOOLS.find_item({spoken_text:'fibre'}))).candidates.length<=3);
  const none = await page.evaluate(()=>AGENT_TOOLS.find_item({spoken_text:'flibbertigibbet'}));
  t('find_item says none rather than guessing', none.found===false && none.candidates.length===0, JSON.stringify(none));
  const weak = await page.evaluate(()=>AGENT_TOOLS.find_item({spoken_text:'ml pole bolt'}));
  t('a weak match is flagged not confident', weak.found===true && weak.confident===false, JSON.stringify(weak).slice(0,120));

  /* ---- record_count ---- */
  await page.evaluate(()=>{ $('setup').classList.add('hidden'); SPOT='Shelf A1'; });
  const rec = await page.evaluate(()=>AGENT_TOOLS.record_count({item_code:'500CONPOLE9M', quantity:12, unit_as_spoken:'each'}));
  t('record_count writes a line and returns the readback',
    rec.recorded===true && rec.short_name==='Medium Pole 9.0m' && rec.quantity===12 && !!rec.line_id, JSON.stringify(rec));
  const conv = await page.evaluate(()=>AGENT_TOOLS.record_count({item_code:'500CABLEAER96F', quantity:3, unit_as_spoken:'drums'}));
  t('the app converts the unit, not the agent', conv.recorded===true && /drum/.test(conv.uom), JSON.stringify(conv));
  t('an unknown item code is refused, not invented',
    (await page.evaluate(()=>AGENT_TOOLS.record_count({item_code:'NOPE', quantity:1, unit_as_spoken:'each'}))).error!=null);
  t('a non-numeric quantity is refused',
    (await page.evaluate(()=>AGENT_TOOLS.record_count({item_code:'500CONPOLE9M', quantity:'lots', unit_as_spoken:'each'}))).error!=null);

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

  /* ══ the wire: a tool call arrives the way Vapi sends it ══ */
  await H.fakeAgent(page);
  await page.evaluate(()=>{ $('setup').classList.add('hidden'); SPOT=''; if(!cur()){ $('fVan').value='202-C-8871'; PTYPE='van'; startSession(); } });

  t('every tool the assistant can call is registered',
    await page.evaluate(()=>['find_item','record_count','undo_last','set_location','read_total',
      'pause','resume','next_line','jump_to','confirm_line','correct_line']
      .every(n=>typeof AGENT_TOOLS[n]==='function')),
    await page.evaluate(()=>Object.keys(AGENT_TOOLS).join(',')));

  const sent = await H.toolCall(page, 'find_item', {spoken_text:'nine metre medium poles'});
  t('a tool-call off the wire runs the tool', sent.length===1 && sent[0].type==='add-message', JSON.stringify(sent).slice(0,120));
  /* Vapi client tools are one-way, so the answer goes back as an injected
     message — this is the thing that makes find_item worth having */
  t('and its answer goes back to the model, named',
    /^Result of find_item: /.test(sent[0].message.content) && /500CONPOLE9M/.test(sent[0].message.content),
    String(sent[0].message.content).slice(0,140));
  t('and the model is asked to speak after it', sent[0].triggerResponseEnabled===true, JSON.stringify(sent[0]));
  t('find_item answers with short names for it to read back',
    /Medium Pole 9\.0m/.test(sent[0].message.content), String(sent[0].message.content).slice(0,140));

  const n0 = await page.evaluate(()=>cur().lines.length);
  const wireRec = await H.toolCall(page, 'record_count', {item_code:'500CONPOLE9M', quantity:6, unit_as_spoken:'each'});
  const n1 = await page.evaluate(()=>cur().lines.length);
  t('record_count off the wire writes exactly one line', n1===n0+1, n0+' -> '+n1);
  t('and the readback goes back to the model', /"recorded":true/.test(wireRec[0].message.content), String(wireRec[0].message.content).slice(0,120));

  const paused = await H.toolCall(page, 'pause', {});
  t('pause is the one tool it must not talk after', paused[0].triggerResponseEnabled===false, JSON.stringify(paused[0]));
  await page.evaluate(()=>{ PAUSED=false; paintMic(); });

  const bogus = await H.toolCall(page, 'nonesuch', {});
  t('a tool the app does not have is refused, not thrown',
    /no such tool/.test(bogus[0].message.content), JSON.stringify(bogus[0]).slice(0,120));

  const logged = await page.evaluate(()=>(S.vlog||[]).filter(e=>e.kind==='tool').map(e=>e.tool));
  t('every tool call is in "What the app heard"',
    ['find_item','record_count','pause'].every(n=>logged.includes(n)), JSON.stringify(logged));

  /* ══ pre-connect ══ */
  const warm = await page.evaluate(async ()=>{
    await stopAgent(); AGENT.conv=null; AGENT.on=false;
    window.__vapi.starts=[]; window.__vapi.muted=[];
    showTab('count');
    await new Promise(r=>setTimeout(r,400));
    return {starts:window.__vapi.starts.length, id:(window.__vapi.starts[0]||{}).id,
            ov:(window.__vapi.starts[0]||{}).ov, muted:window.__vapi.muted.slice(), warm:AGENT.warm, on:AGENT.on};
  });
  t('opening the Count tab connects the call before the tap', warm.starts===1 && warm.on===true, JSON.stringify(warm));
  t('with the microphone muted and the assistant told to wait',
    warm.muted[0]===true && warm.ov.firstMessageMode==='assistant-waits-for-user', JSON.stringify(warm));
  t('and it asks Vapi for tool calls on the client',
    (warm.ov.clientMessages||[]).includes('tool-calls'), JSON.stringify(warm.ov));
  t('against the assistant in the page', warm.id==='aefc0a29-6dc2-41ec-be44-254316db923c', warm.id);

  const tap = await page.evaluate(async ()=>{
    const n = window.__vapi.starts.length;
    await startAgent();
    return {dialledAgain: window.__vapi.starts.length - n, muted: window.__vapi.muted.slice(-1)[0], warm:AGENT.warm};
  });
  t('the mic tap unmutes rather than dialling again', tap.dialledAgain===0 && tap.muted===false && tap.warm===false, JSON.stringify(tap));

  /* ══ the eleven tools as a call override ══ */
  t('the tools travel with the app', await page.evaluate(()=>VAPI_TOOLS.length)===11,
     JSON.stringify(await page.evaluate(()=>VAPI_TOOLS.map(x=>x.function.name))));
  t('and every one of them names a tool the app actually has',
     await page.evaluate(()=>VAPI_TOOLS.every(x=>typeof AGENT_TOOLS[x.function.name]==='function')),
     JSON.stringify(await page.evaluate(()=>VAPI_TOOLS.filter(x=>!AGENT_TOOLS[x.function.name]).map(x=>x.function.name))));
  t('each is client-side — async, and no server url',
     await page.evaluate(()=>VAPI_TOOLS.every(x=>x.async===true && !x.server)),
     JSON.stringify(await page.evaluate(()=>VAPI_TOOLS.filter(x=>x.async!==true||x.server).map(x=>x.function.name))));
  t('the system prompt travels with them', await page.evaluate(()=>VAPI_PROMPT.length)>2000
     && await page.evaluate(()=>/never guess/i.test(VAPI_PROMPT)));

  /* left empty, nothing about the assistant is overridden */
  const off = await page.evaluate(async ()=>{ S.voice.llm=''; save();
    await stopAgent(); window.__vapi.starts=[]; showTab('count');
    await new Promise(r=>setTimeout(r,400));
    return (window.__vapi.starts[0]||{}).ov; });
  t('with no LLM named, the call takes its tools from the dashboard',
     !off.model && (off.clientMessages||[]).includes('tool-calls'), JSON.stringify(off).slice(0,140));

  const on = await page.evaluate(async ()=>{ S.voice.llm='openai/gpt-4.1'; save();
    await stopAgent(); window.__vapi.starts=[]; showTab('count');
    await new Promise(r=>setTimeout(r,400));
    return (window.__vapi.starts[0]||{}).ov; });
  t('naming one sends all eleven with the call',
     !!on.model && on.model.tools.length===11, JSON.stringify(on.model && on.model.tools.map(x=>x.function.name)));
  t('and the LLM it names, because Vapi needs the whole model object',
     on.model.provider==='openai' && on.model.model==='gpt-4.1', JSON.stringify({p:on.model.provider, m:on.model.model}));
  t('and the prompt, because it lives in that same object',
     on.model.messages[0].role==='system' && /You are TruCount/.test(on.model.messages[0].content),
     String(on.model.messages[0].content).slice(0,60));
  await page.evaluate(async ()=>{ S.voice.llm=''; save(); await stopAgent(); });

  const out = R.report('agent — tiers, tools and ownership', page.errs);
  await page.ctx.close();
  return out;
};
