/* voice — keyterm rotation in a review */
function trimTermJs(x){ return x.length<=20 ? x : x.slice(0,20); }
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
  /* proxy on, so readbacks go to ElevenLabs */
  await H.useProxy(p);
  await p.evaluate(()=>probeVoice());
  await p.waitForTimeout(800);
  t('engine is ElevenLabs before the walk', await p.evaluate(()=>VOICE.stt)==='eleven');

  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(500);
  await p.click('#t-cat'); await p.waitForTimeout(400);
  await p.setInputFiles('#csFile', H.fixture('KN02_Stock_Take_Witness_Count_Sample.xlsx'));
  await p.waitForTimeout(1800);

  await p.evaluate(()=>{ $('fOrg').value='KN Circet'; $('fVan').value='202-C-8871'; });
  await p.evaluate(()=>showSheet()); await p.waitForTimeout(600);

  const started = await p.evaluate(()=>reviewStart('all', false));
  await p.waitForTimeout(2500);
  const st = await p.evaluate(()=>({active:REVIEW.active, group:(reviewRow()||{}).group, rows:reviewRowList().length,
    groups:[...new Set(reviewRowList().map(r=>r.group))].length}));
  t('the walk starts', st.active===true, JSON.stringify(st));

  const kt = await p.evaluate(()=>keytermsFor());
  t('keyterms capped at 50', kt.length<=50, 'got '+kt.length);
  t('all keyterms within 20 chars', kt.every(x=>x.length<=20), JSON.stringify(kt.filter(x=>x.length>20)));
  t('commands first', ['yes','next','skip','zero','back','pause','stop'].every(w=>kt.indexOf(w)>=0 && kt.indexOf(w)<14), kt.slice(0,14).join(','));
  const g = await p.evaluate(()=>bareGroup((reviewRow()||{}).group));
  t('the group being walked is boosted', kt.indexOf(trimTermJs(g))>=0 || kt.some(x=>g.startsWith(x)), 'group '+g+' terms '+kt.slice(14,22).join(','));
  const trimmed = await p.evaluate(()=>{ const r=reviewRow(); return reviewWalk().filter(x=>x.group===r.group).map(x=>trimTerm(spokenFor(x))); });
  t('that group\'s items come straight after the commands', trimmed.slice(0,3).every(x=>kt.indexOf(x)>=14 && kt.indexOf(x)<14+trimmed.length+4),
    JSON.stringify({group:g, items:trimmed.slice(0,3), at:trimmed.slice(0,3).map(x=>kt.indexOf(x))}));

  /* walk to a different group and prove the list rotates */
  const before = kt.slice();
  await p.evaluate(async ()=>{
    const g0 = reviewRow().group;
    for(let i=0;i<400 && reviewRow() && reviewRow().group===g0;i++) reviewMove(1);
  });
  await p.waitForTimeout(1500);
  const g2 = await p.evaluate(()=>bareGroup((reviewRow()||{}).group));
  const kt2 = await p.evaluate(()=>keytermsFor());
  t('the group changed', g2 && g2!==g, g+' -> '+g2);
  t('keyterms rotated with the group', JSON.stringify(kt2)!==JSON.stringify(before), kt2.slice(14,20).join(','));
  t('rotated list still within limits', kt2.length<=50 && kt2.every(x=>x.length<=20), 'n='+kt2.length);

  await p.evaluate(()=>reviewStop());
  await p.waitForTimeout(300);
  console.log('walked group 1:', g, '| group 2:', g2);
  console.log('terms while in "'+g2+'":', JSON.stringify(kt2.slice(0,14)));
  const out = R.report('voice — keyterm rotation in a review', errs);
  await p.ctx.close();
  return out;
};
