/* theme — blue and white from one line */
function lum(rgb){ const c=rgb.map(x=>x/255).map(x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; }
/* color-mix() computes to color(srgb r g b) with 0-1 floats, not rgb() */
function parse(s){
  let m = s.match(/rgba?\(([^)]+)\)/);
  if(m) return m[1].split(/[,\s/]+/).filter(Boolean).map(Number).slice(0,3);
  m = s.match(/color\(srgb ([^)]+)\)/);
  if(m) return m[1].split(/[\s/]+/).filter(Boolean).map(Number).slice(0,3).map(x=>x*255);
  throw new Error('cannot parse colour: '+s);
}
function cr(a,b){ const la=lum(a), lb=lum(b); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); }
module.exports = async function({ browser, H }){
  const R = H.results(); const { t, ok, bad } = R;
  const PAGE  = 'http://127.0.0.1:' + H.PAGE_PORT;
  const PROXY = 'http://127.0.0.1:' + H.PROXY_PORT;
  const sample = n => require('path').join(H.ROOT, 'sample-data', n);
  const shot   = n => require('path').join(__dirname, '..', 'screenshots', n);
  const errs = [];
  /* the same theme has to hold whatever the phone is set to */
  for (const scheme of ['light','dark']) {
    const p = await H.openApp(browser, { colorScheme: scheme, scale: 2 });
    const c = await p.evaluate(()=>{
      const g = (sel,prop)=>getComputedStyle(document.querySelector(sel))[prop];
      return {
        brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
        headerBg: g('header.top','backgroundColor'),
        bodyBg: g('body','backgroundColor'),
        bodyInk: g('body','color'),
        tabOnBg: g('.tabs button[aria-selected="true"]','backgroundColor'),
        tabOnInk: g('.tabs button[aria-selected="true"]','color'),
        tabOffInk: g('.tabs button[aria-selected="false"]','color'),
        micBg: g('.mic','backgroundColor'),
        micInk: g('.mic','color'),
        cardBg: g('.card','backgroundColor'),
      };
    });
    t(scheme+': the page is white', parse(c.cardBg).every(x=>x>=250), scheme+' card '+c.cardBg);
    t(scheme+': the ground is light grey', lum(parse(c.bodyBg))>0.85, c.bodyBg);
    t(scheme+': text is dark grey', lum(parse(c.bodyInk))<0.06, c.bodyInk);
    t(scheme+': the header is the brand blue', c.headerBg==='rgb(29, 95, 209)', c.headerBg);
    t(scheme+': the mic is the brand blue', c.micBg==='rgb(29, 95, 209)', c.micBg);
    t(scheme+': white text on the mic', cr(parse(c.micInk), parse(c.micBg))>4.5, 'cr '+cr(parse(c.micInk),parse(c.micBg)).toFixed(2));
    t(scheme+': the active tab is white with blue text', lum(parse(c.tabOnBg))>0.9 && cr(parse(c.tabOnInk),parse(c.tabOnBg))>4.5,
       c.tabOnBg+' / '+c.tabOnInk+' cr '+cr(parse(c.tabOnInk),parse(c.tabOnBg)).toFixed(2));
    t(scheme+': inactive tab text reads on the blue', cr(parse(c.tabOffInk), parse(c.headerBg))>3,
       'cr '+cr(parse(c.tabOffInk),parse(c.headerBg)).toFixed(2));
    t(scheme+': no script errors', errs.length===0, errs.slice(0,2).join('|'));
    if(scheme==='light'){
      /* contractor colour must survive untouched */
      const before = await p.evaluate(()=>{ const bd=$('badge'); return {bg:getComputedStyle(bd).backgroundColor, brand:brandFor('fibre','TLI Group').color}; });
      await p.evaluate(()=>{ saveRole('nbi'); }); await p.waitForTimeout(600);
      await p.evaluate(()=>{ setViewOrgs(['Actavo']); applyBrand(); }); await p.waitForTimeout(400);
      const after = await p.evaluate(()=>({
        badge:getComputedStyle($('badge')).backgroundColor,
        org:brandFor('fibre','Actavo').color,
        header:getComputedStyle(document.querySelector('header.top')).backgroundColor,
        mic:getComputedStyle(document.querySelector('.mic')).backgroundColor,
        bandEdge:getComputedStyle(document.querySelector('.band')).borderBottomColor,
      }));
      const hex = h=>{ const n=h.replace('#',''); return [0,2,4].map(i=>parseInt(n.slice(i,i+2),16)); };
      t('the contractor badge keeps the contractor colour',
        JSON.stringify(parse(after.badge))===JSON.stringify(hex(after.org)), after.badge+' vs '+after.org);
      t('switching contractor does NOT recolour the header', after.header==='rgb(29, 95, 209)', after.header);
      t('switching contractor does NOT recolour the mic', after.mic==='rgb(29, 95, 209)', after.mic);
      t('the band edge still carries the contractor', cr(parse(after.bandEdge), parse(after.header))>1.4,
        after.bandEdge+' on '+after.header);
      /* status colours */
      const stat = await p.evaluate(()=>{
        const d=document.createElement('div'); d.innerHTML='<span class="btn done">x</span><span class="btn fail">y</span>';
        document.body.appendChild(d);
        const r={done:getComputedStyle(d.children[0]).backgroundColor, fail:getComputedStyle(d.children[1]).backgroundColor};
        const s=document.querySelector('.sync'); s.className='sync on';
        r.led=getComputedStyle(s.querySelector('.led')).backgroundColor;
        s.className='sync queued'; r.queued=getComputedStyle(s.querySelector('.led')).backgroundColor;
        d.remove(); return r;
      });
      t('green still reads on white', cr(parse(stat.done),[255,255,255])>3, stat.done);
      t('red still reads on white', cr(parse(stat.fail),[255,255,255])>3, stat.fail);
      t('the synced light stands out on the blue header', cr(parse(stat.led), [29,95,209])>3, stat.led+' cr '+cr(parse(stat.led),[29,95,209]).toFixed(2));
      t('the queued light stands out on the blue header', cr(parse(stat.queued), [29,95,209])>3, stat.queued+' cr '+cr(parse(stat.queued),[29,95,209]).toFixed(2));
      /* one line reshades everything */
      await p.evaluate(()=>{ document.documentElement.style.setProperty('--brand','#8A1C7C'); });
      await p.waitForTimeout(200);
      const re = await p.evaluate(()=>({
        header:getComputedStyle(document.querySelector('header.top')).backgroundColor,
        mic:getComputedStyle(document.querySelector('.mic')).backgroundColor,
        primary:getComputedStyle(document.querySelector('.acts button.primary')).backgroundColor,
        badge:getComputedStyle($('badge')).backgroundColor,
      }));
      t('changing --brand alone reshades header, mic and primary buttons',
        re.header==='rgb(138, 28, 124)' && re.mic==='rgb(138, 28, 124)' && re.primary==='rgb(138, 28, 124)', JSON.stringify(re));
      t('and leaves the contractor badge alone', re.badge===after.badge, re.badge+' vs '+after.badge);
      await p.evaluate(()=>{ document.documentElement.style.removeProperty('--brand'); });
      await p.waitForTimeout(200);
      await p.screenshot({ path: shot('theme-count.png') });
      await p.click('#t-cat'); await p.waitForTimeout(500);
      await p.screenshot({ path: shot('theme-data.png') });
      await p.click('#t-mgr'); await p.waitForTimeout(500);
      await p.screenshot({ path: shot('theme-rollup.png') });
    } else {
      await p.screenshot({ path: shot('theme-darkmode.png') });
    }
    errs.push(...p.errs);
    await p.ctx.close();
  }
  return R.report('theme — blue and white from one line', errs);
};
