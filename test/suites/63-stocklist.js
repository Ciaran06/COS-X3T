/* The stock list on the Count tab.

   The panel is the whole item master, not a list of what has been counted, with
   a box on each row holding what this location has so far. A counter working
   down a shelf sees the row before anybody has said it, and can type the number
   when saying it is not worth the trouble. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser);
  await p.evaluate(()=>{ $('setup').classList.add('hidden'); });
  await p.waitForTimeout(300);

  const qty  = c => p.evaluate(c=>{
    const i = document.querySelector('#stockList input.qty[data-code="'+c+'"]');
    return i ? i.value : null;
  }, c);
  const rows = () => p.evaluate(()=>[...document.querySelectorAll('#stockList tr:not(:has(.none))')]
                                      .map(r=>r.querySelector('input.qty').dataset.code));

  /* ── it is the master, not the count ── */
  const master = await p.evaluate(()=>items('fibre').map(i=>i.code));
  t('every item in the master has a row before anything is counted',
    JSON.stringify(await rows())===JSON.stringify(master), (await rows()).length+' of '+master.length);
  t('in the same order the Setup tab lists them',
    (await rows())[0]===master[0] && (await rows())[master.length-1]===master[master.length-1]);
  const first = await p.evaluate(()=>{
    const r = document.querySelector('#stockList tr');
    const it = items('fibre')[0];
    return {txt:r.querySelector('td.nm').textContent, code:it.code, short:it.short, unit:it.unit, group:groupOf(it)};
  });
  t('a row carries the description, the code, the unit and the product group',
    first.txt.includes(first.short) && first.txt.includes(first.code)
    && first.txt.includes(first.unit) && first.txt.includes(first.group), first.txt);
  t('the box takes a number keyboard on a phone',
    await p.evaluate(()=>document.querySelector('#stockList input.qty').getAttribute('inputmode'))==='numeric');
  t('nothing counted is an empty box, not a zero', await qty('500CONPOLE9M')==='');

  /* ── search ── */
  await p.fill('#stockSearch','pole'); await p.waitForTimeout(250);
  const byWord = await rows();
  t('typing filters the list as you go', byWord.length>0 && byWord.length<master.length, byWord.length+' rows');
  await p.fill('#stockSearch','500CONPOLE9M'); await p.waitForTimeout(250);
  t('a code finds its one row', JSON.stringify(await rows())==='["500CONPOLE9M"]', JSON.stringify(await rows()));
  await p.evaluate(()=>{ const it=item('fibre','3FE49328CB');
    upsertItem('fibre', Object.assign({}, it, {alias:'combi box'})); renderTally(); });
  await p.fill('#stockSearch','combi box'); await p.waitForTimeout(250);
  t('a spoken-as alias finds it too', (await rows()).includes('3FE49328CB'), JSON.stringify(await rows()));
  await p.fill('#stockSearch','zzz nothing'); await p.waitForTimeout(250);
  t('nothing matching says so rather than showing an empty panel',
    /Nothing matches/.test(await p.textContent('#stockList')));
  await p.fill('#stockSearch',''); await p.waitForTimeout(250);
  t('clearing it brings the whole master back', (await rows()).length===master.length);

  /* ── a spoken line fills the box ── */
  await p.evaluate(()=>{ startSession(); writeLine(item('fibre','500CONPOLE9M'), 12, 'each', null, 'twelve poles'); });
  await p.waitForTimeout(400);
  t('a spoken count lands in the box', await qty('500CONPOLE9M')==='12', await qty('500CONPOLE9M'));
  t('and the counted row is marked',
    await p.evaluate(()=>document.querySelector('#stockList input.qty[data-code="500CONPOLE9M"]').closest('tr').classList.contains('has')));

  /* ── typing one ── */
  await p.fill('#stockList input.qty[data-code="3FE49328CB"]','7');
  await p.evaluate(()=>document.querySelector('#stockList input.qty[data-code="3FE49328CB"]').blur());
  await p.waitForTimeout(400);
  const typed = await p.evaluate(()=>{
    const s = cur(), l = s.lines[s.lines.length-1];
    return {code:l.code, qty:l.qty, unit:l.unit, job:s.job, container:s.container, eng:l.eng,
            lines:s.lines.length, queued:(S.out||[]).filter(o=>o.kind==='line').length};
  });
  t('typing a number writes a count line on the same job and location',
    typed.code==='3FE49328CB' && typed.qty===7 && typed.job===await p.evaluate(()=>cur().job), JSON.stringify(typed));
  t('it is saved on the phone with nothing in the way',
    typed.lines===2 && await p.evaluate(()=>JSON.parse(localStorage.getItem('trucount.v1')).current.lines.length)===2,
    JSON.stringify(typed));
  t('but the record says it was typed, not heard', typed.eng==='Typed', typed.eng);
  t('the totals at the top follow it',
    /2\s*Lines/i.test(await p.textContent('#prog')) && /2\s*Items/i.test(await p.textContent('#prog')),
    await p.textContent('#prog'));

  /* ── the box is the total, not an addition ── */
  await p.fill('#stockList input.qty[data-code="500CONPOLE9M"]','20');
  await p.evaluate(()=>document.querySelector('#stockList input.qty[data-code="500CONPOLE9M"]').blur());
  await p.waitForTimeout(400);
  t('setting the box sets the total rather than adding to it', await qty('500CONPOLE9M')==='20', await qty('500CONPOLE9M'));
  const hist = await p.evaluate(()=>cur().lines.filter(l=>l.code==='500CONPOLE9M').map(l=>l.qty));
  t('the correction is a line in the record, not a silent overwrite of one',
    JSON.stringify(hist)==='[12,8]', JSON.stringify(hist));
  await p.evaluate(()=>doUndo()); await p.waitForTimeout(400);
  t('so Undo last still takes the spoken line back off', await qty('500CONPOLE9M')==='12', await qty('500CONPOLE9M'));

  /* ── zero and clearing ── */
  await p.fill('#stockList input.qty[data-code="500CONPOLE9M"]','0');
  await p.evaluate(()=>document.querySelector('#stockList input.qty[data-code="500CONPOLE9M"]').blur());
  await p.waitForTimeout(400);
  t('a counter can type nought and have it stick', await qty('500CONPOLE9M')==='',
    JSON.stringify(await p.evaluate(()=>rollLines(cur().lines,'fibre')['500CONPOLE9M'].base)));
  await p.fill('#stockList input.qty[data-code="3FE49328CB"]','');
  await p.evaluate(()=>document.querySelector('#stockList input.qty[data-code="3FE49328CB"]').blur());
  await p.waitForTimeout(400);
  t('and clearing it means none of them', await qty('3FE49328CB')==='',
    JSON.stringify(await p.evaluate(()=>rollLines(cur().lines,'fibre')['3FE49328CB'].base)));
  t('a negative is refused rather than counted', await p.evaluate(async ()=>{
    const i = document.querySelector('#stockList input.qty[data-code="3FE49328CB"]');
    const n = cur().lines.length;
    i.value='-4'; i.dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,150));
    return cur().lines.length===n;
  }));

  /* ── a Setup edit shows here straight away ── */
  await p.click('#t-cat'); await p.waitForTimeout(400);
  await p.click('#tblCat button[data-edit="500CONPOLE9M"]'); await p.waitForTimeout(300);
  await p.fill('#ie_short','Creosote pole, nine metre');
  await p.click('#ieSave'); await p.waitForTimeout(600);
  await p.click('#t-count'); await p.waitForTimeout(400);
  t('an edit made on the Setup tab is on this list without a reload',
    /Creosote pole, nine metre/.test(await p.textContent('#stockList')));

  /* ── what survives a spoken line landing mid-thumb ── */
  await p.evaluate(()=>{ const b=document.querySelector('.stockbox'); b.scrollTop = 400; });
  await p.evaluate(()=>{ writeLine(item('fibre','500POLESTEP'), 3, 'each', null, 'three steps'); });
  await p.waitForTimeout(400);
  t('a line landing does not throw the list back to the top',
    await p.evaluate(()=>document.querySelector('.stockbox').scrollTop)>200,
    await p.evaluate(()=>document.querySelector('.stockbox').scrollTop));

  /* ── the one empty state left ── */
  await p.evaluate(()=>{ S.hideBuiltin=S.hideBuiltin||{}; S.hideBuiltin.fibre=true; S.custom.fibre=[]; save(); renderTally(); });
  await p.waitForTimeout(300);
  t('with no master loaded it says so, and says where to get one',
    /No item master loaded yet/.test(await p.textContent('#tally')));

  const out = R.report('the stock list — the whole master, with a box on each row', p.errs);
  await p.ctx.close();
  return out;
};
