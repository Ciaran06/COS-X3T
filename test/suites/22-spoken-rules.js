/* The Spoken rules sheet from the item master, built into the matcher. Both the
   words the counter said and the item's own name go through spokenNorm(), so a
   new item is found without anyone hand-writing an alias for it. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser, {});

  t('the master is the fibre catalogue', await p.evaluate(()=>items('fibre').length)===388,
    String(await p.evaluate(()=>items('fibre').length)));

  /* ---- the rules, one at a time ---- */
  const N = async s => await p.evaluate(x=>spokenNorm(x), s);
  const same = async (a,b,name)=> t(name, (await N(a))===(await N(b)), '"'+a+'" -> '+(await N(a))+'   vs   "'+b+'" -> '+(await N(b)));

  await same('three fifty mil pole bolt','350mm Pole Bolt', 'mil / mill / millimetre is mm');
  await same('coach screw seventy five mil','Coach Screw 75 mm-200 Box', 'and a pack suffix is not spoken');
  await same('forty kilometre','40km', 'kilometre is km');
  await same('twelve fibre','012F', 'a fibre count loses its leading zero');
  await same('twelve core','12 F', 'core, F and fibre are the same word');
  await same('em twelve by three hundred mil','M12 x 300mm', 'M twelve is a thread size, and "by" is x');
  await same('twenty four way closure','24-way closure', 'twenty four way is 24 way');
  await same('fibre retraction tool','301124988 Fibre Retraction Tool', 'a leading SAP code is not spoken');
  await same('pole bolt','Pole Bolt c/w 1 Square Washer', 'nothing after c/w is spoken');
  await same('eight and a half light pole','8.5Mt Light Pole', 'and a half is point five');
  await same('a d s s','ADSS', 'a spelled-out acronym closes up');
  await same('em dee you','MDU', 'so does one said as letter names');
  t('"three fifty" is 350, not 53', (await N('three fifty'))==='350', await N('three fifty'));
  t('"three hundred and fifty" is 350 too', (await N('three hundred and fifty'))==='350', await N('three hundred and fifty'));

  /* ---- poles: the letter is the grade ---- */
  /* the written form says "Medium" twice over once 9.0m is read as a grade, so
     the strings differ while the tokens that matter are the same — the contract
     is that they match, not that they are character-identical */
  const medium = await p.evaluate(()=>{
    const r = matchItemAll('fibre', norm('nine medium pole').split(' ').filter(Boolean));
    return r.slice(0,2).map(x=>x.it.code+'@'+x.conf.toFixed(2));
  });
  t('a medium pole said out loud reaches the medium pole',
    medium.some(x=>x.startsWith('500CONPOLE9M@1')), JSON.stringify(medium));
  await same('nine em pole','9M pole', 'em is M is medium');
  await same('nine light pole','9Mt Light Pole', 'and L is light');
  const npole = (await N('nine m pole')).split(' ');
  t('a pole never reads M as metres',
    !npole.includes('9m') && npole.includes('9medium'), JSON.stringify(npole));
  t('off a pole, metres are still metres', /9m/.test(await N('nine metre duct')), await N('nine metre duct'));

  /* ---- what it means for matching ---- */
  const top = async s => await p.evaluate(x=>{
    const r = matchItemAll('fibre', norm(x).split(' ').filter(Boolean));
    return r.length? {code:r[0].it.code, conf:r[0].conf, next:r[1]?r[1].conf:0} : null;
  }, s);
  const cases = [
    ['three fifty mil pole bolt', '500CABLEPOLEBOLT'],
    ['three hundred mil pole bolt', '500CABLEPOLEBOLT300MM'],
    ['nine light pole', '500CONPOLE9L'],
    ['nine el pole', '500CONPOLE9L'],
    ['eight and a half light pole', '500CONPOLE8HL'],
    ['ten medium pole', '500CONPOLE10M'],
    ['em twelve by three hundred mil pole bolt', '500CABLEPOLEBOLTM12X300MM'],
  ];
  for(const [said, want] of cases){
    const r = await top(said);
    t('"'+said+'" finds '+want+' with no alias written for it',
      !!r && r.code===want && r.conf>=0.55, JSON.stringify(r));
  }

  /* the one thing that must never happen */
  const hole = await p.evaluate(()=>{
    const pr = parse('nine m hole 350 each','fibre');
    return {kind:pr.kind, codes:(pr.options||[]).map(o=>o.it.code), it:pr.it?pr.it.code:''};
  });
  t('"nine M" of something that is not a pole never lands on a pole',
    !/POLE/i.test(hole.codes.join(' ')+hole.it), JSON.stringify(hole));

  /* an alias reduced to a stopword must not identify anything */
  t('a candidate with no identifying word is dropped',
    await p.evaluate(()=>parse('three hundred and fifty','fibre').kind)==='noitem');

  /* the drum flag survived the merge */
  t('the merge kept what the sheet does not carry — drum items are still drums',
    await p.evaluate(()=>['500CABLEAER96F','500CABLEAER48F','500CABLEAER24F'].every(c=>item('fibre',c).drum===true)));

  /* ---- two numbers side by side are two numbers ---- */
  /* This is what the demo rows were hiding. "six nine metre poles" was being
     read as fifteen of something, because a run of number words was always
     added up. Every one of these is a quantity and then a size. */
  t('"six nine metre medium poles" is six poles, nine metres tall',
    await N('six nine metre medium poles')==='6 9medium poles', await N('six nine metre medium poles'));
  t('a written "8 5" is eight and five, not thirteen', await N('8 5 mt light pole')==='8 5light pole', await N('8 5 mt light pole'));
  t('but a real number still adds up', await N('one thousand two hundred and fifty')==='1250', await N('one thousand two hundred and fifty'));
  t('and "twenty four" is still twenty four', await N('twenty four fibre')==='24f', await N('twenty four fibre'));

  /* ---- the pole grade, whichever way round it is said ---- */
  const pole = async s => await p.evaluate(x=>spokenNorm(x, true), s);
  t('the sheet says "Medium Pole 9.0m" and the counter says "nine metre medium pole"',
    await pole('Medium Pole 9.0m') === await pole('nine metre medium pole'),
    (await pole('Medium Pole 9.0m'))+' vs '+(await pole('nine metre medium pole')));
  t('a grade already spelled out leaves the metres alone — "Light Pole 10.0m" is not ten medium',
    /10light/.test(await pole('Light Pole 10.0m')) && !/10medium/.test(await pole('Light Pole 10.0m')),
    await pole('Light Pole 10.0m'));
  t('a bare letter with no grade beside it is still the grade', /9medium/.test(await pole('9 M')), await pole('9 M'));
  t('and the candidate keeps its own decimal — 8.5, never 13',
    await p.evaluate(()=>candData(item('fibre','500CONPOLE8HL')).toks[0].join(' '))==='8.5light pole',
    await p.evaluate(()=>candData(item('fibre','500CONPOLE8HL')).toks[0].join(' ')));

  const poles = await p.evaluate(()=>['six nine metre medium poles','four nine metre light poles','twelve ten metre medium poles']
    .map(s=>{ const r=parse(s,'fibre'); return s+' -> '+(r.it? r.it.code : r.kind); }));
  t('every grade and height lands on its own SAP code',
    JSON.stringify(poles)===JSON.stringify(['six nine metre medium poles -> 500CONPOLE9M',
      'four nine metre light poles -> 500CONPOLE9L','twelve ten metre medium poles -> 500CONPOLE10M']),
    JSON.stringify(poles));
  t('and a bare "ten poles" asks, because the master has a dozen of them',
    await p.evaluate(()=>parse('ten poles','fibre').kind)==='choose');

  /* ---- the demo rows are gone ---- */
  t('no demo codes are left among the real ones',
    await p.evaluate(()=>!items('fibre').some(i=>/^(FIB-|DUCT-|POLE-|HANG-|MH-|CONN-|SCREW-|CLOS-)/.test(i.code))),
    await p.evaluate(()=>items('fibre').filter(i=>/^[A-Z]+-/.test(i.code)).map(i=>i.code).join(',')));
  t('a drum ID with no cable named after it asks rather than picking one',
    await p.evaluate(()=>parse('drum a b c d one eight hundred metres','fibre').kind)==='choose');

  const out = R.report('spoken rules — a written part number, said out loud', p.errs);
  await p.ctx.close();
  return out;
};
