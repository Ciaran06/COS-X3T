/* The Spoken rules sheet from the item master, built into the matcher. Both the
   words the counter said and the item's own name go through spokenNorm(), so a
   new item is found without anyone hand-writing an alias for it. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser, {sdk:false});

  t('the master is the fibre catalogue', await p.evaluate(()=>items('fibre').length)===398,
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
    await p.evaluate(()=>['FIB-96F','FIB-48F','FIB-24F'].every(c=>item('fibre',c).drum===true)));

  const out = R.report('spoken rules — a written part number, said out loud', p.errs);
  await p.ctx.close();
  return out;
};
