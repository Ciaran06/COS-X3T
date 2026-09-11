/* Batch A: signing in, finding out which organisation you are in and which
   books you can see, and counting against that book's item master instead of
   the one baked into the page. Nothing here writes a count — that is Batch B.

   The transport is stubbed, so what this proves is the app's half. The other
   half is row level security, which lives in the database and is proved by
   running policies.sql and trying it on two phones. */
module.exports = async function({ browser, H }){
  const R = H.results(); const t = R.t;
  const p = await H.openApp(browser);
  await p.evaluate(()=>saveRole('nbi')); await p.waitForTimeout(400);
  await p.click('#t-cat'); await p.waitForTimeout(500);

  /* ---------- A. signed out, nothing changes ---------- */
  const off = await p.evaluate(()=>({
    on: CLOUD.on, ready: cloudReady(),
    box: $('acctBox').textContent,
    items: items('fibre').length,
    cfgShown: !$('acctCfg').classList.contains('hidden')
  }));
  t('with no project set the app just counts, as it always did',
     off.on===false && off.ready===false && off.items===388, JSON.stringify({on:off.on, items:off.items}));
  t('and the panel says so rather than showing a dead form',
     /counts locally/.test(off.box) && off.cfgShown===true, off.box.slice(0,90));

  /* ---------- B. the project details, then a code ---------- */
  await p.fill('#cbUrl','https://demo.supabase.co');
  await p.fill('#cbKey','anon-key-for-the-browser');
  await p.click('#cbSave'); await p.waitForTimeout(500);
  const conf = await p.evaluate(()=>({url:window.__sb.url, key:window.__sb.key,
      storageKey:(window.__sb.opts&&window.__sb.opts.auth||{}).storageKey,
      form: !!document.getElementById('cbEmail')}));
  t('saving the project makes a client with those details',
     conf.url==='https://demo.supabase.co' && conf.key==='anon-key-for-the-browser', JSON.stringify(conf));
  t('and the session is kept on the device, so a counter signs in once',
     conf.storageKey==='trucount.auth', String(conf.storageKey));
  t('the sign-in form appears', conf.form===true);

  const bad = await p.evaluate(async ()=>{
    try{ await cloudSendCode('not-an-email'); return 'accepted'; }
    catch(e){ return String(e.message); }
  });
  t('an address that is not one is refused before it is sent', /does not look like an email/.test(bad), bad);

  await p.fill('#cbEmail','sean@kncircet.ie');
  await p.click('#cbSend'); await p.waitForTimeout(500);
  const sent = await p.evaluate(()=>({to:window.__sb.sent, code:!!document.getElementById('cbCode'),
      note:$('acctNote').textContent}));
  t('a six-digit code goes to that address', sent.to.join()==='sean@kncircet.ie', JSON.stringify(sent.to));
  t('and the code box appears', sent.code===true && /Code sent/.test(sent.note), sent.note);

  const wrong = await p.evaluate(async ()=>{
    try{ await cloudVerify('000000'); return 'accepted'; }catch(e){ return String(e.message); }
  });
  t('the wrong code does not sign you in', /expired or is invalid/.test(wrong) , wrong);
  t('and you are still signed out', await p.evaluate(()=>CLOUD.on)===false);

  /* ---------- C. signed in: org, books, master, locations ---------- */
  await p.evaluate(()=>{
    window.__sbData.orgs = [{id:'o-kn', name:'KN Circet'}, {id:'o-nbi', name:'NBI'}];
    window.__sbData.profiles = [{id:'u-1', name:'Seán M', role:'counter', org_id:'o-kn',
                                 orgs:{id:'o-kn', name:'KN Circet'}}];
    window.__sbData.books = [
      {id:'b-nbi',  name:'NBI stock',       catalogue:'fibre', org_id:'o-kn',  master_id:'m-nbi', orgs:{name:'KN Circet'}},
      {id:'b-own',  name:'Own consumables', catalogue:'fibre', org_id:'o-kn',  master_id:'m-own', orgs:{name:'KN Circet'}},
      {id:'b-tli',  name:'NBI stock',       catalogue:'fibre', org_id:'o-tli', master_id:'m-nbi', orgs:{name:'TLI Group'}}
    ];
    window.__sbData.items = [
      {master_id:'m-nbi', code:'500CONPOLE9M', short:'Medium Pole 9.0m', long:'Medium Pole 9.0m',
       group_name:'01. Poles', unit:'each', pack:1, pack_name:null, alias:'nine metre medium pole', price:148, expected:null, is_drum:false},
      {master_id:'m-nbi', code:'500CABLEAER96F', short:'Aerial Fibre Cable 096F', long:'Aerial Fibre Cable 096F',
       group_name:'03. Fibre - Overhead', unit:'metre', pack:4000, pack_name:'drum', alias:'ninety six fibre', price:null, expected:null, is_drum:true},
      {master_id:'m-own', code:'KN-GLOVES', short:'Rigger gloves', long:'Rigger gloves',
       group_name:'99. Consumables', unit:'each', pack:10, pack_name:'box', alias:'gloves', price:4.5, expected:null, is_drum:false}
    ];
    window.__sbData.locations = [
      {name:'Claremorris', da:'DA008', alias:'', org_id:'o-kn', orgs:{name:'KN Circet'}},
      {name:'Castlebar',   da:'DA005', alias:'', org_id:'o-kn', orgs:{name:'KN Circet'}}
    ];
  });
  await p.fill('#cbCode','123456');
  await p.click('#cbGo'); await p.waitForTimeout(900);

  const on = await p.evaluate(()=>({
    on:CLOUD.on, who:CLOUD.profile&&CLOUD.profile.name, org:CLOUD.org&&CLOUD.org.name,
    books:CLOUD.books.map(b=>b.name+(b.mine?'':' ('+b.orgName+')')),
    book:CLOUD.book&&CLOUD.book.name, box:$('acctBox').textContent,
    cfgHidden:$('acctCfg').classList.contains('hidden')
  }));
  t('the right code signs you in', on.on===true && on.who==='Seán M', JSON.stringify(on.who));
  t('and it knows which organisation you are in', on.org==='KN Circet', String(on.org));
  t('every book you can see is offered, yours and anyone else\'s',
     on.books.join(' · ')==='NBI stock · Own consumables · NBI stock (TLI Group)', on.books.join(' · '));
  t('it opens on one of them', on.book==='NBI stock', String(on.book));
  t('and the project fields get out of the way once you are in', on.cfgHidden===true);
  t('the panel says who and where', /Seán M/.test(on.box) && /KN Circet/.test(on.box) && /Counter/.test(on.box), on.box.slice(0,80));

  const pulled = await p.evaluate(()=>({
    n: items('fibre').length,
    codes: items('fibre').map(i=>i.code),
    pole: item('fibre','500CONPOLE9M'),
    drum: item('fibre','500CABLEAER96F').drum,
    locs: locsFor('fibre','KN Circet').map(l=>l.name),
    said: $('acctBox').textContent
  }));
  t('the item master is now the book\'s, not the one baked into the page',
     pulled.n===2 && pulled.codes.join()==='500CONPOLE9M,500CABLEAER96F', pulled.n+' '+pulled.codes.join());
  t('with its groups, packs, prices and spoken-as intact',
     pulled.pole.short==='Medium Pole 9.0m' && pulled.pole.price===148 && pulled.drum===true,
     JSON.stringify(pulled.pole));
  t('and the locations come from the organisation', pulled.locs.join()==='Claremorris,Castlebar', pulled.locs.join());
  t('the panel says what it pulled and from where', /2 items and 2 locations/.test(pulled.said), pulled.said.slice(0,120));

  /* the pulled master really is what the matcher uses */
  t('a spoken line matches against the book\'s master',
     await p.evaluate(()=>{ const r=parse('six nine metre medium poles','fibre'); return r.kind==='line' && r.it.code==='500CONPOLE9M'; }));

  /* ---------- C2. who you are follows the account ---------- */
  const who = await p.evaluate(()=>({
    role: me().role, org: me().org, name: me().name, level: me().level, acct: !!me().account,
    localHidden: $('accessLocal').classList.contains('hidden'),
    said: $('accessSaid').textContent
  }));
  t('signed in, me() is the account and not the dropdown',
     who.acct===true && who.org==='KN Circet' && who.name==='Seán M' && who.level==='counter',
     JSON.stringify(who));
  /* This fixture's login can see TLI's book as well as its own, so by the rule
     it is looking across the estate — which is exactly what NBI is. Take the
     foreign book away and the same login is a contractor again. */
  t('a login that can see somebody else\'s book is looking across the estate', who.role==='nbi', who.role);
  const alone = await p.evaluate(()=>{
    const keep = CLOUD.books;
    CLOUD.books = keep.filter(b=>b.mine);
    const r = me().role;
    CLOUD.books = keep;
    return r;
  });
  t('and one that sees only its own is a contractor', alone==='contractor', alone);
  t('the Access panel shows the account instead of the on-device switch',
     who.localHidden===true && /Seán M/.test(who.said) && /KN Circet/.test(who.said)
     && /Counter/.test(who.said) && /From your account/.test(who.said), who.said.slice(0,110));

  /* a login that CAN see another organisation's book is looking across the estate */
  const nbi = await p.evaluate(()=>{
    const keep = CLOUD.profile.org_id;
    CLOUD.profile.org_id = 'o-nbi'; CLOUD.org = {id:'o-nbi', name:'NBI'};
    CLOUD.books = CLOUD.books.map(b=>Object.assign({}, b, {mine:false}));
    const r = {role:me().role, org:me().org};
    CLOUD.profile.org_id = keep; CLOUD.org = {id:'o-kn', name:'KN Circet'};
    CLOUD.books = CLOUD.books.map(b=>Object.assign({}, b, {mine:b.orgId==='o-kn'}));
    return r;
  });
  t('and one that can see somebody else\'s is NBI', nbi.role==='nbi' && nbi.org==='NBI', JSON.stringify(nbi));

  /* ---------- D. switching book switches the master ---------- */
  await p.selectOption('#cbBook','b-own'); await p.waitForTimeout(700);
  const own = await p.evaluate(()=>({book:CLOUD.book.name, codes:items('fibre').map(i=>i.code), saved:S.book}));
  t('switching book switches the master with it',
     own.book==='Own consumables' && own.codes.join()==='KN-GLOVES', JSON.stringify(own));
  t('and the choice is remembered on the device', own.saved==='b-own', own.saved);

  /* a hand edit on the phone still layers on top of the server's copy */
  const edited = await p.evaluate(()=>{
    S.custom = S.custom || {}; S.custom.fibre = [{code:'KN-GLOVES', short:'Rigger gloves — large', unit:'each', pack:10}];
    save();
    return item('fibre','KN-GLOVES').short;
  });
  t('a correction made on the phone survives the pull', edited==='Rigger gloves — large', edited);
  await p.evaluate(()=>{ S.custom.fibre = []; save(); });

  /* ---------- E. it fails out loud ---------- */
  const failed = await p.evaluate(async ()=>{
    window.__sbFail = {items:'permission denied for table items'};
    await cloudPull();
    const note = CLOUD.note;
    window.__sbFail = null;
    return note;
  });
  t('a refused query says so on the panel rather than silently emptying the master',
     /could not load this book/.test(failed) && /permission denied/.test(failed), failed);

  /* ---------- F. signing out gives the phone back ---------- */
  await p.evaluate(()=>cloudPull()); await p.waitForTimeout(300);
  await p.click('#cbOut'); await p.waitForTimeout(600);
  const after = await p.evaluate(()=>({on:CLOUD.on, out:window.__sb.signedOut,
      items:items('fibre').length, form:!!document.getElementById('cbEmail')}));
  t('signing out puts the built-in catalogue back rather than leaving you with nothing',
     after.on===false && after.items===388, JSON.stringify(after));
  t('and it really signed out', after.out===1 && after.form===true, JSON.stringify(after));

  /* ---------- G. the device has a name ---------- */
  const back = await p.evaluate(()=>({acct:!!me().account, name:me().name,
      localShown:!$('accessLocal').classList.contains('hidden')}));
  t('and signing out gives the on-device switch back',
     back.acct===false && back.localShown===true && back.name==='Seán M', JSON.stringify(back));

  const dev = await p.evaluate(()=>({a:deviceId(), b:deviceId(), stored:S.device}));
  t('the phone names itself once and keeps it', dev.a===dev.b && dev.stored===dev.a, JSON.stringify(dev));

  const out = R.report('account — sign in, org, books, and the book\'s master', p.errs);
  await p.ctx.close();
  return out;
};
