/* Shared test harness.

   The app is one HTML file with no build step, so a test is: serve the folder,
   open it in a headless Chromium, and drive the same functions the phone does.
   Two things the sandbox blocks have to be served locally instead of from a CDN
   — SheetJS and the ElevenLabs client — and one thing must never reach the real
   world: the voice proxy, which is stubbed. */
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT   = path.resolve(__dirname, '..', '..');
const CACHE  = path.join(__dirname, '..', '.cache');
const FIXTURES = path.join(__dirname, '..', 'fixtures');
const PAGE_PORT = 8790, PROXY_PORT = 8791;
const APP_TOKEN = 'test-token';

const CHROMIUM = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      '/opt/pw-browsers/chromium/chrome-linux/chrome']
     .find(p => { try { return fs.statSync(p).isFile(); } catch(e){ return false; } });

/* The two libraries the page pulls from a CDN. Cached on first run so a repeat
   run is offline; the cache is gitignored because vendoring 2MB of somebody
   else's JS into a one-file app is not a trade worth making. */
const VENDOR = [
  { file: 'xlsx.full.min.js',  url: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js' },
];
/* Vapi is not cached and injected the way SheetJS is: it is an ES module that
   pulls a WebRTC stack behind it and then wants a real call to a real account.
   The transport is the boundary, so it is stubbed — everything above it, the
   tools included, is the app's own code. */
const VAPI_STUB = `
  window.__vapi = {key:'', starts:[], sent:[], muted:[], stopped:0, inst:null};
  window.Vapi = function(key){
    const h = {}; const self = this;
    window.__vapi.key = key; window.__vapi.inst = this;
    this.on = (e,f)=>{ (h[e]=h[e]||[]).push(f); return self; };
    this.emit = (e,...a)=>{ (h[e]||[]).slice().forEach(f=>{ try{ f(...a); }catch(err){} }); };
    this.start = async (id, ov)=>{ window.__vapi.starts.push({id, ov});
      setTimeout(()=>self.emit('call-start'), 0); return {id:'call_stub'}; };
    this.send = m => { window.__vapi.sent.push(m); };
    this.setMuted = b => { window.__vapi.muted.push(!!b); };
    this.isMuted = () => !!window.__vapi.muted[window.__vapi.muted.length-1];
    this.say = ()=>{};
    this.stop = async ()=>{ window.__vapi.stopped++; self.emit('call-end'); };
  };
  window.__vapiLoaded = true;
`;
async function ensureVendor(){
  fs.mkdirSync(CACHE, { recursive: true });
  for(const v of VENDOR){
    const dest = path.join(CACHE, v.file);
    if(fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;
    process.stdout.write('  fetching ' + v.file + '…\n');
    const res = await fetch(v.url);
    if(!res.ok) throw new Error('could not fetch ' + v.url + ' — ' + res.status);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
}

const MIME = {'.html':'text/html','.js':'application/javascript','.css':'text/css',
  '.csv':'text/csv','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
/* serves the app, plus the two cached libraries under /vendor/ */
function servePage(){
  const srv = http.createServer((req,res)=>{
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/vendor/')
      ? path.join(CACHE, path.basename(url))
      : path.join(ROOT, url === '/' ? 'index.html' : url.replace(/^\/+/,''));
    if(!file.startsWith(ROOT) && !file.startsWith(CACHE)){ res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf)=>{
      if(err){ res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {'content-type': MIME[path.extname(file)] || 'application/octet-stream'});
      res.end(buf);
    });
  });
  return new Promise(r => srv.listen(PAGE_PORT, ()=>r(srv)));
}

/* Stands in for the Cloudflare Worker. Same contract, no key, no network:
   /health, /stt-token, /agent-token, /agent-signed-url, /tts. */
function serveProxy(state){
  const spoken = [];
  const srv = http.createServer((req,res)=>{
    const u = new URL(req.url, 'http://x');
    const cors = {'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':'content-type, x-app-token',
      'Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
    if(req.method==='OPTIONS'){ res.writeHead(204, cors); return res.end(); }
    const j = (o, st)=>{ res.writeHead(st||200, {...cors,'content-type':'application/json'}); res.end(JSON.stringify(o)); };
    const authed = !state.guarded || req.headers['x-app-token']===APP_TOKEN;
    if(u.pathname==='/health') return j({ok:true, key:state.key, guarded:state.guarded, authed,
      voice:'IQjnnInWsKbdAesop75D', model:'eleven_multilingual_v2',
      settings:{stability:0.5, similarity_boost:0.8}});
    if(!authed) return j({error:'unauthorised'}, 401);
    if(u.pathname==='/stt-token') return j({token:'single-use-test'});
    if(u.pathname==='/agent-token')
      return u.searchParams.get('agent_id') ? j({token:'conv-token-test'}) : j({error:'no_agent_id'}, 400);
    if(u.pathname==='/agent-signed-url') return j({signed_url:'wss://example.invalid/agent'});
    if(u.pathname==='/tts' && req.method==='POST'){
      let b=''; req.on('data',d=>b+=d); req.on('end',()=>{
        try{ spoken.push(JSON.parse(b||'{}').text||''); }catch(e){}
        /* a second of silence, so a readback takes real time to play */
        const wav = Buffer.alloc(44+32000);
        wav.write('RIFF',0); wav.writeUInt32LE(36+32000,4); wav.write('WAVE',8);
        wav.write('fmt ',12); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20);
        wav.writeUInt16LE(1,22); wav.writeUInt32LE(16000,24); wav.writeUInt32LE(32000,28);
        wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36);
        wav.writeUInt32LE(32000,40);
        res.writeHead(200,{...cors,'content-type':'audio/wav'}); res.end(wav);
      });
      return;
    }
    j({error:'not_found'}, 404);
  });
  srv.spoken = spoken;
  return new Promise(r => srv.listen(PROXY_PORT, ()=>r(srv)));
}

/* one assertion */
function results(){
  const ok=[], bad=[];
  return {
    ok, bad,
    t(name, cond, detail){ (cond?ok:bad).push(name + (detail? ' — '+detail : '')); },
    report(title, errs){
      console.log('\n' + title);
      ok.forEach(x=>console.log('  ✓ ' + x));
      if(bad.length){ console.log('  FAIL'); bad.forEach(x=>console.log('  ✗ ' + x)); }
      if(errs && errs.length){ console.log('  ERRORS'); errs.slice(0,5).forEach(x=>console.log('  ! ' + x)); }
      return { pass: ok.length, fail: bad.length + ((errs&&errs.length)||0) };
    }
  };
}

/* a page with the app loaded, the CDN libraries in place, and console noise
   the sandbox creates filtered out */
async function openApp(browser, opts){
  const o = opts || {};
  const ctx = await browser.newContext({
    viewport: o.viewport || {width:430, height:940},
    deviceScaleFactor: o.scale || 1,
    permissions: ['microphone'],
    colorScheme: o.colorScheme || 'light',
    acceptDownloads: true
  });
  /* The page pulls SheetJS, the ElevenLabs client and Google Fonts from CDNs
     that this sandbox cannot reach. Left alone, Chromium holds each request
     open until it times out — twelve seconds a page, and the app is served
     local copies here anyway. Abort them and every suite is deterministic. */
  await ctx.route(/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)/,
                  r => r.abort());
  const page = await ctx.newPage();
  /* before any of the app's own script runs, so the first probe sees it */
  if(o.vapi !== false) await page.addInitScript(VAPI_STUB);
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if(m.type()!=='error') return;
    if(/ERR_CONNECTION|Failed to load resource|elevenlabs|vapi|jsdelivr|cdnjs|favicon/i.test(m.text())) return;
    errs.push('CONSOLE: ' + m.text());
  });
  await page.goto('http://127.0.0.1:'+PAGE_PORT+'/index.html', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(900);
  if(o.xlsx !== false) await page.addScriptTag({url:'http://127.0.0.1:'+PAGE_PORT+'/vendor/xlsx.full.min.js'});
  await page.waitForTimeout(250);
  page.errs = errs;
  page.ctx = ctx;
  return page;
}

/* point the app at the stub proxy */
async function useProxy(page, extra){
  await page.evaluate(cfg=>{ S.voice = cfg; save(); },
    Object.assign({proxy:'http://127.0.0.1:'+PROXY_PORT, token:APP_TOKEN, agentId:'', prefer:'auto'}, extra||{}));
  await page.evaluate(()=>probeVoice());
  await page.waitForTimeout(700);
}

/* a WebSocket that opens and swallows, so a Scribe session can be observed
   without reaching ElevenLabs */
async function fakeSocket(page){
  await page.evaluate(()=>{
    window.__sock = [];
    class FakeWS {
      constructor(u){ window.__sock.push(u); this.url=u; this.readyState=1;
        setTimeout(()=>{ if(this.onopen) this.onopen(); }, 5); }
      send(){}
      close(){ this.readyState=3; if(this.onclose) this.onclose(); }
    }
    window.WebSocket = FakeWS;
  });
}

/* a live agent session, without ElevenLabs: records what the app sends it */
/* Stands in for a live Vapi call. Everything the app sends goes into __sent,
   split into the two things it is used for — context the model should know and
   turns it should answer — and __tool collects what came back out of a tool.
   The transport is the only thing faked; the tools are the real ones. */
async function fakeAgent(page){
  await page.evaluate(()=>{
    window.__sent = []; window.__ctx = []; window.__msg = []; window.__tool = [];
    AGENT.on = true; AGENT.warm = false;
    AGENT.conv = {
      send: m => {
        window.__sent.push(m);
        const c = m && m.message && m.message.content;
        if(m && m.type === 'add-message'){
          if(m.message.role === 'user') window.__msg.push(c);
          else if(/^Result of /.test(String(c||''))) window.__tool.push(c);
          else window.__ctx.push(c);
        }
      },
      setMuted: ()=>{},
      stop: async ()=>{}
    };
    paintMic();
  });
}
/* Puts a tool call on the wire the way Vapi does, and hands back what the app
   sent to the model in reply. */
async function toolCall(page, name, args){
  return await page.evaluate(async ({name, args})=>{
    const before = window.__sent.length;
    await runToolCall({id:'call_'+Math.random().toString(36).slice(2),
                       type:'function',
                       function:{name, arguments: JSON.stringify(args||{})}});
    return window.__sent.slice(before);
  }, {name, args});
}

/* somewhere for a suite to write during a run — never a fixture, which is input */
function tmp(name){
  const dir = path.join(CACHE, 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

module.exports = { ROOT, CACHE, FIXTURES, tmp, PAGE_PORT, PROXY_PORT, APP_TOKEN, CHROMIUM,
                   ensureVendor, servePage, serveProxy, results, openApp, useProxy,
                   fakeSocket, fakeAgent, toolCall, fixture: n => path.join(FIXTURES, n) };
