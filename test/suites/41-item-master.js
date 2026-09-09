/* item master — editing, merging and export */
const X = require('xlsx');
module.exports = async function({ browser, H }){
  const R = H.results(); const { t, ok, bad } = R;
  const PAGE  = 'http://127.0.0.1:' + H.PAGE_PORT;
  const PROXY = 'http://127.0.0.1:' + H.PROXY_PORT;
  const sample = n => require('path').join(H.ROOT, 'sample-data', n);
  const shot   = n => require('path').join(__dirname, '..', 'screenshots', n);
  const p = await H.openApp(browser);
  const errs = p.errs;
  await p.click('#t-cat'); await p.waitForTimeout(500);

  const n0 = await p.evaluate(()=>items('fibre').length);
  t('the table lists the master', await p.evaluate(()=>document.querySelectorAll('#tblCat tbody tr').length)===n0, 'rows vs '+n0);

  /* ── search ── */
  await p.fill('#catSearch','pole'); await p.waitForTimeout(400);
  const searched = await p.evaluate(()=>({rows:document.querySelectorAll('#tblCat tbody tr').length, txt:$('catCount').textContent}));
  t('search narrows the table', searched.rows>0 && searched.rows<n0 && /of \d+ items/.test(searched.txt), JSON.stringify(searched));
  await p.fill('#catSearch',''); await p.waitForTimeout(300);

  /* ── edit an existing (built-in) item ── */
  await p.click('#tblCat button[data-edit="500CONPOLE9M"]'); await p.waitForTimeout(400);
  t('Edit opens a form on that row', await p.evaluate(()=>!!$('ie_code') && $('ie_code').value==='500CONPOLE9M'));
  await p.fill('#ie_short','9m creosote pole');
  await p.fill('#ie_alias','pole, nine metre pole, stick');
  await p.fill('#ie_price','152.50');
  await p.fill('#ie_group','01. Poles');
  await p.click('#ieSave'); await p.waitForTimeout(900);
  const edited = await p.evaluate(()=>{ const it=item('fibre','500CONPOLE9M');
    return {short:it.short, alias:it.alias, price:it.price, group:it.group, edited:it.edited,
            n:items('fibre').length, dupes:items('fibre').filter(x=>x.code==='500CONPOLE9M').length}; });
  t('editing a built-in saves without duplicating it', edited.short==='9m creosote pole' && edited.dupes===1 && edited.n===n0, JSON.stringify(edited));
  t('every field on it is editable', edited.price===152.5 && edited.group==='01. Poles' && /stick/.test(edited.alias), JSON.stringify(edited));
  t('the fields changed by hand are remembered', edited.edited && edited.edited.short===1 && edited.edited.alias===1, JSON.stringify(edited.edited));
  t('the edited row keeps its place in the list',
     await p.evaluate(()=>items('fibre').findIndex(i=>i.code==='500CONPOLE9M'))===await p.evaluate(()=>CATALOGUES.fibre.items.findIndex(i=>i.code==='500CONPOLE9M')));

  /* ── spoken-as reaches the voice engine ── */
  /* Fifty slots against a 398-row master: the tail can only carry one term per
     item, so an edit's FIRST phrase goes up straight away and the rest go when
     that item is in focus — the cursor window or the group being walked. */
  const kt = await p.evaluate(()=>keytermsFor());
  t('an edited item\'s spoken-as reaches the keyterms at once',
     ['pole','nine metre pole','stick'].some(x=>kt.includes(x)),
     JSON.stringify(kt.filter(x=>/pole|stick/i.test(x))));
  t('the list still fits inside the API limits with 398 items',
     kt.length<=50 && kt.every(x=>x.length<=20), 'n='+kt.length);
  const focused = await p.evaluate(()=>{
    /* walk the sheet to that item, which is what focus means */
    S.review = {key:'k', role:'contractor', mode:'all', idx:0, speak:false};
    REVIEW.active = true;
    const w = reviewWalk();
    S.review.idx = w.findIndex(r=>r.code==='500CONPOLE9M');
    const terms = keytermsFor();
    REVIEW.active = false; S.review = null;
    return terms;
  });
  t('and every phrase goes once that item is the one being walked',
     ['pole','nine metre pole','stick'].every(w=>focused.includes(w)), JSON.stringify(focused.slice(14,26)));

  /* ── add a new item ── */
  await p.click('#catNew'); await p.waitForTimeout(400);
  await p.fill('#ie_code','nbi-tst-1'); await p.fill('#ie_short','Test bracket');
  await p.fill('#ie_unit','each'); await p.fill('#ie_pack','50'); await p.fill('#ie_packName','box');
  await p.fill('#ie_alias','bracket, test bracket');
  await p.click('#ieSave'); await p.waitForTimeout(900);
  const added = await p.evaluate(()=>{ const it=item('fibre','NBI-TST-1');
    return {code:it.code, pack:it.pack, packName:it.packName, n:items('fibre').length}; });
  t('a new item is added, code upper-cased', added.code==='NBI-TST-1' && added.pack===50 && added.n===n0+1, JSON.stringify(added));
  /* the master has three real brackets, so this is a genuine tie — what matters
     is that the item just added is reachable immediately */
  const newParse = await p.evaluate(()=>{ const r=parse('four boxes of brackets','fibre');
    return {kind:r.kind, qty:r.qty, codes:(r.options||[]).map(o=>o.it.code), it:r.it?r.it.code:''}; });
  t('and it is reachable straight away',
    newParse.qty===4 && (newParse.it==='NBI-TST-1' || newParse.codes.includes('NBI-TST-1')),
    JSON.stringify(newParse));

  /* ── delete ── */
  await p.click('#tblCat button[data-edit="NBI-TST-1"]'); await p.waitForTimeout(300);
  await p.click('#ieDel'); await p.waitForTimeout(600);
  t('deleting a custom item removes it', await p.evaluate(()=>items('fibre').length)===n0);
  await p.click('#tblCat button[data-edit="500CONPOLE9M"]'); await p.waitForTimeout(300);
  await p.click('#ieDel'); await p.waitForTimeout(600);
  const delBuiltin = await p.evaluate(()=>({n:items('fibre').length, gone:!items('fibre').some(i=>i.code==='500CONPOLE9M'), tomb:(S.deleted&&S.deleted.fibre)||[]}));
  t('deleting a built-in item sticks, with a tombstone', delBuiltin.gone && delBuiltin.n===n0-1 && delBuiltin.tomb.includes('500CONPOLE9M'), JSON.stringify(delBuiltin));
  await p.evaluate(()=>{ S.deleted.fibre=[]; save(); renderCat(); }); await p.waitForTimeout(400);
  /* the delete above threw the override away with it, so put the edit back
     before testing what an upload does to a hand-edited row */
  await p.click('#tblCat button[data-edit="500CONPOLE9M"]'); await p.waitForTimeout(300);
  await p.fill('#ie_short','9m creosote pole');
  await p.fill('#ie_alias','pole, nine metre pole, stick');
  await p.click('#ieSave'); await p.waitForTimeout(800);
  t('the edit is back in place before the merge test',
     await p.evaluate(()=>item('fibre','500CONPOLE9M').short)==='9m creosote pole',
     await p.evaluate(()=>item('fibre','500CONPOLE9M').short));

  /* ── merge on re-upload ── */
  const csv = 'Item code,Short description,Unit of measure,Unit value,Product Group\n500CONPOLE9M,SUPPLIER NAME FOR POLE,each,199.00,01. Poles\nNEW-XYZ,Brand new thing,each,5.00,01. Poles\n';
  require('fs').writeFileSync(H.tmp('merge.csv'), csv);
  await p.setInputFiles('#file', H.tmp('merge.csv')); await p.waitForTimeout(1400);
  await p.click('#impAdd'); await p.waitForTimeout(1400);
  const merged = await p.evaluate(()=>{ const it=item('fibre','500CONPOLE9M');
    return {short:it.short, alias:it.alias, price:it.price, newOne:!!items('fibre').find(i=>i.code==='NEW-XYZ'),
            note:$('impNote').textContent}; });
  t('a re-upload adds the new rows', merged.newOne===true, merged.note.slice(0,80));
  t('and never wipes a hand-edited field', merged.short==='9m creosote pole', JSON.stringify(merged.short));
  t('nor the spoken-as words', /stick/.test(merged.alias||''), JSON.stringify(merged.alias));

  /* ── Replace all is the only thing that clears edits ── */
  await p.setInputFiles('#file', H.tmp('merge.csv')); await p.waitForTimeout(1400);
  await p.click('#impReplace'); await p.waitForTimeout(1400);
  const replaced = await p.evaluate(()=>{ const it=item('fibre','500CONPOLE9M'); return {short:it.short, alias:it.alias, n:items('fibre').length}; });
  t('Replace all does clear them, as its label says', replaced.short==='SUPPLIER NAME FOR POLE' && !/stick/.test(replaced.alias||''), JSON.stringify(replaced));

  /* ── export ── */
  const dl = p.waitForEvent('download',{timeout:15000}).catch(()=>null);
  await p.click('#catExport');
  const d = await dl;
  t('Export to Excel produces a file', !!d, d? d.suggestedFilename():'no download');
  if(d){
    await d.saveAs(H.tmp('master.xlsx'));
    const wb = X.readFile(H.tmp('master.xlsx'));
    const aoa = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
    t('the export carries the columns the importer reads back',
       /item code/i.test(aoa[0][0]) && aoa[0].includes('Spoken as') && aoa.length===replaced.n+1,
       JSON.stringify(aoa[0]));
  }

  await p.evaluate(()=>{ localStorage.removeItem('trucount.v1'); });
  const out = R.report('item master — editing, merging and export', errs);
  await p.ctx.close();
  return out;
};
