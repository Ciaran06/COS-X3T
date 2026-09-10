/* The Rollup's filter bar. The point of it is to be able to pull exactly what
   was counted for one job, on one day, at one location, without exporting a
   spreadsheet first — so what is asserted is that the filters combine and that
   every table under them moves with the line that says what they are of. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const sample = n => require('path').join(H.ROOT, 'sample-data', n);
  const p = await H.openApp(browser);

  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(500);
  await p.click('#t-cat'); await p.waitForTimeout(400);
  await p.selectOption('#locOrg', 'KN Circet');
  await p.setInputFiles('#locFile', sample('KN02_locations.xlsx'));
  await p.waitForTimeout(1500);

  /* Counts of our own, so the suite says what it means rather than leaning on
     whatever example data happens to ship. Two jobs, two days, two locations,
     two place types, and one line counted with no type at all. */
  await p.evaluate(()=>{
    const day = n => Date.now() - n*86400000;
    const L = (code,qty,unit,ts) => ({id:'l'+Math.random().toString(36).slice(2,9),
      cat:'fibre', code, qty, unit, loc:'', drumId:null, ts, raw:null, role:'contractor'});
    S.jobs = [{id:'j-daily', name:'Daily van count', kind:'Daily', target:20},
              {id:'j-month', name:'NBI stocktake — month end', kind:'Month end', target:40}];
    S.job = 'j-daily';
    S.sessions = [
      {id:'t1', cat:'fibre', org:'KN Circet', ctype:'van', container:'202-C-8871', loc:'Claremorris',
       by:'Seán M', job:'j-daily', started:day(0), finished:day(0), lines:[
         L('500CONPOLE9M', 6, 'each', day(0)), L('500POLESTEP', 10, 'each', day(0))]},
      {id:'t2', cat:'fibre', org:'KN Circet', ctype:'store-in', container:'Castlebar inside store', loc:'Castlebar',
       by:'Aoife K', job:'j-daily', started:day(0), finished:day(0), lines:[
         L('500POLECOACHSCREW300', 400, 'each', day(0))]},
      {id:'t3', cat:'fibre', org:'KN Circet', ctype:'van', container:'202-C-8871', loc:'Claremorris',
       by:'Seán M', job:'j-month', started:day(3), finished:day(3), lines:[
         L('501COVERSUMPGRATE', 5, 'each', day(3))]},
      {id:'t4', cat:'fibre', org:'KN Circet', ctype:'', container:'Yard behind the depot', loc:'Claremorris',
       by:'Seán M', job:'j-daily', started:day(0), finished:day(0), lines:[
         L('500POLELABEL', 12, 'each', day(0))]}
    ];
    S.current = null;
    setViewOrgs(['KN Circet']);
    save();
  });
  await p.click('#t-mgr'); await p.waitForTimeout(600);
  await p.evaluate(()=>{ mgDefaults(); renderMgr(); }); await p.waitForTimeout(300);

  const bar = async () => await p.evaluate(()=>({
    job:$('mgJob').value, date:$('mgDate').value, loc:$('mgLoc').value,
    where:$('mgWhere').value, place:$('mgPlace').value,
    said:$('mgSaid').textContent,
    jobs:[...$('mgJob').options].map(o=>o.textContent),
    dates:[...$('mgDate').options].map(o=>o.textContent),
    locs:[...$('mgLocList').options].map(o=>o.value),
    wheres:[...$('mgWhere').options].map(o=>o.textContent),
    places:[...$('mgPlace').options].map(o=>o.textContent),
    lines: Number((($('tiles').textContent.match(/Lines called out(\d+)/)||[])[1])||0),
    item: $('tblItem').textContent, org: $('tblOrg').textContent, grp: $('tblGrp').textContent
  }));

  /* ---------- A. the bar itself ---------- */
  let b = await bar();
  t('the job list is the Count tab\'s list', b.jobs.join('|')==='All jobs|Daily van count|NBI stocktake — month end', b.jobs.join('|'));
  t('and it opens on the job you are counting', b.job==='j-daily', b.job);
  /* the list offers days that still have something on them given the OTHER
     filters — a date with nothing behind it is not worth offering */
  t('the date list is only days that have counts, plus all and a range',
     b.dates[0]==='All dates' && b.dates[b.dates.length-1]==='From / To…' && b.dates.length===3, JSON.stringify(b.dates));
  const allJobDates = await p.evaluate(()=>{ const k=MGF.job; MGF.job=''; renderMgFilters();
     const d=[...$('mgDate').options].map(o=>o.textContent); MGF.job=k; renderMgFilters(); return d; });
  t('and it widens when the job filter comes off', allJobDates.length===4, JSON.stringify(allJobDates));
  t('and it opens on today, because something was counted today',
     b.date===await p.evaluate(()=>dayKey(Date.now())), b.date);
  t('the location list is the contractor\'s own, 25 of them', b.locs.length===25 && b.locs.includes('Claremorris'), String(b.locs.length));
  t('Where offers the customer\'s place types plus Not specified',
     b.wheres[0]==='All' && b.wheres.includes('Not specified') && b.wheres.includes('Vehicle'), JSON.stringify(b.wheres));
  t('and Not specified is there because one line was counted without a type',
     b.wheres.filter(x=>x==='Not specified').length===1, JSON.stringify(b.wheres));

  /* ---------- B. the filters combine ---------- */
  const set = async (id, v) => { await p.selectOption('#'+id, v); await p.waitForTimeout(250); };
  await set('mgDate', '*');
  b = await bar();
  t('all dates on the daily job is four lines across three sessions', b.lines===4, 'lines='+b.lines);
  t('the line says what is on screen',
     /KN Circet · Daily van count · All dates/.test(b.said), b.said);

  await set('mgJob', 'j-month');
  b = await bar();
  t('switching job switches the numbers', b.lines===1 && /Sump Hole Grating/.test(b.item), b.lines+' '+b.item.slice(0,40));
  t('and the date list narrows to that job\'s days', b.dates.length===3, JSON.stringify(b.dates));

  await set('mgJob', 'j-daily');
  await p.evaluate(()=>{ MGF.loc='Castlebar'; renderMgr(); }); await p.waitForTimeout(250);
  b = await bar();
  t('a location narrows it to that location', b.lines===1 && /Coach Screw/.test(b.item), b.lines+' '+b.item.slice(0,40));
  t('and the line names it', /Castlebar/.test(b.said), b.said);

  await p.evaluate(()=>{ MGF.loc=''; renderMgr(); }); await p.waitForTimeout(250);
  await set('mgWhere', 'van');
  b = await bar();
  t('Where narrows to one type', b.lines===2 && /Medium Pole/.test(b.item), b.lines+' '+b.item.slice(0,40));
  t('and the registration list is scoped to it', b.places.join('|')==='All|202-C-8871', b.places.join('|'));

  await set('mgWhere', '—none—');
  b = await bar();
  t('Not specified finds the line counted with no type', b.lines===1 && /Pole Barcode Label/.test(b.item), b.lines+' '+b.item.slice(0,40));
  t('and says so on the line', /Not specified/.test(b.said), b.said);

  await set('mgWhere', 'van');
  await set('mgPlace', '202-C-8871');
  b = await bar();
  t('a registration narrows it again', b.lines===2 && /202-C-8871/.test(b.said), b.lines+' '+b.said);

  /* ---------- C. every table moves together ---------- */
  await set('mgJob', 'j-month');
  b = await bar();
  t('the by-item table respects the filters', /Sump Hole Grating/.test(b.item) && !/Medium Pole/.test(b.item), b.item.slice(0,60));
  t('the estate table respects them too', /202-C-8871/.test(b.org) && !/Castlebar inside store/.test(b.org), b.org.slice(0,80));
  t('and the product-group breakdown', /Covers & Accessories/.test(b.grp) && !/Poles/.test(b.grp), b.grp.slice(0,80));

  /* ---------- D. nothing to show says so ---------- */
  await p.evaluate(()=>{ MGF.loc='Belmullet'; renderMgr(); }); await p.waitForTimeout(250);
  b = await bar();
  t('an empty selection says so rather than showing a blank table',
     /Nothing counted for this selection/.test(b.item) && /Nothing counted for this selection/.test(b.org)
     && /Nothing counted for this selection/.test(b.grp), b.item.slice(0,60));

  /* ---------- E. clearing goes back to the default ---------- */
  await p.click('#mgClear'); await p.waitForTimeout(400);
  b = await bar();
  t('Clear filters goes back to this job, today', b.job==='j-daily' && b.loc==='' && b.where==='' && b.place==='',
     JSON.stringify({job:b.job, loc:b.loc, where:b.where, place:b.place}));

  /* ---------- F. a range ---------- */
  const range = await p.evaluate(async ()=>{
    const d = n => { const x=new Date(Date.now()-n*86400000);
      return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
    MGF.job=''; MGF.date='range'; MGF.from=d(5); MGF.to=d(1); renderMgr();
    return {shown:!$('mgFromWrap').classList.contains('hidden'), said:$('mgSaid').textContent,
            item:$('tblItem').textContent};
  });
  t('choosing a range shows the From and To boxes', range.shown===true);
  t('and a range that ends before today excludes today',
     /Sump Hole Grating/.test(range.item) && !/Medium Pole/.test(range.item), range.item.slice(0,60));
  t('and the line reads as a range', / to /.test(range.said), range.said);

  /* ---------- G. the export is what the screen shows ---------- */
  const X = require(require('path').join(H.ROOT,'node_modules','xlsx'));
  await p.click('#mgClear'); await p.waitForTimeout(300);
  await p.evaluate(()=>{ MGF.date='*'; MGF.where='van'; renderMgr(); }); await p.waitForTimeout(300);
  const before = await bar();
  const dl = p.waitForEvent('download',{timeout:15000}).catch(()=>null);
  await p.click('#mgExport');
  const d = await dl;
  t('Export to Excel produces a file', !!d, d? d.suggestedFilename():'no download');
  t('and the filename carries the contractor, the job and a date',
     !!d && /kn-circet/.test(d.suggestedFilename()) && /daily-van-count/.test(d.suggestedFilename())
     && /\d{4}-\d{2}-\d{2}\.xlsx$/.test(d.suggestedFilename()), d? d.suggestedFilename():'');
  if(d){
    await d.saveAs(H.tmp('rollup.xlsx'));
    const wb = X.readFile(H.tmp('rollup.xlsx'));
    t('two sheets — the rollup and every line behind it',
       wb.SheetNames.join('|')==='Rollup|Lines', wb.SheetNames.join('|'));
    const roll = X.utils.sheet_to_json(wb.Sheets['Rollup'],{header:1,defval:''});
    const head = roll.slice(0,12).map(r=>r.join(': '));
    t('a header block names every filter that was on',
       head.some(x=>/^Showing/.test(x)) && head.some(x=>/^Exported/.test(x))
       && head.some(x=>/^Counting job: Daily van count/.test(x))
       && head.some(x=>/^Where: Vehicle/.test(x))
       && head.some(x=>/^Date: All dates/.test(x)), JSON.stringify(head));
    const hi = roll.findIndex(r=>r[0]==='Item');
    t('the columns are the ones on screen',
       roll[hi].join('|')==='Item|Code|Product Group|Unit|Total|Whole packs|Value|Held by', JSON.stringify(roll[hi]));
    const body = roll.slice(hi+1);
    t('and the rows are exactly what the filters left',
       body.length===2 && body.some(r=>r[1]==='500CONPOLE9M') && body.some(r=>r[1]==='500POLESTEP')
       && !body.some(r=>r[1]==='500POLECOACHSCREW300'),
       JSON.stringify(body.map(r=>r[1])));

    const lines = X.utils.sheet_to_json(wb.Sheets['Lines'],{header:1,defval:''});
    t('the second sheet lists every underlying line',
       lines[0].join('|').startsWith('Date|Time|Location|Where|Registration / store') && lines.length===3,
       JSON.stringify(lines[0]));
    t('with the location, the where and the registration on each one',
       lines[1][2]==='Claremorris' && lines[1][3]==='Vehicle' && lines[1][4]==='202-C-8871',
       JSON.stringify(lines[1]));
    t('and who counted it', lines.slice(1).every(r=>r[13]==='Seán M'), JSON.stringify(lines.slice(1).map(r=>r[13])));
  }

  /* an empty selection has nothing to export */
  const none = await p.evaluate(async ()=>{ MGF.loc='Belmullet'; renderMgr(); return await exportRollup(); });
  t('an empty selection exports nothing rather than an empty workbook', none===false, String(none));
  await p.evaluate(()=>{ MGF.loc=''; renderMgr(); });

  /* ---------- H. a closed job exports the same way, frozen ---------- */
  const closed = await p.evaluate(()=>{
    const j = jobs().find(x=>x.id==='j-daily');
    S.closed = [buildSnapshot(j)];
    save(); renderHistory();
    return {rows:S.closed[0].rows.length, hasLoc:S.closed[0].rows.every(r=>'loc' in r)};
  });
  t('closing a job freezes the location on every row', closed.hasLoc===true && closed.rows===4, JSON.stringify(closed));
  await p.click('#t-hist'); await p.waitForTimeout(400);
  const dl2 = p.waitForEvent('download',{timeout:15000}).catch(()=>null);
  await p.click('#histList button[data-hx]');
  const d2 = await dl2;
  t('History exports a closed job', !!d2, d2? d2.suggestedFilename():'no download');
  if(d2){
    await d2.saveAs(H.tmp('closed.xlsx'));
    const wb2 = X.readFile(H.tmp('closed.xlsx'));
    const roll2 = X.utils.sheet_to_json(wb2.Sheets['Rollup'],{header:1,defval:''});
    t('in the same two-sheet format', wb2.SheetNames.join('|')==='Rollup|Lines', wb2.SheetNames.join('|'));
    t('and says the figures are frozen',
       roll2.slice(0,12).some(r=>/frozen/.test(r.join(' '))), JSON.stringify(roll2.slice(0,10)));
    const hi2 = roll2.findIndex(r=>r[0]==='Item');
    t('with the same columns as the live export',
       roll2[hi2].join('|')==='Item|Code|Product Group|Unit|Total|Whole packs|Value|Held by', JSON.stringify(roll2[hi2]));
    t('and every line of the job, not just the filtered ones',
       X.utils.sheet_to_json(wb2.Sheets['Lines'],{header:1,defval:''}).length===5,
       String(X.utils.sheet_to_json(wb2.Sheets['Lines'],{header:1,defval:''}).length));
  }

  const out = R.report('rollup — filters across the top', p.errs);
  await p.ctx.close();
  return out;
};
