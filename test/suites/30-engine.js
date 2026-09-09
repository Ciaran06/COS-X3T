/* voice — engine tiers and fallback */
const P = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ok = [], bad = [];
const t = (n, c, d) => (c ? ok : bad).push(n + (d ? ' — ' + d : ''));
module.exports = async function({ browser, H }){
  const R = H.results(); const { t, ok, bad } = R;
  const PAGE  = 'http://127.0.0.1:' + H.PAGE_PORT;
  const PROXY = 'http://127.0.0.1:' + H.PROXY_PORT;
  const sample = n => require('path').join(H.ROOT, 'sample-data', n);
  const shot   = n => require('path').join(__dirname, '..', 'screenshots', n);
  const p = await H.openApp(browser);
  const errs = p.errs;
  const pg = p;   /* this suite was written against `pg` */

  t('page loads with no script error', errs.length === 0, errs.slice(0, 3).join(' | '));

  /* 1. default state */
  let chip = await pg.textContent('#engChip');
  t('chip shows browser by default', /Voice: Browser/.test(chip) && /no proxy set/.test(chip), chip);

  /* 2. typed input still works on the browser engine */
  await pg.fill('#typeIn', 'six poles');
  await pg.press('#typeIn', 'Enter');
  await pg.waitForTimeout(400);
  let cf = await pg.textContent('#cf1');
  t('typed line still parses on browser engine', /pole/i.test(cf), cf);

  /* 3. point at the proxy */
  await pg.click('#t-cat'); await pg.waitForTimeout(200);
  await pg.fill('#vProxy', PROXY);
  await pg.fill('#vToken', H.APP_TOKEN);
  await pg.click('#vTest');
  await pg.waitForTimeout(1500);
  let btn = await pg.textContent('#vTest');
  chip = await pg.textContent('#engChip2');
  t('Test connection reports connected', /Connected/.test(btn), btn);
  t('chip flips to the ElevenLabs tier', /Voice: Scribe/.test(chip), chip);
  const spoken = await pg.evaluate(() => window.__lastTts || null);

  /* 4. TTS goes through the proxy and calls back */
  const said = await pg.evaluate(() => new Promise(r => {
    const to = setTimeout(() => r('TIMEOUT'), 8000);
    speakThen('Ten cases of Coke, three hundred and sixty units.', () => { clearTimeout(to); r('done'); });
  }));
  t('ElevenLabs readback completes and calls back', said === 'done', said);
  t('readback still on ElevenLabs after speaking', await pg.evaluate(() => VOICE.tts) === 'eleven');

  /* 5. keyterms */
  const kt = await pg.evaluate(() => keytermsFor());
  t('keyterms within the 50 limit', kt.length <= 50, 'got ' + kt.length);
  t('every keyterm within 20 chars', kt.every(x => x.length <= 20), (kt.find(x => x.length > 20) || ''));
  t('command words come first', ['yes','next','skip','zero','back','pause','stop'].every(w=>kt.indexOf(w)>=0 && kt.indexOf(w)<14), kt.slice(0,14).join(','));

  /* 6. wrong token */
  await pg.fill('#vToken', 'wrong');
  await pg.click('#vSave'); await pg.waitForTimeout(1200);
  chip = await pg.textContent('#engChip2');
  t('wrong app token falls back and says so', /Browser/.test(chip) && /app token/.test(chip), chip);

  /* 7. unreachable proxy */
  await pg.fill('#vProxy', 'http://127.0.0.1:8799');
  await pg.fill('#vToken', H.APP_TOKEN);
  await pg.click('#vSave'); await pg.waitForTimeout(1500);
  chip = await pg.textContent('#engChip2');
  t('unreachable proxy falls back and says so', /Browser/.test(chip) && /unreachable/.test(chip), chip);
  const said2 = await pg.evaluate(() => new Promise(r => {
    const to = setTimeout(() => r('TIMEOUT'), 9000);
    speakThen('Falling back.', () => { clearTimeout(to); r('done'); });
  }));
  t('readback still completes with no proxy', said2 === 'done', said2);

  /* 8. typed input still works with the proxy configured */
  await pg.fill('#vProxy', PROXY);
  await pg.fill('#vToken', H.APP_TOKEN);
  await pg.click('#vSave'); await pg.waitForTimeout(1200);
  await pg.click('#t-count'); await pg.waitForTimeout(200);
  await pg.fill('#typeIn', 'four connection kits');
  await pg.press('#typeIn', 'Enter');
  await pg.waitForTimeout(2500);
  const rows = await pg.evaluate(() => (cur() && cur().lines || []).length);
  t('typed input records lines with ElevenLabs selected', rows >= 2, 'lines=' + rows);

  /* 9. the socket cannot be reached from here — prove the fallback */
  await pg.evaluate(() => { window.__fb = []; const f = voiceFellBack; voiceFellBack = w => { window.__fb.push(w); return f(w); }; });
  await pg.click('#mic');
  await pg.waitForTimeout(9000);
  const fb = await pg.evaluate(() => window.__fb);
  const st = await pg.evaluate(() => ({ stt: VOICE.stt, want: wantListen, note: VOICE.note }));
  t('a dead socket falls back to the browser engine', st.stt === 'browser' && fb.length > 0, JSON.stringify({fb, st}));
  t('still wants to listen after the fallback', st.want === true, JSON.stringify(st));
  chip = await pg.textContent('#engChip');
  t('chip explains the fallback', /Browser/.test(chip) && chip.length > 14, chip);

  await pg.screenshot({ path: shot('engine-chip.png'), clip: { x: 0, y: 0, width: 800, height: 900 } });
  const out = R.report('voice — engine tiers and fallback', errs);
  await p.ctx.close();
  return out;
};
