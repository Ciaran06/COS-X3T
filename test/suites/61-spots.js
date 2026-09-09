/* Storage areas are optional and off. A count goes against the location until
   somebody names an area; nothing is ever seeded. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser);
  await p.evaluate(()=>{ $('setup').classList.add('hidden'); });

  t('no spot is selected to begin with', await p.evaluate(()=>SPOT)==='', await p.evaluate(()=>SPOT));
  const chips = await p.evaluate(()=>[...document.querySelectorAll('#spots .spot')].map(b=>b.textContent.trim()));
  t('there are no shelf chips, only the add button',
    chips.length===1 && /Add storage area/.test(chips[0]), JSON.stringify(chips));
  t('nothing named Shelf A1 is anywhere near it',
    !/Shelf A/.test(await p.textContent('#spots')), await p.textContent('#spots'));

  /* ---- a line with no spot goes against the location ---- */
  const bare = await p.evaluate(()=>{
    startSession();
    const l = writeLine(item('fibre','POLE-9'), 12, 'each', null, 'twelve poles');
    return {loc:l.loc, spot:SPOT, lines:cur().lines.length};
  });
  t('a counted line has no storage area on it', (bare.loc===''||bare.loc==null) && bare.lines===1, JSON.stringify(bare));
  await p.waitForTimeout(300);
  t('and the tally shows no area heading',
    !/WHOLE LOCATION|SHELF/i.test(await p.textContent('#tally')), (await p.textContent('#tally')).slice(0,120));
  t('the Storage areas tile is not shown either',
    !/Storage areas/.test(await p.textContent('#prog')), await p.textContent('#prog'));

  /* ---- adding one, by hand ---- */
  await p.click('#spotAdd'); await p.waitForTimeout(300);
  t('the add button opens a name box', await p.evaluate(()=>!!$('spotName')));
  await p.fill('#spotName', 'Bay 3');
  await p.click('#spotGo'); await p.waitForTimeout(400);
  t('it is named whatever was typed', await p.evaluate(()=>SPOT)==='Bay 3', await p.evaluate(()=>SPOT));
  const after = await p.evaluate(()=>{
    const l = writeLine(item('fibre','CONN-KIT'), 4, 'each', null, 'four kits');
    return {loc:l.loc, chips:[...document.querySelectorAll('#spots .spot')].map(b=>b.textContent.trim())};
  });
  t('lines now carry that area', after.loc==='Bay 3', JSON.stringify(after.loc));
  t('and a "Whole location" chip appears to get back out',
    after.chips.some(c=>/Whole location/.test(c)) && after.chips.some(c=>c==='Bay 3'), JSON.stringify(after.chips));
  await p.waitForTimeout(300);
  t('the tally splits by area once one is in use',
    /BAY 3/i.test(await p.textContent('#tally')) && /WHOLE LOCATION/i.test(await p.textContent('#tally')));

  const back = await p.evaluate(()=>{
    [...document.querySelectorAll('#spots .spot')].find(b=>/Whole location/.test(b.textContent)).click();
    const l = writeLine(item('fibre','SCREW-100'), 100, 'each', null, 'hundred screws');
    return {spot:SPOT, loc:l.loc};
  });
  t('Whole location puts you back to no area', back.spot==='' && back.loc==='', JSON.stringify(back));

  /* ---- by voice ---- */
  const voiceNamed = await p.evaluate(async ()=>{ handle('shelf B2'); await new Promise(r=>setTimeout(r,200)); return SPOT; });
  t('saying a named area sets it', voiceNamed==='Shelf B2', voiceNamed);
  const voiceBare = await p.evaluate(async ()=>{
    SPOT=''; SPOTADD=false; renderSpots();
    handle('new spot');
    await new Promise(r=>setTimeout(r,250));
    return {spot:SPOT, asking:!!$('spotName'), said:$('cf1').textContent};
  });
  t('saying "new spot" with no name asks what it is called, rather than inventing one',
    voiceBare.spot==='' && voiceBare.asking===true && /What is it called/.test(voiceBare.said), JSON.stringify(voiceBare));

  /* ---- the export column ---- */
  const csvNone = await p.evaluate(()=>{
    /* a controlled scope: only the count we are about to make */
    S.sessions = []; S.current = null; SPOT = ''; SPOTADD = false;
    startSession();
    writeLine(item('fibre','POLE-9'), 5, 'each', null, 'five poles');
    return csv().split('\n')[0];
  });
  t('with no areas used the export has no area column',
    !/Storage area/.test(csvNone) && /Location,Code/.test(csvNone), csvNone.slice(0,110));
  const csvSome = await p.evaluate(()=>{
    addSpot('Back yard');
    writeLine(item('fibre','CONN-KIT'), 2, 'each', null, 'two kits');
    const rows = csv().split('\n');
    return {head:rows[0], row:rows.find(r=>/Back yard/.test(r))||''};
  });
  t('once one is used the column appears', /Location,Storage area,Code/.test(csvSome.head), csvSome.head.slice(0,120));
  t('and carries the name', /Back yard/.test(csvSome.row), csvSome.row.slice(0,100));

  const out = R.report('storage areas — optional, and never invented', p.errs);
  await p.ctx.close();
  return out;
};
