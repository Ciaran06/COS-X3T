/* Location matching by sound. Irish place names are the norm on this job and a
   recogniser writes them the way it hears them — "Claire Morris" is two words,
   a different spelling and the same sound. Nothing here may invent a location:
   every answer is still one of the rows on the contractor's uploaded list. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const sample = n => require('path').join(H.ROOT, 'sample-data', n);
  const p = await H.openApp(browser, {sdk:false});

  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(500);
  await p.click('#t-cat'); await p.waitForTimeout(400);
  await p.selectOption('#locOrg', 'KN Circet');
  await p.setInputFiles('#locFile', sample('KN02_locations.xlsx'));
  await p.waitForTimeout(1600);
  await p.click('#t-count'); await p.waitForTimeout(300);
  await p.evaluate(()=>{ setViewOrgs(['KN Circet']); afterViewChange&&afterViewChange(); renderLocField(); });
  await p.waitForTimeout(300);

  /* ---------- A. the sound key ---------- */
  const key = async s => await p.evaluate(x=>soundKey(x), s);
  const same = async (a,b) => (await key(a)) === (await key(b));
  t('spaces, hyphens and case are dropped on both sides',
     await same('Claire Morris','claremorris') && await same('BANGOR-ERRIS','Bangor Erris'),
     await key('Claire Morris'));
  t('"Claire Morris" sounds exactly like Claremorris', await same('Claire Morris','Claremorris'), await key('Claire Morris'));
  t('"Tober Curry" sounds like Tubbercurry', await same('Tober Curry','Tubbercurry'), await key('Tober Curry'));
  t('"Doo Leg" and "Doo League" both sound like Dooleeg',
     await same('Doo Leg','Dooleeg') && await same('Doo League','Dooleeg'), await key('Doo League'));
  t('"Nock" sounds like Knock — the K is silent', await same('Nock','Knock'), await key('Knock'));
  t('"Ross Common" sounds like Roscommon', await same('Ross Common','Roscommon'), await key('Ross Common'));
  t('two towns that sound different keep different keys',
     !(await same('Castlebar','Castlerea')) && !(await same('Ballina','Ballinrobe')),
     (await key('Castlebar'))+' vs '+(await key('Castlerea')));

  /* ---------- B. the six names, as a speech engine writes them ---------- */
  const HEARD = [
    ['Claire Morris',  'Claremorris'],
    ['Clare Morris',   'Claremorris'],
    ['Tubber Curry',   'Tubbercurry'],
    ['Tober Curry',    'Tubbercurry'],
    ['Doo Leg',        'Dooleeg'],
    ['Doo League',     'Dooleeg'],
    ['Dulig',          'Dooleeg'],
    ['Nock',           'Knock'],
    ['Ballin Robe',    'Ballinrobe'],
    ['Bally Robe',     'Ballinrobe'],
    ['Ross Common',    'Roscommon'],
    ['Rosscommon',     'Roscommon'],
  ];
  const found = await p.evaluate(list => list.map(([heard, want])=>{
    const m = matchLoc('fibre','KN Circet', heard);
    const got = m.exact ? m.exact.name : m.sure ? m.sure.name : null;
    return {heard, want, got, near:(m.near||[]).map(l=>l.name).slice(0,3)};
  }), HEARD);
  found.forEach(f=> t('“'+f.heard+'” finds '+f.want, f.got===f.want, JSON.stringify(f)));

  /* ---------- C. asked, not assumed ---------- */
  const ask = await p.evaluate(async ()=>{
    setLoc(''); clearPend&&clearPend();
    onHeardFinal('location Claire Morris');
    await new Promise(r=>setTimeout(r,2200));
    return {LOC, pend:PEND&&PEND.kind, q:$('cf1').textContent, sub:$('cf2').textContent};
  });
  t('a name heard another way is put back as a question, not set',
     ask.LOC==='' && ask.pend==='loc' && /Do you mean Claremorris/.test(ask.q), JSON.stringify(ask));
  const yes = await p.evaluate(async ()=>{ onHeardFinal('yes'); await new Promise(r=>setTimeout(r,2200)); return {LOC, LOCDA, pend:!!PEND}; });
  t('and "yes" sets it', yes.LOC==='Claremorris' && yes.LOCDA==='DA008' && !yes.pend, JSON.stringify(yes));

  /* said out loud, the DA goes in the question only when it is a word */
  const said = await p.evaluate(()=>({
    code: locSaidName({name:'Claremorris', da:'DA008'}),
    word: locSaidName({name:'Claremorris', da:'Mayo'}),
    none: locSaidName({name:'Knock', da:''})
  }));
  t('a DA that is a word is said with the name, a DA code is not',
     said.code==='Claremorris' && said.word==='Claremorris, Mayo' && said.none==='Knock', JSON.stringify(said));

  /* ---------- D. a bare place name is a location ---------- */
  const bare = await p.evaluate(async ()=>{
    setLoc(''); clearPend&&clearPend();
    onHeardFinal('Claremorris');
    await new Promise(r=>setTimeout(r,2200));
    return {LOC, pend:!!PEND};
  });
  t('saying just "Claremorris" — no "location" in front of it — sets it', bare.LOC==='Claremorris', JSON.stringify(bare));
  const bare2 = await p.evaluate(async ()=>{
    setLoc(''); clearPend&&clearPend();
    onHeardFinal('Ross Common');
    await new Promise(r=>setTimeout(r,2200));
    return {LOC, pend:PEND&&PEND.kind, q:$('cf1').textContent};
  });
  t('and a bare name heard another way asks', bare2.pend==='loc' && /Do you mean Roscommon/.test(bare2.q), JSON.stringify(bare2));

  /* a real count is still a count, not a place */
  const count = await p.evaluate(async ()=>{
    clearPend&&clearPend(); setLoc('Claremorris');
    $('fVan').value='202-C-8871'; PTYPE='van'; if(!cur()) startSession();
    const before = (cur().lines||[]).length;
    onHeardFinal('two manhole covers');
    await new Promise(r=>setTimeout(r,2500));
    return {added:(cur().lines||[]).length-before, LOC, pend:PEND&&PEND.kind};
  });
  t('a line with a number in it is never taken for a place name', count.added===1 && count.LOC==='Claremorris', JSON.stringify(count));

  /* ---------- E. only refuse when nothing is remotely close ---------- */
  const far = await p.evaluate(async ()=>{
    setLoc(''); clearPend&&clearPend();
    onHeardFinal('location Timbuktu');
    await new Promise(r=>setTimeout(r,2200));
    return {LOC, pend:!!PEND, msg:$('cf1').textContent, n:(S.locs.fibre||[]).length};
  });
  t('nothing remotely close is refused outright', far.LOC==='' && !far.pend && /not on the location list/.test(far.msg), JSON.stringify(far));
  t('and nothing was invented to make it fit', far.n===25, 'count '+far.n);

  /* ---------- F. typing what you heard finds it too ---------- */
  const typed = await p.evaluate(async ()=>{
    $('fLoc').value='claire morris'; openLocMenu();
    await new Promise(r=>setTimeout(r,200));
    return [...document.querySelectorAll('#locMenu button[data-loc]')].map(b=>b.dataset.loc);
  });
  t('the picker finds it typed the way it sounds', typed.includes('Claremorris'), JSON.stringify(typed));

  /* ---------- G. Spoken as, for the ones that still miss ---------- */
  await p.click('#t-cat'); await p.waitForTimeout(400);
  const tbl = await p.evaluate(()=>({
    heads:[...document.querySelectorAll('#tblLoc th')].map(h=>h.textContent),
    rows: document.querySelectorAll('#tblLoc input.lsaid').length,
    count: $('locFound').textContent }));
  t('the location list has a Spoken as column', JSON.stringify(tbl.heads)===JSON.stringify(['Location','DA','Spoken as']), JSON.stringify(tbl));
  t('every location has a box to type one in', tbl.rows===25 && /25 locations/.test(tbl.count), JSON.stringify(tbl));

  const alias = await p.evaluate(async ()=>{
    const inp = document.querySelector('#tblLoc input.lsaid[data-loc="Belmullet"]');
    inp.value = 'bell mullet, the mullet';
    inp.dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,200));
    const l = (S.locs.fibre||[]).find(x=>x.name==='Belmullet');
    const m = matchLoc('fibre','KN Circet','the mullet');
    return {saved:l&&l.alias, got:(m.exact||m.sure||{}).name};
  });
  t('a spoken-as saves against that location', alias.saved==='bell mullet, the mullet', JSON.stringify(alias));
  t('and a phrase that sounds like nothing on the list now lands', alias.got==='Belmullet', JSON.stringify(alias));

  /* re-uploading must not throw it away */
  await p.selectOption('#locOrg', 'KN Circet');
  await p.setInputFiles('#locFile', sample('KN02_locations.xlsx'));
  await p.waitForTimeout(1600);
  const kept = await p.evaluate(()=>{
    const l=(S.locs.fibre||[]).find(x=>x.name==='Belmullet');
    return {alias:l&&l.alias, n:(S.locs.fibre||[]).length, stat:$('locStat').textContent};
  });
  t('uploading the list again keeps a spoken-as typed by hand', kept.alias==='bell mullet, the mullet' && kept.n===25, JSON.stringify(kept));

  /* the file's own column is read */
  t('the importer reads a Spoken as column out of the file',
     await p.evaluate(()=>{ const rows=[['Location','DA','Spoken as'],['Kiltimagh','DA011','kill teemah']];
       const r = importLocs(rows,'fibre','KN Circet');
       const l=(S.locs.fibre||[]).find(x=>x.name==='Kiltimagh');
       return r.ok && /kill teemah/.test(l.alias||''); }));

  const out = R.report('locations — matched by sound, not by spelling', p.errs);
  await p.ctx.close();
  return out;
};
