/* Removing a counted line, a location, or a job. A count is evidence, so a
   removal is recorded rather than silent, and one tap is always recoverable. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser);

  /* three lines to work with */
  await p.evaluate(()=>{
    $('setup').classList.add('hidden');
    SPOT = 'Shelf A1';
    startSession();
    writeLine(item('fibre','500CONPOLE9M'), 12, 'each', null, 'twelve poles');
    writeLine(item('fibre','500POLECOACHSCREW300'), 400, 'each', null, 'four hundred coach screws');
    writeLine(item('fibre','3FE49328CB'), 7, 'each', null, 'seven kits');
    renderTally();
  });
  await p.waitForTimeout(400);
  t('every line has a delete on it',
    await p.evaluate(()=>document.querySelectorAll('#tally [data-del-line]').length) === 6, /* bin + swipe per line */
    String(await p.evaluate(()=>document.querySelectorAll('#tally [data-del-line]').length)));

  /* ---- delete one line ---- */
  const del = await p.evaluate(async ()=>{
    const before = cur().lines.length;
    const id = cur().lines[1].id;
    await removeLine(cur().id, id);
    return {before, after:cur().lines.length, gone:!cur().lines.some(l=>l.id===id),
            toast:$('toast').classList.contains('hidden')===false, msg:$('toastMsg').textContent,
            act:$('toastAct').textContent};
  });
  t('deleting takes the line off', del.after===del.before-1 && del.gone, JSON.stringify(del));
  t('and offers Undo in a toast', del.toast===true && /Removed/.test(del.msg) && del.act==='Undo', JSON.stringify(del));

  const undo = await p.evaluate(()=>{ restoreLine();
    return {n:cur().lines.length, back:cur().lines.some(l=>l.code==='500POLECOACHSCREW300'), at:cur().lines.findIndex(l=>l.code==='500POLECOACHSCREW300')}; });
  t('Undo puts it back where it was', undo.n===3 && undo.back && undo.at===1, JSON.stringify(undo));

  /* ---- the count history ---- */
  const hist = await p.evaluate(()=>(cur().audit||[]).map(a=>({a:a.action, who:a.who, t:!!a.t, words:a.words})));
  t('the removal is logged with who and when',
    hist.length===2 && hist[0].a==='removed' && hist[1].a==='restored' && hist.every(x=>x.who && x.t),
    JSON.stringify(hist));
  t('and it names what was removed', /Coach Screw 75 mm-200 Box 400/.test(hist[0].words||''), hist[0].words);
  await p.waitForTimeout(300);
  t('the history is on screen under the lines',
    /Count history/.test(await p.textContent('#tally')) && /Removed Coach Screw/.test(await p.textContent('#tally')));

  /* ---- the audio clip goes with the line ---- */
  const clip = await p.evaluate(async ()=>{
    const l = cur().lines[0];
    l.audio = true;
    await clipPut(l.id, new Blob(['x'.repeat(1000)]));
    const had = !!(await clipGet(l.id));
    await removeLine(cur().id, l.id);
    const after = !!(await clipGet(l.id));
    restoreLine();
    await new Promise(r=>setTimeout(r,150));
    const back = !!(await clipGet(l.id));
    return {had, after, back};
  });
  t('deleting a line deletes its recording', clip.had===true && clip.after===false, JSON.stringify(clip));
  t('and Undo brings the recording back too', clip.back===true, JSON.stringify(clip));

  /* ---- five seconds, then it is gone for good ---- */
  const window5 = await p.evaluate(async ()=>{
    await removeLine(cur().id, cur().lines[0].id);
    const armed = !!UNDO;
    hideToast();                       /* what the five-second timer does */
    return {armed, after:!!UNDO, hidden:$('toast').classList.contains('hidden')};
  });
  t('the undo window closes with the toast', window5.armed===true && window5.after===false && window5.hidden===true, JSON.stringify(window5));

  /* ---- a whole location asks first, and says how much ---- */
  const askLoc = await p.evaluate(()=>{
    removeSession(cur().id);
    return {open:!$('confirmSheet').classList.contains('hidden'),
            title:$('cfTitle').textContent, body:$('cfBody').textContent, yes:$('cfYes').textContent};
  });
  t('deleting a location asks before it does it', askLoc.open===true, JSON.stringify(askLoc));
  t('and says exactly how many lines it removes', /This removes 2 lines/.test(askLoc.body), askLoc.body);
  const cancelled = await p.evaluate(()=>{ closeConfirm(); return {n:cur()?cur().lines.length:-1, shut:$('confirmSheet').classList.contains('hidden')}; });
  t('Cancel leaves everything alone', cancelled.n===2 && cancelled.shut===true, JSON.stringify(cancelled));

  const doneLoc = await p.evaluate(()=>{ const id=cur().id; removeSession(id); $('cfYes').click();
    return {gone:!findSession(id), cur:!!cur()}; });
  t('confirming deletes the location', doneLoc.gone===true, JSON.stringify(doneLoc));

  /* ---- a job asks too, and counts across locations ---- */
  const askJob = await p.evaluate(()=>{
    $('setup').classList.add('hidden'); SPOT='Shelf A1';
    startSession();
    writeLine(item('fibre','500CONPOLE9M'), 5, 'each', null, 'five poles');
    const jid = cur().job;
    removeJob(jid);
    return {open:!$('confirmSheet').classList.contains('hidden'), body:$('cfBody').textContent, yes:$('cfYes').textContent, jid};
  });
  t('deleting a job asks first', askJob.open===true, JSON.stringify(askJob));
  t('and counts the lines and locations it will take',
    /removes \d+ lines? across \d+ locations?/.test(askJob.body), askJob.body);
  t('the confirm button says what it will do', /Delete job and \d+ line/.test(askJob.yes), askJob.yes);
  const doneJob = await p.evaluate(jid=>{ $('cfYes').click();
    return {job:!jobs().some(j=>j.id===jid), sess:allSessions().filter(x=>x.job===jid).length}; }, askJob.jid);
  t('confirming removes the job and its counts, not just the job', doneJob.job===true && doneJob.sess===0, JSON.stringify(doneJob));

  /* ---- voice and agent removals go the same way ---- */
  const viaVoice = await p.evaluate(async ()=>{
    $('setup').classList.add('hidden'); SPOT='Shelf A1'; startSession();
    writeLine(item('fibre','500CONPOLE9M'), 3, 'each', null, 'three poles');
    doUndo();
    await new Promise(r=>setTimeout(r,200));
    return {n:cur().lines.length, audit:(cur().audit||[]).map(a=>a.action), toast:!$('toast').classList.contains('hidden')};
  });
  t('an undo by voice is logged and recoverable like any other',
    viaVoice.n===0 && viaVoice.audit.includes('removed') && viaVoice.toast===true, JSON.stringify(viaVoice));

  const viaAgent = await p.evaluate(async ()=>{
    hideToast();
    writeLine(item('fibre','500CONPOLE9M'), 9, 'each', null, 'nine poles');
    await AGENT_TOOLS.undo_last();
    return {n:cur().lines.length, audit:(cur().audit||[]).filter(a=>a.action==='removed').length};
  });
  t('the agent tool goes through the same audited path',
    viaAgent.n===0 && viaAgent.audit>=2, JSON.stringify(viaAgent));

  const out = R.report('removing — a line, a location, a job', p.errs);
  await p.ctx.close();
  return out;
};
