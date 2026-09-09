/* The block in index.html that carries the assistant's tools and system prompt
   is generated from agent/tools.json and agent/system-prompt.md. Nothing stops
   somebody editing the copy in the page, so this fails when they have drifted —
   a prompt that only exists in one of two places is a prompt nobody can review. */
module.exports = async function({ H }){
  const R = H.results(); const t = R.t;
  const fs = require('fs'), path = require('path');
  const gen = require(path.join(H.ROOT, 'agent', 'build-overrides.js'));
  const html = fs.readFileSync(path.join(H.ROOT, 'index.html'), 'utf8');
  const i = html.indexOf(gen.BEGIN), j = html.indexOf(gen.END);
  t('the generated block is in index.html', i >= 0 && j > i);
  const now = i >= 0 && j > i ? html.slice(i, j + gen.END.length) : '';
  t('and it matches agent/tools.json and agent/system-prompt.md', now === gen.block(),
    now === gen.block() ? '' : 'run `node agent/build-overrides.js`');
  t('the prompt no longer carries a hard-coded item list',
    !/for this test only/i.test(gen.prompt()));
  t('all eleven tools are in the file', gen.tools().length === 11, String(gen.tools().length));
  return R.report('generated — the tools and prompt the app ships', []);
};
