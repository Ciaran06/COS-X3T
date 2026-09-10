/* Four tabs with plain names, and the count sheet as a mode of Count rather
   than a tab of its own — it is the same location and the same lines, two ways
   to enter them. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser);
  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(500);

  const tabs = await p.evaluate(()=>[...document.querySelectorAll('.tabs button')].map(b=>b.textContent.trim()));
  t('four tabs, in order, plainly named',
     tabs.join(' · ')==='Count · Results · Stocktakes · Setup', tabs.join(' · '));
  t('and the Sheet tab is gone', await p.evaluate(()=>!document.getElementById('t-sheet') && !document.getElementById('v-sheet')));

  /* ---------- Count carries both ways in ---------- */
  const modes = await p.evaluate(()=>({
    labels:[...document.querySelectorAll('#modebar button')].map(b=>b.textContent.trim()),
    inCount: !!document.querySelector('#v-count #modebar') && !!document.querySelector('#v-count #tblSheet'),
    voiceOn: !$('mode-voice').classList.contains('hidden'),
    sheetOff: $('mode-sheet').classList.contains('hidden'),
    mode: MODE
  }));
  t('Count opens on Voice, with a Sheet mode beside it',
     modes.labels.join('|')==='Voice|Sheet' && modes.voiceOn && modes.sheetOff && modes.mode==='voice', JSON.stringify(modes));
  t('and the sheet grid lives inside the Count tab now', modes.inCount===true);

  await p.click('#m-sheet'); await p.waitForTimeout(400);
  const onSheet = await p.evaluate(()=>({
    mode:MODE, voiceOff:$('mode-voice').classList.contains('hidden'),
    sheetOn:!$('mode-sheet').classList.contains('hidden'),
    pressed:document.querySelector('#modebar button[aria-selected="true"]').textContent.trim(),
    stillCount: !$('v-count').classList.contains('hidden'),
    band: !$('band').classList.contains('hidden')
  }));
  t('tapping Sheet swaps the view without leaving Count',
     onSheet.mode==='sheet' && onSheet.voiceOff && onSheet.sheetOn && onSheet.stillCount, JSON.stringify(onSheet));
  t('the Count tab stays selected, band and all', onSheet.pressed==='Sheet' && onSheet.band===true, JSON.stringify(onSheet));
  await p.click('#m-voice'); await p.waitForTimeout(300);
  t('and back again', await p.evaluate(()=>MODE==='voice' && !$('mode-voice').classList.contains('hidden')));

  /* anything that used to send you to the Sheet tab lands in the right place */
  await p.click('#t-mgr'); await p.waitForTimeout(400);
  const jumped = await p.evaluate(async ()=>{ showSheet(); await new Promise(r=>setTimeout(r,200));
    return {tab:$('t-count').getAttribute('aria-selected'), mode:MODE}; });
  t('showSheet() opens Count in Sheet mode', jumped.tab==='true' && jumped.mode==='sheet', JSON.stringify(jumped));

  /* ---------- Stocktakes is closed jobs, and says so when empty ---------- */
  await p.click('#t-hist'); await p.waitForTimeout(400);
  const hist = await p.evaluate(()=>({
    empty:$('histList').textContent.trim(),
    noJobLocs: document.querySelector('#v-hist #jobLocs')===null,
    panels:[...document.querySelectorAll('#v-hist h2')].map(h=>h.textContent)
  }));
  t('Stocktakes explains itself when there is nothing in it',
     /No stocktakes closed yet/.test(hist.empty) && /frozen as of that day/.test(hist.empty), hist.empty);
  t('and it is closed jobs only', hist.noJobLocs===true && hist.panels.join('|')==='Closed stocktakes', JSON.stringify(hist.panels));

  /* the live job's locations moved to Results, where the counting is */
  t('the live job list is on Results', await p.evaluate(()=>!!document.querySelector('#v-mgr #jobLocs')));

  /* ---------- Setup reads as configuration ---------- */
  await p.click('#t-cat'); await p.waitForTimeout(600);
  const setup = await p.evaluate(()=>({
    heads:[...document.querySelectorAll('#v-cat .setuphdr')].map(h=>h.textContent),
    firstPanel:(document.querySelector('#v-cat h2')||{}).textContent,
    order:[...document.querySelectorAll('#v-cat .setuphdr, #v-cat h2')].map(h=>h.textContent)
  }));
  t('Setup is grouped under headings', setup.heads.length===5
     && setup.heads[0]==='Who is using this', JSON.stringify(setup.heads));
  t('and every panel sits under one of them',
     setup.order[0]==='Who is using this' && setup.order.filter(x=>setup.heads.includes(x)).length===5,
     JSON.stringify(setup.order));

  /* ---------- nothing in the app still calls them by the old names ---------- */
  const stale = await p.evaluate(()=>{
    const txt = document.body.innerText;
    return ['the Data tab','the Rollup tab','the History tab','the Sheet tab'].filter(x=>txt.includes(x));
  });
  t('no screen still says Data, Rollup, History or Sheet', stale.length===0, JSON.stringify(stale));

  const out = R.report('nav — four tabs, and the sheet inside Count', p.errs);
  await p.ctx.close();
  return out;
};
