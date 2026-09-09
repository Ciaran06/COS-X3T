#!/usr/bin/env node
/* Run the suites.
     node test/run.js              all of them
     node test/run.js voice agent  only those
   Exit code is the number of failures, so CI and /test can just check it. */
const path = require('path');
const fs = require('fs');
const H = require('./lib/harness');

const SUITES = path.join(__dirname, 'suites');

async function main(){
  const want = process.argv.slice(2).filter(a=>!a.startsWith('-'));
  const files = fs.readdirSync(SUITES).filter(f=>f.endsWith('.js')).sort()
    .filter(f => !want.length || want.some(w => f.includes(w)));
  if(!files.length){ console.error('No suites match ' + want.join(', ')); process.exit(1); }

  if(!H.CHROMIUM){
    console.error('No Chromium found. Set CHROMIUM_PATH to a Chromium binary.');
    process.exit(1);
  }
  let chromium;
  try{ ({ chromium } = require('playwright-core')); }
  catch(e){
    console.error('playwright-core is not installed. Run:  npm install  (in the repo root)');
    process.exit(1);
  }

  console.log('TruCount test run');
  /* suites write screenshots here; the folder is gitignored, so on a fresh
     clone it does not exist yet */
  fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
  await H.ensureVendor();
  const proxyState = { key:true, guarded:true };
  const page = await H.servePage();
  const proxy = await H.serveProxy(proxyState);
  const browser = await chromium.launch({
    executablePath: H.CHROMIUM,
    args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required',
           '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']
  });

  let pass = 0, fail = 0;
  const rows = [];
  for(const f of files){
    const name = f.replace(/\.js$/,'');
    let r;
    try{
      r = await require(path.join(SUITES, f))({ browser, H, proxy, proxyState });
    }catch(e){
      console.log('\n' + name);
      console.log('  ✗ suite crashed — ' + (e && e.message));
      r = { pass:0, fail:1 };
    }
    pass += r.pass; fail += r.fail;
    rows.push([name, r.pass, r.fail]);
  }

  await browser.close();
  page.close(); proxy.close();

  const w = Math.max(...rows.map(r=>r[0].length));
  console.log('\n' + '─'.repeat(w + 20));
  rows.forEach(([n,p,f])=>console.log('  ' + n.padEnd(w) + '  ' + String(p).padStart(3) + ' passed'
    + (f? '   ' + f + ' FAILED' : '')));
  console.log('─'.repeat(w + 20));
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
main().catch(e=>{ console.error(e); process.exit(1); });
