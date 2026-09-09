/* What the app tells the agent that it could not have heard, and the typed path
   driving the same tools. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const page = await H.openApp(browser);
  await H.useProxy(page, {agentId:'agent_test123'});
  await H.fakeAgent(page);

  t('a contextual update is sent when a session is live', await page.evaluate(()=>agentContext('hello')===true));
  t('and refused when there is none',
    await page.evaluate(()=>{ const c=AGENT.conv; AGENT.conv=null; const r=agentContext('x'); AGENT.conv=c; return r===false; }));

  const rev = await page.evaluate(()=>{
    window.__ctx.length = 0;
    S.review = {key:'k', role:'nbi', mode:'all', idx:0, speak:true};
    REVIEW.active = true;
    agentContext('Review has started. Walk the sheet with next_line — say the short name and the current number, then wait.');
    const started = window.__ctx.slice();
    reviewStop();
    return {started, stopped: window.__ctx.slice(started.length), on:AGENT.on, conv:!!AGENT.conv};
  });
  t('the agent is told when review starts', /Review has started/.test(rev.started[0]||''), JSON.stringify(rev.started));
  t('and when it stops', /Review has stopped/.test(rev.stopped[0]||''), JSON.stringify(rev.stopped));
  t('ending a walk does not hang up on the agent', rev.on===true && rev.conv===true, JSON.stringify({on:rev.on, conv:rev.conv}));

  const loc = await page.evaluate(()=>{
    S.locs = {fibre:[{name:'Claremorris', da:'DA008', org:$('fOrg').value}]}; save();
    window.__ctx.length = 0; setLoc('Claremorris');
    return window.__ctx.slice();
  });
  t('the agent is told the location, which it cannot hear',
    /Claremorris/.test(loc[0]||'') && /DA008/.test(loc[0]||''), JSON.stringify(loc));

  /* the typed box is the same input, not a parallel path */
  await page.evaluate(()=>{ $('setup').classList.add('hidden'); window.__msg.length=0; });
  await page.fill('#typeIn', 'ten pole steps');
  await page.press('#typeIn', 'Enter');
  await page.waitForTimeout(300);
  const typed = await page.evaluate(()=>({sent:window.__msg.slice(), lines:(cur()&&cur().lines||[]).length, box:$('typeIn').value}));
  t('typing goes to the agent as a user turn', typed.sent[0]==='ten pole steps', JSON.stringify(typed.sent));
  t('and is not parsed behind its back', typed.lines===0, 'lines=' + typed.lines);
  t('the box clears', typed.box==='', JSON.stringify(typed.box));

  const noAgent = await page.evaluate(async ()=>{
    AGENT.on=false; AGENT.conv=null;
    $('typeIn').value='ten pole steps'; typeSend();
    await new Promise(r=>setTimeout(r,400));
    return (cur()&&cur().lines||[]).length;
  });
  t('with no agent, typing still goes straight to the parser', noAgent===1, 'lines=' + noAgent);
  t('typed lines are never counted as something the ear heard',
    await page.evaluate(()=>(S.vlog||[]).filter(e=>e.kind!=='tool'&&e.kind!=='context'&&e.text==='ten pole steps').length)===0);

  const ctxLogged = await page.evaluate(()=>S.vlog.filter(e=>e.kind==='context').length);
  t('context updates are logged too', ctxLogged>=3, 'n=' + ctxLogged);

  const out = R.report('agent — context and the typed path', page.errs);
  await page.ctx.close();
  return out;
};
