/* "Where are you counting?" is optional. A count goes straight against the
   location until somebody taps a type, and nothing anywhere invents "Vehicle"
   for a line that never said so — a blank is the truth and a wrong label is not. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const sample = n => require('path').join(H.ROOT, 'sample-data', n);
  const X = require(require('path').join(H.ROOT,'node_modules','xlsx'));
  const p = await H.openApp(browser);

  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(500);
  await p.click('#t-cat'); await p.waitForTimeout(400);
  await p.selectOption('#locOrg', 'KN Circet');
  await p.setInputFiles('#locFile', sample('KN02_locations.xlsx'));
  await p.waitForTimeout(1500);
  await p.click('#t-count'); await p.waitForTimeout(400);
  await p.evaluate(()=>{ setViewOrgs(['KN Circet']); afterViewChange&&afterViewChange();
    renderLocField(); }); await p.waitForTimeout(300);

  /* ---------- A. nothing is chosen, and you can see that ---------- */
  const start = await p.evaluate(()=>({
    ptype: PTYPE,
    chips: [...document.querySelectorAll('#segs button[data-p]')].map(b=>b.textContent.trim()),
    first: document.querySelector('#segs button').textContent.trim(),
    pressed: document.querySelector('#segs button[aria-pressed="true"]').textContent.trim(),
    note: ($('segs').parentNode.querySelector('.segnote')||{}).textContent||'',
    regHidden: $('placeWrap').classList.contains('hidden')
  }));
  t('no place type is selected to begin with', start.ptype==='', JSON.stringify(start.ptype));
  t('"Not specified" is the first chip and the pressed one',
     start.first==='Not specified' && start.pressed==='Not specified', JSON.stringify({first:start.first, pressed:start.pressed}));
  t('and the row says it is optional', /Optional/i.test(start.note), start.note);
  t('the registration field is not there until a type is chosen', start.regHidden===true);

  /* ---------- B. tapping one brings the field back ---------- */
  await p.click('#segs button[data-p="van"]'); await p.waitForTimeout(300);
  const van = await p.evaluate(()=>({ptype:PTYPE, regHidden:$('placeWrap').classList.contains('hidden'), label:$('lVan').textContent}));
  t('tapping Vehicle chooses it and shows the registration field',
     van.ptype==='van' && van.regHidden===false && van.label==='Registration', JSON.stringify(van));
  await p.fill('#fVan','202-C-8871'); await p.waitForTimeout(200);
  await p.click('#segs button[data-p=""]'); await p.waitForTimeout(300);
  const back = await p.evaluate(()=>({ptype:PTYPE, regHidden:$('placeWrap').classList.contains('hidden'), reg:$('fVan').value}));
  t('and tapping "Not specified" puts it away again and clears it',
     back.ptype==='' && back.regHidden===true && back.reg==='', JSON.stringify(back));

  /* ---------- C. a line with no type still lands on the location ---------- */
  const line = await p.evaluate(async ()=>{
    setLoc('Claremorris');
    startSession();
    onHeardFinal('ten pole steps');
    await new Promise(r=>setTimeout(r,2600));
    const s = cur();
    return {lines:s.lines.length, ctype:s.ctype, container:s.container, loc:s.loc,
            band:$('whoWhere').textContent, tally:$('tally').textContent.slice(0,80)};
  });
  t('a line counted with no type is still recorded', line.lines===1, JSON.stringify(line.lines));
  t('and it lands on the location, with no type and no registration',
     line.ctype==='' && line.container==='' && line.loc==='Claremorris', JSON.stringify(line));
  t('the band names the location and invents nothing',
     /Claremorris/.test(line.band) && !/Vehicle|Place/.test(line.band), line.band);
  t('and neither does the tally heading', !/Vehicle|Place/.test(line.tally), line.tally);

  /* ---------- D. blank in the export, "Not specified" in the filter ---------- */
  await p.evaluate(()=>{ S.sessions = [Object.assign({}, cur(), {finished:Date.now()})]; S.current=null; save(); });
  await p.click('#t-mgr'); await p.waitForTimeout(600);
  await p.evaluate(()=>{ mgDefaults(); MGF.date='*'; renderMgr(); }); await p.waitForTimeout(300);
  const filt = await p.evaluate(()=>({
    wheres:[...$('mgWhere').options].map(o=>o.textContent),
    rows:$('tblOrg').textContent
  }));
  t('the Rollup offers "Not specified" because a line has no type',
     filt.wheres.includes('Not specified'), JSON.stringify(filt.wheres));
  const only = await p.evaluate(()=>{ MGF.where='—none—'; renderMgr();
    return {said:$('mgSaid').textContent, item:$('tblItem').textContent}; });
  t('and filtering by it finds that line', /Pole Step/.test(only.item) && /Not specified/.test(only.said), only.said);
  t('the estate row falls back to the location name rather than a blank',
     /Claremorris/.test(filt.rows), filt.rows.slice(0,120));

  const dl = p.waitForEvent('download',{timeout:15000}).catch(()=>null);
  await p.click('#mgExport');
  const d = await dl;
  t('it exports', !!d, d? d.suggestedFilename():'no download');
  if(d){
    await d.saveAs(H.tmp('nowhere.xlsx'));
    const wb = X.readFile(H.tmp('nowhere.xlsx'));
    const lines = X.utils.sheet_to_json(wb.Sheets['Lines'],{header:1,defval:''});
    const row = lines[1];
    t('the Where column is blank in the sheet, not a label nobody said',
       row[3]==='' && row[4]==='', JSON.stringify(row.slice(0,6)));
    t('and the location is still on the row', row[2]==='Claremorris', JSON.stringify(row.slice(0,6)));
  }

  const out = R.report('where — optional, and blank when it was never said', p.errs);
  await p.ctx.close();
  return out;
};
