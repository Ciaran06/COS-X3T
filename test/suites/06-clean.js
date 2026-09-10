/* The app starts empty, and a phone that opened it before the example counts
   were dropped is cleaned on the way in. Example data that persists is not a
   demo, it is a fake number in a real total. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser);

  const fresh = await p.evaluate(()=>({
    sessions:(S.sessions||[]).length, current:!!S.current,
    seeded: seedSessions().length,
    jobs:(S.jobs||jobs()).length,
    rollup: (()=>{ showTab('mgr'); return $('tblItem').textContent; })()
  }));
  t('a fresh app has no counts in it', fresh.sessions===0 && fresh.current===false, JSON.stringify(fresh));
  t('and nothing seeds any', fresh.seeded===0, String(fresh.seeded));
  t('jobs are still there, because a count has to belong to one', fresh.jobs===3, String(fresh.jobs));
  t('the Rollup says so rather than showing a blank table',
     /Nothing counted for this selection/.test(fresh.rollup), fresh.rollup.slice(0,60));

  /* a phone carrying the old example data, and one carrying real counts */
  const cleaned = await p.evaluate(()=>{
    const keep = {sessions:[
      {id:'demo-tli-1', cat:'fibre', org:'TLI Group', ctype:'van', container:'12-G-12345',
       by:'Seán M', job:'j-nbi-me', started:1, finished:2, example:true,
       lines:[{id:'lx', cat:'fibre', code:'FIB-48F', qty:4, unit:'drum', ts:1}]},
      {id:'real-1', cat:'fibre', org:'KN Circet', ctype:'van', container:'202-C-8871',
       by:'Aoife K', job:'j-daily', started:3, finished:4,
       lines:[{id:'ly', cat:'fibre', code:'500POLESTEP', qty:10, unit:'each', ts:3},
              {id:'lz', cat:'fibre', code:'CONN-KIT', qty:7, unit:'each', ts:4}]}
    ], current:null, custom:{fibre:[],pub:[]}, me:{role:'nbi', name:'x'}, job:'j-daily'};
    localStorage.setItem('trucount.v1', JSON.stringify(keep));
    const back = JSON.parse(JSON.stringify(keep));
    const n = clearSeeds(back);
    return {removed:n, left:back.sessions.map(x=>x.id),
            realLines:(back.sessions[0]||{}).lines.map(l=>l.code)};
  });
  t('the seeded example counts are cleared on the way in', cleaned.removed===1 && cleaned.left.join()==='real-1', JSON.stringify(cleaned));
  t('and a count somebody actually made is left alone, dead item code or not',
     cleaned.realLines.join()==='500POLESTEP,CONN-KIT', JSON.stringify(cleaned.realLines));

  /* it really happens at load, not just in the helper */
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForTimeout(900);
  const afterLoad = await p.evaluate(()=>({
    ids:(S.sessions||[]).map(x=>x.id),
    stored:JSON.parse(localStorage.getItem('trucount.v1')).sessions.map(x=>x.id)
  }));
  t('reopening the app drops them', afterLoad.ids.join()==='real-1', JSON.stringify(afterLoad.ids));
  t('and writes the cleaned state back, so it stays gone', afterLoad.stored.join()==='real-1', JSON.stringify(afterLoad.stored));

  /* ---------- every item should have a Product Group ---------- */
  await p.evaluate(()=>{ localStorage.removeItem('trucount.v1'); });
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForTimeout(900);
  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(400);
  await p.click('#t-cat'); await p.waitForTimeout(500);
  const grp = await p.evaluate(()=>({
    total: items('fibre').length,
    none: ungrouped('fibre').length,
    pubNone: ungrouped('pub').length,
    said: $('catCount').textContent,
    btn: $('catNoGrp').textContent
  }));
  t('the master says how many items have no Product Group',
     grp.none===69 && /69/.test(grp.said) && /no Product Group/.test(grp.said), JSON.stringify(grp));
  t('the pub catalogue has none of them', grp.pubNone===0, String(grp.pubNone));
  await p.click('#catNoGrp'); await p.waitForTimeout(400);
  const only = await p.evaluate(()=>({
    rows: document.querySelectorAll('#tblCat tbody tr').length,
    allUnassigned: [...document.querySelectorAll('#tblCat tbody tr')].every(r=>/Unassigned/.test(r.textContent)),
    btn: $('catNoGrp').textContent
  }));
  t('and puts them on screen in one tap', only.rows===69 && only.allUnassigned===true, JSON.stringify(only));
  t('with a way back', only.btn==='Show all items', only.btn);
  await p.click('#catNoGrp'); await p.waitForTimeout(400);
  t('which goes back to all of them',
     await p.evaluate(()=>document.querySelectorAll('#tblCat tbody tr').length)===grp.total, '');

  /* the list handed to the office is the same list */
  const fs = require('fs'), path = require('path');
  const csv = fs.readFileSync(path.join(H.ROOT,'docs','items-without-a-product-group.csv'),'utf8').trim().split('\n');
  t('and docs/items-without-a-product-group.csv is that list, not a stale copy',
     csv.length===grp.none+1 && /^Item code,/.test(csv[0]), csv.length+' rows');
  const codes = await p.evaluate(()=>ungrouped('fibre').map(i=>i.code));
  t('every code in the file is one of them',
     csv.slice(1).every(l=>codes.includes(l.split(',')[0])), '');

  const out = R.report('clean — the app starts empty, and every item has a group', p.errs);
  await p.ctx.close();
  return out;
};
