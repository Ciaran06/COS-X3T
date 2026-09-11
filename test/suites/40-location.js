/* location — a closed list, per contractor */

module.exports = async function({ browser, H }){
  const R = H.results(); const { t, ok, bad } = R;
  const PAGE  = 'http://127.0.0.1:' + H.PAGE_PORT;
  const PROXY = 'http://127.0.0.1:' + H.PROXY_PORT;
  const sample = n => require('path').join(H.ROOT, 'sample-data', n);
  const shot   = n => require('path').join(__dirname, '..', 'screenshots', n);
  const p = await H.openApp(browser);
  const errs = p.errs;

  /* the job locations list lives on Results, not on Count and not on Stocktakes */
  t('the job locations list is off the Count tab, and on Results',
     await p.evaluate(()=>document.querySelector('#v-count #jobLocs')===null
       && document.querySelector('#v-hist #jobLocs')===null
       && document.querySelector('#v-mgr #jobLocs')!==null));
  t('Location sits above "Where are you counting?"', await p.evaluate(()=>{
      const f=$('locField'), segs=document.getElementById('segs');
      return !!(f && segs && (f.compareDocumentPosition(segs) & Node.DOCUMENT_POSITION_FOLLOWING));
  }));
  t('with no list, Location says so and counting is blocked', await p.evaluate(()=>{
      const org=activeOrg(); syncStartable();
      return $('fLoc').disabled===true && /Setup tab/.test($('locHint').textContent);
  }), await p.evaluate(()=>$('locHint').textContent));

  /* upload the KN Circet list */
  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(500);
  await p.click('#t-cat'); await p.waitForTimeout(400);
  await p.selectOption('#locOrg', 'KN Circet');
  await p.setInputFiles('#locFile', sample('KN02_locations.xlsx'));
  await p.waitForTimeout(1600);
  const up = await p.evaluate(()=>({ n:(S.locs.fibre||[]).length, stat:$('locStat').textContent,
      das:[...new Set((S.locs.fibre||[]).map(l=>l.da))].filter(Boolean).length,
      first:(S.locs.fibre||[])[0], orgs:[...new Set((S.locs.fibre||[]).map(l=>l.org))] }));
  t('the list imports past the junk rows', up.n===25, JSON.stringify(up.stat));
  t('the DA column comes with it', up.das===7 && up.first.da==='DA008', JSON.stringify(up.first));
  t('it is stored against that contractor only', JSON.stringify(up.orgs)===JSON.stringify(['KN Circet']), JSON.stringify(up.orgs));
  t('the header row is not imported as a location', await p.evaluate(()=>!(S.locs.fibre||[]).some(l=>/^location$/i.test(l.name))));

  /* the field on Count */
  await p.click('#t-count'); await p.waitForTimeout(400);
  await p.evaluate(()=>{ setViewOrgs(['KN Circet']); afterViewChange&&afterViewChange(); renderLocField(); syncStartable(); });
  await p.waitForTimeout(400);
  t('the field wakes up for that contractor', await p.evaluate(()=>$('fLoc').disabled===false && /25 locations/.test($('fLoc').placeholder)),
     await p.evaluate(()=>$('fLoc').placeholder));
  t('counting is blocked until a location is picked', await p.evaluate(()=>{ syncStartable(); return $('btnStart').disabled===true; }));

  /* type-ahead */
  await p.click('#fLoc'); await p.fill('#fLoc','clare'); await p.waitForTimeout(400);
  const menu = await p.evaluate(()=>[...document.querySelectorAll('#locMenu button[data-loc]')].map(b=>b.dataset.loc));
  t('type-ahead narrows the list', menu.length===1 && menu[0]==='Claremorris', JSON.stringify(menu));
  await p.click('#locMenu button[data-loc="Claremorris"]'); await p.waitForTimeout(400);
  t('picking one sets the location and its DA', await p.evaluate(()=>LOC==='Claremorris' && LOCDA==='DA008'),
     await p.evaluate(()=>LOC+'/'+LOCDA));
  t('the DA is shown beside the field', await p.evaluate(()=>/DA008/.test($('locHint').textContent)));
  t('counting is now allowed', await p.evaluate(()=>{ syncStartable(); return $('btnStart').disabled===false; }));

  /* typing something off the list is refused */
  await p.evaluate(()=>{ $('fLoc').value='Timbuktu'; $('fLoc').dispatchEvent(new Event('blur')); });
  await p.waitForTimeout(500);
  t('typing a name off the list is refused, not created',
     await p.evaluate(()=>LOC==='Claremorris' && $('fLoc').value==='Claremorris' && !(S.locs.fibre||[]).some(l=>/timbuktu/i.test(l.name))),
     await p.evaluate(()=>LOC+' / '+$('fLoc').value));

  /* voice */
  const exact = await p.evaluate(async ()=>{ setLoc(''); onHeardFinal('location Castlebar');
     await new Promise(r=>setTimeout(r,2200)); return {LOC, LOCDA, pend:!!PEND}; });
  t('saying "location Castlebar" sets it', exact.LOC==='Castlebar' && exact.LOCDA==='DA005' && !exact.pend, JSON.stringify(exact));
  const near = await p.evaluate(async ()=>{ setLoc(''); onHeardFinal('location Claremoris');
     await new Promise(r=>setTimeout(r,2200)); return {LOC, pend:PEND&&PEND.kind, q:$('cf1').textContent}; });
  t('a near miss asks "Do you mean…?" rather than guessing', near.LOC==='' && near.pend==='loc' && /Do you mean Claremorris/.test(near.q), JSON.stringify(near));
  const yes = await p.evaluate(async ()=>{ onHeardFinal('yes'); await new Promise(r=>setTimeout(r,2200)); return {LOC, pend:!!PEND}; });
  t('"yes" accepts it', yes.LOC==='Claremorris' && !yes.pend, JSON.stringify(yes));
  const no = await p.evaluate(async ()=>{ setLoc(''); onHeardFinal('location Timbuktu');
     await new Promise(r=>setTimeout(r,2200));
     return {LOC, pend:!!PEND, msg:$('cf1').textContent, created:(S.locs.fibre||[]).length}; });
  t('a name that is nowhere near is refused', no.LOC==='' && /not on the location list/.test(no.msg), JSON.stringify(no));
  t('and voice never adds one', no.created===25, 'count '+no.created);

  /* it lands on the session and in the band */
  const sess = await p.evaluate(async ()=>{
    setLoc('Westport');
    $('fVan').value='202-C-8871'; PTYPE='van';
    startSession();
    return {loc:cur().loc, da:cur().da, band:$('whoWhere').textContent};
  });
  t('the location is written onto the session with its DA', sess.loc==='Westport' && sess.da==='DA005', JSON.stringify(sess));
  t('and the band says where you are', /Westport/.test(sess.band), sess.band);

  /* a different contractor has a different list */
  const other = await p.evaluate(async ()=>{ setViewOrgs(['TLI Group']); afterViewChange&&afterViewChange();
     await new Promise(r=>setTimeout(r,300));
     return {LOC, disabled:$('fLoc').disabled, n:locsFor('fibre','TLI Group').length}; });
  t('another contractor gets their own (empty) list', other.n===0 && other.disabled===true && other.LOC==='', JSON.stringify(other));

  await p.evaluate(()=>{ setViewOrgs(['KN Circet']); afterViewChange&&afterViewChange(); setLoc('Claremorris'); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: shot('b3-loc.png'), clip:{x:0,y:100,width:430,height:700} });
  await p.click('#t-hist'); await p.waitForTimeout(500);
  await p.screenshot({ path: shot('b3-hist.png') });
  /* ── the field mic fills the field, and does nothing else ── */
  await p.click('#t-count'); await p.waitForTimeout(300);
  const mic = await p.evaluate(async ()=>{
    setLoc(''); PTYPE=''; syncPlaceUI();
    wantListen = false;
    const before = {setupHidden:$('setup').classList.contains('hidden'), listening:wantListen, ptype:PTYPE};
    resolveLocVoice('Claremorris');
    await new Promise(r=>setTimeout(r,300));
    return {before, loc:LOC, da:LOCDA,
            setupHidden:$('setup').classList.contains('hidden'),
            listening:wantListen, ptype:PTYPE,
            note:$('locVoice').textContent,
            started:!!cur()};
  });
  t('saying a location fills the Location field', mic.loc==='Claremorris' && mic.da==='DA008', JSON.stringify(mic));
  t('and the panel stays open — it does not jump into counting',
     mic.setupHidden===false && mic.listening===false && mic.started===false, JSON.stringify(mic));
  t('Where is still yours to choose', mic.ptype==='', JSON.stringify(mic.ptype));
  t('the field says what it heard', /Claremorris/.test(mic.note) && /DA008/.test(mic.note), mic.note);

  const heard = await p.evaluate(async ()=>{
    setLoc(''); resolveLocVoice('Claire Morris');
    await new Promise(r=>setTimeout(r,250));
    return {loc:LOC, note:$('locVoice').textContent, yes:!!document.getElementById('locYes')};
  });
  t('a name heard another way asks rather than setting it',
     heard.loc==='' && /Do you mean Claremorris/.test(heard.note) && heard.yes===true, JSON.stringify(heard));
  await p.click('#locYes'); await p.waitForTimeout(250);
  t('and Yes fills the field', await p.evaluate(()=>LOC)==='Claremorris');

  const nope = await p.evaluate(async ()=>{
    setLoc(''); resolveLocVoice('Timbuktu');
    await new Promise(r=>setTimeout(r,250));
    return {loc:LOC, note:$('locVoice').textContent};
  });
  t('and something off the list is refused, still without starting anything',
     nope.loc==='' && /Not on the list/.test(nope.note), JSON.stringify(nope));

  /* the registration mic is the same rule */
  const reg = await p.evaluate(()=>{
    setLoc('Claremorris'); PTYPE='store-in'; syncPlaceUI();
    const said = selectRegPlace({label:'202-C-8871', type:'van'});
    return {val:$('fVan').value, ptype:PTYPE, said};
  });
  t('the registration mic fills the registration and leaves Where alone',
     reg.val==='202-C-8871' && reg.ptype==='store-in', JSON.stringify(reg));
  t('and says so when the register disagrees', /register has it as Vehicle/.test(reg.said), reg.said);

  const out = R.report('location — a closed list, per contractor', errs);
  await p.ctx.close();
  return out;
};
