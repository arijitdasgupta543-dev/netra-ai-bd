const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = __dirname; const types = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.bin':'application/octet-stream', '.wasm':'application/wasm' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
srv.listen(8766, async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  await p.goto('http://127.0.0.1:8766/index.html');
  const out = await p.evaluate(async () => { const v = await window.runParity('wasm'); return { backend: tf.getBackend(), v }; });
  fs.writeFileSync(path.join(root, 'parity_tfjs_wasm.json'), JSON.stringify(out.v)); console.log('backend', out.backend, 'n', out.v.length);
  await b.close(); srv.close();
});
